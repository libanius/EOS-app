-- ═══════════════════════════════════════════════════════════════════════════
-- D-074 — Alertas automáticos por hazard (varredura agendada + transições)
--
-- Este script é IDEMPOTENTE e AUTOSSUFICIENTE. Pode ser colado no SQL Editor
-- do Supabase quantas vezes for preciso, e funciona tanto se a migration
-- 20260710010000_hazard_tables.sql já foi aplicada quanto se nunca foi.
-- (Por isso todo CREATE POLICY vem precedido de DROP POLICY IF EXISTS: em
-- Postgres, CREATE POLICY não aceita IF NOT EXISTS.)
--
-- O que ele habilita: guardar o estado ANTERIOR de cada evento, para que o EOS
-- consiga dizer "foi elevado a Tempestade Tropical" em vez de apenas "existe
-- uma Tempestade Tropical". Sem estado anterior não existe alerta de mudança.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Eventos de hazard normalizados ──────────────────────────────────────
-- Uma linha por evento (id = "fonte:id_da_fonte"). O scan sobrescreve a linha
-- DEPOIS de comparar com o que estava lá — a linha antiga é a memória.
CREATE TABLE IF NOT EXISTS hazard_events (
  id                text        PRIMARY KEY,
  source            text        NOT NULL,
  authority         text        NOT NULL,
  visual_class      text        NOT NULL,
  hazard_type       text        NOT NULL,
  event_type        text        NOT NULL,
  title             text        NOT NULL,
  summary           text,
  severity          text        NOT NULL,
  urgency           text,
  certainty         text,
  confidence        text,
  lat               float8,
  lng               float8,
  distance_miles    float8,
  starts_at         timestamptz,
  ends_at           timestamptz,
  detected_at       timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL,
  expires_at        timestamptz,
  official_url      text,
  raw_ref           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Colunas novas desta fase (aditivas — seguras sobre a tabela já existente).
-- metrics: números estruturados que a comparação usa (vento, categoria, AQI…).
--          Ficam em jsonb porque cada fonte traz um conjunto diferente, e um
--          alerta que diz "ventos de 46 mph" precisa do número, não do texto.
ALTER TABLE hazard_events ADD COLUMN IF NOT EXISTS metrics      jsonb;
ALTER TABLE hazard_events ADD COLUMN IF NOT EXISTS scan_key     text;
ALTER TABLE hazard_events ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hazard_events_updated   ON hazard_events (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hazard_events_scan_key  ON hazard_events (scan_key);
CREATE INDEX IF NOT EXISTS idx_hazard_events_last_seen ON hazard_events (last_seen_at DESC);

ALTER TABLE hazard_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hazard_events: authenticated read" ON hazard_events;
CREATE POLICY "hazard_events: authenticated read"
  ON hazard_events FOR SELECT TO authenticated USING (true);

-- ─── 2. Saúde dos providers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_health (
  provider              text        PRIMARY KEY,
  status                text        NOT NULL,
  last_attempt_at       timestamptz,
  last_success_at       timestamptz,
  latency_ms            integer,
  data_age_seconds      integer,
  consecutive_failures  integer     NOT NULL DEFAULT 0,
  fallback_provider     text,
  message               text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE provider_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_health: authenticated read" ON provider_health;
CREATE POLICY "provider_health: authenticated read"
  ON provider_health FOR SELECT TO authenticated USING (true);

-- ─── 3. Assinaturas de hazard por localização ───────────────────────────────
-- Um lugar que a família quer vigiar mesmo sem estar lá (a casa dos avós, a
-- escola). A varredura também cobre a última localização conhecida do perfil.
CREATE TABLE IF NOT EXISTS hazard_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         text,
  lat           float8      NOT NULL,
  lng           float8      NOT NULL,
  radius_miles  float8      NOT NULL DEFAULT 25,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hazard_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hazard_subscriptions: owner only" ON hazard_subscriptions;
CREATE POLICY "hazard_subscriptions: owner only"
  ON hazard_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── 4. Transições detectadas (o que vira notificação) ──────────────────────
-- Auditoria de "o que mudou". Guardada mesmo quando ninguém é notificado —
-- é o histórico que permite responder "por que eu não fui avisado?".
CREATE TABLE IF NOT EXISTS hazard_transitions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_event_id   text        NOT NULL,
  kind              text        NOT NULL,   -- formed | issued | detected | upgraded | downgraded | cleared
  hazard_type       text        NOT NULL,
  severity          text        NOT NULL,
  from_state        text,                   -- ex.: "Tropical Depression"
  to_state          text,                   -- ex.: "Tropical Storm"
  from_metrics      jsonb,
  to_metrics        jsonb,
  title             text        NOT NULL,
  scan_key          text,
  detected_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hazard_transitions_detected
  ON hazard_transitions (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_hazard_transitions_event
  ON hazard_transitions (hazard_event_id, detected_at DESC);
ALTER TABLE hazard_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hazard_transitions: authenticated read" ON hazard_transitions;
CREATE POLICY "hazard_transitions: authenticated read"
  ON hazard_transitions FOR SELECT TO authenticated USING (true);

-- ─── 5. Log de entrega (dedup + cooldown) ───────────────────────────────────
-- O concorrente entregou "Lala rebaixada para Categoria 1" DUAS VEZES, em dias
-- diferentes. dedup_key é o que impede isso: a mesma transição, para o mesmo
-- usuário, entra uma vez só.
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hazard_event_id text,
  channel         text        NOT NULL,     -- push | local
  status          text        NOT NULL,     -- sent | suppressed_quiet_hours | suppressed_cooldown | deduped | failed | not_relevant | no_subscription | plan_gated
  sent_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_delivery_log ADD COLUMN IF NOT EXISTS transition_id uuid;
ALTER TABLE notification_delivery_log ADD COLUMN IF NOT EXISTS dedup_key     text;
ALTER TABLE notification_delivery_log ADD COLUMN IF NOT EXISTS detail        text;

CREATE INDEX IF NOT EXISTS idx_ndl_user_event ON notification_delivery_log (user_id, hazard_event_id);
CREATE INDEX IF NOT EXISTS idx_ndl_user_sent  ON notification_delivery_log (user_id, sent_at DESC);
-- A trava de duplicidade de verdade: um mesmo dedup_key nunca entrega 2x.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ndl_user_dedup
  ON notification_delivery_log (user_id, dedup_key) WHERE dedup_key IS NOT NULL;

ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_delivery_log: owner only" ON notification_delivery_log;
CREATE POLICY "notification_delivery_log: owner only"
  ON notification_delivery_log FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── 6. Preferências por usuário ────────────────────────────────────────────
-- enabled_types vazio = todos os tipos padrão ligados (ver lib/hazards/alerting.ts).
-- basin_wide_tropical: receber "tempestade se formou" em qualquer lugar da bacia,
-- e não só quando ela pode te alcançar. Desligado por padrão — é barulho para a
-- maioria das famílias, e o EOS não notifica sobre o que não te afeta.
CREATE TABLE IF NOT EXISTS user_hazard_preferences (
  user_id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled_types           text[]      NOT NULL DEFAULT '{}',
  quiet_hours_start       smallint,
  quiet_hours_end         smallint,
  allow_critical_override boolean     NOT NULL DEFAULT true,
  cooldown_minutes        smallint    NOT NULL DEFAULT 30,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_hazard_preferences
  ADD COLUMN IF NOT EXISTS basin_wide_tropical boolean NOT NULL DEFAULT false;
ALTER TABLE user_hazard_preferences
  ADD COLUMN IF NOT EXISTS push_enabled        boolean NOT NULL DEFAULT true;

ALTER TABLE user_hazard_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_hazard_preferences: owner only" ON user_hazard_preferences;
CREATE POLICY "user_hazard_preferences: owner only"
  ON user_hazard_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- OPCIONAL — agendar a varredura DENTRO do Supabase (pg_cron), custo zero.
--
-- Alternativa ao Vercel Cron (que no plano Hobby só roda 1x/dia). Descomente,
-- troque <SEU-DOMINIO> e <CRON_SECRET> pelo valor real da env, e execute.
-- Rode isto DEPOIS de o deploy com a rota /api/cron/hazard-scan estar no ar.
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
--   SELECT cron.schedule(
--     'eos-hazard-scan',
--     '*/10 * * * *',
--     $$
--     SELECT net.http_post(
--       url     := 'https://<SEU-DOMINIO>/api/cron/hazard-scan',
--       headers := '{"Content-Type":"application/json","Authorization":"Bearer <CRON_SECRET>"}'::jsonb,
--       body    := '{}'::jsonb,
--       timeout_milliseconds := 60000
--     );
--     $$
--   );
--
-- Para conferir:   SELECT * FROM cron.job;
-- Para desagendar: SELECT cron.unschedule('eos-hazard-scan');
-- ═══════════════════════════════════════════════════════════════════════════
