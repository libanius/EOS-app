-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Per-field inventory sharing in circles
-- Migration: 2026-06-30 (P2-T03)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE circle_members
  ADD COLUMN IF NOT EXISTS shared_fields text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN circle_members.shared_fields IS
  'Resources this member shares with the circle when share_inventory=true.
   Possible values: water, food, medical, comms, emergency_contact.
   Empty array = share all (default legacy behaviour).';
