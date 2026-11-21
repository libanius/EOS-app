import { NextRequest } from 'next/server'
import { GET } from '@/app/api/pilot/offline-pack/route'
import { createClient } from '@/lib/supabase/server'
import { buildKnowledgePack } from '@/lib/offline-knowledge-server'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/offline-knowledge-server', () => ({ buildKnowledgePack: jest.fn() }))
const request = (etag?: string) => new NextRequest('https://eos.test/api/pilot/offline-pack', { headers: etag ? { 'If-None-Match': etag } : {} })
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'reader' } }, error: null }) } } as never)
  jest.mocked(buildKnowledgePack).mockResolvedValue({ schema: 1, version: 'a'.repeat(64), syncedAt: '2026-11-10', documents: [] })
})
it('requires authentication before reading the service-role corpus', async () => {
  jest.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } } as never)
  expect((await GET(request())).status).toBe(401)
  expect(buildKnowledgePack).not.toHaveBeenCalled()
})
it('sends a versioned private, no-store snapshot with conditional 304', async () => {
  const result = await GET(request())
  expect(result.status).toBe(200)
  expect(result.headers.get('Cache-Control')).toBe('private, no-store')
  expect((await result.json()).version).toBe('a'.repeat(64))
  expect((await GET(request('"' + 'a'.repeat(64) + '"'))).status).toBe(304)
})
it('makes unavailable sources and size limits explicit', async () => {
  jest.mocked(buildKnowledgePack).mockRejectedValue(new Error('manual_source_unavailable'))
  expect((await GET(request())).status).toBe(503)
  jest.mocked(buildKnowledgePack).mockRejectedValue(new Error('knowledge_pack_too_large'))
  expect((await GET(request())).status).toBe(413)
})

it('returns bounded parts pinned to the manifest version and rejects incompatible versions', async () => {
  const result = await GET(request())
  const manifest = await result.json()
  expect(manifest.parts).toBe(1)
  const response = await GET(new NextRequest(`https://eos.test/api/pilot/offline-pack?version=${manifest.version}&part=0`))
  expect((await response.json()).data).toBe('[]')
  expect((await GET(new NextRequest('https://eos.test/api/pilot/offline-pack?version=other&part=0'))).status).toBe(409)
})
