-- D-064 — Live family location.
-- Apply in Supabase Dashboard -> SQL Editor when deploying the FAM slice.
--
-- Retention is THE LATEST POINT ONLY (D-051 §2, reaffirmed by D-064): a new
-- report overwrites the previous one. There is deliberately no history table,
-- no trail and no replay — EOS answers "where is my family now", it does not
-- keep a record of where they have been.
--
-- Consent lives in circle_members.shared_fields ('location'), not here: a member
-- may share position with one circle and not another, so the gate cannot be a
-- column on profiles.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_location_lat        double precision;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_location_lng        double precision;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_location_at         timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_location_accuracy_m double precision;

COMMENT ON COLUMN profiles.last_location_lat IS
  'D-064 live GPS point. Latest only — never a trail. Readable by circle members only when shared_fields contains ''location''.';
COMMENT ON COLUMN profiles.last_location_at IS
  'D-064 timestamp of the live point. Drives the mandatory freshness label; a stale point must never be shown as current.';

-- Existing RLS on profiles is owner-only, so a member cannot read another
-- profile row directly. Circle reads go through /api/circles, which applies the
-- consent gate server-side before returning any coordinate.
