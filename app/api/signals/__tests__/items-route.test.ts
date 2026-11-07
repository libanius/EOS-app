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
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (payload: unknown) => { writes.push({ table, op: 'insert', payload }); return { error: null } },
    }),
  }),
}))
jest.mock('@/lib/error-log', () => ({ logError: jest.fn() }))
// INVENTORY-001 / INV-T04: o estoque da casa, uma Casa só.
let stockItems: Array<Record<string, unknown>> = []
const stockHouse = () => ({
  me: 'me', accountIds: ['me'], names: new Map([['me', '']]), coverage: new Map([['me', 1]]),
  homeRootIds: ['casa'],
  locations: [{ id: 'casa', parentId: null, name: 'Casa', kind: 'HOME', isDefault: true, profileId: 'me', holdingId: null }],
  items: stockItems,
})
jest.mock('@/lib/inventory-server', () => {
  class StockError extends Error { constructor(public status: number, m: string) { super(m) } }
  return {
    StockError,
    loadHouse: async () => stockHouse(),
    serializeHouse: (h: { items: unknown[] }) => ({ items: h.items }),
    defaultHomeOf: () => 'casa',
    ensureDefaultHome: async () => 'casa',
    withStockWrite: async (_a: unknown, _u: string, _t: unknown, w: (h: unknown) => Promise<unknown>) =>
      ({ result: await w(stockHouse()), house: stockHouse() }),
  }
})
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

beforeEach(() => { existing = null; writes.length = 0; stockItems = []; houseNow = { lanterna: { status: 'met', by: { name: '', isMe: true } } } })
const reqWrites = () => writes.filter(w => w.table === 'requirements')
const lanterna = { id: 'h1', profileId: 'me', locationId: 'casa', resourceKey: 'lanterna', label: 'Lanterna', quantity: 1, unit: 'un', provenance: 'MANUAL' }

it('critério 5 (INVENTORY-001): "Tenho" sem item na casa cria 1 unidade no estoque, origem PROTOCOL + slug', async () => {
  const res = await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have', lang: 'en' }))
  expect(res.status).toBe(200)
  expect(writes.filter(w => w.table === 'holdings')).toEqual([{ table: 'holdings', op: 'insert', payload: expect.objectContaining({
    profile_id: 'me', location_id: 'casa', resource_key: 'lanterna', label: 'Flashlights, one per person', quantity: 1,
    provenance: 'PROTOCOL', provenance_ref: 'fortress', created_by: 'me', category: 'energia',
  }) }])
  expect(reqWrites()).toEqual([{ table: 'requirements', op: 'insert', payload: expect.objectContaining({ status: 'met', provenance: 'PROTOCOL', provenance_ref: 'fortress' }) }])
  expect((await res.json()).house).toBeDefined()
})

it('critério 6 / E4: "Tenho" com o item já na casa não cria outro', async () => {
  stockItems = [lanterna]
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(writes.filter(w => w.table === 'holdings')).toEqual([])
})

it('critério 7 / E5: "Ainda não tenho" com item na casa não grava nada e devolve os itens', async () => {
  stockItems = [lanterna]
  const res = await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'need' }))
  expect(res.status).toBe(200)
  const d = await res.json()
  expect(d.confirmRemoval).toBe(true)
  expect(d.covering.map((i: { id: string }) => i.id)).toEqual(['h1'])
  expect(writes).toEqual([])
})

it('"Ainda não tenho" sem item na casa grava needed', async () => {
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'need' }))
  expect(reqWrites()).toEqual([{ table: 'requirements', op: 'insert', payload: expect.objectContaining({ status: 'needed' }) }])
})

it('item fora da Casa (outro lugar) não cobre: "Tenho" cria na Casa', async () => {
  stockItems = [{ ...lanterna, locationId: 'carro' }]
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(writes.filter(w => w.table === 'holdings')).toHaveLength(1)
})

it('SIGNAL-002 critério 5: com linha anterior, só o status muda (origem preservada)', async () => {
  existing = { id: 'r1', status: 'proposed' }
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(reqWrites()).toEqual([{ table: 'requirements', op: 'update', payload: expect.objectContaining({ status: 'met' }) }])
  expect(Object.keys(reqWrites()[0].payload as object).sort()).toEqual(['status', 'updated_at'])
})

it('E4 (SIGNAL-002): mesma resposta, e a casa já lê a minha, não regrava', async () => {
  existing = { id: 'r1', status: 'met' }
  stockItems = [lanterna]
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(writes).toEqual([])
})

it('E15: minha linha já é met, mas a Daniela respondeu needed depois — regrava e renova a data', async () => {
  existing = { id: 'r1', status: 'met' }
  stockItems = [lanterna]
  houseNow = { lanterna: { status: 'needed', by: { name: 'Daniela', isMe: false } } }
  await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'have' }))
  expect(reqWrites()).toEqual([{ table: 'requirements', op: 'update', payload: { status: 'met', updated_at: expect.any(String) } }])
})

it('kit médico: nunca grava direto em resource_inventory (passa pelo estoque)', async () => {
  await POST(req({ slug: 'fortress', resourceKey: 'kit-medico', answer: 'have' }))
  expect(writes.some(w => w.table === 'resource_inventory')).toBe(false)
  expect(writes.filter(w => w.table === 'holdings')).toHaveLength(1)
})

it('critério 12: 404 fora do protocolo, 409 arquivado, 422 água — nada gravado', async () => {
  expect((await POST(req({ slug: 'fortress', resourceKey: 'barco', answer: 'have' }))).status).toBe(404)
  expect((await POST(req({ slug: 'arquivado', resourceKey: 'lanterna', answer: 'have' }))).status).toBe(409)
  expect((await POST(req({ slug: 'fortress', resourceKey: 'agua', answer: 'have' }))).status).toBe(422)
  expect((await POST(req({ slug: 'fortress', resourceKey: 'lanterna', answer: 'talvez' }))).status).toBe(400)
  expect(writes).toEqual([])
})
