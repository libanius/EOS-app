/**
 * Alerta oficial vira reavaliação (PREP-T08 / D-168).
 *
 * Os dois testes que mais importam:
 *
 *   "alerta sem lacuna não interrompe"  — inventar trabalho durante um evento
 *                                         rouba atenção de quem tem pouca
 *   "evento desconhecido não alarga"    — ignorância virando alarme geral é o
 *                                         oposto de informar
 */
import { ALERT_KIT_TYPE, alertProposals, reassess, triggerKeyFor, type ReassessmentAlert } from '@/lib/alert-reassessment'
import type { AttentionItem } from '@/lib/attention'
import { splitKitType } from '@/lib/requirements'

const alerta = (over: Partial<ReassessmentAlert> = {}): ReassessmentAlert => ({
  source: 'NWS',
  type: 'Hurricane Warning',
  severity: 'CRITICAL',
  headline: 'Hurricane Warning for your area',
  expires: '2026-08-14T12:00:00Z',
  ...over,
})

const gap = (kind: AttentionItem['kind'], severity: AttentionItem['severity'] = 'low'): AttentionItem =>
  ({ kind, severity, where: 'holdings', detail: {} })

describe('só interrompe quando há motivo', () => {
  it('alerta relevante COM lacuna correspondente reavalia', () => {
    const r = reassess([alerta()], [gap('water', 'critical')])
    expect(r.warranted).toBe(true)
    expect(r.gaps.map(g => g.kind)).toEqual(['water'])
  })

  it('alerta relevante SEM lacuna correspondente NÃO interrompe', () => {
    /*
     * A casa está pronta para este evento. Dizer "atenção" assim mesmo gasta a
     * atenção que o próximo evento vai precisar.
     */
    const r = reassess([alerta()], [])
    expect(r.warranted).toBe(false)
    expect(r.gaps).toEqual([])
  })

  it('lacuna que o evento não pressiona fica de fora', () => {
    // Apagão não torna kit médico urgente.
    const r = reassess([alerta({ type: 'Power Outage', headline: 'Apagão na região' })], [gap('medical-kit')])
    expect(r.warranted).toBe(false)
  })

  it('sem alerta nenhum, nada acontece', () => {
    expect(reassess([], [gap('water', 'critical')]).warranted).toBe(false)
  })
})

describe('severidade', () => {
  it('abaixo de WATCH é ruído e não reavalia', () => {
    for (const severity of ['MODERATE', 'CLEAR'] as const) {
      expect(reassess([alerta({ severity })], [gap('water')]).warranted).toBe(false)
    }
  })

  it('WATCH já basta', () => {
    expect(reassess([alerta({ severity: 'WATCH' })], [gap('water')]).warranted).toBe(true)
  })

  it('o mais severo é quem manda', () => {
    const r = reassess(
      [alerta({ severity: 'WATCH', type: 'Wind Advisory' }), alerta({ severity: 'CRITICAL', type: 'Hurricane Warning' })],
      [gap('water')],
    )
    expect(r.alert?.severity).toBe('CRITICAL')
  })
})

describe('que recursos cada evento pressiona', () => {
  it('furacão pressiona água, comida, energia, kit e comunicação', () => {
    const todos = [gap('water'), gap('food'), gap('battery'), gap('medical-kit'), gap('comms')]
    expect(reassess([alerta()], todos).gaps).toHaveLength(5)
  })

  it('apagão pressiona energia e comunicação, não kit médico', () => {
    const r = reassess(
      [alerta({ type: 'Power Outage', headline: 'Apagão prolongado' })],
      [gap('battery'), gap('comms'), gap('medical-kit')],
    )
    expect(r.gaps.map(g => g.kind).sort()).toEqual(['battery', 'comms'])
  })

  it('enchente pressiona água — a de beber, que fica contaminada', () => {
    const r = reassess(
      [alerta({ type: 'Flood Warning', headline: 'Alagamento' })],
      [gap('water'), gap('comms')],
    )
    expect(r.gaps.map(g => g.kind)).toEqual(['water'])
  })

  it('reconhece o evento em português e em inglês', () => {
    const pt = reassess([alerta({ type: 'Aviso de Ciclone', headline: 'Ciclone se aproximando' })], [gap('water')])
    const en = reassess([alerta({ type: 'Tropical Storm Warning', headline: 'Tropical storm' })], [gap('water')])
    expect(pt.warranted).toBe(true)
    expect(en.warranted).toBe(true)
  })
})

