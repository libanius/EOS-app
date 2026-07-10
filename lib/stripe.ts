import Stripe from 'stripe'
import type { Plan } from '@/lib/feature-gates'

/**
 * Server-only Stripe client (D-042). Returns null when STRIPE_SECRET_KEY is
 * absent so billing routes can degrade cleanly (503) instead of crashing.
 * Never import this from client components.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' })
}

/** Paid plans → their configured Stripe Price ID (env-driven, D-042). */
export function priceIdForPlan(plan: Plan): string | null {
  switch (plan) {
    case 'family':
      return process.env.STRIPE_PRICE_FAMILY ?? null
    case 'premium':
      return process.env.STRIPE_PRICE_PREMIUM ?? null
    default:
      return null
  }
}

/** Reverse map: a Stripe Price ID → the plan it grants. */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return 'premium'
  if (priceId === process.env.STRIPE_PRICE_FAMILY) return 'family'
  return null
}

/** A Stripe subscription is "live" (grants its plan) only in these states. */
export function isActiveStatus(status: Stripe.Subscription.Status): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}
