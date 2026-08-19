import {
  planSessionPlaceEffects,
  shouldAskBeforeDisarmingExpiredSession,
  type PlanSessionSnapshot,
} from '../plan-session'

const baseSession: PlanSessionSnapshot = {
  id: 'session-1',
  circleId: 'circle-1',
  planId: 'plan-1',
  name: 'Parade',
  status: 'armed',
  startsAt: '2026-08-19T10:00:00.000Z',
  endsAt: '2026-08-19T12:00:00.000Z',
  center: null,
  createdBy: 'user-1',
  createdAt: '2026-08-19T09:55:00.000Z',
  disarmedAt: null,
  members: [],
  dependents: [],
  places: [],
}

describe('plan session rules', () => {
  it('asks before disarming an expired armed session', () => {
    expect(shouldAskBeforeDisarmingExpiredSession(baseSession, Date.parse('2026-08-19T12:00:01.000Z'))).toBe(true)
  })

  it('does not ask after a session is already disarmed', () => {
    expect(
      shouldAskBeforeDisarmingExpiredSession(
        { ...baseSession, status: 'disarmed' },
        Date.parse('2026-08-19T12:00:01.000Z'),
      ),
    ).toBe(false)
  })

  it('keeps day points outside plan versioning, push, and acknowledgement', () => {
    expect(planSessionPlaceEffects()).toEqual({
      incrementsPlanVersion: false,
      sendsPush: false,
      asksAcknowledgement: false,
    })
  })
})
