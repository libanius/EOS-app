-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Circle roles: migrate existing data LEADER→Admin, MEMBER→Viewer
-- Migration: 2026-06-29 (run AFTER 20260629000200_circle_roles_upgrade.sql)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE circle_members SET role = 'Admin'  WHERE role = 'LEADER';
UPDATE circle_members SET role = 'Viewer' WHERE role = 'MEMBER';
