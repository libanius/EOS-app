import { notificationSurface } from '@/lib/notification-surface'

describe('notificationSurface', () => {
  it('routes existing notification kinds to bottom-nav surfaces', () => {
    expect(notificationSurface({ scope: 'weather', kind: 'weather_alert' })).toBe('weather')
    expect(notificationSurface({ scope: 'edu', kind: 'edu_content_approved' })).toBe('preparedness')
    expect(notificationSurface({ scope: 'edu', kind: 'edu_content_saved' })).toBe('preparedness')
    expect(notificationSurface({ scope: 'simulation', kind: 'simulation_invite' })).toBe('scenario')
    expect(notificationSurface({ scope: 'circle', kind: 'message' })).toBe('comms')
    expect(notificationSurface({ scope: 'circle', kind: 'plan_execution' })).toBe('comms')
    expect(notificationSurface({ scope: 'circle', kind: 'plan_execution_cancelled' })).toBe('comms')
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

describe('ping da família (D-186, revisto em D-193)', () => {
  it('cai em Comms, porque é lá que se responde', () => {
    /*
     * D-186 mandou para `family`: "é sobre gente, não sobre conversa". Era
     * verdade quando o ping não tinha conversa — chegava e acabava ali.
     *
     * D-193 fez o preset virar MENSAGEM num thread. O badge tem que levar para
     * onde a ação acontece; em Família não dá para responder nada.
     */
    expect(notificationSurface({ scope: 'circle', kind: 'family_ping' })).toBe('comms')
  })
})
