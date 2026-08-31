-- ═══════════════════════════════════════════════════════════════════════════
-- EOS — aparelhos nativos que recebem push (MOB-T03 · D-228)
-- Migration: 2026-08-31
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Por que uma tabela nova, e não uma coluna em `push_subscriptions` ─────
--
-- Não é a mesma coisa com outro nome. Uma assinatura de Web Push é uma TRIPLA
-- (`endpoint`, `p256dh`, `auth`) — o segredo de criptografia mora no banco e o
-- payload viaja cifrado ponta a ponta. Um aparelho nativo é um TOKEN opaco: a
-- Apple e o Google guardam a chave, não nós, e o transporte é outro protocolo.
--
-- Espremer os dois no mesmo formato obrigaria `p256dh` e `auth` a virarem
-- anuláveis, e a partir daí nada no esquema distinguiria uma assinatura íntegra
-- de uma pela metade. São dois transportes; são duas tabelas.
--
-- ── O que NÃO muda ────────────────────────────────────────────────────────
--
-- A porta de envio continua sendo uma só: `sendPush()` (D-119). Ela passa a ler
-- as duas tabelas e a contar os dois destinos. Nenhuma rota que envia push
-- precisa saber que esta tabela existe.

CREATE TABLE IF NOT EXISTS push_devices (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- APNs (iOS) ou FCM (Android). O envio escolhe o protocolo por esta coluna, e
  -- errar aqui é mandar um token de iPhone para o Google: falha silenciosa, que
  -- é o modo de falha que a D-119 foi escrita para tornar impossível.
  platform      text        NOT NULL CHECK (platform IN ('ios', 'android')),

  -- Opaco, e ÚNICO globalmente.
  --
  -- Único de propósito: o mesmo aparelho pode trocar de conta. Quando isso
  -- acontece o token é o mesmo e o `user_id` muda — o upsert por `token`
  -- REATRIBUI o aparelho. Sem a unicidade, a conta antiga continuaria recebendo
  -- os alertas da nova no mesmo telefone.
  token         text        NOT NULL UNIQUE,

  -- Diagnóstico. Quando um build quebra o push, a pergunta seguinte é sempre
  -- "em qual versão?", e sem isto não há como responder.
  app_version   text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_devices_user_id_idx
  ON push_devices (user_id);

ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;

-- A mesma política de `push_subscriptions`: o aparelho é de quem o registrou.
-- O envio roda com a service role e passa por cima disto, como já passa lá.
CREATE POLICY "push_devices: self access"
  ON push_devices FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE push_devices IS
  'D-228/MOB-T03: tokens APNs e FCM da casca nativa. Separada de push_subscriptions porque Web Push guarda segredo de cifragem (p256dh/auth) e push nativo guarda token opaco — misturar os dois obrigaria as colunas de segredo a serem anuláveis e apagaria a diferença entre assinatura íntegra e pela metade.';

COMMENT ON COLUMN push_devices.token IS
  'UNIQUE globalmente: o mesmo aparelho trocando de conta reatribui a linha via upsert. Sem isso a conta antiga seguiria recebendo alertas no telefone de outra pessoa.';
