-- D-123 — a casa passa a existir no banco.
-- Apply in Supabase Dashboard -> SQL Editor.
--
-- O PROBLEMA QUE ISTO RESOLVE. A mesma pessoa vivia em três lugares que não se
-- falavam: `profiles` (a conta), `circle_members` (o círculo) e `family_members`
-- (uma lista digitada à mão). E **todos os cálculos do app liam a lista digitada
-- à mão**: água, comida, checklist, simulação, Pilot. Se o seu círculo tinha
-- cinco contas reais e você não redigitou ninguém, a conta de água dizia uma
-- pessoa. Era por isso que o app obrigava a cadastrar quem já estava lá.
--
-- O MODELO QUE PASSA A VALER:
--
--   Pessoa      = uma conta EOS (profiles)
--   Dependente  = quem não pode ter conta, SEMPRE ligado a um cuidador
--   Círculo     = quem você alcança e com quem troca informação
--   Casa        = membros do círculo que confirmaram morar juntos
--                 + os dependentes dessas pessoas
--
-- TRÊS EIXOS, TRÊS CONSENTIMENTOS. Estar no círculo, morar junto (entra na
-- conta de água) e ver a ficha médica são coisas diferentes. Antes estavam
-- colapsadas num campo só, e "promover a família íntima" dava acesso à ficha
-- médica de alguém como efeito colateral de uma decisão sobre logística.

-- ─── Morar junto ────────────────────────────────────────────────────────────

/*
 * Por que CONFIRMADO, e não uma marcação unilateral.
 *
 * Morar junto faz o inventário somar. Se eu pudesse marcar sozinho, eu marcaria
 * o vizinho e passaria a contar a água dele como se estivesse na minha casa —
 * o mesmo otimismo que torna um número de autonomia perigoso. A confirmação
 * repete o padrão que `family_access_status` já usa para a ficha médica.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'circle_members' AND column_name = 'household_status'
  ) THEN
    ALTER TABLE public.circle_members
      ADD COLUMN household_status text NOT NULL DEFAULT 'none',
      ADD COLUMN household_requested_by uuid,
      ADD COLUMN household_requested_at timestamptz,
      ADD COLUMN household_confirmed_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'circle_members_household_status_check'
      AND conrelid = 'public.circle_members'::regclass
  ) THEN
    ALTER TABLE public.circle_members
      ADD CONSTRAINT circle_members_household_status_check
      CHECK (household_status IN ('none', 'requested', 'confirmed'));
  END IF;
END $$;

-- A pergunta "quem mora nesta casa" é feita a cada cálculo do app. Sem índice,
-- ela varre a tabela inteira toda vez.
CREATE INDEX IF NOT EXISTS circle_members_household_idx
  ON public.circle_members (circle_id, household_status)
  WHERE household_status = 'confirmed';

/*
 * Uma pessoa mora em UMA casa.
 *
 * Sem esta trava, alguém em dois círculos podia ser marcado como "mora comigo"
 * nos dois — e o inventário dela entraria na conta das duas casas. Cada uma
 * mostraria autonomia que não existe, e as duas pareceriam certas.
 *
 * Mudar de casa continua possível: desmarca uma, marca a outra.
 */
CREATE UNIQUE INDEX IF NOT EXISTS circle_members_one_household_per_person
  ON public.circle_members (user_id)
  WHERE household_status = 'confirmed';

COMMENT ON COLUMN public.circle_members.household_status IS
  'D-123: mora na mesma casa. CONFIRMADO pelos dois lados, porque isto faz o inventário somar. Não tem relação com acesso à ficha médica — esse é o family_access_status.';

-- ─── Dependente ─────────────────────────────────────────────────────────────

/*
 * `family_members` deixa de ser "cadastro da família" e passa a ser DEPENDENTE:
 * quem não pode ter conta própria — um bebê, uma pessoa idosa sem celular.
 *
 * A relação com o cuidador é o dado, não um detalhe. Quem cuida de alguém conta
 * como "ela + 1" em toda a engine, e o plano precisa saber quem busca quem: um
 * dependente não se desloca sozinho por definição.
 *
 * `profile_id` já era, na prática, o cuidador. O que faltava era dizer isso e
 * poder descrever a pessoa.
 */
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS care_notes text;

COMMENT ON COLUMN public.family_members.profile_id IS
  'D-123: o CUIDADOR. Um dependente existe sempre ligado a uma conta responsável por ele.';
COMMENT ON COLUMN public.family_members.relationship IS
  'D-123: quem essa pessoa é para o cuidador — "mãe", "filho", "avó". Alimenta o plano: um dependente não se desloca sozinho.';
COMMENT ON COLUMN public.family_members.care_notes IS
  'D-123: o que quem for buscar essa pessoa precisa saber. NÃO é ficha médica — é instrução de resgate.';

-- ─── O que NÃO está aqui, de propósito ──────────────────────────────────────
--
-- As linhas de `family_members` que têm `linked_user_id` preenchido são
-- duplicatas: a mesma pessoa como registro digitado E como conta. Elas não são
-- apagadas por esta migration.
--
-- Apagar dado de família por script, sem a pessoa ver o que vai sumir, é o tipo
-- de decisão que não se toma no escuro. A limpeza acontece na tela, com o
-- usuário olhando: "estas 3 pessoas já têm conta no seu círculo — posso
-- remover o cadastro duplicado?".
