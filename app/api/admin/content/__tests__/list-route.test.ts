/** CONTENT-T04: a lista do admin (§3.6). Banco simulado. */

let user: { id: string } | null = { id: 'u1' }
let rows: unknown[] | null = []
let dbError: { code?: string; message: string } | null = null

jest.mock('@/lib/admin-route', () => ({ requireAdminUser: async () => user }))
type R = { slug: string; version: number; payload: unknown }
let pageCalls = 0
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => cols === 'payload'
        ? { eq: (_k: string, slug: string) => ({ eq: (_k2: string, version: number) => ({
            maybeSingle: async () => ({ data: (rows as R[]).find(r => r.slug === slug && r.version === version) ?? null, error: null }),
          }) }) }
        : { order: () => ({ order: () => ({ range: async (from: number, to: number) => {
            pageCalls++
            return { data: dbError ? null : (rows ?? []).slice(from, to + 1), error: dbError }
          } }) }) },
    }),
  }),
}))
jest.mock('@/lib/content-store', () => ({
  packageState: async (_a: unknown, slug: string) => ({ slug, liveVersion: slug === 'fortress' ? 1 : null, awaitingApproval: true }),
}))

import { GET } from '../route'
import { fortressPackage } from '@/lib/__tests__/fixtures/content-fortress'

beforeEach(() => { user = { id: 'u1' }; rows = []; dbError = null; pageCalls = 0 })

it('sem ADMIN_EMAILS responde 403 (critério 5d)', async () => {
  user = null
  expect((await GET()).status).toBe(403)
})

it('migração ausente vira aviso, não erro', async () => {
  dbError = { code: '42P01', message: 'relation "content_packages" does not exist' }
  const res = await GET()
  expect(res.status).toBe(200)
  expect((await res.json()).migrationPending).toBe(true)
})

it('agrupa por slug, mostra a última versão, a validação e o que mudou desde a do ar', async () => {
  const v1 = fortressPackage()
  const v2 = fortressPackage({ version: 2, video: { pt: { youtubeId: 'dQw4w9WgXcQ' } } })
  const bad = fortressPackage({ slug: 'furacoes', version: 1 })
  bad.signal.whatItIsNot.en = ''
  rows = [
    { slug: 'fortress', version: 2, status: 'review', payload: v2, received_at: '2026-11-06T04:00:00Z', applied_at: null },
    { slug: 'furacoes', version: 1, status: 'review', payload: bad, received_at: '2026-11-06T03:00:00Z', applied_at: null },
    { slug: 'fortress', version: 1, status: 'review', payload: v1, received_at: '2026-11-05T04:00:00Z', applied_at: '2026-11-05T05:00:00Z' },
  ]
  const { packages } = await (await GET()).json()
  expect(packages).toHaveLength(2)
  const f = packages.find((p: { slug: string }) => p.slug === 'fortress')
  expect(f.latest.version).toBe(2)
  expect(f.changed).toEqual(['video'])
  expect(f.problems).toEqual([])
  expect(f.versions.map((v: { version: number }) => v.version)).toEqual([2, 1])
  const h = packages.find((p: { slug: string }) => p.slug === 'furacoes')
  expect(h.problems).toContain('signal.whatItIsNot vazio em um idioma')
  expect(h.changed).toEqual(['signal', 'lesson'])
})

it('pagina até o fim: nenhuma pauta some depois de 1000 versões', async () => {
  const many: unknown[] = []
  for (let v = 1; v <= 1200; v++) many.push({ slug: 'velha', version: v, status: 'review', payload: fortressPackage({ slug: 'velha', version: v }), received_at: '2026-01-01T00:00:00Z', applied_at: null })
  many.push({ slug: 'nova', version: 1, status: 'review', payload: fortressPackage({ slug: 'nova' }), received_at: '2026-11-06T00:00:00Z', applied_at: null })
  rows = many
  const { packages } = await (await GET()).json()
  expect(pageCalls).toBe(2)
  expect(packages.map((p: { slug: string }) => p.slug).sort()).toEqual(['nova', 'velha'])
  expect(packages.find((p: { slug: string }) => p.slug === 'velha').latest.version).toBe(1200)
})
