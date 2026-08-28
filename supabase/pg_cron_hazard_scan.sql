-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — o agendador da varredura de hazard sai do GitHub e vem para o banco
-- Operacional (NÃO é migration) · 2026-08-28 · D-222
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Por que sair do GitHub Actions ────────────────────────────────────────
--
-- O `.github/workflows/hazard-scan.yml` pede `*/10 * * * *`. O que ele entrega,
-- medido em 87,7 h de histórico real da API do GitHub em 2026-08-28:
--
--   execuções esperadas: 526        execuções reais: 67      → 12,7%
--   intervalo mediano:   43 min     MAIOR buraco:    11,6 h
--   falhas:              0
--
-- Nenhuma falhou. Elas simplesmente não aconteceram: o GitHub estrangula
-- `schedule` em repositório gratuito, sem aviso e sem sinal de erro. Para um
-- motor de alerta, uma janela cega de 11,6 horas é o produto não existindo — e
-- do jeito mais cruel, porque o painel fica todo verde enquanto isso.
--
-- Há um segundo relógio contra o GitHub: ele DESATIVA workflows agendados após
-- 60 dias sem commit no repositório. O dia em que o projeto descansar dois
-- meses é o dia em que os alertas param, também em silêncio.
--
-- O pg_cron roda dentro do Postgres do Supabase, no plano que já se paga, e não
-- depende de mais nenhuma conta de terceiro.
--
-- ── Este arquivo NÃO é uma migration, de propósito ───────────────────────
--
-- Ele depende de um segredo específico deste ambiente e de extensões que se
-- ligam por projeto. Rodá-lo num banco local recém-criado agendaria chamadas
-- para a produção. Por isso mora fora de `supabase/migrations/`, como o
-- `match_knowledge.sql`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 1 — extensões (Dashboard → Database → Extensions, ou aqui)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 2 — o segredo vai para o Vault, NUNCA para o corpo do job
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `cron.job.command` é texto legível por qualquer um que alcance o banco. Um
-- `Bearer <CRON_SECRET>` escrito ali é o mesmo segredo que autoriza disparar a
-- varredura, e ele ficaria em claro numa tabela de catálogo, dentro de todo
-- backup e de todo dump. O Vault guarda cifrado e o job resolve na hora.
--
-- Troque <CRON_SECRET> pelo MESMO valor que está na Vercel. Rode uma vez:
--
--   SELECT vault.create_secret('<CRON_SECRET>', 'eos_cron_secret',
--                              'Autoriza /api/cron/hazard-scan (D-220/D-222)');
--
-- Para trocar depois:  SELECT vault.update_secret(
--                        (SELECT id FROM vault.secrets WHERE name='eos_cron_secret'),
--                        '<NOVO_VALOR>');

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 3 — agendar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Idempotente: desagenda antes, para que reexecutar este arquivo não crie um
-- segundo job com o mesmo propósito — dois jobs seriam duas varreduras
-- simultâneas competindo pelo índice de dedup.

SELECT cron.unschedule('eos-hazard-scan')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eos-hazard-scan');

SELECT cron.schedule(
  'eos-hazard-scan',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://eos-app-fawn.vercel.app/api/cron/hazard-scan',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'eos_cron_secret'
      )
    ),
    body    := '{}'::jsonb,
    -- A rota tem maxDuration=300. Cortar antes não cancela a varredura (o
    -- pg_net só desiste de LER a resposta), mas apagaria o único registro de
    -- que ela aconteceu. 120 s cobre com folga as passadas observadas (~2 s).
    timeout_milliseconds := 120000
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 4 — conferir
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O job existe e está ativo:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname='eos-hazard-scan';
--
-- As últimas execuções do AGENDADOR (disparou?):
--   SELECT status, return_message, start_time
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='eos-hazard-scan')
--    ORDER BY start_time DESC LIMIT 10;
--
-- As últimas respostas da ROTA (a Vercel respondeu o quê?). É esta que importa:
-- o pg_net é assíncrono, então o job pode marcar `succeeded` por ter apenas
-- ENFILEIRADO o pedido. 200 aqui é a prova real.
--   SELECT id, status_code, created FROM net._http_response ORDER BY created DESC LIMIT 10;
--
-- Desagendar:  SELECT cron.unschedule('eos-hazard-scan');
--
-- ═══════════════════════════════════════════════════════════════════════════
-- E o GitHub Actions?
-- ═══════════════════════════════════════════════════════════════════════════
--
-- FICA LIGADO por enquanto, de propósito. Desligar o único agendador que
-- funciona antes de o novo provar-se é como tirar o andaime antes da laje.
-- Rodar os dois é seguro **depois da D-222**: é exatamente para isso que o
-- índice de dedup existe, e ele voltou a arbitrar.
--
-- Quando `net._http_response` mostrar 10 min entre respostas por 24 h seguidas,
-- aí sim tire o bloco `schedule:` do `hazard-scan.yml` e deixe só o
-- `workflow_dispatch` como disparo manual. Está registrado como ALERT-T08.
-- ═══════════════════════════════════════════════════════════════════════════
