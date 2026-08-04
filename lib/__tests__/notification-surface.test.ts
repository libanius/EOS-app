import { notificationSurface } from '@/lib/notification-surface'

describe('notificationSurface', () => {
  it('routes existing notification kinds to bottom-nav surfaces', () => {
    expect(notificationSurface({ scope: 'weather', kind: 'weather_alert' })).toBe('weather')
    expect(notificationSurface({ scope: 'edu', kind: 'edu_content_approved' })).toBe('preparedness')
    expect(notificationSurface({ scope: 'simulation', kind: 'simulation_invite' })).toBe('scenario')
    expect(notificationSurface({ scope: 'circle', kind: 'message' })).toBe('comms')
    expect(notificationSurface({ scope: 'circle', kind: 'family_invite' })).toBe('family')
    expect(notificationSurface({ scope: 'circle', kind: 'member_joined' })).toBe('family')
  })

  it('lets explicit metadata surface override legacy scope', () => {
    expect(notificationSurface({
      scope: 'circle',
      kind: 'custom',
      metadata: { surface: 'preparedness' },
    })).toBe('preparedness')
  })
})
