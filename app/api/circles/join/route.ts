import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/circles/join
 * Body: { inviteCode: string }
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
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }
  if (!circle) {
    return NextResponse.json({ error: 'Circle not found' }, { status: 404 })
  }

  const { error: insErr } = await supabase
    .from('circle_members')
    .insert({
      circle_id: circle.id,
      user_id: user.id,
      role: 'MEMBER',
      share_inventory: false,
    })

  if (insErr && !insErr.message.includes('duplicate')) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ circle })
}
