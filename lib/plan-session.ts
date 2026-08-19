export type PlanSessionStatus = 'armed' | 'disarmed' | 'expired'

export type PlanSessionMember = {
  userId: string
  name?: string | null
}

export type PlanSessionDependent = {
  memberId: string
  name?: string | null
  guardianUserId: string | null
  guardianName?: string | null
}

export type PlanSessionPlace = {
  id: string
  sessionId: string
  name: string
  lat: number
  lng: number
  notes: string | null
  createdBy: string
  createdAt: string
  promotedPlaceId: string | null
}

export type PlanSessionSnapshot = {
  id: string
  circleId: string
  circleName?: string | null
  planId: string | null
  planName?: string | null
  name: string
  status: PlanSessionStatus
  startsAt: string
  endsAt: string
  center: { lat: number; lng: number; radiusM: number | null } | null
  createdBy: string
  createdAt: string
  disarmedAt: string | null
  members: PlanSessionMember[]
  dependents: PlanSessionDependent[]
  places: PlanSessionPlace[]
}

export type PlanSessionMutationEffects = {
  incrementsPlanVersion: boolean
  sendsPush: boolean
  asksAcknowledgement: boolean
}

export const PLAN_SESSION_PLACE_EFFECTS: PlanSessionMutationEffects = {
  incrementsPlanVersion: false,
  sendsPush: false,
  asksAcknowledgement: false,
}

export function planSessionPlaceEffects(): PlanSessionMutationEffects {
  return PLAN_SESSION_PLACE_EFFECTS
}

export function isPlanSessionExpired(
  session: Pick<PlanSessionSnapshot, 'status' | 'endsAt'>,
  nowMs = Date.now(),
): boolean {
  if (session.status !== 'armed') return false
  const endsAt = Date.parse(session.endsAt)
  return Number.isFinite(endsAt) && endsAt <= nowMs
}

export function shouldAskBeforeDisarmingExpiredSession(
  session: Pick<PlanSessionSnapshot, 'status' | 'endsAt'>,
  nowMs = Date.now(),
): boolean {
  return isPlanSessionExpired(session, nowMs)
}

export function remainingPlanSessionSeconds(
  session: Pick<PlanSessionSnapshot, 'endsAt'>,
  nowMs = Date.now(),
): number {
  const endsAt = Date.parse(session.endsAt)
  if (!Number.isFinite(endsAt)) return 0
  return Math.max(0, Math.round((endsAt - nowMs) / 1000))
}

export function normalizePlanSessionWindow(startsAt: string, endsAt: string): { startsAt: string; endsAt: string } | null {
  const start = Date.parse(startsAt)
  const end = Date.parse(endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
  }
}
