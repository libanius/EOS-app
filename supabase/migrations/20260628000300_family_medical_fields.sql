-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Família: adicionar medical_notes e medications
-- Migration: 2026-06-28
-- ═══════════════════════════════════════════════════════════════════════════

-- medical_notes: descrição livre das condições médicas (texto)
-- medications:   lista de medicamentos específicos (array)

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS medical_notes  text,
  ADD COLUMN IF NOT EXISTS medications    text[]  NOT NULL DEFAULT '{}';

-- Comentários explicativos
COMMENT ON COLUMN family_members.medical_notes  IS 'Descrição livre das condições médicas do membro';
COMMENT ON COLUMN family_members.medications    IS 'Lista de medicamentos específicos em uso';
