import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'

/**
 * POST /api/circles/join
 * Body: { inviteCode: string }
 *
 * Resolves the circle by invite code and creates a PENDING join request.
 * The circle Admin approves it (see /api/circles/[id]/requests). The requester
 * does not become a member until approved.
 *
 * `wantsFamilyAccess` (D-112) vem do link de convite e é apenas uma INTENÇÃO:
 * ao aprovar, o membro nasce com `family_access_status = 'requested'` e quem
 * decide continua sendo a própria pessoa. Um link nunca abre a ficha médica de
 * alguém — ele só faz a pergunta.
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
  await ensureProfile(supabase, user)

  let body: { inviteCode?: string; wantsFamilyAccess?: boolean }
  try {
    body = (await req.json()) as { inviteCode?: string; wantsFamilyAccess?: boolean }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const code = (body.inviteCode ?? '').trim().toUpperCase()
  if (code.length !== 6) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
  }

  // A prospective member is not yet in the circle, and the circles SELECT policy
  // only exposes circles you belong to — so resolve the invite code with the
  // service-role client.
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const { data: circle, error: cErr } = await admin
    .from('circles')
    .select('id, name')
    .eq('invite_code', code)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!circle) return NextResponse.json({ error: 'Circle not found' }, { status: 404 })

  // Already a member? Nothing to do.
  const { data: existing } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circle.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ status: 'member', circle })
  }

  // Upsert a pending request (re-requesting after a rejection resets to pending).
  const wants = body.wantsFamilyAccess === true
  const base = {
    circle_id: circle.id,
    requester_id: user.id,
    status: 'pending',
    message: null,
    decided_at: null,
    decided_by: null,
  }

  const { error: reqErr } = await supabase
    .from('circle_join_requests')
    .upsert({ ...base, wants_family_access: wants }, { onConflict: 'circle_id,requester_id' })

  // 42703 = coluna inexistente → a migration D-112 ainda não foi aplicada. O
  // convite ao CÍRCULO não pode falhar por causa disso: grava sem a intenção e
  // a tela avisa que a parte de Família íntima ficará para depois.
  if (reqErr?.code === '42703') {
    const { error: fallbackErr } = await supabase
      .from('circle_join_requests')
      .upsert(base, { onConflict: 'circle_id,requester_id' })
    if (fallbackErr) return NextResponse.json({ error: fallbackErr.message }, { status: 500 })
    return NextResponse.json({ status: 'pending', circle, familyAccessPending: wants ? 'migration' : null })
  }
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })

  return NextResponse.json({ status: 'pending', circle, familyAccessRequested: wants })
}
