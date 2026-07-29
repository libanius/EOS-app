import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/simulation/:id — answer an invite, or end the drill.
 *
 * { action: 'join' | 'decline' }  → my own participation only.
 * { action: 'end', reason }       → ends it for the WHOLE circle.
 *
 * `end` is deliberately available to ANY participant when the reason is
 * `real_alert` (D-071): if a genuine CRITICAL alert reaches one member's phone,
 * the family must not stay split between reality and fiction. Ending a drill is
 * never destructive, so the permissive path is the safe one here.
 */

type Ctx = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { action?: string; reason?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: participant } = await admin
    .from('simulation_participants')
    .select('user_id')
    .eq('session_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!participant) return NextResponse.json({ error: 'Não convidado.' }, { status: 403 })

  if (body.action === 'join' || body.action === 'decline') {
    await admin
      .from('simulation_participants')
      .update({ status: body.action === 'join' ? 'joined' : 'declined', responded_at: new Date().toISOString() })
      .eq('session_id', params.id)
      .eq('user_id', user.id)
    return NextResponse.json({ ok: true, status: body.action === 'join' ? 'joined' : 'declined' })
  }

  if (body.action === 'end') {
    const reason = body.reason === 'real_alert' ? 'real_alert' : 'owner'
    await admin
      .from('simulation_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString(), ended_reason: reason })
      .eq('id', params.id)
    return NextResponse.json({ ok: true, ended: true, reason })
  }

  return NextResponse.json({ error: 'action inválida.' }, { status: 400 })
}
