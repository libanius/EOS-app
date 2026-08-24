-- D-066 / PLAN-T02 — Gatilhos do plano de voo familiar.
-- Apply in Supabase Dashboard -> SQL Editor.
-- Spec: docs/18-family-plans.md §3
--
-- Um plano diz PARA ONDE ir e QUEM busca quem. O gatilho diz QUANDO — e sem ele
-- o plano depende de alguém decidir, no pior momento possível, que "agora é a
-- hora". A condição precisa estar combinada antes, em linguagem que uma criança
-- de doze anos executa sem interpretar: "sem contato por 2 horas", "ordem de
-- evacuação no rádio", "água na rua da frente".
--
-- Tabela separada, e não um campo de texto no plano, porque cada gatilho é
-- reordenável, tem uma ação associada e vai precisar existir sozinho quando o
-- Pilot passar a propor gatilhos (doc 18 §9).

CREATE TABLE IF NOT EXISTS family_plan_triggers (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid    NOT NULL REFERENCES family_plans(id) ON DELETE CASCADE,
  -- A condição observável. Nunca inferida pelo app: quem decide é a família.
  condition  text    NOT NULL,
  -- O que fazer quando ela acontecer. Normalmente aponta um ponto de encontro.
  action     text    NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS family_plan_triggers_plan_idx ON family_plan_triggers (plan_id);

-- Deny-all, como as demais tabelas do plano: toda leitura e escrita passa por
-- /api/plans, que confere a participação no círculo com o cliente service-role.
-- Endpoints públicos de ficha NUNCA tocam estas tabelas (doc 18 §8).
ALTER TABLE family_plan_triggers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE family_plan_triggers IS
  'doc 18 §3: quando executar o plano. Sem gatilho combinado, alguém precisa decidir no pior momento.';
