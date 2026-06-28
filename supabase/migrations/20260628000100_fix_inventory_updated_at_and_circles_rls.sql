-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Fix: add updated_at to resource_inventory + fix circles RLS recursion
-- Migration: 2026-06-28 (hotfix)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── resource_inventory: adicionar updated_at ─────────────────────────────
-- A API de inventory seleciona esta coluna mas ela não existia na migration.

ALTER TABLE resource_inventory
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- ─── circles: corrigir recursão infinita nas RLS policies ─────────────────
-- A policy "circles: member read access" referencia circle_members.
-- A policy "circle_members: leader read" referencia circles.
-- Isso cria recursão infinita. Fix: usar SECURITY DEFINER function para
-- quebrar o ciclo.

-- Remover as policies que causam o ciclo
DROP POLICY IF EXISTS "circles: member read access" ON circles;
DROP POLICY IF EXISTS "circle_members: leader read" ON circle_members;

-- Função SECURITY DEFINER para checar se usuário é membro de um círculo
-- (roda com permissões do owner, não do caller — quebra a recursão)
CREATE OR REPLACE FUNCTION is_circle_member(p_circle_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = p_user_id
  );
$$;

-- Função SECURITY DEFINER para checar se usuário é líder de um círculo
CREATE OR REPLACE FUNCTION is_circle_leader(p_circle_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circles
    WHERE id = p_circle_id AND leader_id = p_user_id
  );
$$;

-- Recriar policies usando as funções SECURITY DEFINER (sem recursão)
CREATE POLICY "circles: member read access"
  ON circles FOR SELECT
  USING (is_circle_member(id, auth.uid()));

CREATE POLICY "circle_members: leader read"
  ON circle_members FOR SELECT
  USING (is_circle_leader(circle_id, auth.uid()));
