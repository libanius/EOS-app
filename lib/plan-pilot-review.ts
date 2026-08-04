import {
  TRIGGER_SUGGESTIONS,
  type PlanRole,
  type PlanTrigger,
  type PlanWaypoint,
} from './family-plan'

export type PlanPilotMember = {
  user_id: string
  name: string
  is_me?: boolean
}

export type PlanPilotProposal =
  | {
      id: string
      kind: 'trigger'
      title: string
      reason: string
      trigger: PlanTrigger
    }
  | {
      id: string
      kind: 'role'
      title: string
      reason: string
      role: PlanRole
    }

export type PlanPilotReviewInput = {
  pt: boolean
  members: PlanPilotMember[]
  waypoints: PlanWaypoint[]
  roles: PlanRole[]
  triggers: PlanTrigger[]
}

const norm = (value: string) => value.trim().toLowerCase()

function hasTrigger(triggers: PlanTrigger[], condition: string) {
  const target = norm(condition)
  return triggers.some(trigger => norm(trigger.condition) === target)
}

function hasRoleForMember(roles: PlanRole[], memberId: string) {
  return roles.some(role => role.member_user_id === memberId && role.responsibility.trim().length > 0)
}

export function reviewPlanWithPilot(input: PlanPilotReviewInput): PlanPilotProposal[] {
  const { pt, members, waypoints, roles, triggers } = input
  const proposals: PlanPilotProposal[] = []
  const suggested = TRIGGER_SUGGESTIONS.map(item => item[pt ? 'pt' : 'en'])
  const school = waypoints.find(point => point.kind === 'school')

  for (const item of suggested.slice(0, 3)) {
    if (hasTrigger(triggers, item.condition)) continue
    proposals.push({
      id: `trigger:${norm(item.condition)}`,
      kind: 'trigger',
      title: pt ? `Adicionar gatilho: ${item.condition}` : `Add trigger: ${item.condition}`,
      reason: pt
        ? 'Gatilhos observáveis reduzem discussão quando a família precisa agir rápido.'
        : 'Observable triggers reduce debate when the family needs to act fast.',
      trigger: { ...item, sort_order: triggers.length + proposals.filter(p => p.kind === 'trigger').length },
    })
  }

  if (school && members.length > 0) {
    const candidates = members.filter(member => !hasRoleForMember(roles, member.user_id))
    const member = candidates.find(m => m.is_me) ?? candidates[0] ?? null
    if (member) {
      proposals.push({
        id: `role:school:${member.user_id}`,
        kind: 'role',
        title: pt ? `Definir responsável por ${school.name}` : `Assign responsibility for ${school.name}`,
        reason: pt
          ? 'Lugar importante sem responsável vira decisão improvisada durante a emergência.'
          : 'An important place without an owner becomes an improvised decision during the emergency.',
        role: {
          member_user_id: member.user_id,
          responsibility: pt ? `Verificar e buscar quem estiver em ${school.name}` : `Check and pick up whoever is at ${school.name}`,
        },
      })
    }
  }

  return proposals.slice(0, 4)
}
