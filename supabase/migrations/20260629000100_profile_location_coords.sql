-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Location coordinates in profiles
-- Migration: 2026-06-29
-- Decision: D-024
-- Prerequisite for monitoring features (P2-T09+)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_lat float8,
  ADD COLUMN IF NOT EXISTS location_lng float8;

COMMENT ON COLUMN profiles.location_lat IS 'Latitude geocodificada via Nominatim. Pré-req para monitoramento.';
COMMENT ON COLUMN profiles.location_lng IS 'Longitude geocodificada via Nominatim. Pré-req para monitoramento.';
