-- D-089 / COMMS-T03 — editable circle radio reference.
-- Apply in Supabase Dashboard -> SQL Editor before enabling persisted edits.

CREATE TABLE IF NOT EXISTS circle_radio_profiles (
  circle_id  uuid        PRIMARY KEY REFERENCES circles(id) ON DELETE CASCADE,
  config     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE circle_radio_profiles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE circle_radio_profiles IS
  'D-089 COMMS-T03: editable radio reference per circle. Read/write only through /api/comms/radio.';
COMMENT ON COLUMN circle_radio_profiles.config IS
  'Normalized RadioConfig JSON. It is operational reference content, not legal validation or proof of transmission rights.';
