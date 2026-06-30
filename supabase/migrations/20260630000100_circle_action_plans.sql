-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Circle action plans (P3-T01)
-- Migration: 2026-06-30
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS circle_action_plans (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  created_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body        text        NOT NULL CHECK (char_length(body) <= 5000),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circle_action_plans_circle_id_idx
  ON circle_action_plans (circle_id);

ALTER TABLE circle_action_plans ENABLE ROW LEVEL SECURITY;

-- Members can read plans of circles they belong to
CREATE POLICY "circle_action_plans: members read"
  ON circle_action_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_action_plans.circle_id
        AND cm.user_id = auth.uid()
    )
  );

-- Only Admin/Editor can insert/update plans
CREATE POLICY "circle_action_plans: editor write"
  ON circle_action_plans FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_action_plans.circle_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('Admin', 'Editor')
    )
  );

CREATE POLICY "circle_action_plans: editor update"
  ON circle_action_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_action_plans.circle_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('Admin', 'Editor')
    )
  );

-- Only Admin can delete plans
CREATE POLICY "circle_action_plans: admin delete"
  ON circle_action_plans FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_action_plans.circle_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'Admin'
    )
  );
