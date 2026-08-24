-- PLAN-EXEC-001 / EXEC-T01 — circle places catalog.
--
-- A place belongs to the circle. A waypoint belongs to a plan and points to a
-- place. Existing waypoints are migrated without inventing precision: every
-- migrated place starts as `unknown` until a person confirms it.

CREATE TABLE IF NOT EXISTS public.circle_places (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('home', 'school', 'work', 'rendezvous', 'custom')),
  precision   text NOT NULL DEFAULT 'unknown' CHECK (precision IN ('gps', 'address', 'city', 'unknown')),
  notes       text,
  created_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE public.family_plan_waypoints
  ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES public.circle_places(id);

CREATE INDEX IF NOT EXISTS circle_places_circle_idx
  ON public.circle_places (circle_id, archived_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS circle_places_dedupe_idx
  ON public.circle_places (circle_id, lower(name), archived_at);

CREATE INDEX IF NOT EXISTS family_plan_waypoints_place_idx
  ON public.family_plan_waypoints (place_id);

CREATE OR REPLACE FUNCTION public.circle_places_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS circle_places_set_updated_at ON public.circle_places;
CREATE TRIGGER circle_places_set_updated_at
  BEFORE UPDATE ON public.circle_places
  FOR EACH ROW
  EXECUTE FUNCTION public.circle_places_touch_updated_at();

CREATE OR REPLACE FUNCTION public.eos_distance_meters(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

CREATE OR REPLACE FUNCTION public.circle_places_version_plans_on_large_move()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.eos_distance_meters(OLD.lat, OLD.lng, NEW.lat, NEW.lng) > 50 THEN
    UPDATE public.family_plans fp
       SET version = fp.version + 1,
           updated_at = now()
     WHERE fp.status = 'active'
       AND EXISTS (
         SELECT 1
           FROM public.family_plan_waypoints fpw
          WHERE fpw.plan_id = fp.id
            AND fpw.place_id = NEW.id
       );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS circle_places_large_move_versions_plans ON public.circle_places;
CREATE TRIGGER circle_places_large_move_versions_plans
  AFTER UPDATE OF lat, lng ON public.circle_places
  FOR EACH ROW
  EXECUTE FUNCTION public.circle_places_version_plans_on_large_move();

DO $$
DECLARE
  waypoint record;
  existing_place_id uuid;
  inserted_place_id uuid;
BEGIN
  FOR waypoint IN
    SELECT
      fpw.id,
      fpw.kind,
      fpw.name,
      fpw.lat,
      fpw.lng,
      fpw.notes,
      fp.circle_id,
      fp.created_by
    FROM public.family_plan_waypoints fpw
    JOIN public.family_plans fp ON fp.id = fpw.plan_id
    WHERE fpw.place_id IS NULL
    ORDER BY fp.circle_id, lower(fpw.name), fpw.id
  LOOP
    SELECT cp.id
      INTO existing_place_id
      FROM public.circle_places cp
     WHERE cp.circle_id = waypoint.circle_id
       AND cp.archived_at IS NULL
       AND lower(trim(cp.name)) = lower(trim(waypoint.name))
       AND public.eos_distance_meters(cp.lat, cp.lng, waypoint.lat, waypoint.lng) < 25
     ORDER BY cp.created_at
     LIMIT 1;

    IF existing_place_id IS NULL THEN
      INSERT INTO public.circle_places (
        circle_id,
        name,
        lat,
        lng,
        kind,
        precision,
        notes,
        created_by
      )
      VALUES (
        waypoint.circle_id,
        waypoint.name,
        waypoint.lat,
        waypoint.lng,
        CASE
          WHEN waypoint.kind LIKE 'rendezvous_%' THEN 'rendezvous'
          WHEN waypoint.kind IN ('home', 'school', 'work') THEN waypoint.kind
          ELSE 'custom'
        END,
        'unknown',
        waypoint.notes,
        waypoint.created_by
      )
      RETURNING id INTO inserted_place_id;

      existing_place_id := inserted_place_id;
    END IF;

    UPDATE public.family_plan_waypoints
       SET place_id = existing_place_id
     WHERE id = waypoint.id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.family_plan_waypoints
     WHERE place_id IS NULL
  ) THEN
    RAISE EXCEPTION 'EXEC-T01 migration failed: family_plan_waypoints.place_id still null';
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.circle_places FROM anon, authenticated;
ALTER TABLE public.circle_places ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.circle_places IS
  'PLAN-EXEC-001 EXEC-T01: circle-owned place catalog. Waypoints reference places; migrated precision is unknown until a person confirms it.';
COMMENT ON COLUMN public.circle_places.precision IS
  'gps/address/city are user-declared confidence. unknown is only for never-declared legacy waypoints.';
