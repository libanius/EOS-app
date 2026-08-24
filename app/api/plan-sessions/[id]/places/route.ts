import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

async function readSessionForMember(admin: Admin, sessionId: string, userId: string) {
  const { data: session, error } = await admin
    .from('plan_sessions')
    .select('id, circle_id, status')
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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { name?: string; lat?: number; lng?: number; notes?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name é obrigatório.' }, { status: 400 })
  if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
    return NextResponse.json({ error: 'Coordenada inválida.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { session, error: readError } = await readSessionForMember(admin, params.id, user.id)
  if (tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 })
  if (session.status !== 'armed') return NextResponse.json({ error: 'Sessão não está armada.' }, { status: 409 })

  const { data, error } = await admin
    .from('plan_session_places')
    .insert({
      session_id: params.id,
      name: body.name.trim().slice(0, 80),
      lat: body.lat,
      lng: body.lng,
      notes: body.notes?.slice(0, 300) ?? null,
      created_by: user.id,
    })
    .select('id, session_id, name, lat, lng, notes, created_by, created_at, promoted_place_id')
    .single()

  if (tableMissing(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Falha ao marcar ponto.' }, { status: 500 })

  return NextResponse.json({
    place: {
      id: data.id,
      sessionId: data.session_id,
      name: data.name,
      lat: data.lat,
      lng: data.lng,
      notes: data.notes,
      createdBy: data.created_by,
      createdAt: data.created_at,
      promotedPlaceId: data.promoted_place_id,
    },
  })
}
