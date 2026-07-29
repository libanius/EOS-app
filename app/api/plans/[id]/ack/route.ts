import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/plans/:id/ack — "I have seen this version" (doc 18 §6.4).
 *
 * Without this the author cannot tell a plan from an intention of their own.
 * Acknowledging is explicit and per-version: a new save does not carry an old
 * acknowledgement forward, because the whole point is knowing who has seen the
 * change.
 */

type Ctx = { params: { id: string } }

export async function POST(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { version?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (typeof body.version !== 'number') return NextResponse.json({ error: 'version é obrigatório.' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: plan } = await admin
    .from('family_plans')
    .select('id, circle_id, version')
    .eq('id', params.id)
    .maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 })

  const { data: membership } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', plan.circle_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })

  // Only the CURRENT version can be acknowledged: confirming a stale one would
  // record agreement to a plan nobody is executing.
  if (body.version !== plan.version) {
    return NextResponse.json({ error: 'stale', currentVersion: plan.version }, { status: 200 })
  }

  await admin
    .from('family_plan_acks')
    .upsert({ plan_id: plan.id, member_user_id: user.id, acked_version: plan.version, acked_at: new Date().toISOString() })

  return NextResponse.json({ ok: true, version: plan.version })
}
