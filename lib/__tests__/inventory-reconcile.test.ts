/** INVENTORY-001 / INV-T02 — reconciliação (E10, E11, E24) e escrita legada (E9). */

import { legacyWritePlan, projectInventory, reconcilePlan, type InventoryRow, type ReconcileItem, type StockOp } from '@/lib/inventory'
import type { EosLocation } from '@/lib/holdings'

const LOCS: EosLocation[] = [{ id: 'casa', parentId: null, name: 'Casa', kind: 'HOME', isDefault: true }]
let n = 0
const it_ = (p: Partial<ReconcileItem>): ReconcileItem => ({
  id: `h${++n}`, profileId: 'paulo', locationId: 'casa', resourceKey: 'agua', label: 'x', kind: 'CONSUMABLE',
  quantity: 0, unit: 'L', brand: null, model: null, notes: null, expiresOn: null, foodType: null,
  mealsOverride: null, provenance: 'MANUAL', ...p,
})
const row = (p: Partial<InventoryRow> = {}): InventoryRow => ({
  water_liters: 0, food_days: 0, fuel_liters: 0, cash_amount: 0, has_medical_kit: false, has_communication_device: false, ...p,
})

/** Aplica as operações em memória, para conferir o resultado pela projeção. */
function apply(items: ReconcileItem[], ops: StockOp[]): ReconcileItem[] {
  let out = items.map(i => ({ ...i }))
  for (const o of ops) {
    if (o.op === 'delete') out = out.filter(i => i.id !== o.id)
    if (o.op === 'update') out = out.map(i => (i.id === o.id ? { ...i, quantity: o.quantity, unit: o.unit } : i))
    if (o.op === 'create') out.push(it_({ ...o.item, provenance: 'BACKFILL' }))
  }
  return out
}

describe('reconciliação antes da primeira escrita', () => {
  it('E24: backfill diz 20 L, a linha diz 40 L → o informado vai para 40', () => {
    const items = [it_({ id: 'b1', quantity: 20, provenance: 'BACKFILL' })]
    const ops = reconcilePlan(items, row({ water_liters: 40 }), 1)
    expect(ops).toEqual([{ op: 'update', id: 'b1', quantity: 40, unit: 'L' }])
  })

  it('critério 20: depois de reconciliar, a projeção é igual à linha gravada', () => {
    const items = [
      it_({ id: 'w', quantity: 20, provenance: 'BACKFILL' }),
      it_({ id: 'f', resourceKey: 'comida', quantity: 4, unit: 'dia-pessoa', provenance: 'BACKFILL' }),
      it_({ id: 'k', resourceKey: 'kit-medico', kind: 'DURABLE', quantity: 1, unit: null, provenance: 'BACKFILL' }),
    ]
    const r = row({ water_liters: 37.854, food_days: 5, fuel_liters: 10, cash_amount: 150, has_medical_kit: false, has_communication_device: true })
    const after = apply(items, reconcilePlan(items, r, 2))
    const p = projectInventory(after, LOCS, ['casa'], 2)
    expect(p).toEqual({ water_liters: 37.854, food_days: 5, fuel_liters: 10, cash_amount: 150, has_medical_kit: false, has_communication_device: true })
  })

  it('itens detalhados nunca mudam; o informado cobre só a diferença', () => {
    const items = [it_({ id: 'd', quantity: 30, provenance: 'MANUAL' }), it_({ id: 'b', quantity: 5, provenance: 'BACKFILL' })]
    expect(reconcilePlan(items, row({ water_liters: 40 }), 1)).toEqual([{ op: 'update', id: 'b', quantity: 10, unit: 'L' }])
  })

  it('detalhados passam do número gravado: o estoque ganha, o informado sai', () => {
    const items = [it_({ id: 'd', quantity: 50 }), it_({ id: 'b', quantity: 5, provenance: 'BACKFILL' })]
    expect(reconcilePlan(items, row({ water_liters: 40 }), 1)).toEqual([{ op: 'delete', id: 'b' }])
  })

  it('já batendo: nenhuma operação', () => {
    const items = [it_({ id: 'b', quantity: 40, provenance: 'BACKFILL' })]
    expect(reconcilePlan(items, row({ water_liters: 40 }), 1)).toEqual([])
  })

  it('conta sem linha: nada a reconciliar', () => {
    expect(reconcilePlan([it_({ quantity: 3 })], null, 1)).toEqual([])
  })

  it('rádio marcado na linha e ausente no estoque: cria o informado; desmarcado: só o informado sai', () => {
    expect(reconcilePlan([], row({ has_communication_device: true }), 1)).toEqual([
      { op: 'create', item: { resourceKey: 'radio-comunicacao', label: 'Rádio (estoque informado)', kind: 'DURABLE', quantity: 1, unit: 'un' } },
    ])
    const items = [
      it_({ id: 'b', resourceKey: 'radio-comunicacao', kind: 'DURABLE', quantity: 1, provenance: 'BACKFILL' }),
      it_({ id: 'm', resourceKey: 'radio-comunicacao', kind: 'DURABLE', quantity: 1, provenance: 'MANUAL' }),
    ]
    expect(reconcilePlan(items, row({ has_communication_device: false }), 1)).toEqual([{ op: 'delete', id: 'b' }])
  })

  it('dados reais de produção (2026-11-07): backfill 26,5 L e 50 BRL, linha 75,71 L e 200 → sobe, sem trocar a moeda', () => {
    const items = [
      it_({ id: 'w', quantity: 26.5, provenance: 'BACKFILL' }),
      it_({ id: 'c', resourceKey: 'dinheiro', quantity: 50, unit: 'BRL', provenance: 'BACKFILL' }),
      it_({ id: 'f', resourceKey: 'comida', quantity: 9, unit: 'dia-pessoa', provenance: 'BACKFILL' }),
      it_({ id: 'fu', resourceKey: 'combustivel', quantity: 10, provenance: 'BACKFILL' }),
      it_({ id: 'k', resourceKey: 'kit-medico', kind: 'DURABLE', quantity: 1, unit: null, provenance: 'BACKFILL' }),
      it_({ id: 'r', resourceKey: 'radio-comunicacao', kind: 'DURABLE', quantity: 1, unit: null, provenance: 'BACKFILL' }),
    ]
    const r = row({ water_liters: 75.71, food_days: 9, fuel_liters: 10, cash_amount: 200, has_medical_kit: true, has_communication_device: true })
    expect(reconcilePlan(items, r, 1)).toEqual([
      { op: 'update', id: 'w', quantity: 75.71, unit: 'L' },
      { op: 'update', id: 'c', quantity: 200, unit: 'BRL' },
    ])
  })

  it('comida: a linha está em dias para quem a conta cobre', () => {
    // 10 dias × 3 pessoas × 3 refeições = 90 refeições
    expect(reconcilePlan([], row({ food_days: 10 }), 3)).toEqual([
      { op: 'create', item: { resourceKey: 'comida', label: 'Comida (estoque informado)', kind: 'CONSUMABLE', quantity: 90, unit: 'refeicoes' } },
    ])
  })
})

