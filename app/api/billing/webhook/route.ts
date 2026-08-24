import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, planForPriceId, isActiveStatus } from '@/lib/stripe'
import { commissionCents, type AffiliateCodeRow } from '@/lib/affiliate'
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
          await recordReferralCheckout(admin, session, sub)
        }
        break
      }
      case 'invoice.payment_succeeded':
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        await recordPaidInvoice(admin, invoice)
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

async function recordReferralCheckout(admin: Admin, session: Stripe.Checkout.Session, sub: Stripe.Subscription) {
  const affiliateCode = String(session.metadata?.affiliate_code ?? sub.metadata?.affiliate_code ?? '').toUpperCase()
  if (!affiliateCode) return
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const priceId = sub.items.data[0]?.price?.id
  const plan = planForPriceId(priceId)
  if (plan !== 'family' && plan !== 'premium') return

  await admin.from('affiliate_referrals').upsert({
    affiliate_code: affiliateCode,
    profile_id: session.client_reference_id ?? sub.metadata?.user_id ?? null,
    plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_checkout_session_id: session.id,
    status: 'pending',
  }, { onConflict: 'stripe_checkout_session_id' })
}

async function recordPaidInvoice(admin: Admin, invoice: Stripe.Invoice) {
  const amountPaid = Number(invoice.amount_paid ?? 0)
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) return

  const subscriptionId = subscriptionIdFromInvoice(invoice)
  if (!subscriptionId) return

  const { data: referral } = await admin
    .from('affiliate_referrals')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  if (!referral) return

  const { data: existing } = await admin
    .from('affiliate_conversions')
    .select('id')
    .eq('referral_id', referral.id)
    .limit(1)
  if (existing?.length) return

  const { data: codeRow } = await admin
    .from('affiliate_codes')
    .select('*')
    .eq('code', referral.affiliate_code)
    .maybeSingle()
  if (!codeRow) return

  const affiliate = codeRow as AffiliateCodeRow
  const commission = commissionCents(amountPaid, Number(affiliate.commission_percent))
  const occurred = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
    : new Date().toISOString()
  const invoiceId = invoice.id
  if (!invoiceId) return

  await admin.from('affiliate_conversions').insert({
    affiliate_code: referral.affiliate_code,
    referral_id: referral.id,
    profile_id: referral.profile_id,
    plan: referral.plan,
    stripe_customer_id: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? referral.stripe_customer_id,
    stripe_subscription_id: subscriptionId,
    stripe_invoice_id: invoiceId,
    amount_paid_cents: amountPaid,
    currency: invoice.currency ?? 'usd',
    commission_percent: affiliate.commission_percent,
    commission_cents: commission,
    status: 'owed',
    occurred_at: occurred,
  })

  await admin
    .from('affiliate_referrals')
    .update({ status: 'converted', converted_at: occurred })
    .eq('id', referral.id)
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const value = (invoice as unknown as { subscription?: string | { id?: string } | null }).subscription
  if (typeof value === 'string') return value
  if (value?.id) return value.id
  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | null } }
  }).parent
  return parent?.subscription_details?.subscription ?? null
}

/** A subscription in a terminal state should drop the linkage. */
function event_deleted(sub: Stripe.Subscription): boolean {
  return sub.status === 'canceled' || sub.status === 'incomplete_expired'
}
