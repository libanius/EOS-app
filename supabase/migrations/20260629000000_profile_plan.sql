-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Subscription tier: profiles.plan
-- Migration: 2026-06-29
-- Decision: D-020, D-021
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'family', 'premium'));

COMMENT ON COLUMN profiles.plan IS 'Tier de assinatura: free | family | premium. Default free.';
