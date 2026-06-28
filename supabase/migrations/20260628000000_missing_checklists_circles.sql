-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Create missing tables: checklists, circles, circle_members
-- Migration: 2026-06-28
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ENUMS ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE checklist_tier_enum AS ENUM ('ESSENTIAL', 'MODERATE', 'EXCELLENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE circle_role_enum AS ENUM ('LEADER', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── TABLE: checklists ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS checklists (
  id             uuid                PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id     uuid                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_id    uuid                REFERENCES scenarios(id) ON DELETE SET NULL,
  canonical_key  text                NOT NULL,
  item_name      text                NOT NULL,
  tier           checklist_tier_enum NOT NULL DEFAULT 'ESSENTIAL',
  quantity       numeric(10,2)       NOT NULL DEFAULT 1,
  unit           text,
  acquired       boolean             NOT NULL DEFAULT false,
  acquired_at    timestamptz
);

CREATE INDEX IF NOT EXISTS checklists_profile_id_idx    ON checklists (profile_id);
CREATE INDEX IF NOT EXISTS checklists_scenario_id_idx   ON checklists (scenario_id);
CREATE INDEX IF NOT EXISTS checklists_canonical_key_idx ON checklists (canonical_key);

ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklists: owner access" ON checklists;
CREATE POLICY "checklists: owner access"
  ON checklists FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS checklists_uniq_canonical_scenario
  ON checklists (
    profile_id,
    canonical_key,
    COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE OR REPLACE FUNCTION public.sync_checklist_acquired()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.acquired IS DISTINCT FROM OLD.acquired THEN
    UPDATE checklists
       SET acquired = NEW.acquired, acquired_at = NEW.acquired_at
     WHERE profile_id = NEW.profile_id AND canonical_key = NEW.canonical_key AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_checklist_acquired ON checklists;
CREATE TRIGGER trg_sync_checklist_acquired
  AFTER UPDATE ON checklists FOR EACH ROW
  EXECUTE FUNCTION public.sync_checklist_acquired();

-- ─── TABLE: circles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS circles (
  id          uuid    PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text    NOT NULL,
  invite_code char(6) NOT NULL UNIQUE,
  leader_id   uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circles_leader_id_idx ON circles (leader_id);
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circles: leader full access" ON circles;
CREATE POLICY "circles: leader full access"
  ON circles FOR ALL
  USING (leader_id = auth.uid()) WITH CHECK (leader_id = auth.uid());

-- ─── TABLE: circle_members (antes da policy que a referencia) ────────────

CREATE TABLE IF NOT EXISTS circle_members (
  id              uuid             PRIMARY KEY DEFAULT uuid_generate_v4(),
  circle_id       uuid             NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id         uuid             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            circle_role_enum NOT NULL DEFAULT 'MEMBER',
  share_inventory boolean          NOT NULL DEFAULT false,
  joined_at       timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS circle_members_circle_id_idx ON circle_members (circle_id);
CREATE INDEX IF NOT EXISTS circle_members_user_id_idx   ON circle_members (user_id);
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle_members: self access" ON circle_members;
CREATE POLICY "circle_members: self access"
  ON circle_members FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "circle_members: leader read" ON circle_members;
CREATE POLICY "circle_members: leader read"
  ON circle_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM circles c
    WHERE c.id = circle_members.circle_id AND c.leader_id = auth.uid()
  ));

-- ─── Policy de circles que depende de circle_members (agora ela existe) ──

DROP POLICY IF EXISTS "circles: member read access" ON circles;
CREATE POLICY "circles: member read access"
  ON circles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = circles.id AND cm.user_id = auth.uid()
  ));

-- ─── Funções e trigger de invite_code para circles ───────────────────────

CREATE OR REPLACE FUNCTION generate_invite_code() RETURNS char(6) LANGUAGE sql AS $$
  SELECT upper(substring(md5(random()::text) FROM 1 FOR 6));
$$;

CREATE OR REPLACE FUNCTION set_invite_code() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    LOOP
      NEW.invite_code := generate_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM circles WHERE invite_code = NEW.invite_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS circles_set_invite_code ON circles;
CREATE TRIGGER circles_set_invite_code
  BEFORE INSERT ON circles FOR EACH ROW EXECUTE FUNCTION set_invite_code();
