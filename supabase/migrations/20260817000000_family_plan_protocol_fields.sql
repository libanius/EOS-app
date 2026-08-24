-- D-208 / PLAN-T12 — Protocolos estruturados no plano familiar.
-- Apply in Supabase Dashboard -> SQL Editor.
-- Spec: docs/18-family-plans.md §9.1
--
-- O gatilho dizia QUANDO e escondia o COMO dentro de uma frase. Isso prende a
-- execução a inferência textual. Estes campos são opcionais e aditivos:
-- planos antigos continuam válidos, mas novos protocolos podem declarar a
-- intenção operacional, o destino e a rota.

ALTER TABLE family_plan_triggers
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS destination_kind text NULL,
  ADD COLUMN IF NOT EXISTS route_label text NULL,
  ADD COLUMN IF NOT EXISTS notify_circle boolean NOT NULL DEFAULT true;

ALTER TABLE family_plan_triggers
  DROP CONSTRAINT IF EXISTS family_plan_triggers_action_type_check,
  ADD CONSTRAINT family_plan_triggers_action_type_check
    CHECK (action_type IN ('meet', 'evacuate', 'shelter', 'communicate', 'wait', 'custom'));

ALTER TABLE family_plan_triggers
  DROP CONSTRAINT IF EXISTS family_plan_triggers_destination_kind_check,
  ADD CONSTRAINT family_plan_triggers_destination_kind_check
    CHECK (
      destination_kind IS NULL OR
      destination_kind IN ('rendezvous_1', 'rendezvous_2', 'rendezvous_3', 'home', 'school', 'work', 'custom')
    );

COMMENT ON COLUMN family_plan_triggers.action_type IS
  'D-208: intenção operacional do protocolo: meet, evacuate, shelter, communicate, wait ou custom.';
COMMENT ON COLUMN family_plan_triggers.destination_kind IS
  'D-208: ponto do plano que este protocolo pretende usar, quando aplicável.';
COMMENT ON COLUMN family_plan_triggers.route_label IS
  'D-208: rota desenhada preferida para este protocolo, quando aplicável.';
COMMENT ON COLUMN family_plan_triggers.notify_circle IS
  'D-208: se executar este protocolo deve alertar o círculo por padrão.';
