-- D-112 / COMMS-T07 — o link de convite carrega a intenção de Família íntima.
-- Apply in Supabase Dashboard -> SQL Editor.
--
-- Convidar alguém hoje exige duas conversas: entrar no círculo (código de 6
-- letras, digitado à mão) e, depois de aprovado, um segundo convite para a
-- Família íntima. Um link resolve a primeira; esta coluna carrega a segunda
-- através da aprovação, para quem convida não precisar lembrar de repetir o
-- gesto dias depois.
--
-- O QUE ESTA COLUNA NÃO FAZ: ela não concede acesso. Ela apenas registra que
-- quem convidou QUERIA incluir a pessoa na Família íntima. Ao aprovar, o membro
-- nasce com `family_access_status = 'requested'` — e quem decide continua sendo
-- a própria pessoa, na conta dela, como já garante
-- /api/circles/[id]/family-access. Um link nunca pode abrir a ficha médica de
-- alguém; ele só pode fazer a pergunta.

ALTER TABLE public.circle_join_requests
  ADD COLUMN IF NOT EXISTS wants_family_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.circle_join_requests.wants_family_access IS
  'D-112: o convite pedia Família íntima. Na aprovação vira family_access_status=requested — a pessoa ainda precisa aceitar.';
