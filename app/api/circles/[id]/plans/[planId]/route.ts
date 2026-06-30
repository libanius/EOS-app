import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Ctx { params: { id: string; planId: string } }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
    return NextResponse.json({ error: 'Admin or Editor role required' }, { status: 403 })
  }

  let body: { title?: string; body?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title) patch.title = body.title.trim().slice(0, 100)
  if (body.body) patch.body = body.body.trim().slice(0, 5000)

  const { data, error } = await supabase.from('circle_action_plans')
    .update(patch).eq('id', params.planId).eq('circle_id', params.id).select('id, title').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (!membership || membership.role !== 'Admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }

  const { error } = await supabase.from('circle_action_plans')
    .delete().eq('id', params.planId).eq('circle_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
