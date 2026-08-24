-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Preparedness State, estágio 1 (parte 2): Kits + Requirements
-- Migration: 2026-08-13 · PREP-T05 · D-161 (spec: docs/37-preparedness-state.md)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ADITIVA. `checklists` continua intocada e continua sendo a verdade em
-- produção. Estas tabelas nascem vazias; um adaptador projeta as linhas antigas
-- (`lib/requirements.ts`).
--
-- ── O outro lado do par ────────────────────────────────────────────────────
--
--   Holding      o que EXISTE, num lugar        (PREP-T04, já aplicada)
--   Requirement  o que DEVERIA existir          ← aqui
--
-- Os dois se encontram por `resource_key`. Hoje esse encontro é feito por
-- expressão regular sobre o nome do item; nomear a chave nos dois lados é o que
-- torna a regex desnecessária (docs/37 §13.1).
--
-- ── O defeito que esta migração desfaz ─────────────────────────────────────
--
-- `checklists.kit_type` guarda DUAS dimensões diferentes na mesma coluna:
--
--   propósito     GERAL · BUG_OUT · ACAMPAMENTO · PESCA · CACA
--   procedência   EDU_CONTENT · PILOT_RECOMMENDATION · SIMULATION_DEBRIEF
--
-- E essa coluna faz parte da chave única `(profile_id, canonical_key, kit_type)`.
-- Consequência, por desenho e não por acidente: o MESMO item recomendado pelo
-- Pilot e pertencente à Bug Out vira DUAS linhas que nunca se fundem.
--
-- Aqui as duas viram colunas separadas, e **procedência fica fora da chave
-- natural** (D-155 §26.2): o mesmo item achado por duas fontes atualiza a
-- procedência, não cria uma segunda linha.

-- ---------------------------------------------------------------------------
-- 1. kits — conjuntos nomeados de requisitos
-- ---------------------------------------------------------------------------
--
-- Kit responde PARA QUAL CAPACIDADE; Location responde ONDE ESTÁ. São
-- dimensões independentes, e juntá-las reproduziria o defeito acima numa forma
-- nova (docs/37 §17).
--
-- SEM discriminador de propósito, por decisão do dono (D-157): Pesca, Caça e
-- Acampamento são Preparação, como Bug Out e Geral, como qualquer kit que o
-- usuário criar. O equipamento que sustenta um fim de semana de pesca é o mesmo
-- que sustenta três dias sem energia; separá-los criaria duas prontidões para o
-- mesmo cobertor.

CREATE TABLE IF NOT EXISTS public.kits (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Estável e legível: é o que o adaptador casa com o `kit_type` antigo.
  slug        text        NOT NULL CHECK (length(btrim(slug)) > 0),
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),
  icon        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kits IS
  'Conjunto nomeado de requisitos. Kit = para qual capacidade; Location = onde está. Todo kit é Preparação (D-157).';

CREATE UNIQUE INDEX IF NOT EXISTS kits_uniq_slug_per_profile
  ON public.kits (profile_id, slug);

