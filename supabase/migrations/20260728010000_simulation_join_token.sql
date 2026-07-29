-- D-072 — Share a drill with chosen circles, and with people outside them.
-- Apply in Supabase Dashboard -> SQL Editor.
--
-- The token lets someone who is NOT in the circle join a drill by link. It
-- carries no authority beyond that: the join endpoint still requires a signed-in
-- EOS account, and the guest still has to accept the same pop-up as everyone
-- else (D-071). A link never places anyone in a scenario silently.

ALTER TABLE simulation_sessions ADD COLUMN IF NOT EXISTS join_token text;

CREATE UNIQUE INDEX IF NOT EXISTS simulation_sessions_join_token_idx
  ON simulation_sessions (join_token)
  WHERE join_token IS NOT NULL;

COMMENT ON COLUMN simulation_sessions.join_token IS
  'D-072: opaque invite token. Grants the ability to ASK to join a drill, nothing else.';
