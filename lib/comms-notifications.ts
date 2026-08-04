import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient

export type CommsNotificationKind =
  | 'message'
  | 'join_request_approved'
  | 'member_joined'
  | 'family_invite'
  | 'family_invite_accepted'
  | 'family_invite_denied'

type NotifyInput = {
  admin: AdminClient
  circleId: string
  actorId?: string | null
  recipientIds: string[]
  kind: CommsNotificationKind
  title: string
  body: string
  href?: string
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
  circleId,
  actorId = null,
  recipientIds,
  kind,
  title,
  body,
  href = '/comms?view=notifications',
  metadata = {},
}: NotifyInput) {
  const unique = Array.from(new Set(recipientIds.filter(id => id && id !== actorId)))
  if (!unique.length) return

  const rows = unique.map(recipient_id => ({
    circle_id: circleId,
    recipient_id,
    actor_id: actorId,
    kind,
    title: title.slice(0, 120),
    body: body.slice(0, 280),
    href,
    metadata,
  }))

  const { error } = await admin.from('circle_notifications').insert(rows)
  if (error) {
    // Migration may not be applied in every environment during rollout.
    console.warn('[comms-notifications] insert skipped:', error.message)
  }
}
