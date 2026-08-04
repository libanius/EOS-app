import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { getStripe, priceIdForPlan } from '@/lib/stripe'
import { getSiteUrl } from '@/lib/site-url'
import {
  AFFILIATE_COOKIE,
  normalizeAffiliateCode,
  planAllowed,
  type AffiliateCodeRow,
} from '@/lib/affiliate'
import type { Plan } from '@/lib/feature-gates'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'Cobrança não configurada.' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  await ensureProfile(supabase, user)

  const body = await req.json().catch(() => ({}))
  const plan = body?.plan as Plan | undefined
  if (plan !== 'family' && plan !== 'premium') {
    return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 })
  }

  const priceId = priceIdForPlan(plan)
  if (!priceId) {
    return NextResponse.json({ error: `Preço do plano ${plan} não configurado.` }, { status: 503 })
  }

  try {
    const admin = createAdminClient()
    const affiliateCode = normalizeAffiliateCode(
      body?.affiliateCode ?? cookies().get(AFFILIATE_COOKIE)?.value,
    )
    const affiliate = affiliateCode && admin
      ? await loadAffiliate(admin, affiliateCode, plan)
      : null

    // Reuse an existing Stripe customer if we already created one for this user.
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, name')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id as string | null | undefined

    // Guard against a stale customer id left over from a different Stripe account
    // (e.g. after switching keys): if it no longer exists, drop it and recreate.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId)
        if ((existing as { deleted?: boolean }).deleted) customerId = null
      } catch {
        customerId = null
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: profile?.name ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      // Persist immediately (service role — column is not user-writable via RLS forms).
      if (admin) {
        await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
      }
    }

    const base = getSiteUrl()
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          user_id: user.id,
          ...(affiliate ? { affiliate_code: affiliate.code } : {}),
        },
      },
      metadata: {
        user_id: user.id,
        plan,
        ...(affiliate ? { affiliate_code: affiliate.code } : {}),
      },
      ...(affiliate?.stripe_promotion_code_id
        ? { discounts: [{ promotion_code: affiliate.stripe_promotion_code_id }] }
        : { allow_promotion_codes: true }),
      success_url: `${base}/settings?billing=success`,
      cancel_url: `${base}/settings?billing=cancelled`,
    })

    if (affiliate && admin) {
      await admin.from('affiliate_referrals').upsert({
        affiliate_code: affiliate.code,
        profile_id: user.id,
        plan,
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
        status: 'pending',
      }, { onConflict: 'stripe_checkout_session_id' })
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    // Surface the real reason instead of a bare 500 (the UI shows d.error).
    const msg = err instanceof Error ? err.message : 'checkout failed'
    console.error('[billing/checkout]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

async function loadAffiliate(admin: Admin, code: string, plan: Plan): Promise<AffiliateCodeRow | null> {
  const { data, error } = await admin
    .from('affiliate_codes')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .maybeSingle()
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null
    throw new Error(`Affiliate lookup failed: ${error.message}`)
  }
  const row = data as AffiliateCodeRow | null
  if (!row) return null
  if (!planAllowed(row, plan)) return null
  if (!row.stripe_promotion_code_id) {
    throw new Error(`Código afiliado ${code} ainda não foi sincronizado com Stripe.`)
  }
  return row
}
