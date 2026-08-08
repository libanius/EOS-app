-- "Quem busca quem" precisa dos dois (D-135 fase 3)
--
-- `family_plan_roles` só tinha `member_user_id` — uma CONTA. Quem é buscado
-- normalmente não tem conta: é a criança, é a avó, é justamente quem não sai
-- sozinho. A seção da tela se chama "Quem busca quem" e só sabia dizer quem.
--
-- Na prática a família escrevia "buscar a Avó Ana" no texto livre da
-- responsabilidade. Isso funciona para um humano lendo e falha para tudo mais:
-- o Pilot não consegue raciocinar sobre um nome dentro de uma frase, a
-- verificação de lacunas não sabe se alguém ficou sem responsável, e o dia em
-- que o nome for corrigido no cadastro o plano continua com o nome velho.
--
-- `for_member_id` aponta para a pessoa buscada. Fica NULO quando o papel não é
-- sobre buscar ninguém ("levar o rádio", "fechar o gás") — a maioria dos papéis
-- é assim, e exigir um alvo transformaria cada um deles numa pergunta sem
-- resposta.
--
-- ON DELETE SET NULL, e não CASCADE: se a pessoa buscada sai do cadastro, o
-- papel não pode sumir junto. Um plano que perde uma linha sozinho é um plano
-- em que a família confia e que não está mais lá.

ALTER TABLE public.family_plan_roles
  ADD COLUMN IF NOT EXISTS for_member_id uuid
    REFERENCES public.family_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.family_plan_roles.for_member_id IS
  'Quem é buscado/cuidado neste papel — um dependente sem conta. NULO quando o papel não é sobre uma pessoa (D-135).';

CREATE INDEX IF NOT EXISTS family_plan_roles_for_member_idx
  ON public.family_plan_roles (for_member_id)
  WHERE for_member_id IS NOT NULL;
