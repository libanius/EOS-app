/**
 * Requirements e a separação kit × procedência (PREP-T05 / D-161).
 *
 * O teste que mais importa aqui é o da FUSÃO: o modelo antigo era obrigado a
 * guardar "Água" duas vezes — uma como item geral, outra como recomendação do
 * Pilot — porque `kit_type` fazia parte da chave única. Se a projeção não
 * fundir as duas, a tabela nova nasce com a duplicata que viemos consertar.
 */
import {
  KIT_SLUGS,
  projectLegacyChecklist,
  projectLegacyChecklistRow,
  requirementNaturalKey,
  splitKitType,
  type LegacyChecklistRow,
} from '@/lib/requirements'

const row = (over: Partial<LegacyChecklistRow> = {}): LegacyChecklistRow => ({
  canonical_key: 'agua',
  item_name: 'Água',
  tier: 'ESSENTIAL',
  quantity: 4,
  unit: 'gal',
  acquired: false,
  kit_type: 'GERAL',
  ...over,
})

describe('splitKitType — desfaz a mistura de duas dimensões', () => {
  it('GERAL é a linha de base da casa, não um kit', () => {
    // "Preparação Geral: estoque para emergências em casa" não é uma mochila.
    expect(splitKitType('GERAL')).toEqual({ kitSlug: null, provenance: 'MANUAL' })
  })

  it('vazio e nulo também são linha de base', () => {
    expect(splitKitType('')).toEqual({ kitSlug: null, provenance: 'MANUAL' })
    expect(splitKitType(null)).toEqual({ kitSlug: null, provenance: 'MANUAL' })
    expect(splitKitType(undefined)).toEqual({ kitSlug: null, provenance: 'MANUAL' })
  })

  it('os kits de verdade continuam kits', () => {
    for (const slug of KIT_SLUGS) {
      expect(splitKitType(slug)).toEqual({ kitSlug: slug, provenance: 'MANUAL' })
    }
  })

  it('as três procedências disfarçadas viram procedência, sem kit', () => {
    expect(splitKitType('EDU_CONTENT')).toEqual({ kitSlug: null, provenance: 'EDU' })
    expect(splitKitType('PILOT_RECOMMENDATION')).toEqual({ kitSlug: null, provenance: 'PILOT' })
    expect(splitKitType('SIMULATION_DEBRIEF')).toEqual({ kitSlug: null, provenance: 'SIMULATION' })
  })

  it('slug desconhecido é kit do usuário, não erro', () => {
    // D-157: todo kit é Preparação, inclusive os que o usuário criar.
    expect(splitKitType('KIT_DO_CARRO')).toEqual({ kitSlug: 'KIT_DO_CARRO', provenance: 'MANUAL' })
  })

  it('normaliza caixa e espaço', () => {
    expect(splitKitType('  bug_out ')).toEqual({ kitSlug: 'BUG_OUT', provenance: 'MANUAL' })
    expect(splitKitType('geral')).toEqual({ kitSlug: null, provenance: 'MANUAL' })
  })

  it('os 8 valores em uso hoje estão cobertos', () => {
    const emUso = ['GERAL', 'BUG_OUT', 'ACAMPAMENTO', 'PESCA', 'CACA', 'EDU_CONTENT', 'PILOT_RECOMMENDATION', 'SIMULATION_DEBRIEF']
    for (const valor of emUso) {
      const { kitSlug, provenance } = splitKitType(valor)
      expect(typeof provenance).toBe('string')
      expect(kitSlug === null || typeof kitSlug === 'string').toBe(true)
    }
  })
})

