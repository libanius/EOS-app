export type NotificationSurface = 'weather' | 'family' | 'comms' | 'preparedness' | 'scenario' | 'system'

const SURFACES: NotificationSurface[] = ['weather', 'family', 'comms', 'preparedness', 'scenario', 'system']

type SurfaceInput = {
  scope?: string | null
  kind?: string | null
  metadata?: Record<string, unknown> | null
}

export function isNotificationSurface(value: unknown): value is NotificationSurface {
  return typeof value === 'string' && SURFACES.includes(value as NotificationSurface)
}

export function notificationSurface(input: SurfaceInput): NotificationSurface {
  const explicit = input.metadata?.surface
  if (isNotificationSurface(explicit)) return explicit

  if (input.scope === 'weather') return 'weather'
  if (input.scope === 'edu') return 'preparedness'
  if (input.scope === 'simulation') return 'scenario'
  /*
   * `family_ping` entrou aqui em D-193, e saiu de `family` onde D-186 o pôs.
   *
   * Aquela decisão dizia "é sobre gente, não sobre conversa" — verdade enquanto
   * o ping NÃO TINHA conversa: chegava e acabava, sem onde responder. Agora ele
   * é mensagem num thread, e o badge aponta para onde se RESPONDE.
   */
  if (
    input.kind === 'message' ||
    input.kind === 'family_ping' ||
    input.kind === 'plan_execution' ||
    input.kind === 'plan_execution_cancelled' ||
    input.kind === 'plan_execution_resolved'
  ) return 'comms'
  if (
    input.kind === 'join_request_approved' ||
    input.kind === 'member_joined' ||
    input.kind === 'family_invite' ||
    input.kind === 'family_invite_accepted' ||
    input.kind === 'family_invite_denied'
  ) {
    return 'family'
  }

  return 'system'
}

export function emptySurfaceCounts(): Record<NotificationSurface, number> {
  return {
    weather: 0,
    family: 0,
    comms: 0,
    preparedness: 0,
    scenario: 0,
    system: 0,
  }
}
