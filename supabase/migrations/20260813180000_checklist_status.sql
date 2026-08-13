-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Ciclo de vida do requisito: coluna `status`
-- Migration: 2026-08-13 · PREP-T10 fase 1 · D-171 (spec: docs/37 §19)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ADITIVA. `acquired` continua existindo e continua sendo mantida. Nada é
-- migrado, nada é removido, e todo código que lê o booleano continua correto.
--
-- ── Por que quatro estados, e não oito ────────────────────────────────────
--
-- `docs/37` §19 rejeitou o ciclo de oito estados como software de compras: seis
-- deles eram afordância de interface ou derivados. Ficam quatro:
--
--   proposed        sugerido por Pilot/EDU/simulação/alerta; nada é verdade ainda
--   needed          o usuário confirmou que precisa       ← só o usuário move
--   met             existe cobertura                       ← DERIVADO, no destino
--   not_applicable  descartado para esta família
--
-- ── O que esta fase NÃO faz, e por quê ────────────────────────────────────
--
-- `met` continua vindo do usuário, e não da cobertura por holdings. O destino é
-- derivá-lo (`docs/37` §19: "não se marca prontidão, adquire-se coisas"), mas
-- `holdings` ainda está vazia: derivar agora faria a caixinha parar de
-- funcionar, porque nada cobriria nada. A interface não pode prometer o que o
-- domínio ainda não sustenta — vira PREP-T10c, depois do backfill.
--
-- ── O que esta fase ENTREGA ───────────────────────────────────────────────
--
-- `not_applicable`. Hoje, quem não precisa de um item só pode APAGÁ-LO — e a
-- próxima geração de checklist o traz de volta. "Não se aplica" é uma decisão
-- da família sobre a própria casa, e o app precisa lembrar dela.

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS status text;

-- Deriva do que já existe. `acquired` é a única verdade hoje; o estado nasce
-- coerente com ela e nenhuma linha fica sem valor.
UPDATE public.checklists
   SET status = CASE WHEN acquired THEN 'met' ELSE 'needed' END
 WHERE status IS NULL;

ALTER TABLE public.checklists
  ALTER COLUMN status SET DEFAULT 'needed';

-- NOT NULL só depois do UPDATE: a ordem inversa recusaria as linhas existentes.
ALTER TABLE public.checklists
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checklists_status_check'
  ) THEN
    ALTER TABLE public.checklists
      ADD CONSTRAINT checklists_status_check
      CHECK (status IN ('proposed', 'needed', 'met', 'not_applicable'));
  END IF;
END $$;

COMMENT ON COLUMN public.checklists.status IS
  'Ciclo de vida do requisito (docs/37 §19). `met` ainda é marcado pelo usuário; passa a ser derivado da cobertura em PREP-T10c. `acquired` segue mantida em paralelo até o cutover.';

-- Consultar "o que falta" e "o que não se aplica" é o acesso mais frequente.
CREATE INDEX IF NOT EXISTS checklists_status_idx
  ON public.checklists (profile_id, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO ESTÁ AQUI, e é intencional:
--
--   remoção de `acquired`      só depois do cutover (estágio 6)
--   escrita dupla              PREP-T10b
--   backfill para requirements PREP-T10c, com simulação a seco antes
--   `met` derivado de holdings PREP-T10c
--
-- Nada nesta migração é irreversível: a coluna pode ser derrubada sem perda,
-- porque `acquired` continua sendo a fonte.
-- ═══════════════════════════════════════════════════════════════════════════
