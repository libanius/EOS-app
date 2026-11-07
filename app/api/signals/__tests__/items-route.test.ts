/** POST /api/signals/items — banco simulado (SIGNAL-002 critérios 2–5, 8, 12). */

type Row = { id: string; status: string }
let existing: Row | null = null
const writes: Array<{ table: string; op: string; payload: unknown }> = []

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ is: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) }) }) }),
      update: (payload: unknown) => ({ eq: async () => { writes.push({ table, op: 'update', payload }); return { error: null } } }),
      insert: async (payload: unknown) => { writes.push({ table, op: 'insert', payload }); return { error: null } },
      upsert: async (payload: unknown) => { writes.push({ table, op: 'upsert', payload }); return { error: null } },
    }),
  }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
jest.mock('@/lib/error-log', () => ({ logError: jest.fn() }))
let houseNow: Record<string, unknown> = { lanterna: { status: 'met', by: { name: '', isMe: true } } }
jest.mock('@/lib/signal-house-server', () => {
  const { signalBySlug } = jest.requireActual('@/lib/signals-content')
  return {
    findSignal: async (_a: unknown, slug: string) => (slug === 'arquivado' ? { ...signalBySlug('fortress'), status: 'archived' } : signalBySlug(slug) ?? null),
    readHouseState: async () => ({ accounts: 2, items: houseNow }),
  }
})

import { NextRequest } from 'next/server'
import { POST } from '../items/route'

const req = (body: unknown) => new NextRequest('http://localhost/api/signals/items', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => { existing = null; writes.length = 0; houseNow = { lanterna: { status: 'met', by: { name: '', isMe: true } } } })

it('critério 4: sem linha anterior, cria met com origem PROTOCOL e slug', async () => {
  const res = await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have', lang: 'en' }))
  expect(res.status).toBe(200)
  expect(writes).toEqual([{ table: 'requirements', op: 'insert', payload: expect.objectContaining({ status: 'met', provenance: 'PROTOCOL', provenance_ref: 'fortress', label: 'Flashlights, one per person' }) }])
})

it('critério 5: com linha anterior, só o status muda (origem preservada)', async () => {
  existing = { id: 'r1', status: 'proposed' }
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(writes).toEqual([{ table: 'requirements', op: 'update', payload: expect.objectContaining({ status: 'met' }) }])
  expect(Object.keys(writes[0].payload as object).sort()).toEqual(['status', 'updated_at'])
})

it('E4: mesma resposta, e a casa já lê a minha, não regrava', async () => {
  existing = { id: 'r1', status: 'met' }
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(writes).toEqual([])
})

it('E15: minha linha já é met, mas a Daniela respondeu needed depois — regrava e renova a data', async () => {
  existing = { id: 'r1', status: 'met' }
  houseNow = { lanterna: { status: 'needed', by: { name: 'Daniela', isMe: false } } }
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(writes).toEqual([{ table: 'requirements', op: 'update', payload: { status: 'met', updated_at: expect.any(String) } }])
})

it('critério 8: kit médico também grava a marca antiga do inventário', async () => {
  await POST(req({ slug: 'fortress', resourceKey: 'kit-medico', answer: 'have' }))
  expect(writes[1]).toEqual({ table: 'resource_inventory', op: 'upsert', payload: expect.objectContaining({ profile_id: 'me', has_medical_kit: true }) })
  writes.length = 0
  existing = { id: 'r2', status: 'met' }
  await POST(req({ slug: 'fortress', resourceKey: 'kit-medico', answer: 'need' }))
  expect(writes[1]).toEqual({ table: 'resource_inventory', op: 'upsert', payload: expect.objectContaining({ has_medical_kit: false }) })
})

it('critério 12: 404 fora do protocolo, 409 arquivado, 422 água — nada gravado', async () => {
  expect((await POST(req({ slug: 'fortress', resourceKey: 'barco', answer: 'have' }))).status).toBe(404)
  expect((await POST(req({ slug: 'arquivado', resourceKey: 'lanterna', answer: 'have' }))).status).toBe(409)
  expect((await POST(req({ slug: 'fortress', resourceKey: 'agua', answer: 'have' }))).status).toBe(422)
  expect((await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'talvez' }))).status).toBe(400)
  expect(writes).toEqual([])
})
