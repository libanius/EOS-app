-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Circles: member visibility + pooled inventory RPC
-- Migration: 2026-04-17
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Allow all members of a circle to see each other (not only the leader).
DROP POLICY IF EXISTS "Members can view their circle memberships" ON circle_members;

CREATE POLICY "Members can view their circle memberships"
  ON circle_members FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = circle_members.circle_id
        AND c.leader_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM circle_members self
      WHERE self.circle_id = circle_members.circle_id
        AND self.user_id   = auth.uid()
    )
  );

-- 2. Allow members to leave a Circle (DELETE their own row).
DROP POLICY IF EXISTS "Members can leave their circle" ON circle_members;
CREATE POLICY "Members can leave their circle"
  ON circle_members FOR DELETE USING (auth.uid() = user_id);

-- 3. Allow authenticated users to INSERT themselves into a Circle
--    (join via invite-code flow happens in an API route; still safer via policy).
DROP POLICY IF EXISTS "Users can insert self as circle member" ON circle_members;
CREATE POLICY "Users can insert self as circle member"
  ON circle_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. pooled_inventory(circle_uuid)
--    Returns the SUM of resource_inventory for members who opted in
--    (share_inventory = true). NULL-safe.
CREATE OR REPLACE FUNCTION public.circle_pooled_inventory(circle_uuid uuid)
RETURNS TABLE (
  water_liters              numeric,
  food_days                 numeric,
  fuel_liters               numeric,
  battery_percent           numeric,
  medical_kit_count         bigint,
  communication_device_count bigint,
  cash_amount               numeric,
  member_count              bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(ri.water_liters), 0)::numeric              AS water_liters,
    COALESCE(SUM(ri.food_days), 0)::numeric                 AS food_days,
    COALESCE(SUM(ri.fuel_liters), 0)::numeric               AS fuel_liters,
    COALESCE(AVG(ri.battery_percent), 0)::numeric           AS battery_percent,
    COALESCE(SUM((ri.has_medical_kit)::int), 0)::bigint     AS medical_kit_count,
    COALESCE(SUM((ri.has_communication_device)::int), 0)::bigint
                                                            AS communication_device_count,
    COALESCE(SUM(ri.cash_amount), 0)::numeric               AS cash_amount,
    COUNT(cm.user_id)::bigint                               AS member_count
  FROM circle_members cm
  LEFT JOIN resource_inventory ri
    ON ri.profile_id = cm.user_id
   AND cm.share_inventory = true
  WHERE cm.circle_id = circle_uuid;
$$;

GRANT EXECUTE ON FUNCTION public.circle_pooled_inventory(uuid) TO authenticated;
