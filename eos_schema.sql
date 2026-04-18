-- ============================================================
--  EOS — Emergency Operating System
--  Supabase SQL Schema
--  Generated: 2026-04-08
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE scenario_type_enum AS ENUM (
  'HURRICANE',
  'EARTHQUAKE',
  'FALLOUT',
  'PANDEMIC',
  'FIRE',
  'FLOOD',
  'GENERAL'
);

CREATE TYPE action_plan_mode_enum AS ENUM (
  'CONNECTED',
  'LOCAL_AI',
  'SURVIVAL'
);

CREATE TYPE checklist_tier_enum AS ENUM (
  'ESSENTIAL',
  'MODERATE',
  'EXCELLENT'
);

CREATE TYPE circle_role_enum AS ENUM (
  'LEADER',
  'MEMBER'
);


-- ============================================================
-- TABLE: profiles
-- ============================================================
-- One row per authenticated user. id mirrors auth.users.id.

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY DEFAULT auth.uid(),
  name        text        NOT NULL,
  location    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: owner access"
  ON profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ============================================================
-- TABLE: family_members
-- ============================================================

CREATE TABLE IF NOT EXISTS family_members (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  age                 smallint    CHECK (age >= 0 AND age <= 150),
  medical_conditions  text[]      NOT NULL DEFAULT '{}',
  mobility_impaired   boolean     NOT NULL DEFAULT false,
  is_infant           boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS family_members_profile_id_idx
  ON family_members (profile_id);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_members: owner access"
  ON family_members
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());


-- ============================================================
-- TABLE: resource_inventory
-- ============================================================
-- One row per profile (UNIQUE constraint on profile_id).

CREATE TABLE IF NOT EXISTS resource_inventory (
  id                        uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id                uuid          NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  water_liters              numeric(10,2) NOT NULL DEFAULT 0,
  food_days                 numeric(10,2) NOT NULL DEFAULT 0,
  fuel_liters               numeric(10,2) NOT NULL DEFAULT 0,
  battery_percent           smallint      CHECK (battery_percent >= 0 AND battery_percent <= 100),
  has_medical_kit           boolean       NOT NULL DEFAULT false,
  has_communication_device  boolean       NOT NULL DEFAULT false,
  cash_amount               numeric(14,2) NOT NULL DEFAULT 0
);

ALTER TABLE resource_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_inventory: owner access"
  ON resource_inventory
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());


-- ============================================================
-- TABLE: scenarios
-- ============================================================

CREATE TABLE IF NOT EXISTS scenarios (
  id          uuid                PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  uuid                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description text,
  type        scenario_type_enum  NOT NULL DEFAULT 'GENERAL',
  severity    smallint            CHECK (severity >= 1 AND severity <= 5),
  created_at  timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenarios_profile_id_idx
  ON scenarios (profile_id);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scenarios: owner access"
  ON scenarios
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());


-- ============================================================
-- TABLE: action_plans
-- ============================================================

CREATE TABLE IF NOT EXISTS action_plans (
  id                  uuid                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id         uuid                    NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  mode                action_plan_mode_enum   NOT NULL DEFAULT 'CONNECTED',
  priority            smallint                NOT NULL DEFAULT 1,
  risks               text[]                  NOT NULL DEFAULT '{}',
  immediate_actions   text[]                  NOT NULL DEFAULT '{}',
  short_term_actions  text[]                  NOT NULL DEFAULT '{}',
  mid_term_actions    text[]                  NOT NULL DEFAULT '{}',
  rules_applied       text[]                  NOT NULL DEFAULT '{}',
  created_at          timestamptz             NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_plans_scenario_id_idx
  ON action_plans (scenario_id);

-- RLS: join through scenarios → profile ownership
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_plans: owner access"
  ON action_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM scenarios s
      WHERE s.id = action_plans.scenario_id
        AND s.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM scenarios s
      WHERE s.id = action_plans.scenario_id
        AND s.profile_id = auth.uid()
    )
  );


-- ============================================================
-- TABLE: checklists
-- ============================================================

CREATE TABLE IF NOT EXISTS checklists (
  id             uuid                  PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id     uuid                  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_id    uuid                  REFERENCES scenarios(id) ON DELETE SET NULL,
  canonical_key  text                  NOT NULL,
  item_name      text                  NOT NULL,
  tier           checklist_tier_enum   NOT NULL DEFAULT 'ESSENTIAL',
  quantity       numeric(10,2)         NOT NULL DEFAULT 1,
  unit           text,
  acquired       boolean               NOT NULL DEFAULT false,
  acquired_at    timestamptz
);

