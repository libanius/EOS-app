export type PlanExecutionMemberStatusValue =
  | 'at_place'
  | 'on_the_way'
  | 'searching'
  | 'no_signal'
  | 'unknown'

export type PlanExecutionStateEvent = {
  actorUserId: string
  kind: 'status' | 'arrived' | 'escalation_suggested' | 'escalation_taken' | 'resolved' | string
  payload?: Record<string, unknown> | null
  createdAt: string
}

export type PlanExecutionAdult = {
  userId: string
  name?: string | null
}

export type PlanExecutionDependent = {
  memberId: string
  name?: string | null
  guardianUserId?: string | null
  guardianName?: string | null
}

export type PlanExecutionMemberState = {
  userId: string
  name: string
  status: PlanExecutionMemberStatusValue
  label: string
  updatedAt: string | null
  ageMinutes: number | null
}

export type PlanExecutionDependentState = {
  memberId: string
  name: string
  status: 'no_device'
  label: string
  guardianUserId: string | null
  guardianName: string | null
}

export type PlanExecutionEscalationState = {
  due: boolean
  intervalMinutes: number
  stepIndex: number
  stepLabel: string
  nextAt: string
  ageMinutes: number
}

export type PlanExecutionSharedState = {
  members: PlanExecutionMemberState[]
  dependents: PlanExecutionDependentState[]
  escalation: PlanExecutionEscalationState
}

export type PlanExecutionEscalationDecision = 'taken' | 'deferred'

export const DEFAULT_ESCALATION_MINUTES = 15
export const MIN_ESCALATION_MINUTES = 5
export const MAX_ESCALATION_MINUTES = 120

export const ESCALATION_BUTTON_EFFECTS = {
  recordsEvent: true,
  executesExternalAction: false,
} as const

export function normalizeEscalationMinutes(value: unknown): number {
  if (value === null || value === undefined || value === '') return DEFAULT_ESCALATION_MINUTES
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_ESCALATION_MINUTES
  return Math.max(MIN_ESCALATION_MINUTES, Math.min(MAX_ESCALATION_MINUTES, Math.round(numeric)))
}

export function escalationButtonEffects() {
  return ESCALATION_BUTTON_EFFECTS
}

export function statusLabel(status: PlanExecutionMemberStatusValue, pt: boolean): string {
  if (status === 'at_place') return pt ? 'no local' : 'at place'
  if (status === 'on_the_way') return pt ? 'a caminho' : 'on the way'
  if (status === 'searching') return pt ? 'procurando' : 'searching'
  if (status === 'no_signal') return pt ? 'sem sinal' : 'no signal'
  return pt ? 'sem estado' : 'no status'
}

export function dependentNoDeviceLabel(pt: boolean): string {
  return pt ? 'sem aparelho' : 'no device'
}

export function escalationStepLabels(pt: boolean): string[] {
  return pt
    ? ['segurança do evento', 'achados e perdidos', 'polícia']
    : ['event security', 'lost and found', 'police']
}

function eventTime(event: PlanExecutionStateEvent) {
  const time = Date.parse(event.createdAt)
  return Number.isFinite(time) ? time : 0
}

function statusFrom(event: PlanExecutionStateEvent): PlanExecutionMemberStatusValue {
  if (event.kind === 'arrived') return 'at_place'
  const value = event.payload?.status
  if (value === 'at_place' || value === 'on_the_way' || value === 'searching' || value === 'no_signal') return value
  return 'unknown'
}

function ageMinutesSince(at: string, nowMs: number): number {
  const time = Date.parse(at)
  if (!Number.isFinite(time)) return 0
  return Math.max(0, Math.floor((nowMs - time) / 60000))
}

export function buildPlanExecutionSharedState({
  members,
  dependents,
  events,
  startedAt,
  escalationMinutes,
  nowMs = Date.now(),
  pt,
}: {
  members: PlanExecutionAdult[]
  dependents: PlanExecutionDependent[]
  events: PlanExecutionStateEvent[]
  startedAt: string
  escalationMinutes?: number | null
  nowMs?: number
  pt: boolean
}): PlanExecutionSharedState {
  const latestStatus = new Map<string, PlanExecutionStateEvent>()
  events
    .filter(event => event.kind === 'status' || event.kind === 'arrived')
    .forEach(event => {
      const previous = latestStatus.get(event.actorUserId)
      if (!previous || eventTime(event) > eventTime(previous)) latestStatus.set(event.actorUserId, event)
    })

  const escalationEvents = events
    .filter(event => event.kind === 'escalation_suggested' || event.kind === 'escalation_taken')
    .sort((a, b) => eventTime(a) - eventTime(b))
  const takenCount = escalationEvents.filter(event => event.kind === 'escalation_taken').length
  const steps = escalationStepLabels(pt)
  const stepIndex = Math.min(takenCount, steps.length - 1)
  const anchor = escalationEvents[escalationEvents.length - 1]?.createdAt ?? startedAt
  const interval = normalizeEscalationMinutes(escalationMinutes)
  const anchorMs = Date.parse(anchor)
  const nextMs = (Number.isFinite(anchorMs) ? anchorMs : nowMs) + interval * 60000

  return {
    members: members.map(member => {
      const event = latestStatus.get(member.userId) ?? null
      const status = event ? statusFrom(event) : 'unknown'
      return {
        userId: member.userId,
        name: member.name?.trim() || (pt ? 'Pessoa' : 'Person'),
        status,
        label: statusLabel(status, pt),
        updatedAt: event?.createdAt ?? null,
        ageMinutes: event ? ageMinutesSince(event.createdAt, nowMs) : null,
      }
    }),
    dependents: dependents.map(dependent => ({
      memberId: dependent.memberId,
      name: dependent.name?.trim() || (pt ? 'Dependente' : 'Dependent'),
      status: 'no_device',
      label: dependentNoDeviceLabel(pt),
      guardianUserId: dependent.guardianUserId ?? null,
      guardianName: dependent.guardianName?.trim() || null,
    })),
    escalation: {
      due: nowMs >= nextMs,
      intervalMinutes: interval,
      stepIndex,
      stepLabel: steps[stepIndex],
      nextAt: new Date(nextMs).toISOString(),
      ageMinutes: ageMinutesSince(anchor, nowMs),
    },
  }
}
