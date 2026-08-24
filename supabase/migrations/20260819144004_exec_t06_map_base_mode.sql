-- PLAN-EXEC-001 / EXEC-T06 — persistent app-wide map base preference.
--
-- D-h: satellite is the default and the choice is shared by every map surface
-- instead of being local component state.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS map_base_mode text NOT NULL DEFAULT 'satellite';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'profiles_map_base_mode_check'
       AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_map_base_mode_check
      CHECK (map_base_mode IN ('satellite', 'hybrid', 'dark'));
  END IF;
END $$;
