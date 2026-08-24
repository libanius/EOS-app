import type { PlanExecutionSnapshot } from './plan-execution-mode'
import {
  buildPlanExecutionProtocols,
  buildPlanExecutionSteps,
  inferRendezvousKind,
  type PlanExecutionProtocol,
} from './plan-execution'
import { RENDEZVOUS, type PlanDocument, type PlanRole, type PlanWaypoint } from './family-plan'
import { bearing, compassPoint, distanceKm } from './world/shelters'
import { formatDistance, walkingMinutes } from './world/navigation'

export const PLAN_EXECUTION_LEGIBILITY_CLASS = 'plan-execution-readable'

export type PlanCoordinate = { lat: number; lng: number }

export type PlanPlaybookStep = {
  id: string
  title: string
  body: string
  kind: 'protocol' | 'role' | 'destination' | 'route' | 'finish'
}

export type PlanPlaybookDependentBrief = {
  id: string
  memberId: string
  instruction: string
}

export type PlanPlaybookNavigation = {
  targetName: string
  targetKind: PlanWaypoint['kind']
  bearingDegrees: number
  compass: string
  distanceKm: number
  distanceText: string
  walkingMinutes: number
}

export type PlanPlaybook = {
  protocolChoices: PlanExecutionProtocol[]
  activeProtocol: PlanExecutionProtocol | null
  needsProtocolChoice: boolean
  numberedSteps: PlanPlaybookStep[]
  otherRoleSteps: PlanPlaybookStep[]
  dependentBriefs: PlanPlaybookDependentBrief[]
  systemNotices: string[]
  navigation: PlanPlaybookNavigation | null
}

type BuildPlanPlaybookInput = {
  doc: PlanDocument
  execution: PlanExecutionSnapshot
  userId: string | null
  origin?: PlanCoordinate | null
  pt: boolean
}

const RENDEZVOUS_ORDER = new Map(RENDEZVOUS.map((item, index) => [item.kind, index]))

function orderedRendezvous(waypoints: PlanWaypoint[]) {
  return waypoints
    .filter(point => RENDEZVOUS_ORDER.has(point.kind))
    .sort((a, b) => (RENDEZVOUS_ORDER.get(a.kind) ?? 99) - (RENDEZVOUS_ORDER.get(b.kind) ?? 99))
}

function roleStep(role: PlanRole, index: number, pt: boolean): PlanPlaybookStep {
  return {
    id: `role-${role.member_user_id}-${role.for_member_id ?? 'general'}-${index}`,
    kind: 'role',
    title: pt ? 'Sua tarefa' : 'Your task',
    body: role.responsibility,
  }
}

function fallbackRoleStep(pt: boolean): PlanPlaybookStep {
  return {
    id: 'role-unassigned',
    kind: 'role',
    title: pt ? 'Sem papel específico' : 'No specific role',
    body: pt
      ? 'Siga o protocolo escolhido, mantenha status e localização claros, e ajude quem estiver pendente.'
      : 'Follow the chosen protocol, keep status and location clear, and help anyone still pending.',
  }
}

function activeProtocolFrom(
  protocols: PlanExecutionProtocol[],
  execution: PlanExecutionSnapshot,
): PlanExecutionProtocol | null {
  if (typeof execution.protocolIndex === 'number') return protocols[execution.protocolIndex] ?? null
  return protocols.length === 1 ? protocols[0] ?? null : null
}

function destinationPoint(doc: PlanDocument, protocol: PlanExecutionProtocol | null): PlanWaypoint | null {
  const inferred = inferRendezvousKind(protocol?.trigger ?? null)
  const rendezvous = orderedRendezvous(doc.waypoints ?? [])
  if (inferred) {
    const direct = (doc.waypoints ?? []).find(point => point.kind === inferred)
    if (direct) return direct
  }
  return rendezvous[0] ?? (doc.waypoints ?? []).find(point => point.kind !== 'home') ?? null
}

