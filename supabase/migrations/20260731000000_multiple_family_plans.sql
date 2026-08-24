-- D-080 / PLAN-T09 — multiple family plans per circle.
-- A family needs separate plans for separate situations: power outage, no cell
-- service, crowded event, school incident. One active plan per circle forced
-- those into one document and made execution ambiguous.

DROP INDEX IF EXISTS family_plans_one_active_per_circle;

COMMENT ON TABLE family_plans IS
  'D-080: multiple active plans per circle are allowed; name is the scenario selector in the MVP.';
