# Stripe — Setup do EOS (Rota A: conta separada)

> Decisão (2026-07-17): o EOS terá **conta Stripe própria**, sob a **mesma empresa/Organização** (BrightScale Group LLC, Florida), para não misturar marca, statement descriptor, payouts e relatórios. Mercado inicial: **EUA**, moeda **USD**. Ver `docs/PENDENCIAS-DONO.md` seção 2.
>
> **Site já preparado para a revisão do Stripe (2026-07-17):** landing com preços públicos (`/`), + páginas `/terms`, `/privacy` (CCPA/CPRA), `/refund`, rodapé com identidade legal (BrightScale Group LLC, endereço FL, contact@brightscalegroup.com). **Só valem para o revisor depois do deploy** — é preciso commitar + push para o Vercel publicar.
>
> Este runbook é do **dono** — exige o dashboard do Stripe (o agente não tem acesso). Faça em **Test mode** primeiro, valide, depois repita em **Live mode**.

Endpoint de webhook do EOS (fixo): `https://eos-app-fawn.vercel.app/api/billing/webhook`

---

## Passo 0 — Criar a conta separada (uma vez)

1. Logue no Stripe. No canto superior (seletor de contas) → **New account** / **Create account**.
2. Use os **mesmos dados legais/fiscais** da sua empresa (CNPJ), mas **nome do negócio / marca = EOS**. A conta bancária de payout pode ser a mesma do outro site ou uma nova — sua escolha.
3. Complete a verificação da conta. Enquanto isso, dá para trabalhar tudo em **Test mode**.
4. **Settings → Business → Public details**: defina o **statement descriptor** = `EOS APP` (ou similar, ≤22 chars). É o que aparece na fatura do cartão do cliente — precisa ser reconhecível como EOS.
5. (Opcional) **Settings → Branding**: logo + cor do EOS (aparece no Checkout, recibos e Portal).

Confirme no topo do dashboard que você está **na conta EOS** antes de qualquer passo abaixo.

---

## Passo 1 — Criar os 2 produtos (Test mode)

Toggle **"Test mode"** ligado (canto superior direito).

**Product Catalog → + Add product**, dois produtos, cada um com **preço recorrente mensal**:

| Produto | Preço | Recorrência | Env var que recebe o Price ID |
| --- | --- | --- | --- |
| EOS Family | **$9.90 USD** | Mensal | `STRIPE_PRICE_FAMILY` |
| EOS Premium | **$19.90 USD** | Mensal | `STRIPE_PRICE_PREMIUM` |

> Estes valores já estão publicados na landing (`/` → seção Planos) e nas páginas legais. **Precisam bater** com o que você criar no Stripe.

Depois de salvar cada produto, copie o **Price ID** (`price_...`, não o `prod_...`).

---

## Passo 2 — Chaves de API (Test mode)

**Developers → API keys**: copie a **Secret key** (`sk_test_...`) → vai para `STRIPE_SECRET_KEY`.
(O código usa só a secret key server-side; não precisa da publishable.)

---

## Passo 3 — Registrar o webhook (Test mode)

**Developers → Webhooks → + Add endpoint**:
- **Endpoint URL**: `https://eos-app-fawn.vercel.app/api/billing/webhook`
- **Events to send** (marque estes 4):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Salve → copie o **Signing secret** (`whsec_...`) → vai para `STRIPE_WEBHOOK_SECRET`.

---

## Passo 4 — Setar as 4 env vars na Vercel

Projeto `eos-app` → **Settings → Environment Variables**. Comece por **Preview** (para testar sem afetar produção):

```
STRIPE_SECRET_KEY        = sk_test_...
STRIPE_WEBHOOK_SECRET    = whsec_...        (do Passo 3)
STRIPE_PRICE_FAMILY      = price_...        (Família, do Passo 1)
STRIPE_PRICE_PREMIUM     = price_...        (Premium, do Passo 1)
```

> ⚠️ Pegadinha (D-035/D-036): cole os valores **sem aspas, sem espaços e sem newline no fim**. Vars marcadas "Sensitive" não são lidas de volta — valide pelo comportamento, não pelo dashboard.

Faça **redeploy** (env var nova não afeta deploy já existente).

---

## Passo 5 — Testar ponta-a-ponta (Test mode)

Com as env vars no ar, o fluxo:
1. App → Settings → upgrade para Família/Premium → abre o Checkout do Stripe.
2. Pague com o cartão de teste **`4242 4242 4242 4242`**, validade futura, CVC qualquer.
3. Stripe dispara `checkout.session.completed` → webhook → grava `profiles.plan`.

> O agente pode validar este passo: com o token Supabase, confere se `profiles.plan / plan_status / stripe_customer_id` foram gravados corretamente após o pagamento de teste.

---

## Passo 6 — Ir para Live

Repita **Passos 1–4 em Live mode** (produtos, `sk_live_...`, webhook live com novo `whsec_...`, price IDs live), setando as env vars em **Production**, e redeploy.

> Test e Live são mundos separados no Stripe: produtos, chaves e webhooks de test **não** valem em live. Refaça em live.

---

## Checklist rápido

- [x] Conta EOS criada (`acct_1TuL49I7bawhx445` — "EOS sandbox", US) — falta statement descriptor `EOS APP` (definir no dashboard antes do Live)
- [x] Conta Live EOS ativada (`acct_1TuL40IaCSStSVaq`, US) — statement descriptor `EOS BRIGHTSCALE`
- [x] 2 produtos mensais criados (2026-07-19, via API): **EOS Family** `price_1TuwePI7bawhx4452M8uV7HN` ($9.90) · **EOS Premium** `price_1TuwePI7bawhx4452FUobZFI` ($19.90)
- [x] Webhook (test) criado: `we_1TuwePI7bawhx445hxklasE5` → `/api/billing/webhook`, 4 eventos; `whsec` guardado só na Vercel
- [x] 4 env vars na Vercel **Production** (`sk_test`, `whsec`, 2 price IDs) + redeploy — 2026-07-19
- [x] Pagamento de teste 4242 grava `profiles.plan` ✔ — validado 2026-07-20
- [x] **Live mode**: refazer produtos/keys/webhook em Live, trocar as env vars da Vercel para `sk_live`/price live, definir statement descriptor, redeploy — concluído 2026-07-21 (`acct_1TuL40IaCSStSVaq`, statement descriptor `EOS BRIGHTSCALE`)

> Segredos (`sk_*`, `whsec`) vivem só na Vercel — **não** neste repo. Os IDs acima não são sensíveis.
> Produção usa Stripe Live desde LA-T02. Rotacionar qualquer chave exposta em chat/logs antes de escalar tráfego pago.
