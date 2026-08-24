/**
 * Escrita dupla: a tradução entre as duas formas (PREP-T10b / D-172).
 *
 * `requirementRowFor` é a parte pura e a mais fácil de errar sem que nada
 * quebre visivelmente — um espelho errado só aparece no cutover, quando já é
 * tarde.
 */
import { requirementRowFor, type ChecklistWrite } from '@/lib/requirements-sync'

const linha = (over: Partial<ChecklistWrite> = {}): ChecklistWrite => ({
  canonical_key: 'agua',
  item_name: 'Água',
  tier: 'ESSENTIAL',
  quantity: 4,
  unit: 'gal',
  acquired: false,
  kit_type: 'GERAL',
  ...over,
})

describe('tradução para requirements', () => {
  it('carrega os campos que existem nos dois lados', () => {
    expect(requirementRowFor('u1', linha(), null)).toMatchObject({
      profile_id: 'u1',
      resource_key: 'agua',
      label: 'Água',
      quantity: 4,
      unit: 'gal',
      tier: 'ESSENTIAL',
    })
  })

  it('GERAL é linha de base: kit nulo, procedência manual', () => {
    const r = requirementRowFor('u1', linha({ kit_type: 'GERAL' }), null)
    expect(r.kit_id).toBeNull()
    expect(r.provenance).toBe('MANUAL')
  })

  it('kit de verdade recebe o id resolvido', () => {
    const r = requirementRowFor('u1', linha({ kit_type: 'BUG_OUT' }), 'kit-123')
    expect(r.kit_id).toBe('kit-123')
    expect(r.provenance).toBe('MANUAL')
  })

  it('procedência disfarçada vira procedência, sem kit', () => {
    for (const [kit, esperado] of [
      ['PILOT_RECOMMENDATION', 'PILOT'],
      ['EDU_CONTENT', 'EDU'],
      ['SIMULATION_DEBRIEF', 'SIMULATION'],
      ['OFFICIAL_ALERT', 'OFFICIAL_ALERT'],
    ] as const) {
      const r = requirementRowFor('u1', linha({ kit_type: kit }), null)
      expect(r.provenance).toBe(esperado)
      expect(r.kit_id).toBeNull()
    }
  })
})

describe('estado', () => {
  it('deriva do booleano quando não há coluna nova', () => {
    expect(requirementRowFor('u1', linha({ acquired: true }), null).status).toBe('met')
    expect(requirementRowFor('u1', linha({ acquired: false }), null).status).toBe('needed')
  })

  it('o status explícito vence o booleano', () => {
    // É o que permite `not_applicable` sobreviver ao espelho: no mundo antigo
    // ele é `acquired: false`, indistinguível de "ainda falta".
    const r = requirementRowFor('u1', linha({ acquired: false, status: 'not_applicable' }), null)
    expect(r.status).toBe('not_applicable')
  })

  it('marcado como adquirido com status explícito continua coerente', () => {
    expect(requirementRowFor('u1', linha({ acquired: true, status: 'met' }), null).status).toBe('met')
  })
})

describe('valores defensivos', () => {
  it('quantidade inválida não vira NaN no banco', () => {
    // @ts-expect-error — o legado pode ter linha estranha
    expect(requirementRowFor('u1', linha({ quantity: 'x' }), null).quantity).toBe(1)
  })

  it('unidade ausente permanece nula, não vira string vazia', () => {
    expect(requirementRowFor('u1', linha({ unit: null }), null).unit).toBeNull()
  })
})
