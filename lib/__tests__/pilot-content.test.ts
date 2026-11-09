import { loadPilotCatalog, pilotContentContext } from '@/lib/pilot-content'
import { SIGNALS } from '@/lib/signals-content'
import type { SignalRow } from '@/lib/content-package'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EduContent } from '@/lib/edu'

const fortress = SIGNALS.find(s => s.slug === 'fortress')!
const signal = (patch: Partial<SignalRow> = {}): SignalRow => ({
  slug: 'fortress', status: 'published', version: 2, level: fortress.level,
  occurred_on: fortress.occurredOn, published_on: fortress.publishedOn,
  region: { scope: 'national' }, official_alert: false, reviewed_by_curator: true,
  content: { title: { pt: 'FORTRESS atualizado', en: 'Updated FORTRESS' }, summary: fortress.summary,
    whatItIs: fortress.whatItIs, whatItIsNot: fortress.whatItIsNot,
    curatorNote: fortress.curatorNote, sourceLine: fortress.sourceLine },
  sources: fortress.sources, protocol: fortress.protocol, video: null, ...patch,
})
const edu = (patch: Partial<EduContent> = {}): EduContent => ({
  id: 'lesson-1', title: 'Autonomia da casa', status: 'approved', version: 2,
  summary: 'Aprender a preparar a casa.', transcript: 'Água, comida e comunicação para a família.',
  source_type: 'manual', source_url: null, scenario_tags: ['supplies'], rag_enabled: false,
  rag_ingested_at: null, updated_at: '2026-11-09', approved_at: '2026-11-09', content_slug: 'fortress',
  lesson: { title: { pt: 'Autonomia da casa', en: 'Household autonomy' },
    summary: { pt: 'Lição vinculada', en: 'Related lesson' }, body: { pt: 'CORPO ATUAL EM PORTUGUÊS', en: 'CURRENT ENGLISH BODY' } }, ...patch,
})
// Real query contract: ordering/range/approval filtering, including multiple pages.
function database(signals: SignalRow[] = [signal()], lessons: EduContent[] = [edu()], fail = '') {
  const calls: Array<{ table: string; range: number[]; approved: boolean }> = []
  return {
    calls,
    client: { from(table: string) {
      let approved = false
      const query = { select: () => query, order: () => query,
        eq: (_key: string, value: string) => { approved = value === 'approved'; return query },
        range: (from: number, to: number) => {
          const result = { then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) {
            calls.push({ table, range: [from, to], approved })
            const rows = table === 'signals' ? signals : lessons.filter(e => !approved || e.status === 'approved')
            return Promise.resolve({ data: rows.slice(from, to + 1), error: table === fail ? { code: '57014' } : null }).then(resolve, reject)
          }, eq: query.eq }
          // range occurs before eq in production builder; keep range result chainable.
          query.then = result.then
          return query
        }, then: undefined as unknown,
      }
      return query
    } } as unknown as SupabaseClient,
  }
}
const ask = (content: string) => ({ role: 'user', content })