function navigationFor(
  doc: PlanDocument,
  protocol: PlanExecutionProtocol | null,
  origin: PlanCoordinate | null | undefined,
  pt: boolean,
): PlanPlaybookNavigation | null {
  const target = destinationPoint(doc, protocol)
  const from = origin ?? (doc.waypoints ?? []).find(point => point.kind === 'home') ?? null
  if (!target || !from) return null

  const km = distanceKm(from, target)
  const degrees = bearing(from, target)
  return {
    targetName: target.name,
    targetKind: target.kind,
    bearingDegrees: Math.round(degrees),
    compass: compassPoint(degrees, pt),
    distanceKm: km,
    distanceText: formatDistance(km, pt),
    walkingMinutes: walkingMinutes(km),
  }
}

function dependentBriefsFor(doc: PlanDocument, myRoles: PlanRole[]): PlanPlaybookDependentBrief[] {
  const targetIds = new Set(myRoles.map(role => role.for_member_id).filter((id): id is string => Boolean(id)))
  if (!targetIds.size) return []
  return (doc.dependentBriefs ?? [])
    .filter(brief => targetIds.has(brief.member_id) && brief.instruction.trim())
    .map(brief => ({
      id: brief.id ?? brief.member_id,
      memberId: brief.member_id,
      instruction: brief.instruction.trim(),
    }))
}

function systemNoticesFor(execution: PlanExecutionSnapshot, pt: boolean): string[] {
  if (execution.notice?.pending) {
    return [pt
      ? 'Aviso ao círculo pendente de rede. Continue executando o plano neste aparelho.'
      : 'Circle notice is waiting for network. Keep running the plan on this device.']
  }
  if (execution.notice?.delivered === false) {
    return [pt
      ? 'Aviso ao círculo registrado, mas sem confirmação de entrega.'
      : 'Circle notice was recorded, but delivery is not confirmed.']
  }
  return []
}

export function buildPlanPlaybook({
  doc,
  execution,
  userId,
  origin,
  pt,
}: BuildPlanPlaybookInput): PlanPlaybook {
  const protocolChoices = buildPlanExecutionProtocols(doc, pt)
  const activeProtocol = activeProtocolFrom(protocolChoices, execution)
  const needsProtocolChoice = protocolChoices.length > 1 && activeProtocol === null
  const sharedSteps = activeProtocol ? buildPlanExecutionSteps(doc, pt, activeProtocol) : []
  const protocolStep = sharedSteps.find(step => step.kind === 'trigger')

  const myRoles = userId ? (doc.roles ?? []).filter(role => role.member_user_id === userId) : []
  const otherRoles = userId ? (doc.roles ?? []).filter(role => role.member_user_id !== userId) : (doc.roles ?? [])
  const myRoleSteps = myRoles.map((role, index) => roleStep(role, index, pt))

  const numberedSteps: PlanPlaybookStep[] = [
    ...(protocolStep ? [{ id: protocolStep.id, kind: 'protocol' as const, title: protocolStep.title, body: protocolStep.body }] : []),
    ...(myRoleSteps.length ? myRoleSteps : [fallbackRoleStep(pt)]),
    ...sharedSteps
      .filter(step => step.kind === 'rendezvous' || step.kind === 'route' || step.kind === 'finish')
      .map(step => ({
        id: step.id,
        kind: step.kind === 'rendezvous' ? 'destination' as const : step.kind === 'route' ? 'route' as const : 'finish' as const,
        title: step.title,
        body: step.body,
      })),
  ]

  return {
    protocolChoices,
    activeProtocol,
    needsProtocolChoice,
    numberedSteps,
    otherRoleSteps: otherRoles.map((role, index) => roleStep(role, index, pt)),
    dependentBriefs: dependentBriefsFor(doc, myRoles),
    systemNotices: systemNoticesFor(execution, pt),
    navigation: navigationFor(doc, activeProtocol, origin, pt),
  }
}
