-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — a conversa direta fica direta também no Realtime
-- Migration: 2026-08-16 · COMMS-T15 · D-196
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O furo ────────────────────────────────────────────────────────────────
--
-- D-188 criou a conversa direta e a API a protege: `requireParticipant`
-- responde **403** para quem não participa, e há teste provando isso.
--
-- **O Realtime não passa pela API.** O cliente Supabase assina
-- `circle_messages` e o que decide o que ele recebe é a política RLS de SELECT
-- criada em `20260804013000_comms_realtime.sql`:
--
--     USING (deleted_at IS NULL AND EXISTS (
--       SELECT 1 FROM circle_members cm
--        WHERE cm.circle_id = circle_messages.circle_id
--          AND cm.user_id = auth.uid()))
--
-- Ela é **por círculo**, e foi correta enquanto existia uma conversa por
-- círculo. Uma mensagem direta guarda o `circle_id` do círculo compartilhado —
-- então, com esta política, **qualquer membro do círculo podia ler a conversa
-- direta de duas outras pessoas**, em tempo real, direto do cliente.
--
-- A API dizia não. O banco dizia sim. Quando os dois discordam, vale o banco.
--
-- ── Por que uma função SECURITY DEFINER ───────────────────────────────────
--
-- `conversation_members` tem RLS ligada e nenhuma política (nega tudo, como
-- `circle_messages` já fazia). Uma política que consultasse a tabela
-- diretamente cairia na própria RLS dela e nunca acharia nada — e criar uma
-- política de leitura ali reintroduziria a recursão com `circle_members` que
-- D-087 evitou de propósito.
--
-- A função roda com os direitos do dono, responde uma pergunta só, e não expõe
-- nenhuma linha: **"esta pessoa participa desta conversa?"**

-- ---------------------------------------------------------------------------
-- 1. A pergunta, isolada
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
-- `search_path` fixo: sem isso, um schema no caminho do chamador poderia
-- sequestrar o nome da tabela dentro de uma função com direitos de dono.
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.conversation_members m
     WHERE m.conversation_id = p_conversation
       AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_conversation_member(uuid) IS
  'D-196: responde apenas "quem está pedindo participa desta conversa?". Existe porque `conversation_members` nega tudo por RLS, e uma política que a consultasse diretamente nunca enxergaria linha nenhuma.';

-- ---------------------------------------------------------------------------
-- 2. A política passa a ser por CONVERSA
-- ---------------------------------------------------------------------------
--
-- `conversation_id IS NOT NULL` é exigido, e não tolerado como legado: o
-- backfill de D-188 terminou com **zero** mensagens órfãs (a migração falhava
-- alto se sobrasse alguma) e toda escrita desde então preenche a coluna. Aceitar
-- `NULL` aqui deixaria uma porta aberta para qualquer linha futura que
-- esquecesse de preenchê-la — exatamente o tipo de exceção que vira o furo
-- seguinte.

DROP POLICY IF EXISTS circle_messages_select_circle_members ON public.circle_messages;

CREATE POLICY circle_messages_select_participants
  ON public.circle_messages
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND conversation_id IS NOT NULL
    AND public.is_conversation_member(conversation_id)
  );

COMMENT ON POLICY circle_messages_select_participants ON public.circle_messages IS
  'D-196: substitui a política por CÍRCULO. A anterior deixava qualquer membro ler, via Realtime, a conversa direta de duas outras pessoas — a API dizia 403 e o banco dizia sim.';

-- ---------------------------------------------------------------------------
-- 3. Verificação
-- ---------------------------------------------------------------------------
--
-- Se sobrou mensagem sem conversa, ela fica INVISÍVEL para todo mundo a partir
-- daqui. Melhor parar e saber agora do que descobrir por uma tela vazia.

DO $$
DECLARE orfas int;
BEGIN
  SELECT count(*) INTO orfas
    FROM public.circle_messages WHERE conversation_id IS NULL AND deleted_at IS NULL;

  IF orfas > 0 THEN
    RAISE EXCEPTION
      '% mensagem(ns) sem conversa ficariam invisíveis com a política nova. Rode a migração de D-188 antes.', orfas;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reversível: recriar `circle_messages_select_circle_members` com o USING
-- antigo e apagar esta política devolve o comportamento anterior — **com o
-- furo junto**.
-- ═══════════════════════════════════════════════════════════════════════════
