# PENDÊNCIAS DO DONO — ações que só você pode executar

> Status geral: **PENDENTE**. O código está pronto e no ar (auto-deploy), mas estas ações dependem de credenciais/console que o agente não tem acesso. Enquanto não forem feitas, os recursos abaixo ficam inertes/degradados de forma **honesta** (nada quebra, nada finge estar conectado).
> Última atualização: 2026-07-17.

> **Migrations agora RESOLVIDAS** (2026-07-17): o dono forneceu um **Personal Access Token do Supabase** (`sbp_...`), o que deu ao agente acesso à Management API do projeto `alxurmgpyxjhvnliivbf` ("eosoffgrid@gmail.com's Project"). As 3 migrations da seção 1 foram aplicadas e verificadas. O token deve ser **revogado/rotacionado** pelo dono após o uso (Dashboard → Account → Tokens). O que ainda depende do dono: Stripe (contas/produtos/env vars), chaves de provider (WeatherKit/Xweather/etc.), e autorizações externas (ShakeAlert/FEMA) — valores secretos que só o dono possui.
> Histórico: o `supabase` CLI logado neste ambiente pertence a outra conta (só enxerga BrightScaleWeb / bolt-native / Abre-USA); por isso o CLI não alcança o projeto EOS. A via que funcionou foi o PAT + Management API.

---

## 0. Custo — o que é grátis, pago ou depende de autorização

| Item | Custo | Precisa? |
| --- | --- | --- |
| NWS · USGS · NHC · Open-Meteo (forecast + nowcast) | **Grátis, já ativo** | Já cobre previsão, nowcast de chuva, alertas severos, furacão, terremoto |
| Stripe (chaves) | **Grátis** — só taxa por venda (~2,9% + fixa; BR varia) | Sim, para faturar |
| Apple WeatherKit | **US$99/ano** (Apple Developer Program) | **Opcional** — Open-Meteo já faz o mesmo de graça; só destrava "ALL SYSTEMS LIVE" |
| AccuWeather MinuteCast | Free tier bem limitado; MinuteCast ~pago | Opcional |
| Xweather (raios) | **Pago** (lightning fica fora do free tier) | Opcional. Alternativa comunitária: Blitzortung.org (grátis, só uso não-comercial) |
| ShakeAlert | Grátis, mas **exige autorização/licenciamento** (parceria) | Opcional / difícil p/ app geral |
| FEMA IPAWS | Grátis, mas **exige autorização (COG) da FEMA** | Opcional (muitos CAP já chegam via NWS) |

**Resumo:** dá para lançar **sem gastar nada** (fontes grátis já no ar + Stripe, que só cobra por venda). WeatherKit (US$99/ano) e raios (Xweather) são os únicos que custam dinheiro, e são opcionais.

---

## 1. Migrations a aplicar no Supabase — ✅ APLICADAS (2026-07-17)

Aplicadas pelo agente via **Management API** (`/v1/projects/{ref}/database/query`), usando um Personal Access Token fornecido pelo dono. Verificadas no schema real.

| Migration | O que faz | Status |
| --- | --- | --- |
| `supabase/migrations/20260710000000_stripe_billing.sql` | Colunas Stripe em `profiles` | ✅ Aplicada — 4 colunas confirmadas |
| `supabase/migrations/20260710010000_hazard_tables.sql` | 5 tabelas de hazard (RLS) | ✅ Aplicada — 5 tabelas + policies confirmadas |
| `supabase/migrations/20260705000000_auto_create_profile.sql` | Trigger `handle_new_user` + backfill | ✅ Aplicada — trigger existe; 0 usuários sem perfil |

> Nota: as colunas Stripe existem, mas o **fluxo de faturamento ainda depende da seção 2** (produtos + env vars + webhook). A migration só criou onde gravar.

---

## 2. Stripe — Monetização (D-042) — PENDENTE

Sem isto, os botões de upgrade e o portal respondem **503** (a UI mantém o estado atual, nada quebra).

> **Decisão 2026-07-17 (Rota A):** o EOS terá **conta Stripe própria**, sob a mesma empresa/Organização do site existente do dono, para não misturar marca, statement descriptor, payouts e relatórios. Verificado no código: o webhook resolve o perfil por `user_id`/`stripe_customer_id`, então mesmo numa conta compartilhada um site não corromperia os dados do outro — o motivo de separar é brand/dinheiro/contabilidade, não integridade de dados.
> **Runbook copy-paste passo-a-passo: `docs/stripe-setup-eos.md`.** O checklist abaixo é o resumo; o runbook tem os detalhes (Test mode primeiro, statement descriptor, cartão 4242, etc.).

