-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Link manual family members to circle user profiles (P2-T05)
-- Migration: 2026-06-30
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN family_members.linked_user_id IS
  'If set, this manually-created member has been confirmed to be the same
   person as a circle member who has an EOS account. Null = unlinked.';