-- ---------------------------------------------------------------------------
-- 2. requirements — o que deveria existir
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.requirements (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  resource_key  text          NOT NULL CHECK (length(btrim(resource_key)) > 0),
  label         text          NOT NULL CHECK (length(btrim(label)) > 0),
  quantity      numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit          text,

  -- Kit ao qual pertence. NULO = requisito de LINHA DE BASE da casa, que é
  -- exatamente o que os sete escalares de `resource_inventory` sempre foram.
  kit_id        uuid          REFERENCES public.kits(id) ON DELETE CASCADE,

  -- Cenário que o ativa (furacão, blecaute). NULO = vale sempre.
  scenario_id   uuid          REFERENCES public.scenarios(id) ON DELETE SET NULL,

  -- Onde este requisito precisa ser satisfeito. NULO = a casa.
  -- É o que permite "o kit do carro precisa de água NO CARRO" sem inventar
  -- sistema de reserva: a cobertura compara com holdings alcançáveis dali.
  location_scope_id uuid      REFERENCES public.locations(id) ON DELETE SET NULL,

  tier          text          NOT NULL DEFAULT 'ESSENTIAL'
                              CHECK (tier IN ('ESSENTIAL', 'MODERATE', 'EXCELLENT')),

  -- Ciclo de vida mínimo (docs/37 §19). Oito estados seriam software de
  -- compras; seis deles eram afordância de UI ou derivados.
  --   proposed        sugerido por Pilot/EDU/simulação/alerta, nada persistido como verdade
  --   needed          o usuário confirmou que precisa       ← só o usuário move
  --   met             um Holding cobre                      ← DERIVADO, nunca à mão
  --   not_applicable  descartado para esta família
  status        text          NOT NULL DEFAULT 'proposed'
                              CHECK (status IN ('proposed', 'needed', 'met', 'not_applicable')),

  -- POR QUE isto entrou no EOS. Coluna própria, separada do kit, e — ponto
  -- central desta migração — **fora da chave natural**.
  provenance    text          NOT NULL DEFAULT 'MANUAL'
                              CHECK (provenance IN ('MANUAL', 'PILOT', 'EDU', 'SIMULATION', 'OFFICIAL_ALERT', 'PLAN_GAP')),
  -- Id do artefato de origem: edu_content.id, id da simulação, trigger_key do alerta.
  provenance_ref text,

  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.requirements IS
  'O que DEVERIA existir. O que existe é `holdings`. Encontram-se por resource_key (docs/37 §13.1).';
COMMENT ON COLUMN public.requirements.kit_id IS
  'NULO = requisito de linha de base da casa — o que os 7 escalares de resource_inventory sempre foram.';
COMMENT ON COLUMN public.requirements.provenance IS
  'De onde veio a recomendação. Separada do kit e FORA da chave natural (D-155/D-161): duas fontes atualizam, não duplicam.';
COMMENT ON COLUMN public.requirements.status IS
  'met é DERIVADO da cobertura por holdings — não se marca prontidão, adquire-se coisas (docs/37 §19).';

-- ---------------------------------------------------------------------------
-- 3. Chave natural — e por que ela usa COALESCE
-- ---------------------------------------------------------------------------
--
-- A chave é `(profile_id, resource_key, kit_id, scenario_id)`.
--
-- No Postgres, NULL é distinto de NULL num índice único: sem tratamento, dois
-- requisitos de linha de base do MESMO recurso (ambos com kit_id NULO) seriam
-- aceitos como linhas diferentes — e voltaríamos a ter duplicata, que é
-- exatamente o que viemos consertar. `NULLS NOT DISTINCT` resolveria, mas é
-- PG15+; COALESCE com um sentinela funciona em qualquer versão e deixa a
-- intenção escrita.
--
-- `provenance` NÃO está aqui, e é o ponto inteiro desta migração.

CREATE UNIQUE INDEX IF NOT EXISTS requirements_natural_key
  ON public.requirements (
    profile_id,
    resource_key,
    COALESCE(kit_id,      '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS requirements_profile_idx  ON public.requirements (profile_id);
CREATE INDEX IF NOT EXISTS requirements_kit_idx      ON public.requirements (kit_id);
CREATE INDEX IF NOT EXISTS requirements_resource_idx ON public.requirements (profile_id, resource_key);
CREATE INDEX IF NOT EXISTS requirements_status_idx   ON public.requirements (profile_id, status);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.kits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kits: owner access" ON public.kits;
CREATE POLICY "kits: owner access"
  ON public.kits
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "requirements: owner access" ON public.requirements;
CREATE POLICY "requirements: owner access"
  ON public.requirements
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. updated_at
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS requirements_set_updated_at ON public.requirements;
CREATE TRIGGER requirements_set_updated_at
  BEFORE UPDATE ON public.requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.holdings_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO ESTÁ AQUI, e é intencional:
--
--   backfill de checklists     estágio 4 de docs/37 §28 — tarefa própria
--   motor de cobertura         PREP-T06
--   readiness_assessments      PREP-T09
--   qualquer escrita           nada nesta migração escreve uma linha
--
-- `checklists` continua intocada. O adaptador lê as duas formas e o app não
-- precisa saber qual está valendo.
-- ═══════════════════════════════════════════════════════════════════════════
