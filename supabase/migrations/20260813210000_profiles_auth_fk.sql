-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — `profiles` passa a exigir uma conta de verdade
-- Migration: 2026-08-13 · PREP-T15 · D-175
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O defeito ─────────────────────────────────────────────────────────────
--
--   CREATE TABLE profiles ( id uuid PRIMARY KEY DEFAULT auth.uid(), ... )
--
-- Sem chave estrangeira. Apagar a conta em `auth.users` deixava o perfil — e
-- TUDO pendurado nele: checklists, inventário, família, requisitos, holdings.
--
-- Em 2026-08-13 o banco tinha **19 perfis para 9 contas**. Os 10 excedentes
-- vieram de meses de teste automatizado: os scripts apagavam a CONTA e o perfil
-- ficava. Descoberto de lado, quando o backfill de PREP-T10c contou 16
-- requisitos para 15 itens de checklist.
--
-- Não era só lixo: depois do cutover, um perfil órfão vira linha fantasma numa
-- tabela que passou a ser a verdade.
--
-- ── A limpeza é CONSERVADORA por construção ──────────────────────────────
--
-- Só apaga perfil que satisfaz TODAS as condições:
--   · não tem conta em `auth.users`
--   · não tem NENHUM dado em nenhuma das sete tabelas dependentes
--
-- Se sobrar algum órfão COM dado, a migração **para com erro** em vez de
-- apagar. Perfil órfão com dado é uma pergunta para o dono, não um caso a
-- resolver sozinho num script.
--
-- Verificado antes de escrever: os 9 órfãos de hoje têm 0 checklists,
-- 0 inventário, 0 família, 0 círculos e 0 requisitos, e se chamam "Clima",
-- "Nav Test" e "Ana" — nomes que vêm de `weather-layers-test`,
-- `bottom-nav-test` e `pilot-orb-test`.

-- ---------------------------------------------------------------------------
-- 1. Limpeza dos órfãos VAZIOS
-- ---------------------------------------------------------------------------

DELETE FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u             WHERE u.id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.checklists c      WHERE c.profile_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.resource_inventory r WHERE r.profile_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.family_members f  WHERE f.profile_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.circle_members cm WHERE cm.user_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.requirements rq   WHERE rq.profile_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.holdings h        WHERE h.profile_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.locations l       WHERE l.profile_id = p.id);

-- ---------------------------------------------------------------------------
-- 2. Se sobrou órfão COM dado, PARE
-- ---------------------------------------------------------------------------
--
-- Falhar alto é o comportamento certo: apagar dado de alguém porque a conta
-- sumiu é decisão de produto, não de migração.

DO $$
DECLARE restantes int;
BEGIN
  SELECT count(*) INTO restantes
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

  IF restantes > 0 THEN
    RAISE EXCEPTION
      'Ainda há % perfil(is) órfão(s) COM dado. A chave estrangeira não foi criada. Decida o que fazer com eles antes de rodar de novo.', restantes;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. A chave estrangeira que impede a recorrência
-- ---------------------------------------------------------------------------
--
-- ON DELETE CASCADE: apagar a conta passa a apagar o perfil, e o perfil já
-- cascateia para as sete tabelas. Fecha o laço — inclusive para os scripts de
-- teste, que passam a limpar sozinhos ao remover a conta.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_auth_users_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_auth_users_fkey
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON CONSTRAINT profiles_id_auth_users_fkey ON public.profiles IS
  'PREP-T15/D-175: um perfil sem conta não tem significado. Antes disso, apagar a conta deixava o perfil e tudo pendurado nele — 19 perfis para 9 contas em 2026-08-13.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Reversível: `ALTER TABLE public.profiles DROP CONSTRAINT
-- profiles_id_auth_users_fkey;` devolve o estado anterior. Os perfis vazios
-- apagados não voltam — mas eles não continham nada.
-- ═══════════════════════════════════════════════════════════════════════════