describe('projeção de uma linha', () => {
  it('acquired vira met; o resto vira needed', () => {
    expect(projectLegacyChecklistRow(row({ acquired: true })).status).toBe('met')
    expect(projectLegacyChecklistRow(row({ acquired: false })).status).toBe('needed')
  })

  it('nada nasce como proposed', () => {
    // Tudo em `checklists` já passou por confirmação do usuário (D-092/93/119).
    // Marcar como proposto reabriria decisões que a família já tomou.
    for (const kit of ['GERAL', 'EDU_CONTENT', 'PILOT_RECOMMENDATION', 'SIMULATION_DEBRIEF']) {
      expect(projectLegacyChecklistRow(row({ kit_type: kit })).status).not.toBe('proposed')
    }
  })

  it('preserva quantidade, unidade e tier', () => {
    const r = projectLegacyChecklistRow(row({ quantity: 12, unit: 'gal', tier: 'MODERATE' }))
    expect(r).toMatchObject({ quantity: 12, unit: 'gal', tier: 'MODERATE', resourceKey: 'agua' })
  })
})

describe('chave natural — procedência fica de fora (D-155 §26.2)', () => {
  it('mesma coisa por duas fontes tem a MESMA chave', () => {
    const doGeral = projectLegacyChecklistRow(row({ kit_type: 'GERAL' }))
    const doPilot = projectLegacyChecklistRow(row({ kit_type: 'PILOT_RECOMMENDATION' }))

    expect(doGeral.provenance).toBe('MANUAL')
    expect(doPilot.provenance).toBe('PILOT')
    expect(requirementNaturalKey(doGeral)).toBe(requirementNaturalKey(doPilot))
  })

  it('kits diferentes são requisitos diferentes', () => {
    const casa = projectLegacyChecklistRow(row({ kit_type: 'GERAL' }))
    const mochila = projectLegacyChecklistRow(row({ kit_type: 'BUG_OUT' }))
    expect(requirementNaturalKey(casa)).not.toBe(requirementNaturalKey(mochila))
  })
})

describe('fusão — a duplicata que o modelo antigo era obrigado a criar', () => {
  it('duas linhas viram UMA, com o melhor de cada', () => {
    /*
     * O caso real: a família tem "Água 4 gal" na preparação geral, e o Pilot
     * recomendou "Água 6 gal". Em `checklists` são duas linhas, porque
     * `kit_type` entra na chave única. Aqui viram uma.
     */
    const saida = projectLegacyChecklist([
      row({ kit_type: 'GERAL', quantity: 4, acquired: true }),
      row({ kit_type: 'PILOT_RECOMMENDATION', quantity: 6, acquired: false }),
    ])

    expect(saida).toHaveLength(1)
    expect(saida[0]).toMatchObject({
      kitSlug: null,
      provenance: 'PILOT',   // saber que veio do Pilot vale mais que "alguém digitou"
      status: 'met',         // a família já declarou que tem
      quantity: 6,           // leitura conservadora do que é preciso
    })
  })

  it('o pertencimento a uma mochila sobrevive à fusão', () => {
    const saida = projectLegacyChecklist([
      row({ canonical_key: 'lanterna', kit_type: 'BUG_OUT' }),
      row({ canonical_key: 'lanterna', kit_type: 'BUG_OUT', acquired: true }),
    ])
    expect(saida).toHaveLength(1)
    expect(saida[0].kitSlug).toBe('BUG_OUT')
    expect(saida[0].status).toBe('met')
  })

  it('recursos diferentes não se fundem', () => {
    const saida = projectLegacyChecklist([
      row({ canonical_key: 'agua' }),
      row({ canonical_key: 'comida' }),
    ])
    expect(saida).toHaveLength(2)
  })

  it('EDU e simulação sobre o mesmo item colapsam numa linha só', () => {
    const saida = projectLegacyChecklist([
      row({ kit_type: 'EDU_CONTENT' }),
      row({ kit_type: 'SIMULATION_DEBRIEF' }),
      row({ kit_type: 'GERAL' }),
    ])
    expect(saida).toHaveLength(1)
    expect(saida[0].provenance).not.toBe('MANUAL')
  })

  it('lista vazia devolve lista vazia', () => {
    expect(projectLegacyChecklist([])).toEqual([])
  })
})
