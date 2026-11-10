import { createHash, webcrypto } from 'node:crypto'
import { buildKnowledgePack } from '@/lib/offline-knowledge-server'
import { loadPilotCatalog } from '@/lib/pilot-content'
import { searchKnowledge, offlineKnowledgeReply, validKnowledgePack, KNOWLEDGE_KEY, type KnowledgePack, type OfflineDocument } from '@/lib/offline-knowledge'
import { saveNativeKnowledge, readNativeKnowledge, syncOfflineKnowledge } from '@/lib/offline-knowledge-client'
import { getKnowledgePack, saveKnowledgePack } from '@/lib/offline-storage'
import type { SupabaseClient } from '@supabase/supabase-js'

jest.mock('@/lib/pilot-content', () => ({ loadPilotCatalog: jest.fn() }))
jest.mock('@/lib/offline-storage', () => ({ getKnowledgePack: jest.fn(async () => null), saveKnowledgePack: jest.fn(async () => true) }))
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
const doc = (patch: Partial<OfflineDocument> = {}): OfflineDocument => ({ id: 'manual:1', kind: 'manual', lang: 'en', title: 'Military survival', text: 'Water treatment and filter.\n\nNever assume a filter removes chemicals.', source: 'Military FM', version: 'v1', ...patch })
function pack(documents = [doc()]): KnowledgePack {
  return { schema: 1, documents, version: createHash('sha256').update(JSON.stringify(documents)).digest('hex'), syncedAt: '2026-11-10T14:00:00Z' }
}
function download(p: KnowledgePack) {
  const data = JSON.stringify(p.documents)
  return jest.fn(async (url: string) => {
    const part = Number(new URL(url, 'https://eos.test').searchParams.get('part'))
    return new Response(JSON.stringify(url.includes('?')
      ? { version: p.version, part, data: data.slice(part * 256 * 1024, (part + 1) * 256 * 1024) }
      : { schema: 1, version: p.version, syncedAt: p.syncedAt, parts: Math.ceil(data.length / (256 * 1024)), characters: data.length }))
  }) as jest.Mock
}

function native() {
  const store = new Map<string, string>()
  let writes = 0
  let failAt = Infinity
  return { store, fail(n: number) { writes = 0; failAt = n }, scope: { Capacitor: { getPlatform: () => 'ios', Plugins: { Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { if (++writes === failAt) throw new Error('quota'); store.set(key, value) },
    remove: async ({ key }: { key: string }) => { store.delete(key) },
  } } } } }
}

