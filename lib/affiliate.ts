import type { Plan } from './feature-gates'

export type AffiliateCodeRow = {
  code: string
  tag: string
  active: boolean
  eligible_plans: Plan[]
  discount_percent_off: number
  discount_duration: 'once'
  commission_percent: number
  max_redemptions: number | null
  stripe_coupon_id: string | null
  stripe_promotion_code_id: string | null
  stripe_promotion_code: string | null
  created_at: string
  updated_at: string
}

export const AFFILIATE_COOKIE = 'eos_affiliate_ref'
export const AFFILIATE_STORAGE_KEY = 'eos-affiliate-ref'

export function normalizeAffiliateCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '')
    .slice(0, 64)
}

export function validAffiliateCode(value: string): boolean {
  return Boolean(value) && value.length <= 64 && /^[A-Z0-9._-]+$/.test(value)
}

export function planAllowed(row: Pick<AffiliateCodeRow, 'eligible_plans'>, plan: Plan): boolean {
  return row.eligible_plans.includes(plan)
}

export function commissionCents(amountPaidCents: number, commissionPercent: number): number {
  if (!Number.isFinite(amountPaidCents) || amountPaidCents <= 0) return 0
  if (!Number.isFinite(commissionPercent) || commissionPercent <= 0) return 0
  return Math.round(amountPaidCents * (commissionPercent / 100))
}

export function money(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}
