import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface Ctx { params: { id: string; reqId: string } }

/**
 * POST /api/circles/:id/requests/:reqId — Admin approves or rejects a join request.
 * Body: { action: 'approve' | 'reject' }
 * On approve: inserts the requester into circle_members (Viewer) and marks the
 * request approved. On reject: marks it rejected (the requester may re-request).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = body.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  // Caller must be Admin of this circle.
  const { data: caller } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (caller?.role !== 'Admin') {
    return NextResponse.json({ error: 'Only Admins can decide requests' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const { data: request } = await admin
    .from('circle_join_requests')
    .select('id, circle_id, requester_id, status')
    .eq('id', params.reqId)
    .eq('circle_id', params.id)
    .maybeSingle()
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${request.status}` }, { status: 409 })
  }

  if (action === 'approve') {
    const { error: memErr } = await admin.from('circle_members').upsert(
      { circle_id: params.id, user_id: request.requester_id, role: 'Viewer', share_inventory: false },
      { onConflict: 'circle_id,user_id', ignoreDuplicates: true },
    )
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  }

  const { error: updErr } = await admin
    .from('circle_join_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by: user.id })
    .eq('id', params.reqId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, action })
}
