-- PLAN-EXEC-001 / EXEC-T02 — plan sessions.
--
-- A session is the day/event layer: "today, with these people, for this window".
-- It is deliberately separate from the plan document. Day points do not version
-- the plan, do not notify the circle, and do not ask for acknowledgements.

CREATE TABLE IF NOT EXISTS public.plan_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id    uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  plan_id      uuid REFERENCES public.family_plans(id) ON DELETE SET NULL,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'armed' CHECK (status IN ('armed', 'disarmed', 'expired')),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  center_lat   double precision,
  center_lng   double precision,
  radius_m     integer,
  created_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  disarmed_at  timestamptz,
  CONSTRAINT plan_sessions_window_check CHECK (ends_at > starts_at),
  CONSTRAINT plan_sessions_radius_check CHECK (radius_m IS NULL OR radius_m > 0),
  CONSTRAINT plan_sessions_center_pair_check CHECK (
    (center_lat IS NULL AND center_lng IS NULL AND radius_m IS NULL)
    OR (center_lat IS NOT NULL AND center_lng IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_sessions_one_armed_per_circle
  ON public.plan_sessions (circle_id)
  WHERE status = 'armed';

CREATE INDEX IF NOT EXISTS plan_sessions_member_lookup_idx
  ON public.plan_sessions (circle_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plan_session_members (
  session_id uuid NOT NULL REFERENCES public.plan_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS plan_session_members_user_idx
  ON public.plan_session_members (user_id);

CREATE TABLE IF NOT EXISTS public.plan_session_dependents (
  session_id       uuid NOT NULL REFERENCES public.plan_sessions(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  guardian_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS plan_session_dependents_guardian_idx
  ON public.plan_session_dependents (guardian_user_id);

CREATE TABLE IF NOT EXISTS public.plan_session_places (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES public.plan_sessions(id) ON DELETE CASCADE,
  name              text NOT NULL,
  lat               double precision NOT NULL,
  lng               double precision NOT NULL,
  notes             text,
  created_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  promoted_place_id uuid REFERENCES public.circle_places(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS plan_session_places_session_idx
  ON public.plan_session_places (session_id, created_at DESC);

ALTER TABLE public.plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_session_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_session_dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_session_places ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.plan_sessions FROM anon;
REVOKE ALL ON TABLE public.plan_session_members FROM anon;
REVOKE ALL ON TABLE public.plan_session_dependents FROM anon;
REVOKE ALL ON TABLE public.plan_session_places FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_session_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_session_dependents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_session_places TO authenticated;

DROP POLICY IF EXISTS plan_sessions_circle_members_select ON public.plan_sessions;
CREATE POLICY plan_sessions_circle_members_select
  ON public.plan_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = plan_sessions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS plan_sessions_circle_members_insert ON public.plan_sessions;
CREATE POLICY plan_sessions_circle_members_insert
  ON public.plan_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = plan_sessions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS plan_sessions_circle_members_update ON public.plan_sessions;
CREATE POLICY plan_sessions_circle_members_update
  ON public.plan_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = plan_sessions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = plan_sessions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS plan_session_members_circle_members_all ON public.plan_session_members;
CREATE POLICY plan_session_members_circle_members_all
  ON public.plan_session_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.plan_sessions ps
        JOIN public.circle_members cm ON cm.circle_id = ps.circle_id
       WHERE ps.id = plan_session_members.session_id
         AND cm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.plan_sessions ps
        JOIN public.circle_members cm ON cm.circle_id = ps.circle_id
       WHERE ps.id = plan_session_members.session_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS plan_session_dependents_circle_members_all ON public.plan_session_dependents;
CREATE POLICY plan_session_dependents_circle_members_all
  ON public.plan_session_dependents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.plan_sessions ps
        JOIN public.circle_members cm ON cm.circle_id = ps.circle_id
       WHERE ps.id = plan_session_dependents.session_id
         AND cm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.plan_sessions ps
        JOIN public.circle_members cm ON cm.circle_id = ps.circle_id
       WHERE ps.id = plan_session_dependents.session_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS plan_session_places_circle_members_all ON public.plan_session_places;
CREATE POLICY plan_session_places_circle_members_all
  ON public.plan_session_places
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.plan_sessions ps
        JOIN public.circle_members cm ON cm.circle_id = ps.circle_id
       WHERE ps.id = plan_session_places.session_id
         AND cm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.plan_sessions ps
        JOIN public.circle_members cm ON cm.circle_id = ps.circle_id
       WHERE ps.id = plan_session_places.session_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.plan_sessions IS
  'PLAN-EXEC-001 EXEC-T02: event/day layer. One armed session per circle; never versions the plan.';
COMMENT ON TABLE public.plan_session_places IS
  'PLAN-EXEC-001 EXEC-T02: ephemeral day points. No plan versioning, no push, no ack.';
