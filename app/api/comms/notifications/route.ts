import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emptySurfaceCounts, notificationSurface } from '@/lib/notification-surface'

type NotificationRow = {
  id: string
  circle_id: string | null
  actor_id: string | null
  scope: string
  kind: string
  title: string
  body: string
  href: string
  severity: string | null
  source_key: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

type UnreadSurfaceRow = {
  scope: string | null
  kind: string | null
  metadata: Record<string, unknown> | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  const [{ data: rows, error }, { data: unreadRows, error: unreadError }] = await Promise.all([
    admin
      .from('circle_notifications')
      .select('id, circle_id, actor_id, scope, kind, title, body, href, severity, source_key, metadata, read_at, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('circle_notifications')
      .select('scope, kind, metadata')
      .eq('recipient_id', user.id)
      .is('read_at', null),
  ])

  if (error || unreadError) {
    return NextResponse.json({ notifications: [], unread_count: 0, unread_by_surface: emptySurfaceCounts(), migration_pending: true })
  }

  const notifications = ((rows ?? []) as NotificationRow[])
  const unreadBySurface = emptySurfaceCounts()
  for (const row of (unreadRows ?? []) as UnreadSurfaceRow[]) {
    const surface = notificationSurface(row)
    unreadBySurface[surface] += 1
  }
  const unreadCount = Object.values(unreadBySurface).reduce((total, value) => total + value, 0)
  const circleIds = Array.from(new Set(notifications.map(row => row.circle_id).filter((id): id is string => Boolean(id))))
  const actorIds = Array.from(new Set(notifications.map(row => row.actor_id).filter((id): id is string => Boolean(id))))
  const circleNames = new Map<string, string>()
  const actorNames = new Map<string, string>()

  if (circleIds.length) {
    const { data: circles } = await admin.from('circles').select('id, name').in('id', circleIds)
    for (const circle of circles ?? []) circleNames.set(circle.id as string, (circle.name as string | null) || 'Círculo')
  }
  if (actorIds.length) {
    const { data: profiles } = await admin.from('profiles').select('id, name').in('id', actorIds)
    for (const profile of profiles ?? []) actorNames.set(profile.id as string, (profile.name as string | null) || 'Alguém')
  }

  return NextResponse.json({
    unread_count: unreadCount,
    unread_by_surface: unreadBySurface,
    notifications: notifications.map(row => ({
      ...row,
      surface: notificationSurface(row),
      circle_name: row.circle_id ? (circleNames.get(row.circle_id) ?? 'Círculo') : null,
      actor_name: row.actor_id ? (actorNames.get(row.actor_id) ?? 'Alguém') : null,
      is_read: Boolean(row.read_at),
    })),
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string; ids?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (body.action !== 'mark_read') return NextResponse.json({ error: 'action must be mark_read' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  let query = admin
    .from('circle_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null)

  if (Array.isArray(body.ids) && body.ids.length) query = query.in('id', body.ids)

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
