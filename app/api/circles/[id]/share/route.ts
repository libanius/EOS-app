import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Ctx {
  params: { id: string }
}

/**
 * PATCH /api/circles/:id/share
 * Body: { share: boolean }
 *
 * Toggles the caller's share_inventory flag in a Circle.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { share?: boolean }
  try {
    body = (await req.json()) as { share?: boolean }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.share !== 'boolean') {
    return NextResponse.json({ error: 'share must be boolean' }, { status: 400 })
  }

  const { error } = await supabase
    .from('circle_members')
    .update({ share_inventory: body.share })
    .eq('circle_id', params.id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