CREATE INDEX IF NOT EXISTS checklists_profile_id_idx
  ON checklists (profile_id);

CREATE INDEX IF NOT EXISTS checklists_scenario_id_idx
  ON checklists (scenario_id);

CREATE INDEX IF NOT EXISTS checklists_canonical_key_idx
  ON checklists (canonical_key);

ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklists: owner access"
  ON checklists
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());


-- ============================================================
-- TABLE: circles
-- ============================================================
-- Community resilience groups. invite_code is a unique 6-char string.

CREATE TABLE IF NOT EXISTS circles (
  id           uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text  NOT NULL,
  invite_code  char(6) NOT NULL UNIQUE,
  leader_id    uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circles_leader_id_idx
  ON circles (leader_id);

ALTER TABLE circles ENABLE ROW LEVEL SECURITY;

-- Leaders can do anything with their circles
CREATE POLICY "circles: leader full access"
  ON circles
  FOR ALL
  USING (leader_id = auth.uid())
  WITH CHECK (leader_id = auth.uid());

-- Members can read circles they belong to
CREATE POLICY "circles: member read access"
  ON circles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM circle_members cm
      WHERE cm.circle_id = circles.id
        AND cm.user_id = auth.uid()
    )
  );


-- ============================================================
-- TABLE: circle_members
-- ============================================================

CREATE TABLE IF NOT EXISTS circle_members (
  id               uuid               PRIMARY KEY DEFAULT uuid_generate_v4(),
  circle_id        uuid               NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id          uuid               NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             circle_role_enum   NOT NULL DEFAULT 'MEMBER',
  share_inventory  boolean            NOT NULL DEFAULT false,
  joined_at        timestamptz        NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS circle_members_circle_id_idx
  ON circle_members (circle_id);

CREATE INDEX IF NOT EXISTS circle_members_user_id_idx
  ON circle_members (user_id);

ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;

-- Users manage their own membership row
CREATE POLICY "circle_members: self access"
  ON circle_members
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Circle leader can see all members in their circles
CREATE POLICY "circle_members: leader read"
  ON circle_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM circles c
      WHERE c.id = circle_members.circle_id
        AND c.leader_id = auth.uid()
    )
  );


-- ============================================================
-- TABLE: knowledge_base
-- ============================================================
-- Stores RAG chunks with pgvector embeddings (1536-dim = text-embedding-3-small).

CREATE TABLE IF NOT EXISTS knowledge_base (
  id              uuid                PRIMARY KEY DEFAULT uuid_generate_v4(),
  content         text                NOT NULL,
  embedding       vector(1536),
  source          text,
  source_version  text,
  scenario_type   scenario_type_enum,
  chunk_index     integer             NOT NULL DEFAULT 0,
  created_at      timestamptz         NOT NULL DEFAULT now()
);

-- HNSW index for fast approximate nearest-neighbour cosine search
CREATE INDEX ON knowledge_base
  USING hnsw (embedding vector_cosine_ops);

-- Optional btree index for filtering by scenario type before vector search
CREATE INDEX IF NOT EXISTS knowledge_base_scenario_type_idx
  ON knowledge_base (scenario_type);

-- knowledge_base is read-only for authenticated users (inserts via service role only)
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_base: authenticated read"
  ON knowledge_base
  FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- HELPER FUNCTION: generate_invite_code()
-- ============================================================
-- Generates a random 6-character alphanumeric invite code.

CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS char(6)
LANGUAGE plpgsql
AS $$
DECLARE
  chars  text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code   char(6) := '';
  i      int;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$;

-- Trigger: auto-populate invite_code if not provided
CREATE OR REPLACE FUNCTION set_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    LOOP
      NEW.invite_code := generate_invite_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM circles WHERE invite_code = NEW.invite_code
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER circles_set_invite_code
  BEFORE INSERT ON circles
  FOR EACH ROW
  EXECUTE FUNCTION set_invite_code();


-- ============================================================
-- HELPER FUNCTION: match_knowledge_base()
-- ============================================================
-- Convenience RPC for vector similarity search from client.

CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding    vector(1536),
  match_threshold    float            DEFAULT 0.78,
  match_count        int              DEFAULT 10,
  filter_scenario    scenario_type_enum DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  content        text,
  source         text,
  source_version text,
  scenario_type  scenario_type_enum,
  chunk_index    int,
  similarity     float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.source,
    kb.source_version,
    kb.scenario_type,
    kb.chunk_index,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE
    (filter_scenario IS NULL OR kb.scenario_type = filter_scenario)
    AND (1 - (kb.embedding <=> query_embedding)) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
