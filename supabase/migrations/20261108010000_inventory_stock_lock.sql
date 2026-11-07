-- INVENTORY-001 / INV-T02 — escrita serializada no estoque (achado P1 do Codex no PR #18).
-- Spec: specs/INVENTORY-001-estoque-unico.md §4.2 (E25). Aditiva e idempotente.
--
-- Duas escritas ao mesmo tempo na mesma conta (toque duplo; duas pessoas da casa)
-- liam o mesmo estoque e podiam criar dois itens "estoque informado": pedir 40 L
-- e 50 L gravava 90 L. Duas defesas:
--   1. trava por conta, com validade curta, tomada pelo servidor antes de ler e
--      solta depois de recalcular;
--   2. no máximo UM item informado (BACKFILL) por conta e recurso.

CREATE TABLE IF NOT EXISTS public.stock_locks (
  profile_id   uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token        uuid        NOT NULL,
  locked_until timestamptz NOT NULL
);

COMMENT ON TABLE public.stock_locks IS
  'Trava curta de escrita no estoque, por conta (INVENTORY-001). Só o servidor usa, pelas funções abaixo.';

-- RLS ligada e sem política: ninguém além do service role enxerga ou escreve.
ALTER TABLE public.stock_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_locks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.acquire_stock_lock(p_keys uuid[], p_token uuid, p_ttl_ms integer DEFAULT 15000)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  -- Trava vencida não segura ninguém (a requisição que a tomou morreu).
  DELETE FROM public.stock_locks WHERE profile_id = ANY (p_keys) AND locked_until < now();

  INSERT INTO public.stock_locks (profile_id, token, locked_until)
  SELECT k, p_token, now() + make_interval(secs => p_ttl_ms / 1000.0)
    FROM unnest(p_keys) AS k
  ON CONFLICT (profile_id) DO NOTHING;

  SELECT count(*) INTO n FROM public.stock_locks WHERE profile_id = ANY (p_keys) AND token = p_token;
  IF n < cardinality(p_keys) THEN
    -- Tudo ou nada: sem a trava de todas as contas, solta as que pegou.
    DELETE FROM public.stock_locks WHERE token = p_token;
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stock_lock(p_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.stock_locks WHERE token = p_token;
$$;

-- D-234: SECURITY DEFINER só para o service role.
REVOKE ALL ON FUNCTION public.acquire_stock_lock(uuid[], uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_stock_lock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_stock_lock(uuid[], uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stock_lock(uuid) TO service_role;

-- 2. No máximo um "estoque informado" por conta e recurso.
CREATE UNIQUE INDEX IF NOT EXISTS holdings_one_informed_per_resource
  ON public.holdings (profile_id, resource_key) WHERE provenance = 'BACKFILL';
