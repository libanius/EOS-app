-- INVENTORY-001 / INV-T01 / D-236 — estoque único da casa.
-- Spec: specs/INVENTORY-001-estoque-unico.md §4.1; docs/06 (holdings, locations); docs/37 §15–§16.
-- Aditiva. Única mudança em linhas existentes: o backfill de agosto ganha origem BACKFILL. Idempotente.

-- 1. holdings ganha os campos de estoque
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS brand          text,
  ADD COLUMN IF NOT EXISTS model          text,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS expires_on     date,
  ADD COLUMN IF NOT EXISTS category       text,
  ADD COLUMN IF NOT EXISTS food_type      text,
  ADD COLUMN IF NOT EXISTS meals_override numeric,
  ADD COLUMN IF NOT EXISTS provenance     text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS provenance_ref text,
  ADD COLUMN IF NOT EXISTS created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.holdings DROP CONSTRAINT IF EXISTS holdings_meals_override_check;
ALTER TABLE public.holdings ADD CONSTRAINT holdings_meals_override_check
  CHECK (meals_override IS NULL OR meals_override >= 0);

ALTER TABLE public.holdings DROP CONSTRAINT IF EXISTS holdings_provenance_check;
ALTER TABLE public.holdings ADD CONSTRAINT holdings_provenance_check
  CHECK (provenance IN ('MANUAL', 'PILOT', 'EDU', 'SIMULATION', 'OFFICIAL_ALERT', 'PLAN_GAP', 'PROTOCOL', 'BACKFILL'));

ALTER TABLE public.holdings DROP CONSTRAINT IF EXISTS holdings_food_type_check;
ALTER TABLE public.holdings ADD CONSTRAINT holdings_food_type_check
  CHECK (food_type IS NULL OR food_type IN (
    'arroz', 'feijao', 'macarrao', 'aveia', 'farinha', 'acucar',
    'leite-po', 'castanhas', 'enlatado', 'pronta', 'outro'
  ));

-- As 17 linhas do backfill de agosto (PREP-T10c) ganham a origem verdadeira.
-- Só as que ainda estão com o padrão e não têm autor: rodar de novo não muda nada.
UPDATE public.holdings
   SET provenance = 'BACKFILL'
 WHERE provenance = 'MANUAL' AND created_by IS NULL AND created_at < '2026-11-08';

COMMENT ON COLUMN public.holdings.food_type IS
  'Só comida. Define as kcal/kg da estimativa de refeições (INVENTORY-001 §3.3).';
COMMENT ON COLUMN public.holdings.meals_override IS
  'Refeições digitadas à mão. Quando presente, vale no lugar da estimativa pelo peso.';
COMMENT ON COLUMN public.holdings.provenance IS
  'De onde o item veio. Mesmo enum de requirements.provenance, mais BACKFILL (linhas projetadas de resource_inventory em 2026-08-13).';

-- 2. Um item por linha. PREP-T04 criou "um recurso por lugar", que impede duas
--    mochilas na mesma garagem e dois rádios em casa (INVENTORY-001 E1, E22).
DROP INDEX IF EXISTS public.holdings_uniq_resource_per_location;

CREATE INDEX IF NOT EXISTS holdings_expires_idx
  ON public.holdings (expires_on) WHERE expires_on IS NOT NULL;

-- 3. Mochila: o lugar aponta para o item que ele é.
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS holding_id uuid REFERENCES public.holdings(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS locations_holding_uniq
  ON public.locations (holding_id) WHERE holding_id IS NOT NULL;

COMMENT ON COLUMN public.locations.holding_id IS
  'Quando o lugar é uma mochila (ou outro recipiente), o item que ele é. Mover o lugar move tudo dentro (INVENTORY-001 §3.2).';
