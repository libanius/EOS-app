-- SIGNAL-002-T01 / D-235 — requirements.provenance ganha PROTOCOL.
-- Spec: specs/SIGNAL-002-marcar-como-tenho.md §4.1; docs/37 §18.
-- Aditiva: nenhum valor existente muda. Idempotente.

ALTER TABLE public.requirements DROP CONSTRAINT IF EXISTS requirements_provenance_check;
ALTER TABLE public.requirements ADD CONSTRAINT requirements_provenance_check
  CHECK (provenance IN ('MANUAL', 'PILOT', 'EDU', 'SIMULATION', 'OFFICIAL_ALERT', 'PLAN_GAP', 'PROTOCOL'));

COMMENT ON COLUMN public.requirements.provenance IS
  'De onde veio a recomendação. Separada do kit e FORA da chave natural (D-155/D-161). PROTOCOL = item respondido na folha de um Sinal; provenance_ref = slug do Sinal (SIGNAL-002).';
