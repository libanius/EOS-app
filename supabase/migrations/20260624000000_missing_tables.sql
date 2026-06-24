-- ============================================================
-- EOS — Missing Tables Migration
-- Apply in: https://supabase.com/dashboard/project/alxurmgpyxjhvnliivbf/sql/new
-- ============================================================

-- ENUMS (safe to run even if they already exist)
DO $$ BEGIN
  CREATE TYPE scenario_type_enum AS ENUM ('HURRICANE','EARTHQUAKE','FALLOUT','PANDEMIC','FIRE','FLOOD','GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE action_plan_mode_enum AS ENUM ('CONNECTED','LOCAL_AI','SURVIVAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TABLE: resource_inventory
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
DROP POLICY IF EXISTS "resource_inventory: owner access" ON resource_inventory;
CREATE POLICY "resource_inventory: owner access"
  ON resource_inventory FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- TABLE: scenarios
CREATE TABLE IF NOT EXISTS scenarios (
  id          uuid                PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  uuid                NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description text,
  type        scenario_type_enum  NOT NULL DEFAULT 'GENERAL',
  severity    smallint            CHECK (severity >= 1 AND severity <= 5),
  created_at  timestamptz         NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenarios_profile_id_idx ON scenarios (profile_id);
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scenarios: owner access" ON scenarios;
CREATE POLICY "scenarios: owner access"
  ON scenarios FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- TABLE: action_plans
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
CREATE INDEX IF NOT EXISTS action_plans_scenario_id_idx ON action_plans (scenario_id);
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "action_plans: owner access" ON action_plans;
CREATE POLICY "action_plans: owner access"
  ON action_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM scenarios s
      WHERE s.id = action_plans.scenario_id
        AND s.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios s
      WHERE s.id = action_plans.scenario_id
        AND s.profile_id = auth.uid()
    )
  );

-- FUNCTION: match_documents (pgvector RAG)
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding    vector(1536),
  match_threshold    float   DEFAULT 0.7,
  match_count        int     DEFAULT 5,
  filter_scenario_type text  DEFAULT NULL
)
RETURNS TABLE(content text, source text, similarity float)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.content,
    COALESCE(kb.source, 'Knowledge Base') AS source,
    (1 - (kb.embedding <=> query_embedding))::float AS similarity
  FROM knowledge_base kb
  WHERE
    kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> query_embedding)) >= match_threshold
    AND (
      filter_scenario_type IS NULL
      OR kb.scenario_type IS NULL
      OR kb.scenario_type::text = UPPER(filter_scenario_type)
    )
  ORDER BY kb.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_documents(vector(1536), float, int, text)
  TO authenticated, service_role;