describe('evento desconhecido não alarga o alarme', () => {
  it('usa apenas o que já é crítico', () => {
    /*
     * Neblina não pressiona despensa. Marcar tudo como urgente por ignorância
     * é o oposto de informar.
     */
    const r = reassess(
      [alerta({ type: 'Dense Fog Advisory', headline: 'Visibility below one mile' })],
      [gap('water', 'critical'), gap('food', 'low'), gap('comms', 'low')],
    )
    expect(r.gaps.map(g => g.kind)).toEqual(['water'])
  })

  it('e se nada é crítico, não interrompe', () => {
    const r = reassess(
      [alerta({ type: 'Dense Fog Advisory', headline: 'Visibility below one mile' })],
      [gap('food', 'low')],
    )
    expect(r.warranted).toBe(false)
  })
})

describe('fronteira de palavra — alarme não pode vir de coincidência de letras', () => {
  it('"nevoeiro" NÃO é tratado como "neve"', () => {
    const r = reassess(
      [alerta({ type: 'Aviso de Nevoeiro', headline: 'Nevoeiro denso na região' })],
      [gap('food'), gap('water')],
    )
    expect(r.warranted).toBe(false)
  })

  it('mas "neve" continua sendo neve', () => {
    const r = reassess(
      [alerta({ type: 'Alerta de neve', headline: 'Neve forte' })],
      [gap('food')],
    )
    expect(r.warranted).toBe(true)
  })
})

describe('chave do gatilho', () => {
  it('o mesmo evento produz a mesma chave', () => {
    expect(triggerKeyFor(alerta())).toBe(triggerKeyFor(alerta()))
  })

  it('severidade diferente é gatilho diferente', () => {
    expect(triggerKeyFor(alerta({ severity: 'WATCH' }))).not.toBe(triggerKeyFor(alerta({ severity: 'CRITICAL' })))
  })

  it('a chave acompanha a reavaliação, para deduplicar', () => {
    expect(reassess([alerta()], [gap('water')]).triggerKey).toBe(triggerKeyFor(alerta()))
  })
})

describe('propostas do alerta carregam o próprio contexto (D-167 aplicado)', () => {
  const comAgua = (perPersonLiters: number): AttentionItem =>
    ({ kind: 'water', severity: 'critical', where: 'holdings', detail: { perPersonLiters } })

  it('a proposta de água diz QUANTO falta, para quantos e para quantos dias', () => {
    const [p] = alertProposals([comAgua(0)], { pt: true, householdSize: 3 })
    // 3 dias × 3 pessoas = 9 galões, a régua da FEMA.
    expect(p.name).toContain('9.0 gal')
    expect(p.name).toContain('3 dias')
    expect(p.name).toContain('3 pessoa(s)')
  })

  it('desconta o que a casa já tem', () => {
    // Já há 1 dia por pessoa: faltam 2 dias × 2 pessoas = 4 galões.
    const [p] = alertProposals([comAgua(3.785411784)], { pt: true, householdSize: 2 })
    expect(p.name).toContain('4.0 gal')
  })

  it('a de comida diz quantos dias faltam e para quantos', () => {
    const [p] = alertProposals(
      [{ kind: 'food', severity: 'low', where: 'holdings', detail: { days: 1 } }],
      { pt: true, householdSize: 4 },
    )
    expect(p.name).toContain('2 dia(s)')
    expect(p.name).toContain('4 pessoa(s)')
  })

  it('a de bateria diz o percentual de hoje', () => {
    const [p] = alertProposals(
      [{ kind: 'battery', severity: 'low', where: 'holdings', detail: { percent: 18 } }],
      { pt: true, householdSize: 1 },
    )
    expect(p.name).toContain('18%')
  })

  it('"não sabemos quem mora aqui" NÃO vira tarefa', () => {
    // É cadastro, não compra. Comprar nada resolve.
    const saida = alertProposals(
      [{ kind: 'household-unknown', severity: 'unknown', where: 'household', detail: {} }],
      { pt: true, householdSize: 0 },
    )
    expect(saida).toEqual([])
  })

  it('o checklist essencial também não — ele JÁ é a lista', () => {
    const saida = alertProposals(
      [{ kind: 'checklist-essential', severity: 'low', where: 'requirements', detail: { done: 1, total: 5 } }],
      { pt: true, householdSize: 2 },
    )
    expect(saida).toEqual([])
  })

  it('funciona em inglês', () => {
    const [p] = alertProposals([comAgua(0)], { pt: false, householdSize: 2 })
    expect(p.name).toContain('Buy')
    expect(p.name).toContain('person(s)')
  })

  it('casa de tamanho desconhecido não divide por zero', () => {
    // Cai para uma pessoa: 3 dias × 1 galão/dia = 3 galões.
    const [p] = alertProposals([comAgua(0)], { pt: true, householdSize: 0 })
    expect(p.name).toContain('3.0 gal')
    expect(p.name).toContain('1 pessoa(s)')
  })
})

describe('procedência', () => {
  it('a proposta de alerta é lida com procedência OFFICIAL_ALERT', () => {
    expect(splitKitType(ALERT_KIT_TYPE)).toEqual({ kitSlug: null, provenance: 'OFFICIAL_ALERT' })
  })
})
