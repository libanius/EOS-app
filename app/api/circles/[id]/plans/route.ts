import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Ctx { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data, error } = await supabase.from('circle_action_plans')
    .select('id, title, body, created_by, updated_at, created_at, profiles(name)')
    .eq('circle_id', params.id)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const plans = (data ?? []).map(p => ({
    ...p,
    author: (p.profiles as { name?: string } | null)?.name ?? '—',
    is_mine: p.created_by === user.id,
  }))
  return NextResponse.json({ plans })
}

export async function POST(req: NextRequest, { params }: Ctx) {
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
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!body.body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data, error } = await supabase.from('circle_action_plans').insert({
    circle_id: params.id,
    created_by: user.id,
    title: body.title.trim().slice(0, 100),
    body: body.body.trim().slice(0, 5000),
  }).select('id, title, body, created_by, updated_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data }, { status: 201 })
}
