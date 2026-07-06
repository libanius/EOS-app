import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'

interface Ctx { params: { id: string } }

/**
 * GET /api/circles/:id/requests — Admin lists PENDING join requests for the circle,
 * each with a small preview of the requester's identity (name, location).
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (caller?.role !== 'Admin') {
    return NextResponse.json({ error: 'Only Admins can view requests' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const { data: requests, error } = await admin
    .from('circle_join_requests')
    .select('id, requester_id, message, created_at, status')
    .eq('circle_id', params.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // requester_id references auth.users, not profiles, so PostgREST can't embed
  // the profile — fetch the identities in a second query and join in memory.
  const ids = (requests ?? []).map(r => r.requester_id)
  const profileById = new Map<string, { name?: string; location?: string | null }>()
  if (ids.length) {
    const { data: profiles } = await admin.from('profiles').select('id, name, location').in('id', ids)
    for (const p of profiles ?? []) profileById.set(p.id, { name: p.name, location: p.location })
  }

  const items = (requests ?? []).map(r => {
    const p = profileById.get(r.requester_id)
    return {
      id: r.id,
      requester_id: r.requester_id,
      message: r.message,
      created_at: r.created_at,
      name: p?.name ?? '—',
      location: p?.location ?? null,
    }
  })
  return NextResponse.json({ requests: items })
}

/**
 * POST /api/circles/:id/request — request to join a circle by its id (no invite
 * code, e.g. after finding it by name). Creates a PENDING request.
 * Body: { message?: string }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await ensureProfile(supabase, user)

  let body: { message?: string } = {}
  try { body = (await req.json()) as { message?: string } } catch { /* message optional */ }
  const message = (body.message ?? '').trim().slice(0, 280) || null

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  // Circle must exist.
  const { data: circle } = await admin.from('circles').select('id, name').eq('id', params.id).maybeSingle()
  if (!circle) return NextResponse.json({ error: 'Circle not found' }, { status: 404 })

  // Already a member?
  const { data: existing } = await admin.from('circle_members')
    .select('user_id').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (existing) return NextResponse.json({ status: 'member', circle })

  const { error: reqErr } = await admin
    .from('circle_join_requests')
    .upsert(
      { circle_id: params.id, requester_id: user.id, status: 'pending', message, decided_at: null, decided_by: null },
      { onConflict: 'circle_id,requester_id' },
    )
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
  return NextResponse.json({ status: 'pending', circle })
}
