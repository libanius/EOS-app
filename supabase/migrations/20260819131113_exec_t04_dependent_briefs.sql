-- PLAN-EXEC-001 / EXEC-T04 — dependent briefs.
--
-- A dependent has no account and no execution screen. Their agreed instruction
-- lives with the plan and is rendered in the seeker/adult playbook as a quote,
-- never as a numbered step and never on the public ficha.

CREATE TABLE IF NOT EXISTS public.family_plan_dependent_briefs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES public.family_plans(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  instruction text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_plan_dependent_briefs_instruction_check CHECK (length(trim(instruction)) > 0),
  CONSTRAINT family_plan_dependent_briefs_plan_member_unique UNIQUE (plan_id, member_id)
);

CREATE INDEX IF NOT EXISTS family_plan_dependent_briefs_member_idx
  ON public.family_plan_dependent_briefs (member_id);

ALTER TABLE public.family_plan_dependent_briefs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.family_plan_dependent_briefs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_plan_dependent_briefs TO authenticated;

DROP POLICY IF EXISTS family_plan_dependent_briefs_circle_members_select ON public.family_plan_dependent_briefs;
CREATE POLICY family_plan_dependent_briefs_circle_members_select
  ON public.family_plan_dependent_briefs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.family_plans fp
        JOIN public.circle_members cm ON cm.circle_id = fp.circle_id
       WHERE fp.id = family_plan_dependent_briefs.plan_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS family_plan_dependent_briefs_circle_members_insert ON public.family_plan_dependent_briefs;
CREATE POLICY family_plan_dependent_briefs_circle_members_insert
  ON public.family_plan_dependent_briefs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.family_plans fp
        JOIN public.circle_members cm ON cm.circle_id = fp.circle_id
       WHERE fp.id = family_plan_dependent_briefs.plan_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS family_plan_dependent_briefs_circle_members_update ON public.family_plan_dependent_briefs;
CREATE POLICY family_plan_dependent_briefs_circle_members_update
  ON public.family_plan_dependent_briefs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.family_plans fp
        JOIN public.circle_members cm ON cm.circle_id = fp.circle_id
       WHERE fp.id = family_plan_dependent_briefs.plan_id
         AND cm.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.family_plans fp
        JOIN public.circle_members cm ON cm.circle_id = fp.circle_id
       WHERE fp.id = family_plan_dependent_briefs.plan_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS family_plan_dependent_briefs_circle_members_delete ON public.family_plan_dependent_briefs;
CREATE POLICY family_plan_dependent_briefs_circle_members_delete
  ON public.family_plan_dependent_briefs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.family_plans fp
        JOIN public.circle_members cm ON cm.circle_id = fp.circle_id
       WHERE fp.id = family_plan_dependent_briefs.plan_id
         AND cm.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.family_plan_dependent_briefs IS
  'PLAN-EXEC-001 EXEC-T04: per-plan dependent instructions rendered only inside execution playbooks.';