beforeEach(() => { jest.clearAllMocks(); jest.mocked(getKnowledgePack).mockResolvedValue(null); jest.mocked(saveKnowledgePack).mockResolvedValue(true) })
it('finds English manual guidance from Portuguese and preserves source and warnings without a network', () => {
  const result = offlineKnowledgeReply(pack(), 'Como filtrar e tratar água?', true)
  expect(result.hits[0].document.source).toBe('Military FM')
  expect(result.text).toContain('Never assume a filter removes chemicals')
  expect(result.text).toContain('original em inglês')
  expect(result.text).toContain('2026-11-10')
})
it('finds psychology, approved EDU and signals, while retaining full text for reading', () => {
  const p = pack([doc({ id: 'manual:psych', title: 'Psychology', text: 'Fear and anxiety after a disaster. Psychological support.' }),
    doc({ id: 'signal:fortress', kind: 'signal', lang: 'pt', title: 'FORTRESS', text: 'O que é. O que não é. Alternativas completas de água.' }),
    doc({ id: 'edu:1', kind: 'edu', lang: 'pt', title: 'Abrigo', text: 'Montar abrigo: corpo completo da lição.' })])
  expect(searchKnowledge(p, 'Estou com medo e ansiedade', 'pt')[0].document.id).toBe('manual:psych')
  expect(searchKnowledge(p, 'Fortress', 'pt')[0].document.text).toContain('O que não é')
  expect(searchKnowledge(p, 'Como montar um abrigo?', 'pt')[0].document.id).toBe('edu:1')
  expect(offlineKnowledgeReply(p, 'xilofone', true).hits).toHaveLength(0)
  expect(offlineKnowledgeReply(null, 'água', true).text).toContain('ainda não foi salva')
})
it('rejects malformed, duplicate and unsafe-link snapshots', () => {
  expect(validKnowledgePack(pack())).toBe(true)
  expect(validKnowledgePack(pack([doc(), doc()]))).toBe(false)
  expect(validKnowledgePack(pack([doc({ href: '//external.test' })]))).toBe(false)
  expect(validKnowledgePack({ ...pack(), documents: [{ id: 'incomplete' }] })).toBe(false)
})
it('native reads survive process restart and use the application store, not origin storage', async () => {
  const n = native()
  const p = pack([doc({ text: 'Water '.repeat(40000) })])
  expect(await saveNativeKnowledge(p, n.scope)).toBe(true)
  expect(JSON.parse(n.store.get(KNOWLEDGE_KEY)!).blocks).toBeGreaterThan(1)
  expect((await readNativeKnowledge(n.scope))?.documents[0].text).toBe(p.documents[0].text)
})
it('native interrupted writes preserve the previous generation; successful update removes old documents', async () => {
  const n = native()
  const first = pack()
  await saveNativeKnowledge(first, n.scope)
  n.fail(2)
  const next = pack([doc({ id: 'edu:new', kind: 'edu', lang: 'pt', text: 'Novo '.repeat(40000) })])
  expect(await saveNativeKnowledge(next, n.scope)).toBe(false)
  expect((await readNativeKnowledge(n.scope))?.version).toBe(first.version)
  n.fail(Infinity)
  await saveNativeKnowledge(next, n.scope)
  expect((await readNativeKnowledge(n.scope))?.documents.some(d => d.id === first.documents[0].id)).toBe(false)
})
it('download corruption, failures and quota never report success or erase the previous copy', async () => {
  const previous = pack()
  jest.mocked(getKnowledgePack).mockResolvedValue(previous)
  global.fetch = download({ ...pack(), version: 'f'.repeat(64) })
  await expect(syncOfflineKnowledge()).rejects.toThrow('integrity')
  expect(saveKnowledgePack).not.toHaveBeenCalled()
  global.fetch = jest.fn(async () => new Response('', { status: 503 })) as jest.Mock
  await expect(syncOfflineKnowledge()).rejects.toThrow('503')
  expect(saveKnowledgePack).not.toHaveBeenCalled()
  global.fetch = download(pack())
  jest.mocked(saveKnowledgePack).mockResolvedValue(false)
  await expect(syncOfflineKnowledge()).rejects.toThrow('storage')
})
it('conditional downloads retain a verified complete copy and do not rewrite unchanged data', async () => {
  const previous = pack()
  jest.mocked(getKnowledgePack).mockResolvedValue(previous)
  global.fetch = jest.fn(async () => new Response(null, { status: 304 })) as jest.Mock
  expect((await syncOfflineKnowledge()).version).toBe(previous.version)
  expect(saveKnowledgePack).not.toHaveBeenCalled()
})
it('paginates manuals beyond 1000 rows and excludes obsolete editorial vectors', async () => {
  jest.mocked(loadPilotCatalog).mockResolvedValue({ docs: [
    { id: 'edu:new', kind: 'edu', version: 'v4', title: 'Aula', searchTitle: '', href: '/preparedness/aprender?contentId=new', text: 'CURRENT APPROVED BODY' },
  ], unavailable: [] })
  const rows = Array.from({ length: 1101 }, (_, i) => ({ id: String(i), content: `Manual ${i}`, source: i === 0 ? 'edu:archived' : 'Manual', source_version: null, chunk_index: i }))
  const ranges: number[] = []
  const admin = { from: () => { const q = { select: () => q, order: () => q, range: async (from: number, to: number) => {
    ranges.push(from); return { data: rows.slice(from, to + 1), error: null }
  } }; return q } } as unknown as SupabaseClient
  const result = await buildKnowledgePack(admin)
  expect(ranges).toContain(1100)
  expect(result.documents).toHaveLength(1102)
  expect(result.documents.some(d => d.source === 'edu:archived')).toBe(false)
  expect(result.documents.filter(d => d.id === 'edu:new')).toHaveLength(2)
  expect(result.documents.find(d => d.id === 'edu:new')?.text).toContain('CURRENT APPROVED BODY')
  expect(validKnowledgePack(result)).toBe(true)
})
it('failure of any publication source aborts the snapshot instead of publishing a partial empty library', async () => {
  jest.mocked(loadPilotCatalog).mockResolvedValue({ docs: [], unavailable: ['EDU'] })
  await expect(buildKnowledgePack({} as SupabaseClient)).rejects.toThrow('editorial')
})

it('assembles several bounded responses before atomically committing, preserving Unicode', async () => {
  const p = pack([doc({ text: 'Água 🏕️ '.repeat(50000) })])
  global.fetch = download(p)
  const result = await syncOfflineKnowledge()
  expect(result.documents[0].text).toBe(p.documents[0].text)
  expect(saveKnowledgePack).toHaveBeenCalledTimes(1)
  expect(global.fetch).toHaveBeenCalledTimes(1 + Math.ceil(JSON.stringify(p.documents).length / (256 * 1024)))
})
it('a publication changing mid-download never commits a mixed snapshot', async () => {
  const p = pack()
  global.fetch = download(p)
  const mockFetch = global.fetch as jest.Mock
  const initial = mockFetch.getMockImplementation()!
  mockFetch.mockImplementation((url: string) => url.includes('?') ? Promise.resolve(new Response('', { status: 409 })) : initial(url))
  await expect(syncOfflineKnowledge()).rejects.toThrow('409')
  expect(saveKnowledgePack).not.toHaveBeenCalled()
})
