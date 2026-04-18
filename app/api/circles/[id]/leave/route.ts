import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Ctx {
  params: { id: string }
}

/**
 * POST /api/circles/:id/leave
 *
 * A MEMBER leaves the circle. If the caller is the LEADER, they cannot leave
 * without transferring leadership first (400).
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: circle } = await supabase
    .from('circles')
    .select('id, leader_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!circle) {
    return NextResponse.json({ error: 'Circle not found' }, { status: 404 })
  }

  if (circle.leader_id === user.id) {
    return NextResponse.json(
      { error: 'Leader cannot leave — delete the circle or transfer leadership.' },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', params.id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
