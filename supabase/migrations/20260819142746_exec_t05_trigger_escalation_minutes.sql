-- PLAN-EXEC-001 / EXEC-T05 — escalation interval per protocol.
--
-- Escalation is not a global timer. A house fire, a lost child at an event, and
-- a regional evacuation deserve different intervals, chosen while planning.

ALTER TABLE public.family_plan_triggers
  ADD COLUMN IF NOT EXISTS escalation_minutes integer;

ALTER TABLE public.family_plan_triggers
  DROP CONSTRAINT IF EXISTS family_plan_triggers_escalation_minutes_check;

ALTER TABLE public.family_plan_triggers
  ADD CONSTRAINT family_plan_triggers_escalation_minutes_check
  CHECK (
    escalation_minutes IS NULL
    OR (escalation_minutes >= 5 AND escalation_minutes <= 120)
  );

COMMENT ON COLUMN public.family_plan_triggers.escalation_minutes IS
  'PLAN-EXEC-001 EXEC-T05 / D-215: minutes before local escalation suggestion; null means explicit default of 15.';
