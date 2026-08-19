import {
  planSessionPromotionEffects,
  planSessionPlaceEffects,
  promotableSessionPlaces,
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

  it('offers every unpromoted day point when closing', () => {
    const session: PlanSessionSnapshot = {
      ...baseSession,
      places: [
        {
          id: 'place-1',
          sessionId: 'session-1',
          name: 'Portão norte',
          lat: 26.31,
          lng: -80.24,
          notes: null,
          createdBy: 'user-1',
          createdAt: '2026-08-19T10:10:00.000Z',
          promotedPlaceId: null,
        },
        {
          id: 'place-2',
          sessionId: 'session-1',
          name: 'Barraca médica',
          lat: 26.32,
          lng: -80.25,
          notes: null,
          createdBy: 'user-1',
          createdAt: '2026-08-19T10:12:00.000Z',
          promotedPlaceId: null,
        },
        {
          id: 'place-3',
          sessionId: 'session-1',
          name: 'Entrada já salva',
          lat: 26.33,
          lng: -80.26,
          notes: null,
          createdBy: 'user-1',
          createdAt: '2026-08-19T10:14:00.000Z',
          promotedPlaceId: 'circle-place-1',
        },
      ],
    }

    expect(promotableSessionPlaces(session).map(place => place.id)).toEqual(['place-1', 'place-2'])
  })

  it('promotes a day point without plan versioning, push, or acknowledgement', () => {
    expect(planSessionPromotionEffects(true)).toEqual({
      createsCirclePlace: true,
      marksSessionPlacePromoted: true,
      keepsExecutionRecord: true,
      incrementsPlanVersion: false,
      sendsPush: false,
      asksAcknowledgement: false,
    })
  })

  it('keeps the execution record when promotion is refused', () => {
    expect(planSessionPromotionEffects(false)).toEqual({
      createsCirclePlace: false,
      marksSessionPlacePromoted: false,
      keepsExecutionRecord: true,
      incrementsPlanVersion: false,
      sendsPush: false,
      asksAcknowledgement: false,
    })
  })
})