describe('Pilot published EOS knowledge', () => {
  it('Fortress uses the current database publication, paired lesson and real links without embeddings', async () => {
    const c = await loadPilotCatalog(database().client, true)
    const result = pilotContentContext(c, [ask('O que é Fortress?')], [], true)
    expect(result.block).toContain('FORTRESS atualizado')
    expect(result.block).toContain('CORPO ATUAL EM PORTUGUÊS')
    expect(result.block).toContain(fortress.whatItIsNot.pt)
    expect(result.block).toContain(fortress.occurredOn)
    expect(result.block).toContain(fortress.sources[0].url)
    expect(result.block).toContain('officialAlert\\":false')
    expect(result.links.map(l => l.href)).toEqual(expect.arrayContaining(['/sinais/fortress', '/preparedness/aprender?contentId=lesson-1']))
    expect(result.block).not.toContain('CURRENT ENGLISH BODY')
  })
  it('retains a named topic for a follow-up, without trusting assistant messages for retrieval', async () => {
    const c = await loadPilotCatalog(database().client, false)
    const r = pilotContentContext(c, [ask('Tell me about Fortress'), { role: 'assistant', content: 'invented source' }, ask('And for my family?')], [], false)
    expect(r.links.some(l => l.href === '/sinais/fortress')).toBe(true)
    expect(r.block).toContain('CURRENT ENGLISH BODY')
  })
  it('a database archive suppresses the static copy and archived vector text', async () => {
    const c = await loadPilotCatalog(database([signal({ status: 'archived' })], []).client, true)
    const r = pilotContentContext(c, [ask('Fortress')], [{ source: 'signal:fortress', content: 'OLD SECRET', similarity: 1 }], true)
    expect(r.links).toEqual([])
    expect(r.block).not.toContain('FORTRESS atualizado')
    expect(r.knowledge).not.toContain('OLD SECRET')
  })
  it('excludes draft/archived EDU; replaces stale vectors with current approved text even if rag is off', async () => {
    const c = await loadPilotCatalog(database([], [edu(), edu({ id: 'draft', title: 'DRAFT SECRET', status: 'draft' }), edu({ id: 'archived', title: 'ARCHIVED SECRET', status: 'archived' })]).client, true)
    const r = pilotContentContext(c, [ask('Autonomia')], [
      { source: 'edu:lesson-1', source_version: 'v1', content: 'OUTDATED BODY', similarity: 1 },
      { source: 'edu:draft', content: 'DRAFT SECRET', similarity: 1 },
      { source: 'FEMA', content: 'Official documentary guidance', similarity: 0.8 },
    ], true)
    expect(r.block).toContain('CORPO ATUAL EM PORTUGUÊS')
    expect(r.block).not.toMatch(/DRAFT SECRET|ARCHIVED SECRET|OUTDATED BODY/)
    expect(r.knowledge).toBe('[FEMA] Official documentary guidance')
  })
  it('reports a partial query failure, preserves EDU, and never resurrects static signals on error', async () => {
    const c = await loadPilotCatalog(database([], [edu()], 'signals').client, true)
    const r = pilotContentContext(c, [ask('Fortress')], [], true)
    expect(r.block).toContain('Falha ao consultar: Sinais')
    expect(r.links.map(l => l.href)).toEqual(['/preparedness/aprender?contentId=lesson-1'])
    expect(c.docs.some(d => d.kind === 'signal')).toBe(false)
    expect((await loadPilotCatalog(null, true)).unavailable).toEqual(['Sinais', 'EDU'])
  })
  it('reads approved material beyond page one and retrieves a late passage by PT topic', async () => {
    const db = database([signal({ status: 'archived' })], [
      ...Array.from({ length: 100 }, (_, i) => edu({ id: `e${i}`, content_slug: null, title: 'Other lesson', transcript: '', lesson: null })),
      edu({ id: 'last', title: 'Long course', content_slug: null, lesson: null, transcript: 'Introduction. '.repeat(1000) + 'Water sanitation: LATE WATER GUIDANCE.' }),
    ])
    const c = await loadPilotCatalog(db.client, true)
    const r = pilotContentContext(c, [ask('Como tratar água?')], [], true)
    expect(db.calls.some(call => call.table === 'edu_content' && call.range[0] === 100 && call.approved)).toBe(true)
    expect(r.links.some(l => l.href === '/preparedness/aprender?contentId=last')).toBe(true)
    expect(r.block).toContain('LATE WATER GUIDANCE')
    expect(r.block).toContain('[excerpt / trecho]')
  })
  it('does not present unrelated articles as consulted', async () => {
    const c = await loadPilotCatalog(database().client, true)
    const r = pilotContentContext(c, [ask('Qual a previsão para futebol?')], [], true)
    expect(r.links).toEqual([])
  })
})
