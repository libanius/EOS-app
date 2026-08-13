/**
 * Cobertura (PREP-T06 / D-162).
 *
 * Dois testes deste arquivo valem mais que os outros:
 *
 *   "unknown nunca sobe para covered"  — a regra de segurança do docs/37 §24
 *   "conjunto vazio é unknown"         — o jeito mais fácil de quebrá-la sem
 *                                        perceber
 */
import {
  coverRequirement,
  resourceIsConsumable,
  rollupCoverage,
  summarizeCoverage,
  type CoverageStatus,
  type RequirementForCoverage,
} from '@/lib/coverage'
import { RESOURCE_KEYS, type EosLocation, type Holding } from '@/lib/holdings'
import { gallonsToLiters } from '@/lib/units'

const CASA = 'casa'
const LOCAIS: EosLocation[] = [
  { id: CASA, parentId: null, name: 'Casa', kind: 'HOME', isDefault: true },
  { id: 'garagem', parentId: CASA, name: 'Garagem', kind: 'CUSTOM', isDefault: false },
  { id: 'carro', parentId: null, name: 'Carro', kind: 'VEHICLE', isDefault: false },
]

const agua = (locationId: string, quantity: number, unit: string | null = 'gal'): Holding =>
  ({ locationId, resourceKey: RESOURCE_KEYS.water, label: 'Água', kind: 'CONSUMABLE', quantity, unit })

const durable = (locationId: string, resourceKey: string): Holding =>
  ({ locationId, resourceKey, label: resourceKey, kind: 'DURABLE', quantity: 1, unit: null })

const req = (over: Partial<RequirementForCoverage> = {}): RequirementForCoverage => ({
  resourceKey: RESOURCE_KEYS.water,
  quantity: 7,
  unit: 'gal',
  locationScopeId: null,
  ...over,
})

describe('consumível — conta de quantidade dentro do escopo', () => {
  it('cobre quando há o suficiente', () => {
    const r = coverRequirement(req({ quantity: 7 }), [agua(CASA, 10)], LOCAIS, CASA)
    expect(r.status).toBe('covered')
  })

  it('parcial quando há algo, mas não basta', () => {
    const r = coverRequirement(req({ quantity: 7 }), [agua(CASA, 3)], LOCAIS, CASA)
    expect(r.status).toBe('partial')
    expect(r.have).toBeCloseTo(3, 6)
  })

  it('falta quando não há nada daquele recurso no escopo', () => {
    expect(coverRequirement(req(), [], LOCAIS, CASA).status).toBe('missing')
  })

  it('soma sub-localizações e converte unidades', () => {
    // 4 gal na casa + 7,57 L (=2 gal) na garagem = 6 gal, contra 7 exigidos.
    const r = coverRequirement(
      req({ quantity: 7 }),
      [agua(CASA, 4, 'gal'), agua('garagem', gallonsToLiters(2), 'L')],
      LOCAIS, CASA,
    )
    expect(r.status).toBe('partial')
    expect(r.have).toBeCloseTo(6, 6)
  })

  it('água do carro não cobre requisito da casa', () => {
    expect(coverRequirement(req(), [agua('carro', 99)], LOCAIS, CASA).status).toBe('missing')
  })

  it('requisito com escopo no carro é coberto pela água do carro', () => {
    const r = coverRequirement(req({ quantity: 2, locationScopeId: 'carro' }), [agua('carro', 3)], LOCAIS, CASA)
    expect(r.status).toBe('covered')
  })
})

describe('durável — presença, não quantidade', () => {
  it('um torniquete na garagem cobre o requisito da casa', () => {
    const r = coverRequirement(
      req({ resourceKey: 'torniquete', quantity: 1, unit: null }),
      [durable('garagem', 'torniquete')], LOCAIS, CASA,
    )
    expect(r.status).toBe('covered')
  })

  it('o MESMO torniquete não cobre o kit do carro', () => {
    const r = coverRequirement(
      { resourceKey: 'torniquete', quantity: 1, unit: null, locationScopeId: 'carro' },
      [durable('garagem', 'torniquete')], LOCAIS, CASA,
    )
    expect(r.status).toBe('missing')
  })

  it('dois duráveis não cobrem "mais" que um', () => {
    // Contar dois como cobertura dupla seria a dupla contagem física que o
    // modelo existe para impedir.
    const um = coverRequirement(req({ resourceKey: 't', quantity: 1, unit: null }), [durable(CASA, 't')], LOCAIS, CASA)
    const dois = coverRequirement(req({ resourceKey: 't', quantity: 1, unit: null }), [durable(CASA, 't'), durable('garagem', 't')], LOCAIS, CASA)
    expect(um.status).toBe(dois.status)
    expect(dois.have).toBe(1)
  })

  it('infere consumível/durável do holding quando ele existe', () => {
    expect(resourceIsConsumable('agua', null, [agua(CASA, 1)])).toBe(true)
    expect(resourceIsConsumable('t', 'gal', [durable(CASA, 't')])).toBe(false)
    // Sem holding: unidade presente ⇒ consumível.
    expect(resourceIsConsumable('x', 'gal', [])).toBe(true)
    expect(resourceIsConsumable('x', null, [])).toBe(false)
  })
})

