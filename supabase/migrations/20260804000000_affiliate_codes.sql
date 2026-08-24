-- D-099 / LA-T06 — Stripe affiliate codes and commission tracker.
-- Service-role/admin only. Public users never read affiliate tracking tables.

CREATE TABLE IF NOT EXISTS affiliate_codes (
  code                       text        PRIMARY KEY,
  tag                        text        NOT NULL,
  active                     boolean     NOT NULL DEFAULT true,
  eligible_plans             text[]      NOT NULL DEFAULT ARRAY['family','premium']::text[],
  discount_percent_off       integer     NOT NULL DEFAULT 100 CHECK (discount_percent_off >= 1 AND discount_percent_off <= 100),
  discount_duration          text        NOT NULL DEFAULT 'once' CHECK (discount_duration IN ('once')),
  commission_percent         numeric(5,2) NOT NULL DEFAULT 70 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  max_redemptions            integer     CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  stripe_coupon_id           text,
  stripe_promotion_code_id   text,
  stripe_promotion_code      text,
  created_by                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_codes_eligible_plans_check
    CHECK (eligible_plans <@ ARRAY['family','premium']::text[] AND cardinality(eligible_plans) > 0)
);

CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code             text        NOT NULL REFERENCES affiliate_codes(code) ON DELETE RESTRICT,
  profile_id                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  plan                       text        NOT NULL CHECK (plan IN ('family', 'premium')),
  stripe_customer_id         text,
  stripe_subscription_id     text UNIQUE,
  stripe_checkout_session_id text UNIQUE,
  status                     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'canceled')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  converted_at               timestamptz
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code             text        NOT NULL REFERENCES affiliate_codes(code) ON DELETE RESTRICT,
  referral_id                uuid        REFERENCES affiliate_referrals(id) ON DELETE SET NULL,
  profile_id                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  plan                       text        NOT NULL CHECK (plan IN ('family', 'premium')),
  stripe_customer_id         text,
  stripe_subscription_id     text,
  stripe_invoice_id          text        NOT NULL UNIQUE,
  amount_paid_cents          integer     NOT NULL CHECK (amount_paid_cents > 0),
  currency                   text        NOT NULL DEFAULT 'usd',
  commission_percent         numeric(5,2) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
  commission_cents           integer     NOT NULL CHECK (commission_cents >= 0),
  status                     text        NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'paid', 'void')),
  occurred_at                timestamptz NOT NULL DEFAULT now(),
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_code
  ON affiliate_referrals (affiliate_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_code_status
  ON affiliate_conversions (affiliate_code, status, occurred_at DESC);

CREATE OR REPLACE FUNCTION set_affiliate_codes_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_affiliate_codes_updated_at ON affiliate_codes;
CREATE TRIGGER trg_affiliate_codes_updated_at
  BEFORE UPDATE ON affiliate_codes
  FOR EACH ROW EXECUTE FUNCTION set_affiliate_codes_updated_at();

ALTER TABLE affiliate_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;
-- Intentionally no RLS policies: all access goes through owner-only API routes
-- and Stripe webhook service-role writes.

INSERT INTO affiliate_codes (
  code,
  tag,
  active,
  eligible_plans,
  discount_percent_off,
  discount_duration,
  commission_percent,
  max_redemptions,
  stripe_promotion_code
) VALUES (
  'EOSPARTNER',
  'Teste Afiliado app',
  true,
  ARRAY['family','premium']::text[],
  100,
  'once',
  70,
  NULL,
  'EOSPARTNER'
) ON CONFLICT (code) DO UPDATE SET
  tag = EXCLUDED.tag,
  active = EXCLUDED.active,
  eligible_plans = EXCLUDED.eligible_plans,
  discount_percent_off = EXCLUDED.discount_percent_off,
  discount_duration = EXCLUDED.discount_duration,
  commission_percent = EXCLUDED.commission_percent,
  max_redemptions = EXCLUDED.max_redemptions,
  stripe_promotion_code = COALESCE(affiliate_codes.stripe_promotion_code, EXCLUDED.stripe_promotion_code);
