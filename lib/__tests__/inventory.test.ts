/** INVENTORY-001 / INV-T01 — estoque: unidades, comida estimada, projeção, validade, catálogo. */

import {
  coveringItems,
  expiryState,
  gramsOf,
  homeScope,
  isIsoDate,
  litersOf,
  mealsOf,
  projectInventory,
  type StockItem,
} from '@/lib/inventory'
import { catalogEntry, categoryOf, customKey, isCustomKey, suggest, unitsFor } from '@/lib/resource-catalog'
import type { EosLocation } from '@/lib/holdings'
import { signalBySlug } from '@/lib/signals-content'

const loc = (id: string, parentId: string | null, kind: EosLocation['kind'] = 'CUSTOM', isDefault = false): EosLocation =>
  ({ id, parentId, name: id, kind, isDefault })

// Casa do Paulo (com garagem e mochila vermelha), Casa da Daniela, e o carro.
const LOCS: EosLocation[] = [
  loc('casa-paulo', null, 'HOME', true),
  loc('garagem', 'casa-paulo'),
  loc('mochila-vermelha', 'garagem'),
  loc('casa-daniela', null, 'HOME', true),
  loc('carro', null, 'VEHICLE'),
]
const HOMES = ['casa-paulo', 'casa-daniela']

let seq = 0
const item = (p: Partial<StockItem>): StockItem => ({
  id: `i${++seq}`, profileId: 'paulo', locationId: 'casa-paulo', resourceKey: 'lanterna', label: 'x',
  kind: 'DURABLE', quantity: 1, unit: null, brand: null, model: null, notes: null, expiresOn: null,
  foodType: null, mealsOverride: null, ...p,
})

describe('unidades (D-158)', () => {
  it('litros a partir de gal e L; outra unidade não vira litro', () => {
    expect(litersOf(10, 'L')).toBe(10)
    expect(litersOf(20, 'gal')).toBeCloseTo(75.708, 3)
    expect(litersOf(5, 'kg')).toBeNull()
    expect(litersOf(5, null)).toBeNull()
  })
  it('E7d: gramas a partir de g, kg, lb e oz', () => {
    expect(gramsOf(500, 'g')).toBe(500)
    expect(gramsOf(5, 'kg')).toBe(5000)
    expect(gramsOf(11, 'lb')).toBeCloseTo(4989.5, 1)
    expect(gramsOf(16, 'oz')).toBeCloseTo(453.6, 1)
    expect(gramsOf(5, 'L')).toBeNull()
  })
})

describe('comida estimada pelo peso (D-I6)', () => {
  it('E7a: arroz 5 kg = 27 refeições, marcado como estimativa', () => {
    expect(mealsOf({ quantity: 5, unit: 'kg', foodType: 'arroz', mealsOverride: null })).toEqual({ meals: 27, estimated: true })
  })
  it('critério 17: o mesmo arroz gravado em 5000 g dá o mesmo número', () => {
    expect(mealsOf({ quantity: 5000, unit: 'g', foodType: 'arroz', mealsOverride: null })?.meals).toBe(27)
  })
  it('E7b: 12 latas de 425 g (enlatado) ≈ 6 refeições', () => {
    expect(mealsOf({ quantity: 5100, unit: 'g', foodType: 'enlatado', mealsOverride: null })?.meals).toBe(6)
  })
  it('E7c: correção à mão vale e tira a etiqueta de estimativa', () => {
    expect(mealsOf({ quantity: 5, unit: 'kg', foodType: 'arroz', mealsOverride: 30 })).toEqual({ meals: 30, estimated: false })
  })
  it('E7e: sem tipo estima como "outro", para menos', () => {
    const semTipo = mealsOf({ quantity: 5, unit: 'kg', foodType: null, mealsOverride: null })!.meals
    expect(semTipo).toBe(11)
    expect(semTipo).toBeLessThan(mealsOf({ quantity: 5, unit: 'kg', foodType: 'arroz', mealsOverride: null })!.meals)
  })
  it('legado do backfill: dia-pessoa vira refeições sem estimativa', () => {
    expect(mealsOf({ quantity: 4, unit: 'dia-pessoa', foodType: null, mealsOverride: null })).toEqual({ meals: 12, estimated: false })
  })
  it('unidade desconhecida não vira refeição', () => {
    expect(mealsOf({ quantity: 3, unit: 'caixas', foodType: 'arroz', mealsOverride: null })).toBeNull()
  })
})

describe('sob a Casa (E3, E20)', () => {
  it('as duas Casas padrão e tudo dentro delas; o carro fica fora', () => {
    const s = homeScope(LOCS, HOMES)
    expect(Array.from(s).sort()).toEqual(['casa-daniela', 'casa-paulo', 'garagem', 'mochila-vermelha'])
  })
  it('E3: a mochila vai para o carro e sai da Casa, com tudo dentro', () => {
    const noCarro = LOCS.map(l => (l.id === 'mochila-vermelha' ? { ...l, parentId: 'carro' } : l))
    expect(homeScope(noCarro, HOMES).has('mochila-vermelha')).toBe(false)
  })
})

