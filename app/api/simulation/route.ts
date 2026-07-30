import { type NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Shared simulation drills (D-071 / SIM-T07).
 *
 * GET  /api/simulation — what drill, if any, concerns me right now.
 * POST /api/simulation — start one for a circle and invite everyone in it.
 *
 * Two rules the API enforces, not the UI:
 *  - Nobody is placed in a drill they did not accept: participants start as
 *    `invited` and only a deliberate answer moves them to `joined`.
 *  - A real CRITICAL alert ends the drill for the WHOLE circle (D-071), because
 *    a family split between reality and fiction is the failure this feature
 *    could otherwise create.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:brightscalegroup@gmail.com'

/** A drill nobody ended is over after this — no one inherits a stale scenario. */
const MAX_AGE_MINUTES = 90

/** Opaque, unguessable, and short enough to share out loud if needed. */
function randomToken() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 18)
}

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ session: null })

  const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60_000).toISOString()

  const { data: rows, error } = await admin
    .from('simulation_participants')
    .select('session_id, status, simulation_sessions!inner(id, circle_id, owner_id, config, status, started_at)')
    .eq('user_id', user.id)
    .in('status', ['invited', 'joined'])
    .eq('simulation_sessions.status', 'active')
    .gte('simulation_sessions.started_at', cutoff)
    .order('session_id', { ascending: false })
    .limit(1)

  if (error) {
    // Migration not applied yet: shared drills are additive, so stay quiet.
    if (tableMissing(error)) return NextResponse.json({ session: null, migrationPending: true })
    return NextResponse.json({ session: null })
  }

  type Joined = { id: string; owner_id: string; config: unknown; circle_id: string }
  const row = rows?.[0] as unknown as
    | { status: string; simulation_sessions: Joined | Joined[] }
    | undefined
  if (!row) return NextResponse.json({ session: null })

  // PostgREST returns the embedded row as an object or a single-item array
  // depending on the relationship it infers; accept both.
  const session = (Array.isArray(row.simulation_sessions)
    ? row.simulation_sessions[0]
    : row.simulation_sessions) as Joined | undefined
  if (!session) return NextResponse.json({ session: null })
  const { data: owner } = await admin.from('profiles').select('name').eq('id', session.owner_id).maybeSingle()

  return NextResponse.json({
    session: {
      id: session.id,
      circleId: session.circle_id,
      config: session.config,
      ownerName: owner?.name ?? '—',
      isOwner: session.owner_id === user.id,
      myStatus: row.status,
    },
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { circleIds?: string[]; circleId?: string; config?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }
  // Accepts a list; the old single-circle shape still works.
  const circleIds = (body.circleIds ?? (body.circleId ? [body.circleId] : [])).filter(Boolean)
  if (!circleIds.length || !body.config) {
    return NextResponse.json({ error: 'circleIds e config são obrigatórios.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  // Only a member may start a drill in a circle — checked for every circle asked.
  const { data: myMemberships } = await admin
    .from('circle_members')
    .select('circle_id')
    .eq('user_id', user.id)
    .in('circle_id', circleIds)
  const allowed = (myMemberships ?? []).map(m => m.circle_id as string)
  if (!allowed.length) return NextResponse.json({ error: 'Não é membro destes círculos.' }, { status: 403 })

  // One active drill per circle: two competing scenarios on the same family is
  // exactly the confusion this feature must not create.
  await admin
    .from('simulation_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString(), ended_reason: 'owner' })
    .in('circle_id', allowed)
    .eq('status', 'active')

  const joinToken = randomToken()
  const { data: created, error } = await admin
    .from('simulation_sessions')
    .insert({ circle_id: allowed[0], owner_id: user.id, config: body.config, join_token: joinToken })
    .select('id')
    .single()

  if (error || !created) {
    if (tableMissing(error)) {
      return NextResponse.json({ error: 'migration_pending', session: null }, { status: 200 })
    }
    return NextResponse.json({ error: error?.message ?? 'Falha ao criar.' }, { status: 500 })
  }

  const { data: members } = await admin
    .from('circle_members')
    .select('user_id')
    .in('circle_id', allowed)

  // A person in two selected circles is still one participant.
  const uniqueMembers = Array.from(new Set((members ?? []).map(m => m.user_id as string)))
  const participants = uniqueMembers.map(id => ({ user_id: id })).map(m => ({
    session_id: created.id,
    user_id: m.user_id,
    // The starter is in by definition; everyone else must accept.
    status: m.user_id === user.id ? 'joined' : 'invited',
    responded_at: m.user_id === user.id ? new Date().toISOString() : null,
  }))
  await admin.from('simulation_participants').insert(participants)

  // Push is best-effort: the in-app poll shows the invite even if it fails.
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    const others = uniqueMembers.filter(id => id !== user.id)
    if (others.length) {
      const { data: subs } = await admin
        // A coluna é user_id. profile_id não existe — escrevi errado três vezes e
    // todo push que eu adicionei falhava em silêncio.
    .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .in('user_id', others)
      if (subs?.length) {
        const { data: me } = await admin.from('profiles').select('name').eq('id', user.id).maybeSingle()
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
        const payload = JSON.stringify({
          title: 'EOS · Treino da família',
          body: `${me?.name ?? 'Alguém'} iniciou uma simulação. Abra para participar.`,
          url: '/dashboard',
        })
        await Promise.allSettled(
          subs.map(sub =>
            webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            ),
          ),
        )
      }
    }
  }

  return NextResponse.json({ sessionId: created.id, joinToken, invited: participants.length - 1 })
}
