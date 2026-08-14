-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — a conversa vira uma coisa
-- Migration: 2026-08-15 · COMMS-T11 · D-188
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O que existia ─────────────────────────────────────────────────────────
--
-- `circle_messages` tem `circle_id` e nada mais. Existe exatamente UMA conversa
-- por círculo, e ela é implícita: não tem identidade, nem nome, nem endereço.
--
-- Para ter conversa individual havia o caminho barato — `to_user_id` na tabela
-- de mensagens — que faz grupo e 1:1 virarem dois caminhos de código para a
-- mesma coisa. Esta migração escolhe o outro: a conversa passa a ser entidade,
-- e a do círculo é apenas a conversa cujos membros são o círculo inteiro.
--
-- ── ADITIVA ───────────────────────────────────────────────────────────────
--
-- Nada é apagado e nada é movido. `circle_messages.circle_id` continua onde
-- está e continua sendo preenchido: se este passo precisar ser desfeito, basta
-- ignorar `conversation_id`.
--
-- Idempotente: pode rodar duas vezes.

-- ---------------------------------------------------------------------------
-- 1. A conversa
-- ---------------------------------------------------------------------------
--
-- `circle_id` é NOT NULL de propósito. A regra de permissão do EOS é UMA só —
-- *você fala com quem divide círculo com você* (D-073, o ping) — e uma conversa
-- fora de círculo abriria uma segunda regra, com a própria superfície de abuso.
--
-- `direct_key` é a chave natural da conversa individual: os dois `user_id`
-- ordenados e unidos por ':'. Ordenar é o que faz (A,B) e (B,A) serem a MESMA
-- conversa — sem isso, abrir pelo outro lado criaria um segundo thread e as
-- duas pessoas conversariam sozinhas.

CREATE TABLE IF NOT EXISTS conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('circle', 'direct')),
  -- Só a conversa direta tem chave natural; a do círculo é única por `circle_id`.
  direct_key  text,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_direct_key_shape CHECK (
    (kind = 'direct' AND direct_key IS NOT NULL) OR
    (kind = 'circle' AND direct_key IS NULL)
  )
);

-- Um círculo tem UMA conversa de círculo.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_circle_unique
  ON conversations (circle_id)
  WHERE kind = 'circle';

-- Um par tem UMA conversa direta dentro de cada círculo.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_unique
  ON conversations (circle_id, direct_key)
  WHERE kind = 'direct';

-- ---------------------------------------------------------------------------
-- 2. Quem participa, e o que cada um já leu
-- ---------------------------------------------------------------------------
--
-- `hidden_at` é o "excluir conversa" (D-188 §4): ESCONDE PARA MIM, nunca
-- destrói para todos. Num app de emergência o histórico compartilhado é
-- registro — quem avisou o quê e quando —, e apagar do lado do outro destrói a
-- prova de que o aviso existiu.
--
-- Mensagem nova reabre a conversa escondida: esconder é arrumar a lista, não
-- bloquear alguém. Quem quiser silenciar de verdade precisa de outra decisão.

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at    timestamptz,
  hidden_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conversation_members_user_idx
  ON conversation_members (user_id);

-- ---------------------------------------------------------------------------
-- 3. A mensagem ganha dono
-- ---------------------------------------------------------------------------
--
-- Aditivo e nulável. `circle_id` continua sendo escrito — as duas colunas
-- convivem até a retirada do legado ter a própria decisão.

ALTER TABLE circle_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS circle_messages_conversation_created_idx
  ON circle_messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Backfill — nenhuma mensagem se move
-- ---------------------------------------------------------------------------
--
-- Uma conversa `circle` por círculo existente, e toda mensagem recebe o id
-- dela. Nenhum thread muda de endereço; o que muda é ele passar a ter um.

INSERT INTO conversations (circle_id, kind, direct_key)
SELECT c.id, 'circle', NULL
  FROM circles c
 WHERE NOT EXISTS (
   SELECT 1 FROM conversations v WHERE v.circle_id = c.id AND v.kind = 'circle'
 );

-- Todo membro do círculo é membro da conversa do círculo.
INSERT INTO conversation_members (conversation_id, user_id)
SELECT v.id, cm.user_id
  FROM conversations v
  JOIN circle_members cm ON cm.circle_id = v.circle_id
 WHERE v.kind = 'circle'
   AND NOT EXISTS (
     SELECT 1 FROM conversation_members m
      WHERE m.conversation_id = v.id AND m.user_id = cm.user_id
   );

UPDATE circle_messages m
   SET conversation_id = v.id
  FROM conversations v
 WHERE v.circle_id = m.circle_id
   AND v.kind = 'circle'
   AND m.conversation_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Verificação — falhar alto é melhor que backfill pela metade
-- ---------------------------------------------------------------------------
--
-- `error_log` não pegaria uma linha órfã: ela não lança exceção, só some da
-- tela. Três defeitos desta semana tiveram exatamente essa forma.

DO $$
DECLARE orfas int;
BEGIN
  SELECT count(*) INTO orfas
    FROM circle_messages WHERE conversation_id IS NULL AND deleted_at IS NULL;

  IF orfas > 0 THEN
    RAISE EXCEPTION
      '% mensagem(ns) ficaram sem conversa. O backfill não terminou — não prossiga.', orfas;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. RLS: negar tudo, como `circle_messages` já faz
-- ---------------------------------------------------------------------------
--
-- Toda leitura e escrita passa por `/api/comms/*`, que confere a participação
-- antes de usar a service-role. Política direta sobre `conversation_members`
-- seria recursiva com `circle_members`, e foi por isso que D-087 escolheu este
-- desenho.

ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE conversations IS
  'D-188 COMMS-T11: a conversa vira entidade. A do círculo é a conversa cujos membros são o círculo inteiro; a direta é o mesmo objeto com dois membros.';
COMMENT ON COLUMN conversations.direct_key IS
  'Os dois user_id ORDENADOS e unidos por ":". Ordenar é o que faz (A,B) e (B,A) serem a mesma conversa — sem isso cada lado abriria um thread e os dois conversariam sozinhos.';
COMMENT ON COLUMN conversation_members.hidden_at IS
  'D-188: "excluir conversa" esconde PARA MIM. Histórico compartilhado é registro de quem avisou o quê e quando; apagar do lado do outro destruiria a prova. Mensagem nova reabre.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Reversível: `ALTER TABLE circle_messages DROP COLUMN conversation_id;` e
-- `DROP TABLE conversation_members, conversations;`. `circle_messages.circle_id`
-- nunca deixou de ser escrito, então o chat do círculo volta a funcionar
-- sozinho.
-- ═══════════════════════════════════════════════════════════════════════════
