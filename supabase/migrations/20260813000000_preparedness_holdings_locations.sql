-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Preparedness State, estágio 1: Locations + Holdings
-- Migration: 2026-08-13 · PREP-T04 · D-160 (spec: docs/37-preparedness-state.md)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ADITIVA. Nada é alterado, nada é removido, nada é migrado.
-- `resource_inventory` e `checklists` continuam sendo a verdade em produção; as
-- duas tabelas abaixo nascem vazias e são lidas por um adaptador que projeta os
-- dados antigos. O cutover é um passo explícito e posterior (docs/37 §28).
--
-- ── Por que estas duas tabelas ─────────────────────────────────────────────
--
-- `resource_inventory` é UMA LINHA por perfil com sete escalares. Ela não sabe
-- representar um objeto, uma quantidade por objeto, nem um lugar. Por isso
-- "onde está minha água de reserva?" é hoje uma pergunta sem resposta possível,
-- e por isso a água de uma mochila acabava escrita no estoque da casa.
--
-- `holdings` responde O QUE EXISTE e ONDE. `locations` responde ONDE É.
-- O que DEVERIA existir (`requirements`) é PREP-T05 — de propósito: o par
-- Requirement↔Holding é o núcleo do modelo, e juntar os dois lados numa
-- migração só repetiria a confusão que estamos desfazendo.

-- ---------------------------------------------------------------------------
-- 1. locations — onde as coisas estão
-- ---------------------------------------------------------------------------
--
-- Árvore auto-referente: Casa → Garagem → Armário 1. Arbitrariamente profunda,
-- porque a casa de quem se prepara de verdade é assim, e porque uma segunda
-- tabela para "sub-localização" não compraria nada (docs/37 §13).
--
-- ON DELETE CASCADE no `parent_id`: apagar a Garagem apaga os armários dentro
-- dela. É o que a pessoa espera de um lugar que deixou de existir — e os
-- holdings pendurados nele caem junto, por CASCADE próprio mais abaixo.

