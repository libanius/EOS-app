-- D-087 / COMMS-T01 — app-level circle chat.
-- Apply in Supabase Dashboard -> SQL Editor before enabling persistent Comms.
--
-- Comms starts as circle-scoped text chat plus radio/mesh reference. It is not
-- SMS, dispatch, guaranteed delivery, or LoRa hardware.

CREATE TABLE IF NOT EXISTS circle_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  sender_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        text        NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 1000),
  kind        text        NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'system', 'alert')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS circle_messages_circle_created_idx
  ON circle_messages (circle_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS circle_messages_sender_idx
  ON circle_messages (sender_id, created_at DESC);

-- Deny all direct access. Every read/write goes through /api/comms/messages,
-- which verifies circle membership before using the service-role client. This
-- avoids recursive circle_members policies and keeps message access explicit.
ALTER TABLE circle_messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE circle_messages IS
  'D-087 COMMS-T01: circle-scoped app chat. Not SMS, dispatch, or guaranteed delivery.';
COMMENT ON COLUMN circle_messages.kind IS
  'v1 writes only text. system/alert are reserved and require separate decisions before use.';
