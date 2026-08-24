import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePointPrecision } from '@/lib/plan-places'
import type { CirclePlace } from '@/lib/family-plan'

const PLACE_KINDS: CirclePlace['kind'][] = ['home', 'school', 'work', 'rendezvous', 'custom']

async function assertMember(admin: NonNullable<ReturnType<typeof createAdminClient>>, circleId: string, userId: string) {
  const { data } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const circleId = request.nextUrl.searchParams.get('circleId')
  if (!circleId) return NextResponse.json({ error: 'circleId é obrigatório.' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!(await assertMember(admin, circleId, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('circle_places')
    .select('id, circle_id, name, lat, lng, kind, precision, notes, created_by, created_at, updated_at, archived_at')
    .eq('circle_id', circleId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })

  if (tableMissing(error)) return NextResponse.json({ places: [], migrationPending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ places: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: Partial<CirclePlace>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (!body.circle_id) return NextResponse.json({ error: 'circle_id é obrigatório.' }, { status: 400 })
  if (!body.name?.trim()) return NextResponse.json({ error: 'name é obrigatório.' }, { status: 400 })
  if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
    return NextResponse.json({ error: 'Coordenada inválida.' }, { status: 400 })
  }
  if (!PLACE_KINDS.includes(body.kind as CirclePlace['kind'])) {
    return NextResponse.json({ error: 'kind inválido.' }, { status: 400 })
  }
  const precision = normalizePointPrecision(body.precision)
  if (!precision || precision === 'unknown') {
    return NextResponse.json({ error: 'precision precisa ser declarada pelo usuário.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!(await assertMember(admin, body.circle_id, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('circle_places')
    .insert({
      circle_id: body.circle_id,
      name: body.name.trim().slice(0, 80),
      lat: body.lat,
      lng: body.lng,
      kind: body.kind,
      precision,
      notes: body.notes?.slice(0, 300) ?? null,
      created_by: user.id,
    })
    .select('id, circle_id, name, lat, lng, kind, precision, notes, created_by, created_at, updated_at, archived_at')
    .single()

  if (tableMissing(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ place: data })
}
