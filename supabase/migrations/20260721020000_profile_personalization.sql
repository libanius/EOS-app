-- D-059 — Authenticated Profile Personalization + Pilot memory.
-- Apply in Supabase Dashboard -> SQL Editor when deploying the UPP slice.
-- Public emergency ficha endpoints must not expose this table.

CREATE TABLE IF NOT EXISTS profile_personalization (
  profile_id              uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  avatar_url              text,
  user_context_md         text        NOT NULL DEFAULT '',
  pilot_memory_md         text        NOT NULL DEFAULT '',
  decision_style          text        NOT NULL DEFAULT 'balanced'
    CHECK (decision_style IN ('concise', 'balanced', 'detailed', 'checklist')),
  risk_tolerance          text        NOT NULL DEFAULT 'balanced'
    CHECK (risk_tolerance IN ('conservative', 'balanced', 'flexible')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  pilot_memory_updated_at timestamptz
);

ALTER TABLE profile_personalization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_personalization: owner read" ON profile_personalization;
CREATE POLICY "profile_personalization: owner read"
  ON profile_personalization FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "profile_personalization: owner insert" ON profile_personalization;
CREATE POLICY "profile_personalization: owner insert"
  ON profile_personalization FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "profile_personalization: owner update" ON profile_personalization;
CREATE POLICY "profile_personalization: owner update"
  ON profile_personalization FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION set_profile_personalization_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.pilot_memory_md IS DISTINCT FROM OLD.pilot_memory_md THEN
    NEW.pilot_memory_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profile_personalization_updated_at ON profile_personalization;
CREATE TRIGGER trg_profile_personalization_updated_at
  BEFORE UPDATE ON profile_personalization
  FOR EACH ROW EXECUTE FUNCTION set_profile_personalization_updated_at();