**Checklist:**
1. [x] ~~Aplicar a migration `20260710000000_stripe_billing.sql`~~ — ✅ feito 2026-07-17 (seção 1).
2. [ ] No **Stripe Dashboard**, criar **2 produtos com preço recorrente**:
       - Plano **Família** (mensal) → copiar o **Price ID** (`price_...`).
       - Plano **Premium** (mensal) → copiar o **Price ID**.
3. [ ] No **Vercel** (Production + Preview), setar as 4 env vars:
       - `STRIPE_SECRET_KEY` (`sk_live_...` ou `sk_test_...`)
       - `STRIPE_WEBHOOK_SECRET` (`whsec_...` — vem do passo 4)
       - `STRIPE_PRICE_FAMILY` (o Price ID do Família)
       - `STRIPE_PRICE_PREMIUM` (o Price ID do Premium)
4. [ ] No Stripe, registrar o **endpoint de webhook**:
       `https://eos-app-fawn.vercel.app/api/billing/webhook`
       eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
       Copiar o **Signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.
5. [ ] **Redeploy** (`vercel --prod --yes`) — env var novo não afeta deploy existente.

> Pegadinha (D-035/D-036): grave valores **sem aspas e sem espaços/newline**. Vars "Sensitive" não são lidas de volta — valide pelo comportamento em produção.

Detalhes: `docs/08-decisions-log.md` (D-042).

---

## 3. Chaves dos providers de hazard (D-043) — PENDENTE

**Já funcionando sem chave** (não precisa fazer nada): NWS, USGS, NHC, Open-Meteo (forecast + nowcast). Hoje a rede reporta honestamente **"USING BACKUP WEATHER SOURCE"** porque o WeatherKit (previsão principal pedida) ainda não tem chave.

Cada bloco abaixo, quando preenchido no Vercel, tira o canal de `NOT CONFIGURED`. Guia completo: `docs/hazard-provider-setup.md`.

### 3a. Apple WeatherKit (previsão principal + minuto-a-minuto) — PENDENTE
Requer Apple Developer Program.
```
WEATHERKIT_TEAM_ID=
WEATHERKIT_SERVICE_ID=
WEATHERKIT_KEY_ID=
WEATHERKIT_PRIVATE_KEY=   (conteúdo do .p8, server-side, nunca no cliente)
```
- [ ] Criar Services ID + WeatherKit key (.p8) no Apple Developer.
- [ ] Setar as 4 vars no Vercel.
- [ ] (dev) Implementar o branch real em `lib/hazards/providers/adapters.ts:weatherKitProvider` (JWT ES256).
> Quando ativo, o canal "Local Forecast" deixa de usar fallback e a rede pode chegar a **ALL SYSTEMS LIVE**.

### 3b. AccuWeather MinuteCast (fallback de nowcast) — PENDENTE (opcional)
```
ACCUWEATHER_API_KEY=
```
- [ ] Obter API key na AccuWeather. Já há Open-Meteo nowcast keyless funcionando; isto é upgrade.

### 3c. Xweather — raios (Lightning) — PENDENTE
```
XWEATHER_CLIENT_ID=
XWEATHER_CLIENT_SECRET=
```
- [ ] Obter credenciais Xweather (ex-Aeris). Sem isto, canal "Lightning" = NOT CONFIGURED.

### 3d. USGS ShakeAlert — early warning — PENDENTE (requer autorização)
Requer **licenciamento/parceria** com o programa ShakeAlert. Não simular.
```
SHAKEALERT_ENABLED=true
SHAKEALERT_ENDPOINT=
SHAKEALERT_TOKEN=
```
- [ ] Solicitar autorização ShakeAlert. Até lá, canal fica NOT CONFIGURED.

### 3e. FEMA IPAWS-OPEN — alertas públicos — PENDENTE (requer autorização)
Requer **COG ID** e autorização da FEMA.
```
FEMA_IPAWS_ENABLED=true
FEMA_IPAWS_COG_ID=
FEMA_IPAWS_PIN=
```
- [ ] Solicitar acesso IPAWS-OPEN à FEMA. (Muitos alertas CAP já chegam via NWS.)

---

## 4. Resumo do que já está no ar (não precisa de você)

- Círculos (criar/entrar/aprovar/membros), Ficha Master, Recursos, Checklist, Weather Intelligence, Cenário.
- Monitoramento multi-fonte ao vivo (NWS/USGS/NHC/Open-Meteo) + componente **Live Intelligence Network** nas telas Cenário e Weather.
- Push manual de Admin de círculo (VAPID já configurado).

## 5. Ordem sugerida

1. Migration Stripe + chaves Stripe → **começa a faturar**.
2. WeatherKit → previsão principal + nowcast premium; destrava "ALL SYSTEMS LIVE".
3. Xweather (raios) → canal de raios.
4. Migration hazard_tables → histórico + push automático (Fase 2).
5. ShakeAlert / FEMA IPAWS → quando as autorizações saírem.
