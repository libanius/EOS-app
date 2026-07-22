import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import type { Plan } from '@/lib/feature-gates'

export const runtime = 'nodejs'

/**
 * POST /api/billing/redeem — redeem a non-Stripe gift code (D-061).
 * Grants profiles.plan for the code's grant_days (plan_status='gift'), one use.
 * Expiry is enforced lazily by lib/plan.ts:reconcileGiftPlan on next plan read.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  await ensureProfile(supabase, user)

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const code = String(body?.code ?? '').trim().toUpperCase()
  if (!code || code.length > 64) {
    return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
  }

  const { data: gc } = await admin
    .from('gift_codes')
    .select('code, plan, grant_days, redeemed_by')
    .eq('code', code)
    .maybeSingle()
  if (!gc) return NextResponse.json({ error: 'Código não encontrado.' }, { status: 404 })
  if (gc.redeemed_by) return NextResponse.json({ error: 'Código já utilizado.' }, { status: 409 })

  // Never override an active paid Stripe subscription.
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_subscription_id, plan_status')
    .eq('id', user.id)
    .single()
  if (profile?.stripe_subscription_id && profile.plan_status === 'active') {
    return NextResponse.json({ error: 'Você já tem uma assinatura ativa.' }, { status: 409 })
  }

  // Claim the code atomically (still-unredeemed guard) → guarantees one use.
  const { data: claimed, error: claimErr } = await admin
    .from('gift_codes')
    .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq('code', code)
    .is('redeemed_by', null)
    .select('code')
    .maybeSingle()
  if (claimErr || !claimed) {
    return NextResponse.json({ error: 'Código já utilizado.' }, { status: 409 })
  }

  const until = new Date(Date.now() + gc.grant_days * 86_400_000).toISOString()
  const { error: updErr } = await admin
    .from('profiles')
    .update({ plan: gc.plan as Plan, plan_status: 'gift', plan_current_period_end: until })
    .eq('id', user.id)
  if (updErr) {
    // Roll back the claim so the code isn't burned on a failed grant.
    await admin.from('gift_codes').update({ redeemed_by: null, redeemed_at: null }).eq('code', code)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ plan: gc.plan as Plan, grantDays: gc.grant_days, until })
}
