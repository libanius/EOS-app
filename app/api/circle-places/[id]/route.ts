import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePointPrecision } from '@/lib/plan-places'
import type { CirclePlace } from '@/lib/family-plan'

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

async function readPlace(admin: NonNullable<ReturnType<typeof createAdminClient>>, id: string) {
  return admin
    .from('circle_places')
    .select('id, circle_id, name, lat, lng, kind, precision, notes, created_by, created_at, updated_at, archived_at')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle()
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: Partial<CirclePlace>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: place, error: readError } = await readPlace(admin, params.id)
  if (tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!place) return NextResponse.json({ error: 'Lugar não encontrado.' }, { status: 404 })
  if (!(await assertMember(admin, (place as CirclePlace).circle_id, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const precision = body.precision === undefined ? undefined : normalizePointPrecision(body.precision)
  if (body.precision !== undefined && (!precision || precision === 'unknown')) {
    return NextResponse.json({ error: 'precision precisa ser declarada pelo usuário.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name.trim().slice(0, 80)
  if (body.lat !== undefined) {
    if (!Number.isFinite(body.lat)) return NextResponse.json({ error: 'lat inválido.' }, { status: 400 })
    patch.lat = body.lat
  }
  if (body.lng !== undefined) {
    if (!Number.isFinite(body.lng)) return NextResponse.json({ error: 'lng inválido.' }, { status: 400 })
    patch.lng = body.lng
  }
  if (precision) patch.precision = precision
  if (body.notes !== undefined) patch.notes = body.notes?.slice(0, 300) ?? null

  const { data, error } = await admin
    .from('circle_places')
    .update(patch)
    .eq('id', params.id)
    .select('id, circle_id, name, lat, lng, kind, precision, notes, created_by, created_at, updated_at, archived_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ place: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: place, error: readError } = await readPlace(admin, params.id)
  if (tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!place) return NextResponse.json({ error: 'Lugar não encontrado.' }, { status: 404 })
  if (!(await assertMember(admin, (place as CirclePlace).circle_id, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const { count, error: usageError } = await admin
    .from('family_plan_waypoints')
    .select('plan_id, family_plans!inner(status)', { count: 'exact', head: true })
    .eq('place_id', params.id)
    .eq('family_plans.status', 'active')

  if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 })
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: 'place_in_use',
        message: 'Este lugar está em uso por pelo menos um plano ativo. Remova-o dos planos antes de apagar.',
      },
      { status: 409 },
    )
  }

  const { error } = await admin
    .from('circle_places')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
