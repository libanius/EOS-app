/**
 * Holdings — fundação do Preparedness State (PREP-T04 / D-160).
 *
 * O teste mais importante deste arquivo é o do critério 6: a autonomia lida
 * pelo modelo NOVO tem que dar exatamente o mesmo que a do modelo ANTIGO. Se
 * divergirem, o EOS ganhou uma quinta conta de prontidão — que `docs/37` §24.2
 * classifica como defeito, não como feature.
 */
import {
  DEFAULT_LOCATION_NAME,
  RESOURCE_KEYS,
  autonomyDaysFromHoldings,
  consumableLitersUnder,
  durableCovers,
  locationSubtree,
  projectLegacyInventory,
  toLiters,
  type EosLocation,
  type Holding,
  type LegacyInventory,
} from '@/lib/holdings'
import { autonomyDays } from '@/lib/household'
import { gallonsToLiters } from '@/lib/units'

const CASA = 'loc-casa'

const legacy = (over: Partial<LegacyInventory> = {}): LegacyInventory => ({
  water_liters: 0,
  food_days: 0,
  fuel_liters: 0,
  battery_percent: 0,
  has_medical_kit: false,
  has_communication_device: false,
  cash_amount: 0,
  ...over,
})

const loc = (id: string, parentId: string | null = null, kind: EosLocation['kind'] = 'HOME'): EosLocation => ({
  id, parentId, name: id, kind, isDefault: id === CASA,
})

describe('toLiters', () => {
  it('aceita litro e galão, nas duas línguas', () => {
    expect(toLiters(10, 'L')).toBe(10)
    expect(toLiters(10, 'litros')).toBe(10)
    expect(toLiters(1, 'gal')).toBeCloseTo(3.785411784, 6)
    expect(toLiters(1, 'galões')).toBeCloseTo(3.785411784, 6)
    expect(toLiters(1, 'gallons')).toBeCloseTo(3.785411784, 6)
  })

  it('unidade desconhecida devolve null, nunca um palpite', () => {
    // Chutar aqui viraria autonomia inventada — e autonomia inventada para
    // cima é o pior erro que este app pode cometer.
    expect(toLiters(10, 'caixas')).toBeNull()
    expect(toLiters(10, null)).toBeNull()
    expect(toLiters(Number.NaN, 'L')).toBeNull()
  })
})

describe('projectLegacyInventory', () => {
  it('projeta só o que existe — zero não vira Holding vazio', () => {
    const holdings = projectLegacyInventory(legacy({ water_liters: 40 }), CASA)
    expect(holdings).toHaveLength(1)
    expect(holdings[0]).toMatchObject({
      resourceKey: RESOURCE_KEYS.water, kind: 'CONSUMABLE', quantity: 40, unit: 'L', locationId: CASA,
    })
  })

  it('kit médico e rádio são DURÁVEIS, não quantidades', () => {
    const holdings = projectLegacyInventory(
      legacy({ has_medical_kit: true, has_communication_device: true }), CASA,
    )
    expect(holdings.every(h => h.kind === 'DURABLE')).toBe(true)
    expect(holdings.map(h => h.resourceKey).sort()).toEqual(
      [RESOURCE_KEYS.comms, RESOURCE_KEYS.medicalKit].sort(),
    )
  })

  it('bateria NÃO vira Holding', () => {
    // Porcentagem de capacidade não é objeto guardado num lugar. Projetá-la
    // criaria um Holding que ninguém consegue apontar numa prateleira.
    const holdings = projectLegacyInventory(legacy({ battery_percent: 80 }), CASA)
    expect(holdings).toHaveLength(0)
  })

  it('sem inventário ou sem localização, projeta nada', () => {
    expect(projectLegacyInventory(null, CASA)).toEqual([])
    expect(projectLegacyInventory(legacy({ water_liters: 40 }), '')).toEqual([])
  })
})

describe('locationSubtree', () => {
  const locais = [loc(CASA), loc('garagem', CASA), loc('armario', 'garagem'), loc('fazenda', null, 'FARM')]

  it('inclui a raiz e tudo abaixo dela', () => {
    expect(locationSubtree(locais, CASA)).toEqual(new Set([CASA, 'garagem', 'armario']))
  })

  it('não inclui um irmão', () => {
    expect(locationSubtree(locais, CASA).has('fazenda')).toBe(false)
  })

  it('um ciclo no banco não trava o cálculo', () => {
    const ciclo = [loc('a', 'b'), loc('b', 'a')]
    expect(locationSubtree(ciclo, 'a')).toEqual(new Set(['a', 'b']))
  })
})

