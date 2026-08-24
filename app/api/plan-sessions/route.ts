import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePlanSessionWindow, type PlanSessionSnapshot } from '@/lib/plan-session'

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

async function memberCircleIds(admin: Admin, userId: string): Promise<string[]> {
  const { data } = await admin.from('circle_members').select('circle_id').eq('user_id', userId)
  return (data ?? []).map(row => row.circle_id as string)
}

async function assertMember(admin: Admin, circleId: string, userId: string) {
  const { data } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
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
    members: memberIds.map(userId => ({ userId, name: profileName.get(userId) ?? null })),
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

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ session: null })

  const requestedCircleId = request.nextUrl.searchParams.get('circleId')
  const circleIds = requestedCircleId ? [requestedCircleId] : await memberCircleIds(admin, user.id)
  if (!circleIds.length) return NextResponse.json({ session: null })
  if (requestedCircleId && !(await assertMember(admin, requestedCircleId, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('plan_sessions')
    .select('*')
    .in('circle_id', circleIds)
    .eq('status', 'armed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tableMissing(error)) return NextResponse.json({ session: null, migrationPending: true })
  if (error) return NextResponse.json({ session: null })
  if (!data) return NextResponse.json({ session: null })

  return NextResponse.json({ session: await snapshotFor(admin, data as SessionRow) })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: {
    circleId?: string
    planId?: string | null
    name?: string
    startsAt?: string
    endsAt?: string
    memberUserIds?: unknown[]
    dependents?: Array<{ memberId?: string; guardianUserId?: string | null }>
    center?: { lat?: number; lng?: number; radiusM?: number | null } | null
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (!body.circleId) return NextResponse.json({ error: 'circleId é obrigatório.' }, { status: 400 })
  if (!body.name?.trim()) return NextResponse.json({ error: 'name é obrigatório.' }, { status: 400 })
  if (!body.startsAt || !body.endsAt) return NextResponse.json({ error: 'Janela de tempo é obrigatória.' }, { status: 400 })
  const window = normalizePlanSessionWindow(body.startsAt, body.endsAt)
  if (!window) return NextResponse.json({ error: 'Janela de tempo inválida.' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!(await assertMember(admin, body.circleId, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const { data: existing, error: existingError } = await admin
    .from('plan_sessions')
    .select('id')
    .eq('circle_id', body.circleId)
    .eq('status', 'armed')
    .maybeSingle()
  if (tableMissing(existingError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (existing) {
    return NextResponse.json(
      { error: 'active_session_exists', message: 'Este círculo já tem uma sessão armada. Desarme a sessão atual antes de armar outra.' },
      { status: 409 },
    )
  }

  if (body.planId) {
    const { data: plan } = await admin
      .from('family_plans')
      .select('id')
      .eq('id', body.planId)
      .eq('circle_id', body.circleId)
      .maybeSingle()
    if (!plan) return NextResponse.json({ error: 'Plano não pertence a este círculo.' }, { status: 400 })
  }

  const { data: circleMembers } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', body.circleId)
  const allowedMembers = new Set((circleMembers ?? []).map(row => row.user_id as string))
  const memberUserIds = uniqueStrings([...(body.memberUserIds ?? []), user.id])
    .filter(id => allowedMembers.has(id))
  if (!memberUserIds.length) return NextResponse.json({ error: 'Selecione pelo menos um adulto presente.' }, { status: 400 })

  const dependentIds = uniqueStrings((body.dependents ?? []).map(dep => dep.memberId))
  const { data: dependentRows } = dependentIds.length
    ? await admin.from('family_members').select('id, profile_id').in('id', dependentIds)
    : { data: [] }
  const allowedDependents = new Set(
    (dependentRows ?? [])
      .filter(row => allowedMembers.has(row.profile_id as string))
      .map(row => row.id as string),
  )
  const dependents = (body.dependents ?? [])
    .filter(dep => dep.memberId && allowedDependents.has(dep.memberId))
    .map(dep => ({
      member_id: dep.memberId,
      guardian_user_id: dep.guardianUserId && allowedMembers.has(dep.guardianUserId) ? dep.guardianUserId : null,
    }))

  const center = body.center
  const hasCenter = Number.isFinite(center?.lat) && Number.isFinite(center?.lng)

  const { data: created, error } = await admin
    .from('plan_sessions')
    .insert({
      circle_id: body.circleId,
      plan_id: body.planId ?? null,
      name: body.name.trim().slice(0, 100),
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      center_lat: hasCenter ? center?.lat : null,
      center_lng: hasCenter ? center?.lng : null,
      radius_m: hasCenter && Number.isFinite(center?.radiusM) ? Math.max(1, Math.round(center?.radiusM ?? 0)) : null,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (tableMissing(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (error || !created) return NextResponse.json({ error: error?.message ?? 'Falha ao armar sessão.' }, { status: 500 })

  await admin.from('plan_session_members').insert(
    memberUserIds.map(userId => ({ session_id: created.id, user_id: userId })),
  )
  if (dependents.length) {
    await admin.from('plan_session_dependents').insert(
      dependents.map(dep => ({ session_id: created.id, ...dep })),
    )
  }

  return NextResponse.json({ session: await snapshotFor(admin, created as SessionRow) }, { status: 201 })
}
