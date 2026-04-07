-- ============================================================
-- EOS — Emergency Operations System
-- Supabase Schema v1.0  (Fase 1 Roadmap)
-- Generated: 2026-04-07
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensions
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;


-- ------------------------------------------------------------
-- 1. Custom ENUM types
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 2. profiles
--    One row per authenticated user; id mirrors auth.users.id
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY DEFAULT auth.uid(),
  name         text        NOT NULL,
  location     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Automatically create a profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', new.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ------------------------------------------------------------
-- 3. family_members
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family_members (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id          uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  name                text        NOT NULL,
  age                 smallint    CHECK (age >= 0),
  medical_conditions  text[]      NOT NULL DEFAULT '{}',
  mobility_impaired   boolean     NOT NULL DEFAULT false,
  is_infant           boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_members_profile_id_idx ON family_members (profile_id);


-- ------------------------------------------------------------
-- 4. resource_inventory
--    One row per profile (UNIQUE constraint on profile_id)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resource_inventory (
  id                        uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id                uuid        NOT NULL UNIQUE REFERENCES profiles (id) ON DELETE CASCADE,
  water_liters              numeric(8,2) NOT NULL DEFAULT 0 CHECK (water_liters >= 0),
  food_days                 numeric(6,1) NOT NULL DEFAULT 0 CHECK (food_days >= 0),
  fuel_liters               numeric(8,2) NOT NULL DEFAULT 0 CHECK (fuel_liters >= 0),
  battery_percent           smallint     NOT NULL DEFAULT 0 CHECK (battery_percent BETWEEN 0 AND 100),
  has_medical_kit           boolean      NOT NULL DEFAULT false,
  has_communication_device  boolean      NOT NULL DEFAULT false,
  cash_amount               numeric(12,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
  updated_at                timestamptz  NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------
-- 5. scenarios
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenarios (
  id           uuid                PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   uuid                NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  description  text,
  type         scenario_type_enum  NOT NULL DEFAULT 'GENERAL',
  severity     smallint            NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  created_at   timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenarios_profile_id_idx ON scenarios (profile_id);


-- ------------------------------------------------------------
-- 6. action_plans
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_plans (
  id                  uuid                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id         uuid                    NOT NULL REFERENCES scenarios (id) ON DELETE CASCADE,
  mode                action_plan_mode_enum   NOT NULL DEFAULT 'CONNECTED',
  priority            smallint                NOT NULL DEFAULT 1 CHECK (priority >= 1),
  risks               text[]                  NOT NULL DEFAULT '{}',
  immediate_actions   text[]                  NOT NULL DEFAULT '{}',
  short_term_actions  text[]                  NOT NULL DEFAULT '{}',
  mid_term_actions    text[]                  NOT NULL DEFAULT '{}',
  rules_applied       text[]                  NOT NULL DEFAULT '{}',
  created_at          timestamptz             NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_plans_scenario_id_idx ON action_plans (scenario_id);


-- ------------------------------------------------------------
-- 7. checklists
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklists (
  id             uuid                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id     uuid                 NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  scenario_id    uuid                 REFERENCES scenarios (id) ON DELETE SET NULL,
  canonical_key  text                 NOT NULL,
  item_name      text                 NOT NULL,
  tier           checklist_tier_enum  NOT NULL DEFAULT 'ESSENTIAL',
  quantity       numeric(10,2)        NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit           text,
  acquired       boolean              NOT NULL DEFAULT false,
  acquired_at    timestamptz,
  created_at     timestamptz          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checklists_profile_id_idx   ON checklists (profile_id);
CREATE INDEX IF NOT EXISTS checklists_scenario_id_idx  ON checklists (scenario_id);
CREATE INDEX IF NOT EXISTS checklists_canonical_key_idx ON checklists (canonical_key);


-- ------------------------------------------------------------
-- 8. circles
--    invite_code: 6-character alphanumeric, unique
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circles (
  id           uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text  NOT NULL,
  invite_code  char(6) NOT NULL UNIQUE,
  leader_id    uuid  NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circles_invite_code_idx ON circles (invite_code);
CREATE INDEX IF NOT EXISTS circles_leader_id_idx   ON circles (leader_id);


-- ------------------------------------------------------------
-- 9. circle_members
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circle_members (
  id               uuid              PRIMARY KEY DEFAULT uuid_generate_v4(),
  circle_id        uuid              NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  user_id          uuid              NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role             circle_role_enum  NOT NULL DEFAULT 'MEMBER',
  share_inventory  boolean           NOT NULL DEFAULT false,
  joined_at        timestamptz       NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id)
);

CREATE INDEX IF NOT EXISTS circle_members_circle_id_idx ON circle_members (circle_id);
CREATE INDEX IF NOT EXISTS circle_members_user_id_idx   ON circle_members (user_id);


-- ------------------------------------------------------------
-- 10. knowledge_base  (pgvector RAG store)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_base (
  id              uuid    PRIMARY KEY DEFAULT uuid_generate_v4(),
  content         text    NOT NULL,
  embedding       vector(1536),
  source          text,
  source_version  text,
  scenario_type   scenario_type_enum,
  chunk_index     integer NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- HNSW index for fast approximate cosine-similarity search
CREATE INDEX ON knowledge_base
  USING hnsw (embedding vector_cosine_ops);


-- ============================================================
-- Row-Level Security (RLS)
-- ============================================================

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- family_members
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own family members"
  ON family_members FOR ALL USING (auth.uid() = profile_id);

-- resource_inventory
ALTER TABLE resource_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own inventory"
  ON resource_inventory FOR ALL USING (auth.uid() = profile_id);

-- scenarios
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scenarios"
  ON scenarios FOR ALL USING (auth.uid() = profile_id);

-- action_plans
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access action plans via scenario"
  ON action_plans FOR ALL USING (
    EXISTS (
      SELECT 1 FROM scenarios s
      WHERE s.id = action_plans.scenario_id
        AND s.profile_id = auth.uid()
    )
  );

-- checklists
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own checklists"
  ON checklists FOR ALL USING (auth.uid() = profile_id);

-- circles
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Circle members can view their circle"
  ON circles FOR SELECT USING (
    auth.uid() = leader_id
    OR EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circles.id AND cm.user_id = auth.uid()
    )
  );
CREATE POLICY "Leader can manage circle"
  ON circles FOR ALL USING (auth.uid() = leader_id);

-- circle_members
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their circle memberships"
  ON circle_members FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = circle_members.circle_id AND c.leader_id = auth.uid()
    )
  );
CREATE POLICY "Leader can manage circle members"
  ON circle_members FOR ALL USING (
    EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = circle_members.circle_id AND c.leader_id = auth.uid()
    )
  );

-- knowledge_base: publicly readable, only service role writes
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read knowledge base"
  ON knowledge_base FOR SELECT USING (true);
