-- D-118 — limite de uso distribuído e registro de erro de produção.
-- Apply in Supabase Dashboard -> SQL Editor.
--
-- DOIS BURACOS QUE O LEVANTAMENTO DO ROTEIRO ACHOU:
--
-- 1. `/api/pilot/chat` — o endpoint mais caro do produto (gpt-4.1 + embedding +
--    tradução + RAG) — não tinha limite NENHUM. O limitador que existe cai para
--    um Map em memória quando o Upstash não está configurado, e em serverless
--    cada instância tem o próprio contador: na prática, nenhum. Cadastro é
--    aberto; uma conta podia queimar a conta da OpenAI do dono.
--
-- 2. Erro em produção era invisível: o Sentry está no código mas sem DSN. Foi
--    assim que o push ficou meses quebrado sem ninguém saber.
--
-- Nenhum dos dois precisa de fornecedor novo: o Postgres que já paga a conta
-- resolve os dois, e resolve DISTRIBUÍDO — que é o ponto.

-- ─── Limite de uso ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  -- Quem está sendo limitado + qual recurso. Ex.: 'pilot:<user_id>'.
  key          text        NOT NULL,
  -- Início da janela, truncado. Duas requisições na mesma janela somam na mesma
  -- linha; a janela seguinte cria outra.
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

/*
 * Consome uma unidade e devolve quanto sobrou.
 *
 * A atomicidade é o ponto inteiro: ler-e-depois-escrever deixa duas requisições
 * simultâneas lerem 9 e passarem as duas. O `INSERT ... ON CONFLICT DO UPDATE`
 * com `RETURNING` resolve numa única declaração, sob o lock da linha.
 */
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key      text,
  p_window   integer,   -- tamanho da janela, em segundos
  p_limit    integer
)
RETURNS TABLE (allowed boolean, used integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_count integer;
BEGIN
  -- Janela fixa alinhada ao relógio: previsível de explicar ao usuário
  -- ("tente de novo em X s") e barata de indexar.
  v_start := to_timestamp(floor(extract(epoch FROM now()) / p_window) * p_window);

  INSERT INTO public.rate_limit_buckets (key, window_start, count)
  VALUES (p_key, v_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limit_buckets.count + 1
  RETURNING public.rate_limit_buckets.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_start + make_interval(secs => p_window);
END;
$$;

-- Janelas velhas não servem para nada e a tabela cresceria para sempre.
CREATE INDEX IF NOT EXISTS rate_limit_buckets_window_idx
  ON public.rate_limit_buckets (window_start);

CREATE OR REPLACE FUNCTION public.prune_rate_limit_buckets()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH removidos AS (
    DELETE FROM public.rate_limit_buckets
    WHERE window_start < now() - interval '2 days'
    RETURNING 1
  )
  SELECT count(*)::integer FROM removidos;
$$;

-- ─── Registro de erro ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.error_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Onde aconteceu. Ex.: 'api/pilot/chat'.
  scope      text        NOT NULL,
  message    text        NOT NULL,
  stack      text,
  -- Quem estava usando, quando dá para saber. Nunca guarda o conteúdo da
  -- conversa nem a ficha médica: o que se quer é achar o defeito, não ler a
  -- vida de ninguém.
  user_id    uuid,
  context    jsonb
);

CREATE INDEX IF NOT EXISTS error_log_created_idx ON public.error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS error_log_scope_idx ON public.error_log (scope, created_at DESC);

-- Deny-all nas duas: só o cliente service-role escreve e lê, pelas rotas do
-- EOS. Um log de erro exposto conta a atacante onde o app quebra.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

COMMENT ON FUNCTION public.consume_rate_limit IS
  'D-118: incremento ATÔMICO. Ler-e-depois-escrever deixaria duas requisições simultâneas passarem juntas.';
COMMENT ON TABLE public.error_log IS
  'D-118: erro de produção deixa de ser invisível enquanto não há DSN do Sentry.';
