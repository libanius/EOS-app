-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Fix: checklists unique constraint for upsert ON CONFLICT
-- Migration: 2026-06-28 (hotfix-2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem: the upsert in /api/checklist/generate uses
--   ON CONFLICT (profile_id, canonical_key, scenario_id)
-- PostgREST requires a real UNIQUE CONSTRAINT on those columns.
-- The previous migration created an expression-based index using COALESCE
-- which PostgREST cannot match to a column-based ON CONFLICT clause.
--
-- Fix: create a UNIQUE CONSTRAINT on (profile_id, canonical_key) only.
-- scenario_id is excluded — for the checklist feature, dedup is per-user
-- per-item-key regardless of which scenario it was generated for.
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove the expression-based unique index (cannot be used for ON CONFLICT)
DROP INDEX IF EXISTS checklists_uniq_canonical_scenario;

-- Add a true unique constraint on the columns the upsert conflicts on
ALTER TABLE checklists
  DROP CONSTRAINT IF EXISTS checklists_profile_id_canonical_key_key;

ALTER TABLE checklists
  ADD CONSTRAINT checklists_profile_id_canonical_key_key
  UNIQUE (profile_id, canonical_key);
