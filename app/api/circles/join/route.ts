import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/lib/ensure-profile'

/**
 * POST /api/circles/join
 * Body: { inviteCode: string }
 *
 * Resolves the circle by invite code and creates a PENDING join request.
 * The circle Admin approves it (see /api/circles/[id]/requests). The requester
 * does not become a member until approved.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await ensureProfile(supabase, user)

  let body: { inviteCode?: string }
  try {
    body = (await req.json()) as { inviteCode?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const code = (body.inviteCode ?? '').trim().toUpperCase()
  if (code.length !== 6) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
  }

  const { data: circle, error: cErr } = await supabase
    .from('circles')
    .select('id, name')
    .eq('invite_code', code)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!circle) return NextResponse.json({ error: 'Circle not found' }, { status: 404 })

  // Already a member? Nothing to do.
  const { data: existing } = await supabase
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circle.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ status: 'member', circle })
  }

  // Upsert a pending request (re-requesting after a rejection resets to pending).
  const { error: reqErr } = await supabase
    .from('circle_join_requests')
    .upsert(
      { circle_id: circle.id, requester_id: user.id, status: 'pending', message: null, decided_at: null, decided_by: null },
      { onConflict: 'circle_id,requester_id' },
    )
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })

  return NextResponse.json({ status: 'pending', circle })
}
