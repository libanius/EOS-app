/** INVENTORY-001 / INV-T02 — achados do Codex no PR #18: casa não lida, trava, cobertura. */

const rpcCalls: Array<[string, Record<string, unknown>]> = []
let lockAnswers: boolean[] = []
const writes: string[] = []
let household: { known: boolean; people: unknown[] } = { known: true, people: [{ userId: 'paulo', awaitingConfirmation: false, name: 'Paulo' }] }

function q() {
  const b: Record<string, unknown> = {}
  for (const n of ['select', 'eq', 'in', 'is', 'neq', 'limit']) b[n] = () => b
  b.maybeSingle = async () => ({ data: { id: 'casa' }, error: null })
  b.upsert = async () => { writes.push('resource_inventory'); return { error: null } }
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
  return b
}
const admin = {
  from: () => q(),
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push([name, args])
    if (name === 'acquire_stock_lock') return { data: lockAnswers.length ? lockAnswers.shift() : true, error: null }
    return { data: null, error: null }
  },
}

jest.mock('@/lib/household', () => ({ getHousehold: async () => household }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
jest.mock('@/lib/error-log', () => ({ logError: jest.fn() }))

import {
  acquireStockLock,
  beginCoverageChange,
  endCoverageChange,
  loadHouse,
  StockError,
  withStockWrite,
} from '@/lib/inventory-server'

beforeEach(() => {
  rpcCalls.length = 0
  writes.length = 0
  lockAnswers = []
  household = { known: true, people: [{ userId: 'paulo', awaitingConfirmation: false, name: 'Paulo' }] }
})

describe('casa não lida (P1)', () => {
  it('loadHouse recusa em vez de inventar uma casa de uma pessoa', async () => {
    household = { known: false, people: [] }
    await expect(loadHouse(admin as never, 'paulo')).rejects.toMatchObject({ status: 503 })
  })
  it('nenhuma escrita acontece', async () => {
    household = { known: false, people: [] }
    const write = jest.fn()
    await expect(withStockWrite(admin as never, 'paulo', () => ['paulo'], write)).rejects.toBeInstanceOf(StockError)
    expect(write).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })
})

describe('trava de escrita (E25)', () => {
  it('espera a outra requisição soltar e então pega', async () => {
    lockAnswers = [false, false, true]
    const token = await acquireStockLock(admin as never, ['paulo'])
    expect(typeof token).toBe('string')
    expect(rpcCalls.filter(c => c[0] === 'acquire_stock_lock')).toHaveLength(3)
  })
  it('desiste com 409 depois das tentativas', async () => {
    lockAnswers = Array(20).fill(false)
    await expect(acquireStockLock(admin as never, ['paulo'])).rejects.toMatchObject({ status: 409 })
  }, 10000)
  it('a escrita roda dentro da trava e solta mesmo quando falha', async () => {
    await expect(withStockWrite(admin as never, 'paulo', () => ['paulo'], async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const names = rpcCalls.map(c => c[0])
    expect(names).toEqual(['acquire_stock_lock', 'release_stock_lock'])
    expect(rpcCalls[1][1].p_token).toBe(rpcCalls[0][1].p_token)
  })
  it('escrita sem conta tocada (sublugar) não trava', async () => {
    await withStockWrite(admin as never, 'paulo', () => [], async () => 'ok')
    expect(rpcCalls).toEqual([])
  })
})

describe('cobertura (P2)', () => {
  it('reconciliação que falhou antes: o recálculo depois não roda, e a trava é solta', async () => {
    household = { known: false, people: [] }
    const snap = await beginCoverageChange('paulo')
    expect(snap).toEqual({ reconciled: [], tokens: [] })
    household = { known: true, people: [{ userId: 'paulo', awaitingConfirmation: false, name: 'Paulo' }] }
    await endCoverageChange('paulo', snap)
    expect(writes).toEqual([])
  })
  it('reconciliada antes: recalcula depois e solta a trava', async () => {
    const snap = await beginCoverageChange('paulo')
    expect(snap.reconciled).toEqual(['paulo'])
    expect(snap.tokens).toHaveLength(1)
    await endCoverageChange('paulo', snap)
    expect(writes).toEqual(['resource_inventory'])
    expect(rpcCalls.map(c => c[0])).toEqual(['acquire_stock_lock', 'release_stock_lock'])
  })
})
