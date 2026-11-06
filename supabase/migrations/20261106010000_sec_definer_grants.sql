-- SEC-T04 / D-234 — funções SECURITY DEFINER fechadas para quem não deve chamá-las.
-- O Postgres dá EXECUTE a PUBLIC por padrão; via /rest/v1/rpc, isso abria as
-- funções abaixo para qualquer pessoa, mesmo sem login.
-- Idempotente: REVOKE/GRANT podem rodar de novo sem efeito colateral.

-- Só o servidor (service role) chama estas três.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_documents(vector, double precision, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_buckets() TO service_role;
GRANT EXECUTE ON FUNCTION public.match_documents(vector, double precision, integer, text) TO service_role;

-- Funções de gatilho: o gatilho roda sem EXECUTE do chamador.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_checklist_acquired() FROM PUBLIC, anon, authenticated;

-- Usuário logado continua; anônimo sai.
REVOKE ALL ON FUNCTION public.confirm_pilot_memory(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_pilot_memory(uuid, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated, service_role;

-- is_circle_member / is_circle_leader: sem mudança (D-234). As políticas de
-- `circles` e `circle_members` valem para `public`; fechá-las vem antes.