CREATE TABLE IF NOT EXISTS public.locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id   uuid        REFERENCES public.locations(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (length(btrim(name)) > 0),

  -- HOME é o único com significado de negócio: a autonomia da casa lê os
  -- consumíveis que estão sob ele (D-156). Os outros são organização do
  -- usuário e não mudam nenhum cálculo.
  kind        text        NOT NULL DEFAULT 'HOME'
                          CHECK (kind IN (
                            'HOME', 'FARM', 'WAREHOUSE', 'OFFICE', 'VEHICLE',
                            'RV', 'BOAT', 'STORAGE_UNIT', 'SECOND_RESIDENCE', 'CUSTOM'
                          )),

  -- Marca a raiz criada pelo sistema. Existe para garantir UMA por perfil sem
  -- impedir que a pessoa crie outras casas depois.
  is_default  boolean     NOT NULL DEFAULT false,

  lat         double precision,
  lng         double precision,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.locations IS
  'Onde as coisas estão fisicamente. Árvore por parent_id. Dado do usuário — nunca navegação global (D-155).';
COMMENT ON COLUMN public.locations.kind IS
  'HOME é o único com efeito de cálculo: a autonomia da casa lê consumíveis sob HOME (D-156).';

-- Uma só Location padrão por perfil. Índice PARCIAL: a restrição vale para a
-- padrão e deixa a pessoa criar quantas outras quiser.
CREATE UNIQUE INDEX IF NOT EXISTS locations_one_default_per_profile
  ON public.locations (profile_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS locations_profile_idx ON public.locations (profile_id);
CREATE INDEX IF NOT EXISTS locations_parent_idx  ON public.locations (parent_id);

-- ---------------------------------------------------------------------------
-- 2. holdings — o que existe, e onde
-- ---------------------------------------------------------------------------
--
-- `resource_key` é o MESMO conceito que `checklists.canonical_key`, de
-- propósito: é a chave que liga "o que eu preciso" a "o que eu tenho". Hoje
-- essa ligação é feita por expressão regular sobre o nome do item; nomear a
-- chave é o que torna a regex desnecessária (docs/37 §13.1).
--
-- `kind` é o que impede dupla contagem física SEM sistema de reserva:
--
--   CONSUMABLE  quantidade, dentro de uma localização, contada UMA vez.
--               Beber a água acaba com ela para todos os kits.
--
--   DURABLE     presença. Um torniquete em casa atende Primeiros Socorros,
--               Bug Out e Furacão ao mesmo tempo — os três são executados de
--               casa. Não atende o kit do Veículo, porque não está no veículo.
--
-- A localização faz o trabalho que uma alocação faria (docs/37 §15.1).

CREATE TABLE IF NOT EXISTS public.holdings (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- ON DELETE CASCADE: uma coisa sem lugar não existe neste modelo. Se a
  -- pessoa apaga a Fazenda, o que estava lá some junto — e é honesto, porque
  -- manter holdings órfãos inflaria a prontidão com coisas sem paradeiro.
  location_id   uuid          NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,

  resource_key  text          NOT NULL CHECK (length(btrim(resource_key)) > 0),
  label         text          NOT NULL CHECK (length(btrim(label)) > 0),

  kind          text          NOT NULL DEFAULT 'CONSUMABLE'
                              CHECK (kind IN ('CONSUMABLE', 'DURABLE')),

  -- CONSUMABLE usa quantidade; DURABLE é presença e mantém 1.
  quantity      numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),

  -- A unidade é DADO, não convenção (D-158). Um galão de 5 é `5` + `gal`.
  -- É o que permite somar um garrafão de 5 gal com uma garrafa de 2 L sem que
  -- o número dependa de quem leu.
  unit          text,

  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.holdings IS
  'O que a família REALMENTE tem, e onde. O que ela deveria ter é `requirements` (PREP-T05).';
COMMENT ON COLUMN public.holdings.resource_key IS
  'Mesma identidade de checklists.canonical_key — é a chave que liga precisar a ter (docs/37 §13.1).';
COMMENT ON COLUMN public.holdings.kind IS
  'CONSUMABLE conta quantidade e é consumido; DURABLE é presença e serve vários kits alcançáveis daquele lugar (docs/37 §15.1).';
COMMENT ON COLUMN public.holdings.unit IS
  'Unidade é dado, não convenção (D-158). Água é exibida em galão; o legado resource_inventory.water_liters segue em litros.';

-- Um recurso, um lugar, uma linha. Duas garrafas de água na mesma prateleira
-- são uma linha com quantidade 2 — não duas linhas que ninguém consegue somar.
CREATE UNIQUE INDEX IF NOT EXISTS holdings_uniq_resource_per_location
  ON public.holdings (profile_id, location_id, resource_key);

CREATE INDEX IF NOT EXISTS holdings_profile_idx  ON public.holdings (profile_id);
CREATE INDEX IF NOT EXISTS holdings_location_idx ON public.holdings (location_id);
CREATE INDEX IF NOT EXISTS holdings_resource_idx ON public.holdings (profile_id, resource_key);

-- ---------------------------------------------------------------------------
-- 3. RLS — mesmo contrato de resource_inventory e checklists
-- ---------------------------------------------------------------------------
--
-- Um lugar é pelo menos tão sensível quanto uma quantidade: "tenho um gerador
-- e 200 galões na fazenda em tal ponto" é exatamente o que não pode vazar por
-- padrão. Compartilhamento com o círculo é decisão própria e posterior; até lá
-- só o dono lê e escreve (docs/37 §25).

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations: owner access" ON public.locations;
CREATE POLICY "locations: owner access"
  ON public.locations
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "holdings: owner access" ON public.holdings;
CREATE POLICY "holdings: owner access"
  ON public.holdings
  FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.holdings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS holdings_set_updated_at ON public.holdings;
CREATE TRIGGER holdings_set_updated_at
  BEFORE UPDATE ON public.holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.holdings_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO ESTÁ AQUI, e é intencional:
--
--   requirements / kits   PREP-T05 — o outro lado do par
--   backfill dos dados    estágio 4 de docs/37 §28, tarefa própria e reversível
--   cutover               estágio 5, decisão explícita
--   compartilhamento      holdings visíveis ao círculo: decisão própria
--
-- Enquanto o cutover não acontece, estas tabelas podem ficar vazias sem que
-- nada quebre: o adaptador (`lib/holdings.ts`) projeta o legado.
-- ═══════════════════════════════════════════════════════════════════════════
