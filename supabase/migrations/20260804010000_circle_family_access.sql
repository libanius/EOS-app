-- D-107: circle membership is not family membership.
-- A circle is the broader coordination group. Family access is a separate,
-- explicit inner authorization inside that circle for master ficha/Pilot use.

ALTER TABLE circle_members
  ADD COLUMN IF NOT EXISTS family_access_status text NOT NULL DEFAULT 'none'
    CHECK (family_access_status IN ('none', 'requested', 'approved', 'denied')),
  ADD COLUMN IF NOT EXISTS family_access_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS family_access_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS family_access_approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS circle_members_family_access_idx
  ON circle_members (circle_id, family_access_status);
