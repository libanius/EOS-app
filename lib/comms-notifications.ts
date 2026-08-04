import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient

export type CommsNotificationKind =
  | 'message'
  | 'join_request_approved'
  | 'member_joined'
  | 'family_invite'
  | 'family_invite_accepted'
  | 'family_invite_denied'
  | 'edu_content_approved'
  | 'simulation_invite'
  | 'weather_alert'

export type CommsNotificationScope = 'circle' | 'weather' | 'edu' | 'simulation' | 'system'

type NotifyInput = {
  admin: AdminClient
  circleId?: string | null
  actorId?: string | null
  recipientIds: string[]
  scope?: CommsNotificationScope
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
  kind,
  title,
  body,
  href = '/comms?view=notifications',
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
    metadata,
  }))

  const { error } = await admin.from('circle_notifications').insert(rows)
  if (error) {
    // Migration may not be applied in every environment during rollout.
    console.warn('[comms-notifications] insert skipped:', error.message)
  }
}
