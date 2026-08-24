/**
 * O simulador cobrando o plano (SIM-T06).
 *
 * O que estes testes protegem não é a formatação das frases, é a REGRA: cobrar
 * o plano só quando o cenário justifica, e nunca acusar uma lacuna que não é
 * real. Um alarme falso num app de emergência custa mais que o silêncio — quem
 * lê duas lacunas inventadas para de ler a terceira, que era verdadeira.
 */

import { drillPlan, type PlanDrillInput } from '../plan-drill'
import { DEFAULT_SIMULATION, type SimulationConfig } from '../simulation'
import type { PlanWaypoint } from '../family-plan'

const HOME: PlanWaypoint = { kind: 'home', name: 'Casa', lat: 26.3106, lng: -80.2456 }
/** ~24 km a norte da casa: a pé passa de 3 h com folga. */
const FAR: PlanWaypoint = { kind: 'rendezvous_3', name: 'Sítio do vô', lat: 26.5265, lng: -80.2456 }
/** ~600 m: caminhada de poucos minutos. */
const NEAR: PlanWaypoint = { kind: 'rendezvous_1', name: 'Portão', lat: 26.3160, lng: -80.2456 }

const scenario = (over: Partial<SimulationConfig> = {}): SimulationConfig => ({
  ...DEFAULT_SIMULATION,
  ...over,
})

const drill = (over: Partial<PlanDrillInput> = {}) =>
  drillPlan({
    config: scenario(),
    waypoints: [HOME, NEAR],
    routes: [{ label: 'a pé', mode: 'foot', geometry: {}, notes: null }],
    triggers: [{ condition: 'sem contato por 2 h', action: 'ir ao portão' }],
    membersPending: 0,
    planVersion: 3,
    hasPlan: true,
    mobilityImpaired: false,
    pt: true,
    ...over,
  })

const ids = (gaps: ReturnType<typeof drillPlan>) => gaps.map(g => g.id)

describe('drillPlan', () => {
  it('não inventa lacuna quando o plano cobre o cenário', () => {
    expect(drill()).toEqual([])
  })

  it('cobra a existência do plano, e escala com a gravidade do cenário', () => {
    const calmo = drill({ hasPlan: false })
    const grave = drill({ hasPlan: false, config: scenario({ roadsBlocked: true }) })
    expect(ids(calmo)).toEqual(['plan-missing'])
    expect(calmo[0].severity).toBe('important')
    expect(grave[0].severity).toBe('critical')
  })

  it('para na primeira lacuna quando não há plano — não empilha consequências', () => {
    // Sem plano, dizer também "não tem gatilho" e "não tem rota" é repetir a
    // mesma notícia três vezes. Uma lacuna, uma ação.
    expect(drill({ hasPlan: false, triggers: [], routes: [] })).toHaveLength(1)
  })

  it('só mede alcance a pé quando as vias estão bloqueadas', () => {
    const comCarro = drill({ waypoints: [HOME, FAR] })
    const semCarro = drill({ waypoints: [HOME, FAR], config: scenario({ roadsBlocked: true }) })
    expect(ids(comCarro)).not.toContain('reach-rendezvous_3')
    expect(ids(semCarro)).toContain('reach-rendezvous_3')
  })

  it('não acusa distância quando o ponto é perto', () => {
    expect(ids(drill({ config: scenario({ roadsBlocked: true }) }))).not.toContain('reach-rendezvous_1')
  })

  it('dobra o tempo estimado quando alguém não anda no ritmo normal', () => {
    // 12 km ficam abaixo do limite a pé normal e acima dele com mobilidade
    // reduzida — é exatamente aí que o fator precisa mudar o veredito.
    const meio: PlanWaypoint = { kind: 'rendezvous_2', name: 'Praça', lat: 26.4186, lng: -80.2456 }
    const base = { waypoints: [HOME, meio], config: scenario({ roadsBlocked: true }) }
    expect(ids(drill(base))).not.toContain('reach-rendezvous_2')
    expect(ids(drill({ ...base, mobilityImpaired: true }))).toContain('reach-rendezvous_2')
  })

  it('exige rota a pé só quando dirigir não era opção', () => {
    const soCarro = [{ label: 'de carro', mode: 'car' as const, geometry: {}, notes: null }]
    expect(ids(drill({ routes: soCarro }))).not.toContain('no-foot-route')
    expect(ids(drill({ routes: soCarro, config: scenario({ roadsBlocked: true }) }))).toContain('no-foot-route')
  })

  it('trata quem não reconheceu a versão como falha crítica', () => {
    const gaps = drill({ membersPending: 2, planVersion: 7 })
    const gap = gaps.find(g => g.id === 'unacknowledged')
    expect(gap?.severity).toBe('critical')
    expect(gap?.title).toContain('2')
    expect(gap?.title).toContain('v7')
  })

  it('sem rede e sem ponto de encontro é crítico', () => {
    const gaps = drill({ waypoints: [HOME], config: scenario({ networkDown: true }) })
    expect(gaps.find(g => g.id === 'no-rendezvous-offline')?.severity).toBe('critical')
  })

  it('cobra o gatilho ausente com mais peso quando o cenário exige mover', () => {
    expect(drill({ triggers: [] })[0].severity).toBe('advisory')
    expect(drill({ triggers: [], config: scenario({ severity: 5 }) })[0].severity).toBe('important')
  })
})
