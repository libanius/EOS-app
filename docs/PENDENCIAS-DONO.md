# PENDÊNCIAS DO DONO — ações que só você pode executar

> Status geral: **PENDENTE**. O código está pronto e no ar (auto-deploy), mas estas ações dependem de credenciais/console que o agente não tem acesso. Enquanto não forem feitas, os recursos abaixo ficam inertes/degradados de forma **honesta** (nada quebra, nada finge estar conectado).
> Última atualização: 2026-07-10.

---

## 1. Migrations a aplicar no Supabase (SQL Editor) — PENDENTE

O agente não tem credencial de banco. Cole cada arquivo no **Supabase Dashboard → SQL Editor** e rode.

| Migration | O que faz | Bloqueia o quê se não aplicar |
| --- | --- | --- |
| `supabase/migrations/20260710000000_stripe_billing.sql` | Colunas Stripe em `profiles` | **Upgrade de plano não persiste** (webhook não tem onde gravar) — ver seção 2 |
| `supabase/migrations/20260710010000_hazard_tables.sql` | 5 tabelas de hazard (RLS) | Histórico de hazards + automação de push por hazard (Fase 2). O monitoramento ao vivo funciona sem isto. |
| `supabase/migrations/20260705000000_auto_create_profile.sql` | Trigger `handle_new_user` | Nada crítico — o self-heal do app cobre. Otimização. |

Verificar depois: `SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 5;`

---

## 2. Stripe — Monetização (D-042) — PENDENTE

Sem isto, os botões de upgrade e o portal respondem **503** (a UI mantém o estado atual, nada quebra).

**Checklist:**
1. [ ] Aplicar a migration `20260710000000_stripe_billing.sql` (seção 1).
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
