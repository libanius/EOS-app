import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_FIELDS = ['water', 'food', 'medical', 'comms', 'emergency_contact'] as const
type SharedField = typeof VALID_FIELDS[number]

interface Ctx { params: { id: string } }

/** PATCH /api/circles/:id/share — toggle share_inventory and/or per-field shared_fields */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { share?: boolean; shared_fields?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}

  if (typeof body.share === 'boolean') patch.share_inventory = body.share

  if (Array.isArray(body.shared_fields)) {
    const valid = body.shared_fields.filter(f => VALID_FIELDS.includes(f as SharedField))
    patch.shared_fields = valid
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Provide share (bool) and/or shared_fields (array)' }, { status: 400 })
  }

  const { error } = await supabase.from('circle_members')
    .update(patch)
    .eq('circle_id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
