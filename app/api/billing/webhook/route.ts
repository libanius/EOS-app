import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, planForPriceId, isActiveStatus } from '@/lib/stripe'
import type { Plan } from '@/lib/feature-gates'

export const runtime = 'nodejs'

/**
 * Stripe webhook (D-042) — the single source of truth for profiles.plan.
 * Verifies the signature, then reconciles the subscription state into the
 * profile: active → mapped plan; canceled/expired → free.
 */
export async function POST(req: Request) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Assinatura ausente.' }, { status: 400 })
  }

  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid'
    return NextResponse.json({ error: `Assinatura inválida: ${msg}` }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Service role ausente.' }, { status: 503 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
          )
          await applySubscription(admin, sub)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await applySubscription(admin, sub)
        break
      }
      default:
        // Ignore unrelated events.
        break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    // 500 so Stripe retries transient failures.
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

/** Reconcile one subscription into the owning profile. */
async function applySubscription(admin: Admin, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // Resolve the profile: prefer stripe_customer_id, fall back to metadata user_id.
  const userId = sub.metadata?.user_id
  let query = admin.from('profiles').select('id').limit(1)
  query = userId
    ? query.eq('id', userId)
    : query.eq('stripe_customer_id', customerId)
  const { data: rows } = await query
  const profileId = rows?.[0]?.id as string | undefined
  if (!profileId) return // No matching profile — nothing to do.

  const priceId = sub.items.data[0]?.price?.id
  const mappedPlan = planForPriceId(priceId)
  const live = isActiveStatus(sub.status) && sub.status !== 'canceled'

  const plan: Plan = live && mappedPlan ? mappedPlan : 'free'
  const isGone = sub.status === 'canceled' || event_deleted(sub)

  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
  await admin
    .from('profiles')
    .update({
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: isGone ? null : sub.id,
      plan_status: sub.status,
      plan_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq('id', profileId)
}

/** A subscription in a terminal state should drop the linkage. */
function event_deleted(sub: Stripe.Subscription): boolean {
  return sub.status === 'canceled' || sub.status === 'incomplete_expired'
}
