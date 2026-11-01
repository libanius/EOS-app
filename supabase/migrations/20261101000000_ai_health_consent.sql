-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — consentimento para a IA ler dado de saúde (STORE-T01 · D-231)
-- Migration: 2026-11-01
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Por que um instante, e não um booleano ────────────────────────────────
--
-- Consentimento é um ATO, com data. `null` = a pessoa nunca disse sim (ou
-- retirou); preenchido = quando disse. Um booleano `false` por padrão diria a
-- mesma coisa hoje e perderia o "quando" no dia em que alguém perguntar.
--
-- ── O que esta coluna governa ─────────────────────────────────────────────
--
-- Só o que vai PARA O PROMPT da OpenAI: tipo sanguíneo, alergias,
-- medicamentos, condições, notas médicas e mobilidade reduzida — desta pessoa
-- e dos dependentes sem conta de quem ela cuida. A ficha de emergência
-- (`/ficha/[id]`), o compartilhamento no círculo e o motor local não mudam.
--
-- ── Sem backfill, de propósito ────────────────────────────────────────────
--
-- Ninguém migra "consentido". Até cada pessoa ligar a chave em /mais, a IA não
-- lê a ficha médica dela.
--
-- ── Antes de aplicar ──────────────────────────────────────────────────────
--
-- Nenhuma RLS nova: `profiles` já permite a cada um atualizar a própria linha,
-- e a leitura do consentimento de OUTRA pessoa é feita pelo service-role no
-- servidor (`lib/ai-health-consent.ts`). Coluna nula não quebra nada: o
-- código trata ausência da coluna como "ninguém consentiu".

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_health_consent_at timestamptz;

COMMENT ON COLUMN profiles.ai_health_consent_at IS
  'D-231: quando a pessoa autorizou a IA (OpenAI) a ler seus dados de saúde e os dos dependentes sem conta de quem cuida. NULL = não autorizado.';
