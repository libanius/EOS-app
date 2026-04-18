-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Checklist canonical_key uniqueness + cross-scenario dedup trigger
-- Migration: 2026-04-17
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Uniqueness per (profile_id, canonical_key, scenario_id)
--    scenario_id may be NULL (general tier) so we allow that with COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS checklists_uniq_canonical_scenario
  ON checklists (
    profile_id,
    canonical_key,
    COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 2. Trigger: when one row is flipped acquired/unacquired, mirror the change
--    across every row sharing (profile_id, canonical_key).
CREATE OR REPLACE FUNCTION public.sync_checklist_acquired()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.acquired IS DISTINCT FROM OLD.acquired THEN
    UPDATE checklists
       SET acquired    = NEW.acquired,
           acquired_at = NEW.acquired_at
     WHERE profile_id    = NEW.profile_id
       AND canonical_key = NEW.canonical_key
       AND id <> NEW.id
       AND acquired IS DISTINCT FROM NEW.acquired;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_checklist_acquired ON checklists;
CREATE TRIGGER trg_sync_checklist_acquired
  AFTER UPDATE OF acquired ON checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_checklist_acquired();
