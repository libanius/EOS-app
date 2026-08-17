import { buildPlanExecutionProtocols, buildPlanExecutionSteps } from '../plan-execution'
import type { PlanDocument } from '../family-plan'

describe('buildPlanExecutionSteps', () => {
  it('turns the approved family plan into a deterministic host sequence', () => {
    const doc: PlanDocument = {
      plan: { id: 'plan-1', name: 'Plano escola', version: 4, status: 'active', updated_at: '2026-07-31T00:00:00Z' },
      waypoints: [
        { kind: 'rendezvous_3', name: 'Casa da tia', lat: 1, lng: 1 },
        { kind: 'rendezvous_1', name: 'Esquina', lat: 1, lng: 2 },
      ],
      routes: [{ label: 'Saida pela rua de tras', geometry: { type: 'LineString', coordinates: [] }, mode: 'foot', notes: 'Evitar avenida.' }],
      roles: [{ member_user_id: 'ana', responsibility: 'Ana busca Isadora se a escola liberar.' }],
      triggers: [{ condition: 'Alerta na escola', action: 'Confirmar fonte oficial antes de dirigir.' }],
      acknowledgedBy: [],
      myAck: null,
    }

    const steps = buildPlanExecutionSteps(doc, true)

    expect(steps.map(step => step.kind)).toEqual([
      'circle',
      'trigger',
      'role',
      'rendezvous',
      'rendezvous',
      'route',
      'finish',
    ])
    expect(steps[0].body).toContain('v4')
    expect(steps[3].title).toContain('Ponto 1')
    expect(steps[4].title).toContain('Ponto 3')
    expect(steps[5].body).toContain('Evitar avenida.')
  })

  it('builds protocol choices from saved triggers', () => {
    const doc: PlanDocument = {
      plan: { id: 'plan-1', name: 'Plano escola', version: 4, status: 'active', updated_at: '2026-07-31T00:00:00Z' },
      waypoints: [],
      routes: [],
      roles: [],
      triggers: [
        { condition: 'Sem contato por 2 horas', action: 'Ir para o bairro' },
        { condition: 'Evacuação oficial', action: 'Sair para fora da região' },
      ],
      acknowledgedBy: [],
      myAck: null,
    }

    const protocols = buildPlanExecutionProtocols(doc, true)

    expect(protocols).toHaveLength(2)
    expect(protocols[0].label).toBe('Sem contato por 2 horas')
    expect(protocols[1].triggerIndex).toBe(1)
  })

  it('runs the selected protocol instead of listing every trigger', () => {
    const doc: PlanDocument = {
      plan: { id: 'plan-1', name: 'Furacão', version: 2, status: 'active', updated_at: '2026-07-31T00:00:00Z' },
      waypoints: [
        { kind: 'rendezvous_1', name: 'Esquina', lat: 1, lng: 2 },
        { kind: 'rendezvous_2', name: 'Escola', lat: 2, lng: 2 },
        { kind: 'rendezvous_3', name: 'Casa da tia', lat: 3, lng: 3 },
      ],
      routes: [],
      roles: [],
      triggers: [
        { condition: 'Sem contato por 2 horas', action: 'Ir para o ponto do bairro' },
        { condition: 'Evacuação oficial', action: 'Executar saída para fora da região' },
      ],
      acknowledgedBy: [],
      myAck: null,
    }
    const protocol = buildPlanExecutionProtocols(doc, true)[1]

    const steps = buildPlanExecutionSteps(doc, true, protocol)

    expect(steps.map(step => step.title)).toContain('Protocolo: Evacuação oficial')
    expect(steps.map(step => step.title)).not.toContain('Protocolo: Sem contato por 2 horas')
    expect(steps.map(step => step.title)).toContain('Ponto 3: Casa da tia')
    expect(steps.map(step => step.title)).not.toContain('Ponto 1: Esquina')
    expect(steps.map(step => step.title)).not.toContain('Ponto 2: Escola')
  })
})
