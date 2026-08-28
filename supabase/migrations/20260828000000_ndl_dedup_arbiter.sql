-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — o índice de dedup volta a ser um árbitro válido de ON CONFLICT
-- Migration: 2026-08-28 · ALERT follow-up · D-222
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O defeito ─────────────────────────────────────────────────────────────
--
-- A `20260824000000_hazard_alerting.sql` criou a trava de duplicidade assim:
--
--   CREATE UNIQUE INDEX uq_ndl_user_dedup
--     ON notification_delivery_log (user_id, dedup_key) WHERE dedup_key IS NOT NULL;
--
-- Um índice **parcial**. O Postgres só aceita um índice parcial como árbitro de
-- `ON CONFLICT` se a instrução repetir o predicado do índice
-- (`ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL`), e o
-- parâmetro `on_conflict` do PostgREST — que é o que o supabase-js emite — NÃO
-- emite predicado nenhum.
--
-- Resultado, medido em produção em 2026-08-28 com controle negativo:
--
--   upsert exato do código  → HTTP 400  42P10
--       "there is no unique or exclusion constraint matching the ON CONFLICT
--        specification"
--   insert simples          → HTTP 201
--
-- ── Por que isso é grave, e não cosmético ────────────────────────────────
--
-- `lib/hazards/scan.ts` não checava o retorno do upsert, então TODA escrita no
-- log de entrega falhava calada. A varredura de 2026-08-28 16:48 UTC relatou
-- `pushed: 1` com a tabela em 0 linhas. E o log de entrega não é telemetria —
-- é o mecanismo:
--
--   · `seen` (dedup) lê essa tabela  → vivia vazio  → a MESMA transição podia
--     ser empurrada para a tela de bloqueio em toda passada, para sempre;
--   · `lastSentAt` (cooldown 30 min) lê essa tabela → vivia 0 → o cooldown
--     nunca se aplicava;
--   · toda supressão é gravada aqui com o motivo → "por que eu não fui
--     avisado?" não tinha resposta.
--
-- Ou seja: a proteção que a D-220 descreve como o diferencial sobre o
-- concorrente ("entregou 'Lala rebaixada' DUAS VEZES, em dias diferentes")
-- estava inerte desde o primeiro minuto em produção.
--
-- ── A correção ────────────────────────────────────────────────────────────
--
-- Tirar o `WHERE`. O índice total é um árbitro válido, e o comportamento para
-- `dedup_key IS NULL` não muda: no Postgres, `NULL` nunca é igual a `NULL`, e
-- por padrão (`NULLS DISTINCT`) um índice único aceita quantas linhas com NULL
-- forem precisas. O predicado não estava comprando nada — só quebrando o
-- árbitro.

DROP INDEX IF EXISTS uq_ndl_user_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ndl_user_dedup
  ON notification_delivery_log (user_id, dedup_key);

COMMENT ON INDEX uq_ndl_user_dedup IS
  'D-222: total, NUNCA parcial. Um índice parcial não pode arbitrar ON CONFLICT sem repetir o predicado, e o on_conflict do PostgREST não repete — o que fazia toda escrita do log de entrega falhar com 42P10, desligando dedup e cooldown. NULLS DISTINCT continua permitindo N linhas com dedup_key nulo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Regressão: `npm run test:hazard-dedup` reproduz o 42P10 contra o banco real
-- com controle negativo. Rodar depois de aplicar — tem que passar de falhar
-- para passar.
-- ═══════════════════════════════════════════════════════════════════════════