describe('escrita da tela antiga (E9)', () => {
  it('40 L com 30 L detalhados → informado de 10 L', () => {
    const items = [it_({ id: 'd', quantity: 30 })]
    expect(legacyWritePlan(items, { water_liters: 40 }, 1)).toEqual({
      ok: true, ops: [{ op: 'create', item: { resourceKey: 'agua', label: 'Água (estoque informado)', kind: 'CONSUMABLE', quantity: 10, unit: 'L' } }],
    })
  })
  it('E9: detalhados já somam mais que o pedido → recusa e diz quanto', () => {
    expect(legacyWritePlan([it_({ quantity: 50 })], { water_liters: 40 }, 1)).toEqual({ ok: false, field: 'water_liters', detailed: 50 })
  })
  it('"não tenho kit médico" com kit detalhado → recusa', () => {
    const items = [it_({ resourceKey: 'kit-medico', kind: 'DURABLE', quantity: 1 })]
    expect(legacyWritePlan(items, { has_medical_kit: false }, 1)).toMatchObject({ ok: false, field: 'has_medical_kit' })
  })
  it('zerar o informado apaga o item informado', () => {
    const items = [it_({ id: 'b', quantity: 12, provenance: 'BACKFILL' })]
    expect(legacyWritePlan(items, { water_liters: 0 }, 1)).toEqual({ ok: true, ops: [{ op: 'delete', id: 'b' }] })
  })
  it('E23: dias de comida viram refeições pela cobertura da conta', () => {
    expect(legacyWritePlan([], { food_days: 10 }, 2)).toMatchObject({ ok: true, ops: [{ op: 'create', item: { quantity: 60, unit: 'refeicoes' } }] })
  })
  it('E23: com a comida no estoque, um dependente novo divide os dias e mantém a pessoa-dia', () => {
    const items = [it_({ resourceKey: 'comida', quantity: 90, unit: 'refeicoes' })]
    const sozinho = projectInventory(items, LOCS, ['casa'], 1).food_days
    const comDependente = projectInventory(items, LOCS, ['casa'], 2).food_days
    expect(sozinho).toBe(30)
    expect(comDependente).toBe(15)
    expect(sozinho * 1).toBe(comDependente * 2)
  })
})