describe('cobertura sem dupla contagem (docs/37 §15.1)', () => {
  const locais = [loc(CASA), loc('garagem', CASA), loc('carro', null, 'VEHICLE')]

  it('consumível soma dentro da casa, incluindo sub-lugares', () => {
    const holdings: Holding[] = [
      { locationId: CASA, resourceKey: RESOURCE_KEYS.water, label: 'Água', kind: 'CONSUMABLE', quantity: 20, unit: 'L' },
      { locationId: 'garagem', resourceKey: RESOURCE_KEYS.water, label: 'Água', kind: 'CONSUMABLE', quantity: 5, unit: 'gal' },
    ]
    expect(consumableLitersUnder(holdings, locais, CASA, RESOURCE_KEYS.water))
      .toBeCloseTo(20 + gallonsToLiters(5), 6)
  })

  it('água do carro NÃO conta na casa', () => {
    const holdings: Holding[] = [
      { locationId: 'carro', resourceKey: RESOURCE_KEYS.water, label: 'Água', kind: 'CONSUMABLE', quantity: 99, unit: 'L' },
    ]
    expect(consumableLitersUnder(holdings, locais, CASA, RESOURCE_KEYS.water)).toBe(0)
  })

  it('unidade desconhecida é ignorada, não somada como litro', () => {
    const holdings: Holding[] = [
      { locationId: CASA, resourceKey: RESOURCE_KEYS.water, label: 'Água', kind: 'CONSUMABLE', quantity: 10, unit: 'L' },
      { locationId: CASA, resourceKey: RESOURCE_KEYS.water, label: 'Água', kind: 'CONSUMABLE', quantity: 999, unit: 'caixas' },
    ]
    expect(consumableLitersUnder(holdings, locais, CASA, RESOURCE_KEYS.water)).toBe(10)
  })

  it('UM torniquete cobre vários kits da casa — e não cobre o do carro', () => {
    /*
     * O teste E de `docs/37` §32. Um objeto físico, uma linha, cobertura
     * honesta: Primeiros Socorros, Bug Out e Furacão são executados de casa;
     * o kit do Veículo não é.
     */
    const holdings: Holding[] = [
      { locationId: 'garagem', resourceKey: 'torniquete', label: 'Torniquete', kind: 'DURABLE', quantity: 1, unit: null },
    ]
    expect(durableCovers(holdings, locais, CASA, 'torniquete')).toBe(true)
    expect(durableCovers(holdings, locais, 'carro', 'torniquete')).toBe(false)
  })
})

describe('critério 6 — a autonomia nova bate com a antiga', () => {
  const locais = [loc(CASA)]

  const casos: Array<{ nome: string; inv: LegacyInventory; pessoas: number }> = [
    { nome: 'água limita', inv: legacy({ water_liters: 30, food_days: 99 }), pessoas: 2 },
    { nome: 'comida limita', inv: legacy({ water_liters: 999, food_days: 6 }), pessoas: 1 },
    { nome: 'casa vazia', inv: legacy(), pessoas: 4 },
    { nome: 'sem água', inv: legacy({ water_liters: 0, food_days: 30 }), pessoas: 3 },
    { nome: 'sem comida', inv: legacy({ water_liters: 500, food_days: 0 }), pessoas: 2 },
    { nome: 'casa grande', inv: legacy({ water_liters: 200, food_days: 40 }), pessoas: 7 },
  ]

  for (const { nome, inv, pessoas } of casos) {
    it(`${nome}: modelo novo === modelo antigo`, () => {
      const antigo = autonomyDays(
        {
          waterLiters: inv.water_liters,
          foodPersonDays: inv.food_days,
          fuelLiters: inv.fuel_liters,
          batteryPercent: inv.battery_percent,
          hasMedicalKit: inv.has_medical_kit,
          hasCommunicationDevice: inv.has_communication_device,
          contributors: 1,
        },
        pessoas,
      )

      const novo = autonomyDaysFromHoldings(
        projectLegacyInventory(inv, CASA), locais, CASA, pessoas,
      )

      expect(novo).toBeCloseTo(antigo, 9)
    })
  }

  it('casa de tamanho zero não divide por zero', () => {
    expect(autonomyDaysFromHoldings(projectLegacyInventory(legacy({ water_liters: 50 }), CASA), locais, CASA, 0)).toBe(0)
  })

  it('a casa padrão tem nome', () => {
    expect(DEFAULT_LOCATION_NAME).toBe('Casa')
  })
})
