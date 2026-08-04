-- D-095 / UPP-03 — Confirmed Pilot memory writes + audit trail.
-- Apply in Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS pilot_memory_events (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source             text        NOT NULL DEFAULT 'pilot_chat',
  reason             text        NOT NULL DEFAULT '',
  proposal_md        text        NOT NULL,
  previous_memory_md text        NOT NULL DEFAULT '',
  next_memory_md     text        NOT NULL,
  status             text        NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed')),
  confirmed_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_memory_events_profile_idx
  ON pilot_memory_events (profile_id, created_at DESC);

ALTER TABLE pilot_memory_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot_memory_events: owner read" ON pilot_memory_events;
CREATE POLICY "pilot_memory_events: owner read"
  ON pilot_memory_events FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- No direct writes from the browser. Confirmed writes go through the RPC below,
-- which updates memory and inserts the audit row in the same transaction.

CREATE OR REPLACE FUNCTION confirm_pilot_memory(
  p_profile_id uuid,
  p_source text,
  p_reason text,
  p_proposal_md text,
  p_next_memory_md text
)
RETURNS pilot_memory_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_md text;
  event_row pilot_memory_events;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_profile_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO profile_personalization (profile_id)
  VALUES (p_profile_id)
  ON CONFLICT (profile_id) DO NOTHING;

  SELECT COALESCE(pilot_memory_md, '')
    INTO previous_md
    FROM profile_personalization
   WHERE profile_id = p_profile_id
   FOR UPDATE;

  UPDATE profile_personalization
     SET pilot_memory_md = p_next_memory_md
   WHERE profile_id = p_profile_id;

  INSERT INTO pilot_memory_events (
    profile_id,
    source,
    reason,
    proposal_md,
    previous_memory_md,
    next_memory_md
  )
  VALUES (
    p_profile_id,
    COALESCE(NULLIF(p_source, ''), 'pilot_chat'),
    COALESCE(p_reason, ''),
    p_proposal_md,
    previous_md,
    p_next_memory_md
  )
  RETURNING * INTO event_row;

  RETURN event_row;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_pilot_memory(uuid, text, text, text, text) TO authenticated;
