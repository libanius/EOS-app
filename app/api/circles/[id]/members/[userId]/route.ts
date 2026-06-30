import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type CircleRole = 'Admin' | 'Editor' | 'Viewer'
const VALID_ROLES: CircleRole[] = ['Admin', 'Editor', 'Viewer']

interface Ctx { params: { id: string; userId: string } }

/** PATCH /api/circles/:id/members/:userId  — change a member's role (Admin only) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { role?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const newRole = body.role as CircleRole
  if (!VALID_ROLES.includes(newRole)) {
    return NextResponse.json({ error: 'role must be Admin | Editor | Viewer' }, { status: 400 })
  }

  // Caller must be Admin of this circle
  const { data: callerRow } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (callerRow?.role !== 'Admin') {
    return NextResponse.json({ error: 'Only Admins can change roles' }, { status: 403 })
  }

  // Cannot demote yourself if you're the only Admin
  if (params.userId === user.id && newRole !== 'Admin') {
    const { count } = await supabase.from('circle_members')
      .select('*', { count: 'exact', head: true })
      .eq('circle_id', params.id).eq('role', 'Admin')
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Circle must have at least one Admin' }, { status: 400 })
    }
  }

  const { error } = await supabase.from('circle_members')
    .update({ role: newRole })
    .eq('circle_id', params.id)
    .eq('user_id', params.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE /api/circles/:id/members/:userId  — remove a member (Admin only) */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerRow } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (callerRow?.role !== 'Admin') {
    return NextResponse.json({ error: 'Only Admins can remove members' }, { status: 403 })
  }
  if (params.userId === user.id) {
    return NextResponse.json({ error: 'Use leave endpoint to remove yourself' }, { status: 400 })
  }
  const { error } = await supabase.from('circle_members')
    .delete().eq('circle_id', params.id).eq('user_id', params.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
