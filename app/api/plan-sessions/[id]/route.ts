import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanSessionSnapshot } from '@/lib/plan-session'

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

type SessionRow = {
  id: string
  circle_id: string
  plan_id: string | null
  name: string
  status: 'armed' | 'disarmed' | 'expired'
  starts_at: string
  ends_at: string
  center_lat: number | null
  center_lng: number | null
  radius_m: number | null
  created_by: string
  created_at: string
  disarmed_at: string | null
}

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

async function readSessionForMember(admin: Admin, sessionId: string, userId: string) {
  const { data: session, error } = await admin
    .from('plan_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (error || !session) return { session: null, error }

  const { data: membership } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', session.circle_id)
    .eq('user_id', userId)
    .maybeSingle()
  return { session: membership ? session : null, error: null }
}

async function snapshotFor(admin: Admin, session: SessionRow): Promise<PlanSessionSnapshot> {
  const [{ data: circle }, { data: plan }, { data: members }, { data: dependents }, { data: places }] = await Promise.all([
    admin.from('circles').select('name').eq('id', session.circle_id).maybeSingle(),
    session.plan_id
      ? admin.from('family_plans').select('name').eq('id', session.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('plan_session_members')
      .select('user_id')
      .eq('session_id', session.id),
    admin
      .from('plan_session_dependents')
      .select('member_id, guardian_user_id')
      .eq('session_id', session.id),
    admin
      .from('plan_session_places')
      .select('id, session_id, name, lat, lng, notes, created_by, created_at, promoted_place_id')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false }),
  ])

  const memberIds = uniqueStrings((members ?? []).map(row => row.user_id))
  const guardianIds = uniqueStrings((dependents ?? []).map(row => row.guardian_user_id))
  const dependentIds = uniqueStrings((dependents ?? []).map(row => row.member_id))
  const [{ data: profiles }, { data: familyMembers }] = await Promise.all([
    memberIds.length || guardianIds.length
      ? admin.from('profiles').select('id, name').in('id', uniqueStrings([...memberIds, ...guardianIds]))
      : Promise.resolve({ data: [] }),
    dependentIds.length
      ? admin.from('family_members').select('id, name').in('id', dependentIds)
      : Promise.resolve({ data: [] }),
  ])
  const profileName = new Map((profiles ?? []).map(row => [row.id as string, row.name as string | null]))
  const dependentName = new Map((familyMembers ?? []).map(row => [row.id as string, row.name as string | null]))

  return {
    id: session.id,
    circleId: session.circle_id,
    circleName: circle?.name ?? null,
    planId: session.plan_id,
    planName: plan?.name ?? null,
    name: session.name,
    status: session.status,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    center: session.center_lat !== null && session.center_lng !== null
      ? { lat: session.center_lat, lng: session.center_lng, radiusM: session.radius_m }
      : null,
    createdBy: session.created_by,
    createdAt: session.created_at,
    disarmedAt: session.disarmed_at,
    members: memberIds.map(memberId => ({ userId: memberId, name: profileName.get(memberId) ?? null })),
    dependents: (dependents ?? []).map(row => ({
      memberId: row.member_id as string,
      name: dependentName.get(row.member_id as string) ?? null,
      guardianUserId: (row.guardian_user_id as string | null) ?? null,
      guardianName: row.guardian_user_id ? profileName.get(row.guardian_user_id as string) ?? null : null,
    })),
    places: (places ?? []).map(row => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      name: row.name as string,
      lat: row.lat as number,
      lng: row.lng as number,
      notes: (row.notes as string | null) ?? null,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
      promotedPlaceId: (row.promoted_place_id as string | null) ?? null,
    })),
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { session, error } = await readSessionForMember(admin, params.id, user.id)
  if (tableMissing(error)) return NextResponse.json({ session: null, migrationPending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 })

  return NextResponse.json({ session: await snapshotFor(admin, session as SessionRow) })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { action?: 'disarm' | 'expire' | 'promote_place'; placeId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (body.action !== 'disarm' && body.action !== 'expire' && body.action !== 'promote_place') {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { session, error: readError } = await readSessionForMember(admin, params.id, user.id)
  if (tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 })

  if (body.action === 'promote_place') {
    if (!body.placeId || body.placeId.startsWith('local:')) {
      return NextResponse.json({ error: 'Ponto não sincronizado.' }, { status: 409 })
    }

    const { data: place, error: placeError } = await admin
      .from('plan_session_places')
      .select('id, session_id, name, lat, lng, notes, created_by, created_at, promoted_place_id')
      .eq('id', body.placeId)
      .eq('session_id', params.id)
      .maybeSingle()

    if (tableMissing(placeError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
    if (placeError) return NextResponse.json({ error: placeError.message }, { status: 500 })
    if (!place) return NextResponse.json({ error: 'Ponto não encontrado.' }, { status: 404 })

    if (place.promoted_place_id) {
      return NextResponse.json({
        place: {
          id: place.id,
          sessionId: place.session_id,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          notes: place.notes,
          createdBy: place.created_by,
          createdAt: place.created_at,
          promotedPlaceId: place.promoted_place_id,
        },
      })
    }

    const { data: circlePlace, error: insertError } = await admin
      .from('circle_places')
      .insert({
        circle_id: (session as SessionRow).circle_id,
        name: (place.name as string).trim().slice(0, 80),
        lat: place.lat,
        lng: place.lng,
        kind: 'custom',
        precision: 'unknown',
        notes: place.notes,
        created_by: user.id,
      })
      .select('id, name, lat, lng, kind, precision, notes')
      .single()

    if (tableMissing(insertError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
    if (insertError || !circlePlace) return NextResponse.json({ error: insertError?.message ?? 'Falha ao promover ponto.' }, { status: 500 })

    const { data: updated, error: updateError } = await admin
      .from('plan_session_places')
      .update({ promoted_place_id: circlePlace.id })
      .eq('id', body.placeId)
      .eq('session_id', params.id)
      .select('id, session_id, name, lat, lng, notes, created_by, created_at, promoted_place_id')
      .single()

    if (updateError || !updated) return NextResponse.json({ error: updateError?.message ?? 'Falha ao marcar promoção.' }, { status: 500 })

    return NextResponse.json({
      place: {
        id: updated.id,
        sessionId: updated.session_id,
        name: updated.name,
        lat: updated.lat,
        lng: updated.lng,
        notes: updated.notes,
        createdBy: updated.created_by,
        createdAt: updated.created_at,
        promotedPlaceId: updated.promoted_place_id,
      },
      circlePlace,
    })
  }

  const status = body.action === 'expire' ? 'expired' : 'disarmed'
  const { error } = await admin
    .from('plan_sessions')
    .update({ status, disarmed_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
