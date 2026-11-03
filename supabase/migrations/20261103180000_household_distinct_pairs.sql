-- HOUSEHOLD-FIX-001 §4.3 — pares que o usuário disse serem DUAS pessoas.
-- Apply in Supabase Dashboard -> SQL Editor (ou via MCP apply_migration).
--
-- Por que existe. O alerta "esta pessoa aparece duas vezes" pergunta quando
-- dois nomes da casa se parecem (regra 5, lib/household-names.ts). Mãe e filha
-- com o mesmo nome são duas pessoas — e uma vez dito isso, o app não pode
-- voltar a perguntar a cada sessão. Antes (D-135) a resposta "são duas" vivia
-- só na memória da tela e sumia ao recarregar.
--
-- As chaves são texto ('invite:<uuid>', 'dependent:<uuid>', 'account:<uuid>')
-- porque o par pode juntar tipos diferentes; sempre gravadas em ordem
-- (a_key < b_key), para o mesmo par ter uma linha só.

CREATE TABLE IF NOT EXISTS public.household_distinct_pairs (
  owner_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  a_key      text        NOT NULL,
  b_key      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, a_key, b_key),
  CONSTRAINT household_distinct_pairs_ordered CHECK (a_key < b_key)
);

-- Deny-all: mesmo padrão de household_invites. São nomes de terceiros, e só as
-- rotas do EOS (service role) leem e escrevem, sempre filtrando pelo dono.
ALTER TABLE public.household_distinct_pairs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.household_distinct_pairs IS
  'HOUSEHOLD-FIX-001: pares de registros da casa que o dono marcou como pessoas diferentes ("São duas pessoas"). Deny-all; acesso só pelas rotas.';
