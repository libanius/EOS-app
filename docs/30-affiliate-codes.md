# 30 — Affiliate Codes And Commission Tracking

> Status: IMPLEMENTED
> Date: 2026-08-04
> Decision: **D-099**
> Roadmap: **LA-T06**

---

## Intent

EOS precisa de um menu admin para criar links/códigos de afiliado sob demanda.
O primeiro código é `EOSPARTNER`, tag `Teste Afiliado app`, válido para Family e
Premium, ilimitado por padrão, com 100% off uma vez e comissão de 70%.

## Distinction From Gift Codes

Gift codes grant temporary access without Stripe. Affiliate codes are different:
they go through Stripe Checkout, use Stripe coupons/promotion codes, and create a
commission tracker only after Stripe reports real payment.

## Commission Rule

The tracker calculates owed commission only when Stripe reports a paid invoice
with `amount_paid > 0`.

- Monthly user from affiliate link: 70% of the first monthly payment actually
  paid.
- Annual/full-year user from affiliate link: 70% of the annual/full-year amount
  actually paid.
- If the first Stripe invoice is fully discounted by `100% off once`, EOS records
  the referral but waits for the first non-zero paid invoice before marking the
  conversion owed.

The app does not auto-pay affiliates. It creates an admin tracker for manual
settlement.

## Required Data

- `affiliate_codes`: admin-created campaign/code configuration.
- `affiliate_referrals`: checkout/subscription attribution.
- `affiliate_conversions`: first paid invoice and commission owed.

All tables are service-role/admin only. Public users never read the tracker.

## Link Behavior

Affiliate links use query params:

```text
/?ref=EOSPARTNER
/settings?ref=EOSPARTNER
```

The app stores the ref, passes it into checkout, and also lets Stripe users type
the promotion code directly.

## Admin UX

`/admin/affiliates` allows the owner to create a new affiliate code, set
tag/label, choose Family/Premium eligibility, choose commission percent, choose
an optional redemption limit, and see referrals/conversions/commission owed.

## Implementation

- Migration: `supabase/migrations/20260804000000_affiliate_codes.sql`.
- Admin UI: `/admin/affiliates`.
- Admin API: `GET/POST /api/admin/affiliates`.
- Attribution capture: `AffiliateAttribution` plus middleware cookie capture.
- Checkout: `POST /api/billing/checkout` accepts `affiliateCode` and preapplies
  the Stripe promotion code when valid.
- Webhook: `checkout.session.completed` records/updates referral;
  `invoice.payment_succeeded` / `invoice.paid` records first paid conversion.

## Operational Requirement

Apply `20260804000000_affiliate_codes.sql` in Supabase before using the admin
tracker in production. After migration, open `/admin/affiliates` as an
`ADMIN_EMAILS` user and sync/create `EOSPARTNER` so Stripe receives the real
coupon and promotion code IDs.

## Non-Negotiables

- No affiliate code gives app access without Stripe.
- No commission is owed on zero-dollar invoices.
- Commission is calculated from Stripe `amount_paid`, not hardcoded plan prices.
- Stripe remains the billing source of truth.
