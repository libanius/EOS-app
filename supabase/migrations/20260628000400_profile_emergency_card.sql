-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — Ficha Pessoal: campos de emergência no perfil
-- Migration: 2026-06-28
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS blood_type              text,
  ADD COLUMN IF NOT EXISTS allergies               text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS medical_notes           text,
  ADD COLUMN IF NOT EXISTS medications             text[]  NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.blood_type              IS 'Tipo sanguíneo (A+, A-, B+, B-, AB+, AB-, O+, O-)';
COMMENT ON COLUMN profiles.allergies               IS 'Alergias conhecidas';
COMMENT ON COLUMN profiles.emergency_contact_name  IS 'Nome do contato de emergência';
COMMENT ON COLUMN profiles.emergency_contact_phone IS 'Telefone do contato de emergência';
COMMENT ON COLUMN profiles.medical_notes           IS 'Observações médicas pessoais';
COMMENT ON COLUMN profiles.medications             IS 'Medicamentos de uso contínuo';

-- Política RLS: dono lê e edita, página pública lê sem auth (para socorristas)
-- A página /ficha/[id] usa service role para leitura, sem expor dados sensíveis além da ficha
