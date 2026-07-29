-- D-066 / PLAN-T01 — Planos de Emergência da Família ("plano de voo").
-- Apply in Supabase Dashboard -> SQL Editor.
-- Spec: docs/18-family-plans.md
--
-- The plan is what the family executes when the system is degraded, so it is
-- durable, circle-scoped, and versioned. Versioning is a SAFETY requirement, not
-- a convenience (doc 18 §6): two people running different versions go to
-- different places, which is the failure that kills.

CREATE TABLE IF NOT EXISTS family_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT 'Plano da família',
  -- Incremented on every saved change. The device shows it next to the age of
  -- its local copy, so nobody executes a stale plan believing it is current.
  version     integer     NOT NULL DEFAULT 1,
  status      text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One active plan per circle: two plans is the same failure as two versions.
CREATE UNIQUE INDEX IF NOT EXISTS family_plans_one_active_per_circle
  ON family_plans (circle_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS family_plan_waypoints (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid    NOT NULL REFERENCES family_plans(id) ON DELETE CASCADE,
  -- rendezvous_1/2/3 are the escalation ladder from doc 18 §4: doorstep,
  -- neighbourhood, out of region.
  kind       text    NOT NULL CHECK (kind IN (
                'rendezvous_1', 'rendezvous_2', 'rendezvous_3',
                'home', 'school', 'work', 'custom')),
  name       text    NOT NULL,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  notes      text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS family_plan_routes (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid  NOT NULL REFERENCES family_plans(id) ON DELETE CASCADE,
  label           text  NOT NULL,
  from_waypoint_id uuid REFERENCES family_plan_waypoints(id) ON DELETE SET NULL,
  to_waypoint_id   uuid REFERENCES family_plan_waypoints(id) ON DELETE SET NULL,
  -- A LineString the family drew themselves. Author-drawn, not routed (D-066 §2):
  -- it carries local knowledge no engine has, and it survives offline.
  geometry        jsonb NOT NULL,
  mode            text  NOT NULL DEFAULT 'car' CHECK (mode IN ('foot', 'car')),
  notes           text
);

CREATE TABLE IF NOT EXISTS family_plan_roles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES family_plans(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- "Ana pega Isadora na escola." Plain language on purpose.
  responsibility text NOT NULL
);

-- Without acks there is no way to know whether the plan is real or just the
-- author's intention (doc 18 §6.4). This table is not optional.
CREATE TABLE IF NOT EXISTS family_plan_acks (
  plan_id        uuid        NOT NULL REFERENCES family_plans(id) ON DELETE CASCADE,
  member_user_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  acked_version  integer     NOT NULL,
  acked_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS family_plan_waypoints_plan_idx ON family_plan_waypoints (plan_id);
CREATE INDEX IF NOT EXISTS family_plan_routes_plan_idx ON family_plan_routes (plan_id);
CREATE INDEX IF NOT EXISTS family_plan_roles_plan_idx ON family_plan_roles (plan_id);

-- Deny-all RLS. Every read and write goes through /api/plans, which verifies
-- circle membership with the service-role client — the same pattern as the
-- simulation tables. The public emergency card endpoints must NEVER touch these
-- tables: a rendezvous point on a QR anyone can scan is the opposite of safety
-- (doc 18 §8).
ALTER TABLE family_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_plan_waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_plan_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_plan_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_plan_acks ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN family_plans.version IS
  'doc 18 §6: safety requirement. Two people on different versions go to different places.';
COMMENT ON TABLE family_plan_acks IS
  'doc 18 §6.4: who has SEEN the current version. Without this the author cannot tell a plan from an intention.';
