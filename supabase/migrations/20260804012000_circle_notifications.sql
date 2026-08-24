-- D-109 / COMMS-T04 — durable social-style notification timeline for Comms.

CREATE TABLE IF NOT EXISTS circle_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  recipient_id uuid       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  kind        text        NOT NULL CHECK (kind IN (
    'message',
    'join_request_approved',
    'member_joined',
    'family_invite',
    'family_invite_accepted',
    'family_invite_denied'
  )),
  title       text        NOT NULL,
  body        text        NOT NULL,
  href        text        NOT NULL DEFAULT '/comms?view=notifications',
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circle_notifications_recipient_created_idx
  ON circle_notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS circle_notifications_unread_idx
  ON circle_notifications (recipient_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS circle_notifications_circle_idx
  ON circle_notifications (circle_id, created_at DESC);

ALTER TABLE circle_notifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE circle_notifications IS
  'D-109 COMMS-T04: durable app-level social timeline and badge source for Comms.';
