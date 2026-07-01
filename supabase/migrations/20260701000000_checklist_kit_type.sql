-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Checklist kit_type: per-bag organization (Bug Out, Pesca, Caça, etc.)
-- Migration: 2026-07-01
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add kit_type column (idempotent)
ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS kit_type TEXT NOT NULL DEFAULT 'GERAL';

-- 2. Drop old scenario-based unique index (may not exist if already dropped)
DROP INDEX IF EXISTS checklists_uniq_canonical_scenario;

-- 3. New unique constraint: one item per (profile, canonical_key, kit_type)
--    Same item CAN appear in both Bug Out AND Pesca kits independently.
CREATE UNIQUE INDEX IF NOT EXISTS checklists_uniq_canonical_kit
  ON checklists (profile_id, canonical_key, kit_type);

-- 4. Index for kit_type queries
CREATE INDEX IF NOT EXISTS checklists_kit_type_idx ON checklists (profile_id, kit_type);
