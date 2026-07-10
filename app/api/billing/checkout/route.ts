import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureProfile } from '@/lib/ensure-profile'
import { getStripe, priceIdForPlan } from '@/lib/stripe'
import type { Plan } from '@/lib/feature-gates'

export const runtime = 'nodejs'

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000')
  )
}

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

  // Reuse an existing Stripe customer if we already created one for this user.
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, name')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | null | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: profile?.name ?? undefined,
      metadata: { user_id: user.id },
    })
    customerId = customer.id
    // Persist immediately (service role — column is not user-writable via RLS forms).
    const admin = createAdminClient()
    if (admin) {
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }
  }

  const base = siteUrl()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    success_url: `${base}/settings?billing=success`,
    cancel_url: `${base}/settings?billing=cancelled`,
  })

  return NextResponse.json({ url: session.url })
}