describe('unknown — o desconhecido nunca vira zero nem vira pronto', () => {
  it('unidade não conversível com falta aparente dá unknown, não missing', () => {
    /*
     * Há 3 gal medidos e "2 caixas" que não sabemos ler, contra 7 exigidos.
     * A diferença pode estar nas caixas. Chamar de falta seria chutar para
     * baixo; ignorar seria chutar para cima. `unknown` é a única honesta.
     */
    const r = coverRequirement(
      req({ quantity: 7 }),
      [agua(CASA, 3, 'gal'), agua(CASA, 2, 'caixas')],
      LOCAIS, CASA,
    )
    expect(r.status).toBe('unknown')
    expect(r.have).toBeNull()
    expect(r.reason).toBe('unconvertible-unit')
  })

  it('se o que é mensurável já basta, o não conversível não atrapalha', () => {
    const r = coverRequirement(
      req({ quantity: 2 }),
      [agua(CASA, 5, 'gal'), agua(CASA, 1, 'caixas')],
      LOCAIS, CASA,
    )
    expect(r.status).toBe('covered')
  })

  it('requisito em unidade estranha, com holding na mesma unidade, é comparável', () => {
    const r = coverRequirement(
      req({ quantity: 3, unit: 'caixas' }),
      [agua(CASA, 5, 'caixas')],
      LOCAIS, CASA,
    )
    expect(r.status).toBe('covered')
    expect(r.have).toBe(5)
  })

  it('requisito em unidade estranha, sem par, é unknown', () => {
    const r = coverRequirement(req({ quantity: 3, unit: 'caixas' }), [agua(CASA, 50, 'gal')], LOCAIS, CASA)
    expect(r.status).toBe('unknown')
  })
})

describe('not_applicable sai da conta', () => {
  it('devolve not_applicable e não vira falta', () => {
    expect(coverRequirement(req({ status: 'not_applicable' }), [], LOCAIS, CASA).status).toBe('not_applicable')
  })

  it('não altera o rollup', () => {
    expect(rollupCoverage(['covered', 'not_applicable'])).toBe('covered')
  })
})

describe('rollup pior-vence', () => {
  const casos: Array<[CoverageStatus[], CoverageStatus]> = [
    [['covered', 'covered'], 'covered'],
    [['covered', 'partial'], 'partial'],
    [['covered', 'missing'], 'missing'],
    [['partial', 'missing'], 'missing'],
    [['covered', 'unknown'], 'unknown'],
    [['unknown', 'partial'], 'partial'],
    [['unknown', 'missing'], 'missing'],
  ]
  for (const [entrada, esperado] of casos) {
    it(`${entrada.join(' + ')} → ${esperado}`, () => {
      expect(rollupCoverage(entrada)).toBe(esperado)
    })
  }

  it('REGRA INEGOCIÁVEL: um unknown no meio de tudo coberto NÃO dá covered', () => {
    expect(rollupCoverage(['covered', 'covered', 'covered', 'unknown'])).toBe('unknown')
  })

  it('conjunto vazio é unknown, nunca covered', () => {
    // "Nada foi olhado" e "nada falta" não podem ter a mesma cor.
    expect(rollupCoverage([])).toBe('unknown')
    expect(rollupCoverage(['not_applicable', 'not_applicable'])).toBe('unknown')
  })
})

describe('summarizeCoverage', () => {
  it('conta cada estado e devolve o veredito', () => {
    const s = summarizeCoverage([
      { status: 'covered', have: 1, need: 1 },
      { status: 'covered', have: 1, need: 1 },
      { status: 'partial', have: 1, need: 4 },
      { status: 'unknown', have: null, need: 2 },
      { status: 'not_applicable', have: null, need: 0 },
    ])
    expect(s).toMatchObject({ status: 'partial', covered: 2, partial: 1, unknown: 1, notApplicable: 1, total: 4 })
  })

  it('sem requisitos, o veredito é unknown', () => {
    expect(summarizeCoverage([]).status).toBe('unknown')
  })
})
