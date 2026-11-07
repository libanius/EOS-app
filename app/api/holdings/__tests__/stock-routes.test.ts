/** INVENTORY-001 / INV-T02 — rotas do estoque e dos lugares, com banco simulado. */

type Op = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }
const ops: Op[] = []

/** Builder encadeável que registra a operação e resolve como o PostgREST. */
function builder(table: string) {
  const rec: Op = { table, op: 'select', filters: [] }
  const b: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => {
    if (name === 'insert' || name === 'update' || name === 'delete' || name === 'upsert') {
      rec.op = name
      rec.payload = args[0]
      ops.push(rec)
    }
    if (name === 'eq') rec.filters.push([String(args[0]), args[1]])
    return b
  }
  for (const n of ['insert', 'update', 'delete', 'upsert', 'select', 'eq', 'neq', 'in', 'is', 'limit']) b[n] = chain(n)
  b.single = async () => ({ data: { id: `new-${table}` }, error: null })
  b.maybeSingle = async () => ({ data: null, error: null })
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
  return b
}
const admin = { from: builder }

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'paulo' } } }) } }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
jest.mock('@/lib/error-log', () => ({ logError: jest.fn() }))

// A casa: Casa do Paulo › Garagem › Mochila vermelha (com uma lanterna); o carro; um rádio da Daniela.
const HOUSE = () => ({
  me: 'paulo',
  accountIds: ['paulo', 'daniela'],
  names: new Map([['paulo', 'Paulo'], ['daniela', 'Daniela']]),
  coverage: new Map([['paulo', 1], ['daniela', 1]]),
  homeRootIds: ['casa'],
  locations: [
    { id: 'casa', parentId: null, name: 'Casa', kind: 'HOME', isDefault: true, profileId: 'paulo', holdingId: null },
    { id: 'garagem', parentId: 'casa', name: 'Garagem', kind: 'CUSTOM', isDefault: false, profileId: 'paulo', holdingId: null },
    { id: 'mochila-loc', parentId: 'garagem', name: 'Mochila vermelha', kind: 'CUSTOM', isDefault: false, profileId: 'paulo', holdingId: 'mochila' },
    { id: 'carro', parentId: null, name: 'Carro', kind: 'VEHICLE', isDefault: false, profileId: 'paulo', holdingId: null },
  ],
  items: [
    { id: 'mochila', profileId: 'paulo', locationId: 'garagem', resourceKey: 'mochila', label: 'Mochila vermelha', kind: 'DURABLE', quantity: 1, unit: 'un', provenance: 'MANUAL' },
    { id: 'lanterna', profileId: 'paulo', locationId: 'mochila-loc', resourceKey: 'lanterna', label: 'Lanterna', kind: 'DURABLE', quantity: 1, unit: 'un', provenance: 'MANUAL' },
    { id: 'radio', profileId: 'daniela', locationId: 'casa', resourceKey: 'radio-comunicacao', label: 'Rádio', kind: 'DURABLE', quantity: 1, unit: 'un', brand: null, model: null, notes: null, expiresOn: null, foodType: null, mealsOverride: null, category: 'comunicacao', provenance: 'MANUAL' },
  ],
})

const touchedLog: string[][] = []
jest.mock('@/lib/inventory-server', () => {
  const real = jest.requireActual('@/lib/inventory-server')
  return {
    ...real,
    loadHouse: async () => HOUSE(),
    withStockWrite: async (_a: unknown, _u: string, touched: (h: unknown) => string[], write: (h: unknown) => Promise<unknown>) => {
      const h = HOUSE()
      touchedLog.push(touched(h))
      return { result: await write(h), house: HOUSE() }
    },
  }
})

import { GET, POST } from '../route'
import { PATCH, DELETE } from '../[id]/route'
import { POST as POST_LOC } from '../../locations/route'
import { PATCH as PATCH_LOC, DELETE as DELETE_LOC } from '../../locations/[id]/route'

const req = (method: string, body?: unknown, url = 'http://localhost/api/holdings') =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const p = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => { ops.length = 0; touchedLog.length = 0 })

