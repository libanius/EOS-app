-- D-111 / COMMS-T06 — Inbox EOS app-level notifications.
--
-- Keeps the existing circle_notifications table for compatibility, but allows
-- app-level scopes such as weather, EDU, and simulation invites.

ALTER TABLE public.circle_notifications
  ALTER COLUMN circle_id DROP NOT NULL;

ALTER TABLE public.circle_notifications
  DROP CONSTRAINT IF EXISTS circle_notifications_kind_check;

ALTER TABLE public.circle_notifications
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'circle',
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS source_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'circle_notifications_scope_check'
      AND conrelid = 'public.circle_notifications'::regclass
  ) THEN
    ALTER TABLE public.circle_notifications
      ADD CONSTRAINT circle_notifications_scope_check
      CHECK (scope IN ('circle', 'weather', 'edu', 'simulation', 'system'));
  END IF;
END $$;

DROP INDEX IF EXISTS circle_notifications_circle_idx;
CREATE INDEX IF NOT EXISTS circle_notifications_circle_idx
  ON public.circle_notifications (circle_id, created_at DESC)
  WHERE circle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS circle_notifications_scope_created_idx
  ON public.circle_notifications (scope, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS circle_notifications_recipient_source_key_idx
  ON public.circle_notifications (recipient_id, source_key)
  WHERE source_key IS NOT NULL;

COMMENT ON COLUMN public.circle_notifications.scope IS
  'D-111 COMMS-T06: Inbox EOS scope: circle, weather, edu, simulation, or system.';

COMMENT ON COLUMN public.circle_notifications.source_key IS
  'D-111 COMMS-T06: optional per-recipient dedupe key for app-level events.';
