import type { PlanDocument } from '../family-plan'
import type { PlanExecutionSnapshot } from '../plan-execution-mode'
import {
  PLAN_EXECUTION_LEGIBILITY_CLASS,
  buildPlanPlaybook,
} from '../plan-playbook'

const doc: PlanDocument = {
  plan: {
    id: 'plan-fire',
    name: 'Incêndio em casa',
    version: 2,
    status: 'active',
    updated_at: '2026-08-19T12:00:00.000Z',
  },
  waypoints: [
    { kind: 'home', name: 'Casa', lat: 26, lng: -80, precision: 'gps' },
    { kind: 'rendezvous_1', name: 'Caixa de correio', lat: 26.01, lng: -80, precision: 'gps' },
  ],
  routes: [],
  roles: [
    { member_user_id: 'user-a', for_member_id: 'child-1', responsibility: 'Buscar a criança no quarto e sair pela porta lateral.' },
    { member_user_id: 'user-b', responsibility: 'Pegar extintor, documentos e chamar 911.' },
  ],
  dependentBriefs: [
    { id: 'brief-child', member_id: 'child-1', instruction: 'A criança se esconde no closet quando ouve alarme.' },
  ],
  triggers: [
    {
      condition: 'Alarme de incêndio da casa soou',
      action: 'Sair da casa e ir para a caixa de correio',
      action_type: 'meet',
      destination_kind: 'rendezvous_1',
      notify_circle: true,
    },
  ],
  acknowledgedBy: [],
  myAck: null,
}

const execution: PlanExecutionSnapshot = {
  id: 'exec-1',
  circleId: 'circle-1',
  circleName: 'Família',
  planId: 'plan-fire',
  planName: 'Incêndio em casa',
  planVersion: 2,
  sessionId: null,
  protocolIndex: 0,
  status: 'running',
  startedBy: 'user-a',
  startedByName: 'A',
  startedAt: '2026-08-19T12:00:00.000Z',
  endedAt: null,
  outcome: null,
  notice: { attempted: true, delivered: false, pending: true },
}

describe('EXEC-T04 — playbook por papel offline-first', () => {
  it('renderiza um playbook completo com rumo, distância e minutos até o ponto ativo', () => {
    const playbook = buildPlanPlaybook({
      doc,
      execution,
      userId: 'user-a',
      origin: { lat: 26, lng: -80 },
      pt: true,
    })

    expect(playbook.activeProtocol?.label).toBe('Alarme de incêndio da casa soou')
    expect(playbook.numberedSteps[0]).toMatchObject({ kind: 'protocol' })
    expect(playbook.numberedSteps.map(step => step.body)).toContain('Buscar a criança no quarto e sair pela porta lateral.')
    expect(playbook.navigation).toMatchObject({
      targetName: 'Caixa de correio',
      compass: 'N',
      distanceText: '1.1 km',
      walkingMinutes: 15,
    })
  })

  it('mostra listas de primeiro nível diferentes para dois usuários do mesmo círculo', () => {
    const userA = buildPlanPlaybook({ doc, execution, userId: 'user-a', origin: null, pt: true })
    const userB = buildPlanPlaybook({ doc, execution, userId: 'user-b', origin: null, pt: true })

    expect(userA.numberedSteps.map(step => step.body)).toContain('Buscar a criança no quarto e sair pela porta lateral.')
    expect(userA.numberedSteps.map(step => step.body)).not.toContain('Pegar extintor, documentos e chamar 911.')
    expect(userB.numberedSteps.map(step => step.body)).toContain('Pegar extintor, documentos e chamar 911.')
    expect(userB.numberedSteps.map(step => step.body)).not.toContain('Buscar a criança no quarto e sair pela porta lateral.')
  })

  it('deixa a carta do dependente na tela de quem procura, fora da numeração', () => {
    const playbook = buildPlanPlaybook({ doc, execution, userId: 'user-a', origin: null, pt: true })
    const numberedBodies = playbook.numberedSteps.map(step => step.body)

    expect(playbook.dependentBriefs).toEqual([
      { id: 'brief-child', memberId: 'child-1', instruction: 'A criança se esconde no closet quando ouve alarme.' },
    ])
    expect(numberedBodies).not.toContain('A criança se esconde no closet quando ouve alarme.')
  })

  it('mantém avisos do sistema fora dos passos numerados', () => {
    const playbook = buildPlanPlaybook({ doc, execution, userId: 'user-a', origin: null, pt: true })

    expect(playbook.systemNotices).toHaveLength(1)
    expect(playbook.numberedSteps.some(step => step.body.includes('Aviso ao círculo'))).toBe(false)
  })

  it('declara o modo de legibilidade da PWA sem prometer brilho nativo', () => {
    expect(PLAN_EXECUTION_LEGIBILITY_CLASS).toBe('plan-execution-readable')
  })
})