describe('POST /api/holdings', () => {
  it('cria na minha Casa, dono = eu, autor = eu, origem MANUAL', async () => {
    const res = await POST(req('POST', { label: 'Galão 5 gal', resourceKey: 'agua', quantity: 20, unit: 'gal' }))
    expect(res.status).toBe(201)
    expect(ops[0]).toMatchObject({ table: 'holdings', op: 'insert', payload: expect.objectContaining({
      profile_id: 'paulo', location_id: 'casa', resource_key: 'agua', quantity: 20, unit: 'gal', created_by: 'paulo', updated_by: 'paulo', provenance: 'MANUAL', kind: 'CONSUMABLE',
    }) })
    expect(touchedLog[0]).toEqual(['paulo'])
  })
  it('critério 17: arroz em kg grava tipo; sem tipo, "outro"', async () => {
    await POST(req('POST', { label: 'Arroz', resourceKey: 'comida', quantity: 5, unit: 'kg', foodType: 'arroz' }))
    expect(ops[0].payload).toMatchObject({ food_type: 'arroz', unit: 'kg', quantity: 5 })
    ops.length = 0
    await POST(req('POST', { label: 'Mix', resourceKey: 'comida', quantity: 1, unit: 'kg' }))
    expect(ops[0].payload).toMatchObject({ food_type: 'outro' })
  })
  it('E8: nome livre vira custom:<slug>', async () => {
    await POST(req('POST', { label: 'Faca Leatherman' }))
    expect(ops[0].payload).toMatchObject({ resource_key: 'custom:faca-leatherman', category: 'outros', unit: 'un', quantity: 1 })
  })
  it('422: quantidade negativa, unidade errada, validade inválida; 400 sem nome', async () => {
    expect((await POST(req('POST', { label: 'Água', resourceKey: 'agua', quantity: -1, unit: 'L' }))).status).toBe(422)
    expect((await POST(req('POST', { label: 'Água', resourceKey: 'agua', quantity: 1, unit: 'kg' }))).status).toBe(422)
    expect((await POST(req('POST', { label: 'Pilhas', resourceKey: 'pilhas', expiresOn: '2026-02-30' }))).status).toBe(422)
    expect((await POST(req('POST', { quantity: 1 }))).status).toBe(400)
    expect(ops).toEqual([])
  })
  it('E13a: item sem validade é aceito sem aviso', async () => {
    expect((await POST(req('POST', { label: 'Lanterna', resourceKey: 'lanterna' }))).status).toBe(201)
    expect(ops[0].payload).toMatchObject({ expires_on: null })
  })
  it('lugar de fora da casa: 403; origem BACKFILL não vem do cliente: 422', async () => {
    expect((await POST(req('POST', { label: 'X', locationId: 'outra-casa' }))).status).toBe(403)
    expect((await POST(req('POST', { label: 'X', provenance: 'BACKFILL' }))).status).toBe(422)
  })
})

describe('GET /api/holdings', () => {
  it('a casa toda, com o nome da dona de cada item', async () => {
    const d = await (await GET(req('GET'))).json()
    expect(d.items.find((i: { id: string }) => i.id === 'radio').ownerName).toBe('Daniela')
    expect(d.accounts).toHaveLength(2)
  })
})

describe('PATCH /api/holdings/[id]', () => {
  it('critério 8: Paulo edita o rádio da Daniela; o item continua dela, updated_by = Paulo', async () => {
    const res = await PATCH(req('PATCH', { brand: 'Midland', model: 'ER310' }), p('radio'))
    expect(res.status).toBe(200)
    expect(ops[0]).toMatchObject({ table: 'holdings', op: 'update', payload: expect.objectContaining({ brand: 'Midland', model: 'ER310', updated_by: 'paulo' }) })
    expect((ops[0].payload as Record<string, unknown>).profile_id).toBeUndefined()
    expect(touchedLog[0]).toEqual(['daniela'])
  })
  it('critério 13: item de outra casa → 403, nada muda', async () => {
    expect((await PATCH(req('PATCH', { quantity: 2 }), p('nao-existe'))).status).toBe(403)
    expect(ops).toEqual([])
  })
  it('E3: mover a mochila move o lugar junto e recalcula a casa toda', async () => {
    await PATCH(req('PATCH', { locationId: 'carro' }), p('mochila'))
    expect(ops.map(o => [o.table, o.op])).toEqual([['holdings', 'update'], ['locations', 'update']])
    expect(ops[1].payload).toMatchObject({ parent_id: 'carro' })
    expect(touchedLog[0]).toEqual(['paulo', 'daniela'])
  })
  it('E15: a mochila não entra nela mesma', async () => {
    expect((await PATCH(req('PATCH', { locationId: 'mochila-loc' }), p('mochila'))).status).toBe(422)
    expect(ops).toEqual([])
  })
})

