import { buildPlanExecutionSteps } from '../plan-execution'
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
      'safety',
      'circle',
      'trigger',
      'role',
      'rendezvous',
      'rendezvous',
      'route',
      'finish',
    ])
    expect(steps[0].body).toContain('não se aproxime')
    expect(steps[1].body).toContain('v4')
    expect(steps[4].title).toContain('Ponto 1')
    expect(steps[5].title).toContain('Ponto 3')
    expect(steps[6].body).toContain('Evitar avenida.')
  })
})
