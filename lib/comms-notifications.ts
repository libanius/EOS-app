import type { SupabaseClient } from '@supabase/supabase-js'
import { notificationSurface, type NotificationSurface } from '@/lib/notification-surface'

type AdminClient = SupabaseClient

export type CommsNotificationKind =
  | 'message'
  | 'join_request_approved'
  | 'member_joined'
  | 'family_invite'
  | 'family_invite_accepted'
  | 'family_invite_denied'
  | 'edu_content_saved'
  | 'edu_content_approved'
  | 'simulation_invite'
  | 'weather_alert'
  // D-119: aviso ao dono de que apareceu erro novo em produção.
  | 'error_alert'
  | 'plan_execution'
  | 'plan_execution_cancelled'
  | 'plan_execution_resolved'
  /*
   * D-186: a mensagem predefinida de uma pessoa para outra do círculo.
   *
   * Ela existia SÓ como push. Quando a notificação não saía, a mensagem não
   * existia em lugar nenhum — nem na caixa, nem na linha do tempo, nem ao
   * abrir o app. Agora ela é registro, e o push é reforço.
   */
  | 'family_ping'

export type CommsNotificationScope = 'circle' | 'weather' | 'edu' | 'simulation' | 'system'

type NotifyInput = {
  admin: AdminClient
  circleId?: string | null
  actorId?: string | null
  recipientIds: string[]
  scope?: CommsNotificationScope
  surface?: NotificationSurface
  kind: CommsNotificationKind
  title: string
  body: string
  href?: string
  severity?: string | null
  sourceKey?: string | null
  excludeActor?: boolean
  metadata?: Record<string, unknown>
}

export async function getCircleMemberIds(admin: AdminClient, circleId: string) {
  const { data } = await admin.from('circle_members').select('user_id').eq('circle_id', circleId)
  return Array.from(new Set(((data ?? []) as Array<{ user_id: string }>).map(row => row.user_id).filter(Boolean)))
}

export async function getProfileName(admin: AdminClient, userId: string | null | undefined) {
  if (!userId) return 'Alguém'
  const { data } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle()
  return (data?.name as string | null | undefined)?.trim() || 'Alguém'
}

export async function getCircleName(admin: AdminClient, circleId: string) {
  const { data } = await admin.from('circles').select('name').eq('id', circleId).maybeSingle()
  return (data?.name as string | null | undefined)?.trim() || 'Círculo'
}

export async function createCommsNotifications({
  admin,
  circleId = null,
  actorId = null,
  recipientIds,
  scope = 'circle',
  surface,
  kind,
  title,
  body,
  /*
   * COMMS-T12/D-188: o padrão passou de `?view=notifications` para a rota.
   * Os `href` JÁ GRAVADOS continuam com o endereço antigo — `/comms` os
   * redireciona, porque histórico não se reescreve.
   */
  href = '/comms/linha-do-tempo',
  severity = null,
  sourceKey = null,
  excludeActor = true,
  metadata = {},
}: NotifyInput) {
  let unique = Array.from(new Set(recipientIds.filter(id => id && (!excludeActor || id !== actorId))))
  if (!unique.length) return

  if (sourceKey) {
    const { data } = await admin
      .from('circle_notifications')
      .select('recipient_id')
      .eq('source_key', sourceKey)
      .in('recipient_id', unique)
    const existing = new Set(((data ?? []) as Array<{ recipient_id: string }>).map(row => row.recipient_id))
    unique = unique.filter(id => !existing.has(id))
    if (!unique.length) return
  }

  const nextMetadata = {
    ...metadata,
    surface: surface ?? notificationSurface({ scope, kind, metadata }),
  }

  const rows = unique.map(recipient_id => ({
    circle_id: circleId,
    recipient_id,
    actor_id: actorId,
    scope,
    kind,
    title: title.slice(0, 120),
    body: body.slice(0, 280),
    href,
    severity,
    source_key: sourceKey,
    metadata: nextMetadata,
  }))

  const { error } = await admin.from('circle_notifications').insert(rows)
  if (error) {
    // Migration may not be applied in every environment during rollout.
    console.warn('[comms-notifications] insert skipped:', error.message)
  }
}
