import { reviewPlanWithPilot } from '../plan-pilot-review'
import type { PlanRole, PlanTrigger, PlanWaypoint } from '../family-plan'

const school: PlanWaypoint = {
  kind: 'school',
  name: 'Escola da Isadora',
  lat: 26.3,
  lng: -80.2,
}

describe('reviewPlanWithPilot', () => {
  it('proposes observable triggers when the plan has none', () => {
    const proposals = reviewPlanWithPilot({
      pt: true,
      members: [],
      waypoints: [],
      roles: [],
      triggers: [],
    })

    expect(proposals.filter(p => p.kind === 'trigger')).toHaveLength(3)
    expect(proposals[0]).toMatchObject({
      kind: 'trigger',
      trigger: { condition: 'Sem contato com alguém da família por 2 horas' },
    })
  })

  it('does not propose triggers that already exist', () => {
    const triggers: PlanTrigger[] = [
      { condition: 'Sem contato com alguém da família por 2 horas', action: 'Ir para o ponto de encontro do bairro' },
    ]

    const proposals = reviewPlanWithPilot({
      pt: true,
      members: [],
      waypoints: [],
      roles: [],
      triggers,
    })

    expect(proposals.some(p => p.id === 'trigger:sem contato com alguém da família por 2 horas')).toBe(false)
  })

  it('proposes a school role only for a member without an assigned role', () => {
    const roles: PlanRole[] = [{ member_user_id: 'ana', responsibility: 'Levar rádio reserva' }]

    const proposals = reviewPlanWithPilot({
      pt: true,
      members: [
        { user_id: 'ana', name: 'Ana' },
        { user_id: 'paulo', name: 'Paulo', is_me: true },
      ],
      waypoints: [school],
      roles,
      triggers: [],
    })

    expect(proposals).toContainEqual(expect.objectContaining({
      kind: 'role',
      role: {
        member_user_id: 'paulo',
        responsibility: 'Verificar e buscar quem estiver em Escola da Isadora',
      },
    }))
  })
})
