-- D-043 — Hazard persistence (Fase 2, PREPARADO / a aplicar no SQL Editor).
-- O snapshot ao vivo funciona SEM estas tabelas (fetch on-demand + cache in-memory).
-- Elas habilitam histórico e automação de push por hazard. RLS: a localização
-- exata de um usuário NUNCA é legível publicamente.

-- 1. Eventos de hazard normalizados (auditoria/histórico; payload bruto por referência).
CREATE TABLE IF NOT EXISTS hazard_events (
  id                text        PRIMARY KEY,           -- HazardEvent.id (source:sourceEventId)
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
CREATE INDEX IF NOT EXISTS idx_hazard_events_updated ON hazard_events (updated_at DESC);
ALTER TABLE hazard_events ENABLE ROW LEVEL SECURITY;
-- Eventos oficiais são públicos para leitura autenticada; escrita só service-role.
CREATE POLICY "hazard_events: authenticated read"
  ON hazard_events FOR SELECT TO authenticated USING (true);

-- 2. Saúde dos providers (última medição por provider).
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
CREATE POLICY "provider_health: authenticated read"
  ON provider_health FOR SELECT TO authenticated USING (true);

-- 3. Assinaturas de hazard por localização (localização exata protegida por RLS).
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
CREATE POLICY "hazard_subscriptions: owner only"
  ON hazard_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Log de entrega de notificações (dedup + cooldown por evento).
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hazard_event_id text,
  channel       text        NOT NULL,      -- push | local
  status        text        NOT NULL,      -- sent | suppressed_quiet_hours | deduped | failed
  sent_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ndl_user_event ON notification_delivery_log (user_id, hazard_event_id);
ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_delivery_log: owner only"
  ON notification_delivery_log FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. Preferências de hazard por usuário (tipos, quiet hours, cooldown).
CREATE TABLE IF NOT EXISTS user_hazard_preferences (
  user_id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled_types       text[]      NOT NULL DEFAULT '{}',
  quiet_hours_start   smallint,   -- 0-23 local
  quiet_hours_end     smallint,
  allow_critical_override boolean NOT NULL DEFAULT true,
  cooldown_minutes    smallint    NOT NULL DEFAULT 30,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_hazard_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_hazard_preferences: owner only"
  ON user_hazard_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
