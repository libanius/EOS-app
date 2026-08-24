import type { PlanSummary } from './family-plan'

export const HOLD_TO_EXECUTE_MS = 1_500
export const EXECUTION_UNDO_WINDOW_MS = 30_000

export type PlanExecutionStatus = 'running' | 'resolved' | 'cancelled'
export type PlanExecutionEventKind =
  | 'started'
  | 'cancelled'
  | 'protocol_set'
  | 'status'
  | 'arrived'
  | 'step_done'
  | 'escalation_suggested'
  | 'escalation_taken'
  | 'resolved'

export type PlanExecutionSnapshot = {
  id: string
  circleId: string
  circleName?: string | null
  planId: string
  planName: string
  planVersion: number
  sessionId: string | null
  protocolIndex: number | null
  status: PlanExecutionStatus
  startedBy: string
  startedByName?: string | null
  startedAt: string
  endedAt: string | null
  outcome: string | null
  notice?: {
    attempted: boolean
    delivered: boolean
    pending?: boolean
  }
}

export function isPlanExecutionActive(execution: PlanExecutionSnapshot | null): boolean {
  return execution?.status === 'running'
}

export type PlanExecutionEntryState =
  | { kind: 'empty' }
  | { kind: 'hold'; plan: PlanSummary; highlightedPlanId: string | null }
  | { kind: 'select'; plans: PlanSummary[]; highlightedPlanId: string | null }

export type PlanExecutionTriggerEffects = {
  createsExecution: true
  sendsNotice: true
  opensPlaybook: true
}

export const PLAN_EXECUTION_TRIGGER_EFFECTS: PlanExecutionTriggerEffects = {
  createsExecution: true,
  sendsNotice: true,
  opensPlaybook: true,
}

export const UNDO_BANNER_BEHAVIOR = {
  presentation: 'banner',
  blocksPlaybook: false,
} as const

export function holdDurationTriggersExecution(durationMs: number): boolean {
  return durationMs >= HOLD_TO_EXECUTE_MS
}

export function planExecutionEntryState(
  plans: PlanSummary[],
  highlightedPlanId: string | null = null,
): PlanExecutionEntryState {
  if (!plans.length) return { kind: 'empty' }
  if (plans.length === 1) return { kind: 'hold', plan: plans[0], highlightedPlanId }

  const ordered = highlightedPlanId
    ? [
        ...plans.filter(plan => plan.id === highlightedPlanId),
        ...plans.filter(plan => plan.id !== highlightedPlanId),
      ]
    : plans

  return { kind: 'select', plans: ordered, highlightedPlanId }
}

export function executionUndoDeadline(startedAt: string | number | Date): number {
  const startedMs = startedAt instanceof Date ? startedAt.getTime() : typeof startedAt === 'number' ? startedAt : Date.parse(startedAt)
  return Number.isFinite(startedMs) ? startedMs + EXECUTION_UNDO_WINDOW_MS : 0
}

export function executionUndoRemainingMs(startedAt: string | number | Date, nowMs = Date.now()): number {
  return Math.max(0, executionUndoDeadline(startedAt) - nowMs)
}

export function isExecutionUndoOpen(startedAt: string | number | Date, nowMs = Date.now()): boolean {
  return executionUndoRemainingMs(startedAt, nowMs) > 0
}

export function planExecutionTriggerEffects(): PlanExecutionTriggerEffects {
  return PLAN_EXECUTION_TRIGGER_EFFECTS
}