describe('DELETE /api/holdings/[id]', () => {
  it('critério 14: mochila com itens sem destino → 422, nada apagado', async () => {
    expect((await DELETE(req('DELETE'), p('mochila'))).status).toBe(422)
    expect(ops).toEqual([])
  })
  it('critério 14: com destino, os itens mudam de lugar e nenhum é apagado além da mochila', async () => {
    const res = await DELETE(req('DELETE', { moveTo: 'garagem' }), p('mochila'))
    expect(res.status).toBe(200)
    expect(ops.map(o => [o.table, o.op])).toEqual([['holdings', 'update'], ['locations', 'delete'], ['holdings', 'delete']])
    expect(ops[0].payload).toMatchObject({ location_id: 'garagem' })
    expect(ops[2].filters).toEqual([['id', 'mochila']])
  })
  it('item comum sai direto', async () => {
    await DELETE(req('DELETE'), p('radio'))
    expect(ops.map(o => [o.table, o.op])).toEqual([['holdings', 'delete']])
  })
})

describe('lugares', () => {
  it('mochila nova = item mochila + lugar ligado a ele', async () => {
    const res = await POST_LOC(req('POST', { name: 'Mochila preta', bag: true, parentId: 'garagem' }, 'http://localhost/api/locations'))
    expect(res.status).toBe(201)
    expect(ops[0]).toMatchObject({ table: 'holdings', op: 'insert', payload: expect.objectContaining({ resource_key: 'mochila', label: 'Mochila preta', location_id: 'garagem' }) })
    expect(ops[1]).toMatchObject({ table: 'locations', op: 'insert', payload: expect.objectContaining({ parent_id: 'garagem', holding_id: 'new-holdings' }) })
  })
  it('sublugar padrão vai na minha Casa; carro pode ser raiz', async () => {
    await POST_LOC(req('POST', { name: 'Despensa' }, 'http://localhost/api/locations'))
    expect(ops[0].payload).toMatchObject({ parent_id: 'casa', kind: 'CUSTOM' })
    ops.length = 0
    await POST_LOC(req('POST', { name: 'Carro 2', kind: 'VEHICLE', parentId: null }, 'http://localhost/api/locations'))
    expect(ops[0].payload).toMatchObject({ parent_id: null, kind: 'VEHICLE' })
  })
  it('E15: mover a Garagem para dentro da mochila que está nela → 422', async () => {
    expect((await PATCH_LOC(req('PATCH', { parentId: 'mochila-loc' }), p('garagem'))).status).toBe(422)
  })
  it('a Casa padrão não muda de lugar nem é apagada', async () => {
    expect((await PATCH_LOC(req('PATCH', { parentId: 'carro' }), p('casa'))).status).toBe(422)
    expect((await DELETE_LOC(req('DELETE'), p('casa'))).status).toBe(422)
  })
  it('E21: apagar a Garagem com coisas dentro exige destino; com destino, move e apaga', async () => {
    expect((await DELETE_LOC(req('DELETE'), p('garagem'))).status).toBe(422)
    expect(ops).toEqual([])
    await DELETE_LOC(req('DELETE', { moveTo: 'casa' }), p('garagem'))
    expect(ops.map(o => [o.table, o.op])).toEqual([['holdings', 'update'], ['locations', 'update'], ['locations', 'delete']])
  })
  it('mover a mochila pelo lugar move o item junto', async () => {
    await PATCH_LOC(req('PATCH', { parentId: 'carro' }), p('mochila-loc'))
    expect(ops.map(o => [o.table, o.op])).toEqual([['locations', 'update'], ['holdings', 'update']])
    expect(ops[1].payload).toMatchObject({ location_id: 'carro' })
  })
})
