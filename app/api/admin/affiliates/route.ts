import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import {
  normalizeAffiliateCode,
  validAffiliateCode,
  type AffiliateCodeRow,
} from '@/lib/affiliate'
import type { Plan } from '@/lib/feature-gates'
export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const [{ data: codes, error: codeError }, { data: referrals }, { data: conversions }] = await Promise.all([
    admin.from('affiliate_codes').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('affiliate_referrals').select('affiliate_code, status, created_at, converted_at').order('created_at', { ascending: false }).limit(500),
    admin.from('affiliate_conversions').select('*').order('occurred_at', { ascending: false }).limit(500),
  ])

  if (codeError) {
    return NextResponse.json({ error: codeError.message }, { status: /does not exist|schema cache/i.test(codeError.message) ? 503 : 500 })
  }

  return NextResponse.json({
    codes: (codes ?? []).map(code => summarize(code as AffiliateCodeRow, referrals ?? [], conversions ?? [])),
    referrals: referrals ?? [],
    conversions: conversions ?? [],
  })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'Stripe não configurado.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const code = normalizeAffiliateCode(body?.code)
  const tag = String(body?.tag ?? '').trim().slice(0, 160)
  const eligiblePlans = parsePlans(body?.eligiblePlans)
  const commissionPercent = Number(body?.commissionPercent ?? 70)
  const maxRedemptionsRaw = body?.maxRedemptions === null || body?.maxRedemptions === '' ? null : Number(body?.maxRedemptions)
  const maxRedemptions = maxRedemptionsRaw !== null && Number.isInteger(maxRedemptionsRaw) && maxRedemptionsRaw > 0 ? maxRedemptionsRaw : null

  if (!validAffiliateCode(code)) {
    return NextResponse.json({ error: 'Código inválido (use A-Z, 0-9, . _ -).' }, { status: 400 })
  }
  if (!tag) return NextResponse.json({ error: 'Tag obrigatória.' }, { status: 400 })
  if (!eligiblePlans.length) return NextResponse.json({ error: 'Selecione Family e/ou Premium.' }, { status: 400 })
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return NextResponse.json({ error: 'Comissão inválida (0–100).' }, { status: 400 })
  }

  const stripeIds = await ensureStripePromotionCode({
    code,
    tag,
    commissionPercent,
    maxRedemptions,
  })

  const row = {
    code,
    tag,
    active: true,
    eligible_plans: eligiblePlans,
    discount_percent_off: 100,
    discount_duration: 'once',
    commission_percent: commissionPercent,
    max_redemptions: maxRedemptions,
    stripe_coupon_id: stripeIds.couponId,
    stripe_promotion_code_id: stripeIds.promotionCodeId,
    stripe_promotion_code: code,
    created_by: user.id,
  }

  const { error } = await admin.from('affiliate_codes').upsert(row, { onConflict: 'code' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: /does not exist|schema cache/i.test(error.message) ? 503 : 500 })
  }

  return NextResponse.json({ ok: true, code, ...stripeIds })
}

function parsePlans(value: unknown): Plan[] {
  const list = Array.isArray(value) ? value : ['family', 'premium']
  return Array.from(new Set(list.filter((item): item is Plan => item === 'family' || item === 'premium')))
}

async function ensureStripePromotionCode({
  code,
  tag,
  commissionPercent,
  maxRedemptions,
}: {
  code: string
  tag: string
  commissionPercent: number
  maxRedemptions: number | null
}) {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe não configurado.')

  const existing = await stripe.promotionCodes.list({ code, limit: 1 })
  const active = existing.data.find(item => item.active)
  if (active) {
    const coupon = active.promotion.coupon
    return {
      couponId: typeof coupon === 'string' ? coupon : coupon?.id ?? null,
      promotionCodeId: active.id,
    }
  }

  const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: 'once',
    name: `EOS affiliate ${code}`,
    metadata: {
      affiliate_code: code,
      affiliate_tag: tag,
      commission_percent: String(commissionPercent),
    },
  })

  const promotion = await stripe.promotionCodes.create({
    promotion: { type: 'coupon', coupon: coupon.id },
    code,
    max_redemptions: maxRedemptions ?? undefined,
    metadata: {
      affiliate_code: code,
      affiliate_tag: tag,
      commission_percent: String(commissionPercent),
    },
  })

  return { couponId: coupon.id, promotionCodeId: promotion.id }
}

function summarize(code: AffiliateCodeRow, referrals: Array<Record<string, unknown>>, conversions: Array<Record<string, unknown>>) {
  const ownRefs = referrals.filter(ref => ref.affiliate_code === code.code)
  const ownConversions = conversions.filter(conversion => conversion.affiliate_code === code.code)
  const owedCents = ownConversions
    .filter(conversion => conversion.status === 'owed')
    .reduce((sum, conversion) => sum + Number(conversion.commission_cents ?? 0), 0)
  const paidCents = ownConversions
    .filter(conversion => conversion.status === 'paid')
    .reduce((sum, conversion) => sum + Number(conversion.commission_cents ?? 0), 0)
  return {
    ...code,
    referral_count: ownRefs.length,
    conversion_count: ownConversions.length,
    owed_cents: owedCents,
    paid_cents: paidCents,
  }
}
