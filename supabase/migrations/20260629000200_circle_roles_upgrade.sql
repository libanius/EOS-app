-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Circle roles: LEADER/MEMBER → Admin/Editor/Viewer
-- Migration: 2026-06-29
-- Decision: D-016
--
-- IMPORTANT: PostgreSQL cannot use new enum values in the same transaction.
-- This migration file must be applied in two separate executions:
--   Step 1: Run the ALTER TYPE block.
--   Step 2: Run the UPDATE block (after Step 1 commits).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Add new role values ─────────────────────────────────────────────
-- (run this block first, then commit before running Step 2)

ALTER TYPE circle_role_enum ADD VALUE IF NOT EXISTS 'Admin';
ALTER TYPE circle_role_enum ADD VALUE IF NOT EXISTS 'Editor';
ALTER TYPE circle_role_enum ADD VALUE IF NOT EXISTS 'Viewer';