describe('projeção: estoque → resource_inventory (§4.2)', () => {
  const agua = [
    item({ resourceKey: 'agua', kind: 'CONSUMABLE', quantity: 20, unit: 'gal', locationId: 'garagem' }),
    item({ resourceKey: 'agua', kind: 'CONSUMABLE', quantity: 10, unit: 'L', locationId: 'mochila-vermelha' }),
  ]

  it('E6/critério 2: 20 gal + 10 L = 85,708 L', () => {
    expect(projectInventory(agua, LOCS, HOMES, 1).water_liters).toBeCloseTo(85.708, 3)
  })

  it('critério 4: mochila no carro tira os 10 L da casa', () => {
    const noCarro = LOCS.map(l => (l.id === 'mochila-vermelha' ? { ...l, parentId: 'carro' } : l))
    expect(projectInventory(agua, noCarro, HOMES, 1).water_liters).toBeCloseTo(75.708, 3)
  })

  it('E7: 90 refeições numa conta que cobre 3 pessoas = 10 dias', () => {
    const c = [item({ resourceKey: 'comida', kind: 'CONSUMABLE', quantity: 90, unit: 'refeicoes' })]
    expect(projectInventory(c, LOCS, HOMES, 3).food_days).toBe(10)
  })

  it('kit médico e rádio são presença; quantidade 0 não conta (E17)', () => {
    const p = projectInventory(
      [item({ resourceKey: 'kit-medico' }), item({ resourceKey: 'radio-comunicacao', quantity: 0 })],
      LOCS, HOMES, 1,
    )
    expect(p.has_medical_kit).toBe(true)
    expect(p.has_communication_device).toBe(false)
  })

  it('combustível em L, dinheiro somado; itens fora da Casa e unidade estranha não somam', () => {
    const p = projectInventory([
      item({ resourceKey: 'combustivel', kind: 'CONSUMABLE', quantity: 5, unit: 'gal' }),
      item({ resourceKey: 'combustivel', kind: 'CONSUMABLE', quantity: 9, unit: 'L', locationId: 'carro' }),
      item({ resourceKey: 'agua', kind: 'CONSUMABLE', quantity: 3, unit: 'garrafas' }),
      item({ resourceKey: 'dinheiro', kind: 'CONSUMABLE', quantity: 200, unit: 'USD' }),
    ], LOCS, HOMES, 1)
    expect(p.fuel_liters).toBeCloseTo(18.927, 3)
    expect(p.water_liters).toBe(0)
    expect(p.cash_amount).toBe(200)
  })

  it('cobertura 0 ou desconhecida conta como 1 pessoa, nunca divide por zero', () => {
    const c = [item({ resourceKey: 'comida', kind: 'CONSUMABLE', quantity: 30, unit: 'refeicoes' })]
    expect(projectInventory(c, LOCS, HOMES, 0).food_days).toBe(10)
  })
})

describe('quem cobre um item do Sinal (§3.4)', () => {
  it('E4/E22: dois rádios, um de cada conta, cobrem; o do carro não', () => {
    const itens = [
      item({ resourceKey: 'radio-comunicacao', profileId: 'paulo' }),
      item({ resourceKey: 'radio-comunicacao', profileId: 'daniela', locationId: 'casa-daniela' }),
      item({ resourceKey: 'radio-comunicacao', locationId: 'carro' }),
    ]
    expect(coveringItems(itens, LOCS, HOMES, 'radio-comunicacao')).toHaveLength(2)
  })
})

describe('validade (D-I4)', () => {
  it('E13a: sem validade não gera aviso', () => {
    expect(expiryState(null, '2026-11-07')).toBeNull()
  })
  it('critério 11: vencido, a vencer em até 30 dias, e longe', () => {
    expect(expiryState('2026-11-06', '2026-11-07')).toBe('expired')
    expect(expiryState('2026-11-07', '2026-11-07')).toBe('soon')
    expect(expiryState('2026-12-07', '2026-11-07')).toBe('soon')
    expect(expiryState('2026-12-08', '2026-11-07')).toBeNull()
  })
  it('data inválida não vira aviso', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(expiryState('2026-02-30', '2026-11-07')).toBeNull()
  })
})

describe('catálogo (§4.4)', () => {
  it('toda chave do protocolo do FORTRESS está no catálogo', () => {
    const faltando = signalBySlug('fortress')!.protocol.items.map(i => i.resourceKey).filter(k => !catalogEntry(k))
    expect(faltando).toEqual([])
  })
  it('as chaves do inventário antigo estão no catálogo', () => {
    for (const k of ['agua', 'comida', 'combustivel', 'kit-medico', 'radio-comunicacao', 'dinheiro']) {
      expect(catalogEntry(k)).not.toBeNull()
    }
  })
  it('E8: nome livre vira custom:<slug>, categoria Outros, contado em unidades', () => {
    const k = customKey('Faca Leatherman')
    expect(k).toBe('custom:faca-leatherman')
    expect(isCustomKey(k)).toBe(true)
    expect(categoryOf(k)).toBe('outros')
    expect(unitsFor(k)).toEqual(['un'])
  })
  it('unidades por chave: água em volume, comida em peso', () => {
    expect(unitsFor('agua')).toEqual(['gal', 'L'])
    expect(unitsFor('comida')).toEqual(['g', 'kg', 'lb', 'oz'])
  })
  it('sugestões sem acento, em PT e EN', () => {
    expect(suggest('radio').map(c => c.key)).toContain('radio-comunicacao')
    expect(suggest('backpack').map(c => c.key)).toEqual(['mochila'])
    expect(suggest('')).toEqual([])
  })
})
