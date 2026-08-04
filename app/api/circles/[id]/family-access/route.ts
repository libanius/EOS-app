import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Action = 'request' | 'cancel'

interface Ctx { params: { id: string } }

/** POST /api/circles/:id/family-access — self request/cancel for inner family access. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: Action }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (body.action !== 'request' && body.action !== 'cancel') {
    return NextResponse.json({ error: 'action must be request or cancel' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: membership } = await admin
    .from('circle_members')
    .select('family_access_status')
    .eq('circle_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Você não faz parte deste círculo.' }, { status: 403 })

  const patch = body.action === 'request'
    ? {
        family_access_status: 'requested',
        family_access_requested_at: new Date().toISOString(),
        family_access_approved_at: null,
        family_access_approved_by: null,
      }
    : {
        family_access_status: 'none',
        family_access_requested_at: null,
        family_access_approved_at: null,
        family_access_approved_by: null,
      }

  const { data, error } = await admin
    .from('circle_members')
    .update(patch)
    .eq('circle_id', params.id)
    .eq('user_id', user.id)
    .select('family_access_status')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })
  return NextResponse.json({ ok: true, family_access_status: data[0].family_access_status })
}
