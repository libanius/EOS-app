# SPEC — PUSH-403-001: Apple recusa o push do iPhone (HTTP 403)
Version: 1.0 | Status: **Ready** (pedido direto do dono no chat em 2026-11-27: "Corrija") | Author: Paulo Neto

> Regra 1: nenhum código antes de Ready. Este spec está **Ready**.
> Regra 5: critérios binários.

---

## 1. Objetivo

O botão **Enviar TESTE EOS para este iPhone** (MAIS › Alertas Push) mostrava
`NÃO ENVIADO · HTTP 502 · provider HTTP 403`. O 403 vem de `web.push.apple.com`
e quer dizer que a Apple não aceitou a assinatura VAPID (JWT) do servidor para
aquela inscrição. Os alertas reais de emergência usam o mesmo caminho, então
também não chegam no iPhone.

Causas possíveis, todas invisíveis hoje:

1. **Inscrição com chave antiga** — o iPhone se inscreveu com uma chave pública
   VAPID que não é mais a do servidor. O app mostra "Ativado" porque só olha se
   a inscrição existe.
2. **`VAPID_SUBJECT` sujo** — quebra de linha, aspas ou espaço (`mailto: x@y`)
   colados no painel da Vercel. O `web-push` aceita; a Apple recusa.
3. **Chaves que não são um par** — pública e privada de gerações diferentes.

## 2. Comportamento

- Servidor (`lib/vapid.ts`, usado por `lib/push.ts` e `/api/push/self-test`):
  - limpa espaços, quebras de linha e aspas das três variáveis;
  - normaliza o assunto para `mailto:usuario@dominio` ou `https://` (sem
    localhost); se ficar inválido, usa o remetente padrão
    `mailto:brightscalegroup@gmail.com` (o mesmo das rotas antigas) e registra aviso;
  - confere se a chave privada gera a pública configurada. Se não gera, NÃO envia
    e responde `503 { vapidProblem: 'key_pair_mismatch' }` — sem gastar a cota
    de teste;
  - quando a Apple recusa, devolve o motivo curto dela (`providerReason`, ex.
    `BadJwtToken`) e grava no log `status@host reason=...`.
- iPhone (MAIS › Alertas Push):
  - ao abrir a tela, se a inscrição deste aparelho foi feita com outra chave
    pública e a permissão já foi dada, ela é renovada sozinha e a tela avisa;
  - antes do teste, a mesma checagem é feita;
  - se ainda assim a Apple responder 403, a inscrição é renovada e a mensagem
    diz para testar de novo em 10 minutos (limite atual da rota).
  - a mensagem de erro mostra `· Apple: <motivo>` quando houver.

## 3. Data Contract

- `POST /api/push/self-test` — erro 502 ganha `providerReason: string | null`;
  erro 503 de configuração ganha `vapidProblem: 'missing' | 'key_invalid' | 'key_pair_mismatch'`.
- `PushResult.reason` ganha o valor `'vapid_invalid'`.
- Sem migração. `push_subscriptions` inalterada (renovar = DELETE + POST pelas
  rotas que já existem).

## 4. Regras de Negócio

- Nunca ecoar o corpo cru do provedor: só um identificador de até 40 letras.
- Nunca registrar endpoint nem chaves no log; só o hostname.
- Renovação só acontece com permissão de notificação já concedida (nada de
  prompt surpresa).
- O teste continua sendo só para este iPhone; nenhum círculo recebe.

## 5. Edge cases

- Navegador que não expõe `subscription.options.applicationServerKey` → não dá
  para comparar; segue sem renovar (o 403 ainda dispara a renovação).
- Renovação falha depois de descartar a inscrição antiga → o selo volta a
  refletir a verdade e a tela pede para ativar de novo.
- Variável de ambiente com aspas ou `\n` → limpa antes de validar.
- Rotas antigas que ainda leem `process.env` direto (planos, círculos, ping,
  simulação, varredura de perigos) ficam para um passo seguinte.

## 6. Critérios de Aceitação

- [x] CA1 — `cleanEnv` remove espaço, `\n` e aspas das pontas.
- [x] CA2 — `normalizeSubject` conserta `mailto: x@y.com` e `mailto:x@y.com\n`, recusa localhost e endereço sem `@`.
- [x] CA3 — `isVapidKeyPair` é `true` para um par gerado junto e `false` para chaves trocadas.
- [x] CA4 — `readVapid` devolve `key_pair_mismatch`, `missing` e `key_invalid` nos casos correspondentes.
- [x] CA5 — `readVapid` aceita par com sujeira e cai no remetente padrão quando o assunto é inválido.
- [x] CA6 — `providerReason` devolve `BadJwtToken` do corpo da Apple e `null` para corpo estranho.
- [x] CA7 — `tsc --noEmit` e a suíte Jest inteira passam.
- [x] CA8a — No iPhone, após o deploy: tocar no teste mostra "A Apple aceitou o teste (HTTP 201)" (2026-11-27 11:50 ET).
- [ ] CA8b — A notificação TESTE EOS aparece na tela bloqueada. **Falhou no 1º teste** (201 aceito, nada exibido) → §8.
- [ ] CA9 — Após o próximo teste, o log de produção tem `[EOS push-receipt] ... tag=eos-test-... shown=true|false` OU a ausência dele, e o diagnóstico de §8 é registrado aqui.

## 8. Recibo de entrega (adendo 2026-11-27)

Após o merge, a Apple respondeu **201** mas nada apareceu no iPhone. Entre a
Apple e a tela há duas caixas-pretas: o service worker do EOS e os ajustes do
iOS (Foco, permissões). Para separá-las:

- O payload do teste leva `tag: 'eos-test-<base36>'`.
- `public/push-sw.js`, ao receber um push, exibe a notificação e então chama
  `POST /api/push/receipt { tag, shown, error }` (mesma origem, com cookies).
- A rota só **registra no log** `[EOS push-receipt] user=<8 chars> tag= shown= error=`
  e responde 204. Sem tabela, sem dado pessoal além do prefixo do id.

Leitura do próximo teste:
- **sem recibo** → **inconclusivo, com forte indício** de que o worker não
  acordou (Apple não entregou ao aparelho, ou o worker instalado é antigo/
  quebrado). O recibo tenta 2 vezes; ainda assim a rede pode tê-lo perdido.
  Confirmar com um 2º teste antes de agir (reinstalar o PWA / investigar o worker);
- **`shown=false`** → `showNotification` falhou dentro do worker (erro no log);
- **`shown=true`** e nada na tela → o iOS escondeu (Foco, ajustes do EOS).

## 7. Fora do Escopo

- Trocar as chaves VAPID.
- Mudar o limite de 1 teste a cada 10 minutos.
- Migrar as demais rotas de envio para `lib/vapid.ts`.
