-- D-130 — endereço estruturado e convites que sobrevivem ao "agora não".
-- Apply in Supabase Dashboard -> SQL Editor.
--
-- DE ONDE ISTO VEM. O dono descreveu o fluxo: ao preencher o endereço completo
-- na ficha, o app pergunta quem mais mora ali. É um bom lugar para a pergunta —
-- endereço é onde a pessoa realmente pensa "minha casa", muito melhor que uma
-- tela de cadastro abstrata.
--
-- O que mudou na conversa antes de codar:
--
--   1. Endereço estruturado por PAÍS, não formato americano fixo: o app fala
--      pt-BR e en, e o campo de unidade resolve o caso do próprio dono — um
--      condomínio onde vários prédios dividem o mesmo número de rua.
--
--   2. O endereço NUNCA vira vínculo automático. Se casas fossem juntadas por
--      endereço igual, os vizinhos do dono entrariam na casa dele e as
--      despensas deles somariam na autonomia. O endereço dispara a pergunta; a
--      confirmação continua pessoa a pessoa (D-123).
--
--   3. Nome digitado não vira registro de pessoa. Vira convite, ou dependente
--      quando não há celular — as duas coisas que já existem. Um nome solto
--      seria um terceiro tipo, e foi justamente ele que o D-123 removeu.

-- ─── Endereço ───────────────────────────────────────────────────────────────

/*
 * Campos separados em vez de um texto só.
 *
 * `profiles.location` continua existindo e passa a guardar a forma legível
 * ("5851 Holmberg Rd, Unit 4124, Parkland, FL 33067") para quem já lê dali.
 * Os campos abaixo são a verdade estruturada, e é deles que sai a
 * geocodificação para `location_lat`/`location_lng`.
 *
 * `address_unit` não é detalhe: é o que distingue duas famílias que dividem o
 * mesmo número de rua.
 */
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address_country text,   -- ISO-3166 alpha-2
  ADD COLUMN IF NOT EXISTS address_line1   text,
  ADD COLUMN IF NOT EXISTS address_unit    text,
  ADD COLUMN IF NOT EXISTS address_city    text,
  ADD COLUMN IF NOT EXISTS address_region  text,   -- estado, província
  ADD COLUMN IF NOT EXISTS address_postal  text;

COMMENT ON COLUMN public.profiles.address_unit IS
  'D-130: apartamento/bloco. É o que separa duas famílias no mesmo número de rua — o caso do próprio dono.';
COMMENT ON COLUMN public.profiles.address_country IS
  'D-130: ISO-3166 alpha-2. O formato do endereço muda com ele; o app atende Brasil e Estados Unidos.';

-- ─── Convites que esperam ───────────────────────────────────────────────────

/*
 * Por que esta tabela existe.
 *
 * A pessoa lista quem mora na casa e, no fim, recebe a oferta de criar o
 * círculo — que é do plano Família. Se ela disser "agora não", os nomes que
 * acabou de digitar não podem simplesmente sumir: seria pedir o trabalho e
 * jogá-lo fora.
 *
 * Eles ficam aqui. Quando o círculo existir — hoje, semana que vem, ou quando
 * alguém a convidar — os convites já estão prontos e saem com um toque.
 *
 * SÓ ENTRA QUEM TEM CELULAR. Quem não tem vira dependente em `family_members`
 * na hora, com cuidador definido, porque para essa pessoa não há convite
 * possível — ela não vai abrir o app.
 */
CREATE TABLE IF NOT EXISTS public.household_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quem declarou que essa pessoa mora na casa dele.
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Como a pessoa foi nomeada. É um nome escrito por OUTRA pessoa, antes de
  -- qualquer consentimento — por isso a tabela é deny-all e some junto com a
  -- conta de quem escreveu.
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Preenchidos quando o convite finalmente sai.
  circle_id   uuid        REFERENCES public.circles(id) ON DELETE SET NULL,
  sent_at     timestamptz,
  status      text        NOT NULL DEFAULT 'pending'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'household_invites_status_check'
      AND conrelid = 'public.household_invites'::regclass
  ) THEN
    ALTER TABLE public.household_invites
      ADD CONSTRAINT household_invites_status_check
      CHECK (status IN ('pending', 'sent', 'dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS household_invites_owner_idx
  ON public.household_invites (owner_id, status);

/*
 * O mesmo nome não entra duas vezes.
 *
 * A pessoa vai voltar à ficha e editar o endereço mais de uma vez; sem isto,
 * cada visita duplicaria a lista de quem mora na casa.
 */
CREATE UNIQUE INDEX IF NOT EXISTS household_invites_owner_name_idx
  ON public.household_invites (owner_id, lower(trim(name)))
  WHERE status = 'pending';

ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.household_invites IS
  'D-130: nomes que a pessoa declarou morarem na casa dela, aguardando um círculo para virarem convite. Deny-all: é nome de terceiro escrito sem consentimento, e só o dono da linha (pelas rotas do EOS) o vê.';
