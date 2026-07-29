-- D-071 — Shared simulation drills across a circle.
-- Apply in Supabase Dashboard -> SQL Editor when deploying the SIM-T07 slice.
--
-- A local simulation lives in memory and dies on reload (D-067 §5.3). A SHARED
-- one has to survive long enough to reach other people's phones, so it gets a
-- row — but the same safety rules still bind it: a real critical alert ends it
-- for everyone (D-071), and no participant is ever placed in a drill they did
-- not accept.

CREATE TABLE IF NOT EXISTS simulation_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  owner_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- The full SimulationConfig, so a joiner's app reproduces the exact scenario.
  config      jsonb       NOT NULL,
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_reason text       CHECK (ended_reason IN ('owner', 'real_alert', 'expired')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);

CREATE TABLE IF NOT EXISTS simulation_participants (
  session_id  uuid        NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- 'invited' until the person answers the pop-up. Never assume consent.
  status      text        NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'joined', 'declined')),
  responded_at timestamptz,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS simulation_sessions_active_idx
  ON simulation_sessions (circle_id, status);
CREATE INDEX IF NOT EXISTS simulation_participants_user_idx
  ON simulation_participants (user_id, status);

-- RLS: reads and writes go through the API, which checks circle membership with
-- the service-role client. Deny-all here keeps a stray anon key from ever
-- enrolling someone in a drill.
ALTER TABLE simulation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_participants ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN simulation_sessions.ended_reason IS
  'D-071: real_alert means a genuine CRITICAL alert aborted the drill for the whole circle.';
COMMENT ON COLUMN simulation_participants.status IS
  'D-071: nobody is placed in a drill they did not accept. invited -> joined | declined.';
