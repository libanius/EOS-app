-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Circle roles: LEADER/MEMBER → Admin/Editor/Viewer
-- Migration: 2026-06-29
-- Decision: D-016
-- ═══════════════════════════════════════════════════════════════════════════

-- Add new role values (cannot remove old ones without recreating type)
ALTER TYPE circle_role_enum ADD VALUE IF NOT EXISTS 'Admin';
ALTER TYPE circle_role_enum ADD VALUE IF NOT EXISTS 'Editor';
ALTER TYPE circle_role_enum ADD VALUE IF NOT EXISTS 'Viewer';

-- Migrate existing data: LEADER → Admin, MEMBER → Viewer (default per spec)
UPDATE circle_members SET role = 'Admin'  WHERE role = 'LEADER';
UPDATE circle_members SET role = 'Viewer' WHERE role = 'MEMBER';
