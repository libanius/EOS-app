-- PLAN-EXEC-001 / EXEC-T03 — family plan executions.
--
-- Execution is the operational mode, not the editable plan document. The
-- notification is a reinforcement channel; the execution row and event log are
-- the shared audit trail once the server is reachable.

CREATE TABLE IF NOT EXISTS public.family_plan_executions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES public.family_plans(id) ON DELETE CASCADE,
  circle_id      uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  session_id     uuid REFERENCES public.plan_sessions(id) ON DELETE SET NULL,
  protocol_index integer,
  plan_version   integer NOT NULL,
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'resolved', 'cancelled')),
  started_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  outcome        text,
  CONSTRAINT family_plan_executions_plan_version_check CHECK (plan_version >= 1),
  CONSTRAINT family_plan_executions_protocol_index_check CHECK (protocol_index IS NULL OR protocol_index >= 0)
);

CREATE INDEX IF NOT EXISTS family_plan_executions_circle_status_idx
  ON public.family_plan_executions (circle_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS family_plan_executions_started_by_idx
  ON public.family_plan_executions (started_by, started_at DESC);

CREATE TABLE IF NOT EXISTS public.family_plan_execution_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  uuid NOT NULL REFERENCES public.family_plan_executions(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (
    kind IN (
      'started',
      'cancelled',
      'protocol_set',
      'status',
      'arrived',
      'step_done',
      'escalation_suggested',
      'escalation_taken',
      'resolved'
    )
  ),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_plan_execution_events_execution_idx
  ON public.family_plan_execution_events (execution_id, created_at);

ALTER TABLE public.family_plan_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_plan_execution_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.family_plan_executions FROM anon;
REVOKE ALL ON TABLE public.family_plan_execution_events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_plan_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_plan_execution_events TO authenticated;

DROP POLICY IF EXISTS family_plan_executions_circle_members_select ON public.family_plan_executions;
CREATE POLICY family_plan_executions_circle_members_select
  ON public.family_plan_executions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = family_plan_executions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS family_plan_executions_circle_members_insert ON public.family_plan_executions;
CREATE POLICY family_plan_executions_circle_members_insert
  ON public.family_plan_executions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = family_plan_executions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS family_plan_executions_circle_members_update ON public.family_plan_executions;
CREATE POLICY family_plan_executions_circle_members_update
  ON public.family_plan_executions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = family_plan_executions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.circle_members cm
       WHERE cm.circle_id = family_plan_executions.circle_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS family_plan_execution_events_circle_members_all ON public.family_plan_execution_events;
CREATE POLICY family_plan_execution_events_circle_members_all
  ON public.family_plan_execution_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.family_plan_executions fpe
        JOIN public.circle_members cm ON cm.circle_id = fpe.circle_id
       WHERE fpe.id = family_plan_execution_events.execution_id
         AND cm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.family_plan_executions fpe
        JOIN public.circle_members cm ON cm.circle_id = fpe.circle_id
       WHERE fpe.id = family_plan_execution_events.execution_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.family_plan_executions IS
  'PLAN-EXEC-001 EXEC-T03: shared operational execution of a saved family plan.';

COMMENT ON TABLE public.family_plan_execution_events IS
  'PLAN-EXEC-001 EXEC-T03+: event log for execution status, protocol, steps, escalation, and closure.';
