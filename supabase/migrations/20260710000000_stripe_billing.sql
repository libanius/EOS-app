-- D-042 — Stripe billing columns on profiles.
-- profiles.plan already exists (D-020). These add the Stripe linkage so the
-- webhook (source of truth) can reconcile subscriptions → plan and the Billing
-- Portal can be opened for an existing customer.
--
-- Apply in Supabase Dashboard → SQL Editor (no DB credential in agent env).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id        text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id    text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_status               text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_current_period_end   timestamptz;

-- Fast lookup by customer id in the webhook handler.
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
