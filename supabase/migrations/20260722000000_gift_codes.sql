-- D-060 — Gift codes (non-Stripe): owner-generated codes that grant a temporary
-- plan (Family/Premium) for a variable number of days, one use each.
-- Redemption goes through /api/billing/redeem, which uses the service-role client
-- after authorizing the caller. RLS is ON with NO policies = deny all direct
-- access (authenticated/anon can never read or write this table).

CREATE TABLE IF NOT EXISTS gift_codes (
  code           text        PRIMARY KEY,
  plan           text        NOT NULL CHECK (plan IN ('family', 'premium')),
  grant_days     integer     NOT NULL CHECK (grant_days > 0 AND grant_days <= 366),
  note           text,
  redeemed_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gift_codes ENABLE ROW LEVEL SECURITY;
-- (intentionally no policies — service-role only)
