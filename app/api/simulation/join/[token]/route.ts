import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/simulation/join/:token — ask to join a drill by invite link (D-072).
 *
 * The token grants exactly one thing: the ability to be ADDED AS INVITED. It is
 * not authority. The caller must still be a signed-in EOS user, and still has to
 * accept the same pop-up as everyone else (D-071) — a link never places anyone
 * in a scenario silently, whether they are family or not.
 */

type Ctx = { params: { token: string } }

export async function POST(_request: Request, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: session } = await admin
    .from('simulation_sessions')
    .select('id, status')
    .eq('join_token', params.token)
    .maybeSingle()

  if (!session) return NextResponse.json({ error: 'Convite inválido.' }, { status: 404 })
  if (session.status !== 'active') {
    return NextResponse.json({ error: 'ended', message: 'Este treino já terminou.' }, { status: 200 })
  }

  // Idempotent: opening the link twice must not reset an answer already given.
  const { data: existing } = await admin
    .from('simulation_participants')
    .select('status')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    await admin
      .from('simulation_participants')
      .insert({ session_id: session.id, user_id: user.id, status: 'invited' })
  }

  return NextResponse.json({ ok: true, sessionId: session.id, status: existing?.status ?? 'invited' })
}
