# PENDÊNCIAS DO DONO — ações que só você pode executar

> Status geral: **Stripe Live ativo; providers opcionais pendentes**. O código está pronto e no ar (auto-deploy). As pendências restantes são rotação de segredos expostos e providers opcionais de hazard.
> Última atualização: 2026-07-21.

> **Migrations resolvidas** (2026-07-17), **Stripe Test mode validado ponta-a-ponta** (2026-07-20) e **Stripe Live cutover concluído** (2026-07-21). O que ainda depende do dono: rotacionar segredos expostos durante a operação, chaves opcionais de provider (WeatherKit/Xweather/etc.) e autorizações externas (ShakeAlert/FEMA). O Personal Access Token Supabase usado em 2026-07-17 deve ser **revogado/rotacionado** pelo dono após o uso (Dashboard → Account → Tokens).
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

## 1-D. Migration PENDENTE — `for_member_id` nos papéis do plano (D-135)

**Aplique `supabase/migrations/20260808210000_plan_role_dependent.sql`.**

A seção "Quem busca quem" do plano só sabia dizer QUEM BUSCA — a lista era de
contas do círculo. Quem é buscado normalmente não tem conta: é a criança, é a
avó, é justamente quem não sai sozinho. A família contornava escrevendo "buscar
a Avó Ana" no texto livre, o que funciona para um humano lendo e falha para todo
o resto.

Até aplicar, o plano salva **sem** o alvo em vez de falhar inteiro, e a falha
fica no `error_log` como `api/plans:for_member_id`.

---

## 1-C. Migration PENDENTE — `joined` nos convites (D-135)

**Aplique `supabase/migrations/20260808200000_invite_joined.sql`.** Uma linha:
acrescenta `joined` aos status possíveis de `household_invites`.

Por que importa agora: sua conta tem dois convites marcados como *enviados*
para a **Daniela** e a **Paola** — que já moram com você no círculo há semanas.
Sem o `joined`, o app continua dizendo, para você e para o Pilot, que as duas
"não estão no EOS". Estão.

Até aplicar, nada quebra e nada mente: o código detecta, tenta gravar, falha, e
**mantém o convite aberto na tela** em vez de fingir que fechou. A falha fica no
`error_log` como `household:fechar-convite`.

Depois de aplicar, rode `node scripts/duplicate-person-test.mjs`.

---

## 1-B. Play Store — o que só você pode fazer (D-133)

O lado do código está pronto: manifest válido para TWA, ícone maskable de
verdade, e a rota `/.well-known/assetlinks.json` já no ar. **Nada disso precisa
de novo deploy** — o que falta são dois valores que só existem depois que você
criar o app no Play Console.

**Passo 1 — crie o app no Play Console** e escolha o nome do pacote, por
exemplo `app.eos.familia`. Ele é permanente: não dá para trocar depois.

**Passo 2 — pegue a impressão digital.** Play Console → *Release* → *Setup* →
*App signing* → copie o **SHA-256 certificate fingerprint** (o do *App signing
key*, não o do upload key). Vem no formato `AA:BB:CC:…`, 32 pares.

**Passo 3 — cole na Vercel** (Settings → Environment Variables → Production):

```
TWA_PACKAGE_NAME=app.eos.familia
TWA_SHA256_FINGERPRINTS=AA:BB:CC:…            (várias, separadas por vírgula)
```

Não precisa de commit. A rota lê a variável a cada pedido.

**Passo 4 — confira**, abrindo `https://eos-app-fawn.vercel.app/.well-known/assetlinks.json`.
Antes de preencher, ela devolve `[]` — que é a verdade: nenhum app autorizado.
Depois, tem que aparecer o seu pacote. Se aparecer `[]` mesmo com a variável
posta, a impressão digital está fora do formato e foi descartada de propósito
(uma malformada faz o Chrome falhar em silêncio e a barra de endereço fica lá
sem explicar por quê).

**Passo 5 — gere o APK** com o Bubblewrap:
`npx @bubblewrap/cli init --manifest https://eos-app-fawn.vercel.app/manifest.json`

**O que o Play vai pedir e já existe**: política de privacidade
(`/privacy`), termos (`/terms`), política de reembolso (`/refund`).

**O que o Play vai pedir e ainda NÃO existe**: as capturas de tela da loja
(mínimo 2 de celular), o ícone de 512 da ficha da loja e o gráfico de
destaque 1024×500. Isso é material de listagem, não de código — me diga se
quer que eu gere.

---

## 1-A. Migration PENDENTE — `pilot_events` (PILOT-T04 / D-132)

**Aplique `supabase/migrations/20260808150000_pilot_events.sql`** (Dashboard →
SQL Editor → cole e execute). É a telemetria do Pilot, o último portão de
lançamento.

Até você aplicar, **nada quebra**: a rota responde `migration_pending`, o Pilot
abre e responde normal, o console fica limpo — isso foi verificado com a tabela
ausente. O que não acontece é a coleta.

Depois de aplicar, rode `node scripts/pilot-metrics-test.mjs` (9 checagens
contra o Supabase real) e me avise.

O que a tabela guarda: só enum e contador — qual evento, qual veredito, qual
intenção, de onde partiu, quantos milissegundos. **Não existe coluna de texto
livre**: a pergunta que a família faz ao Pilot, a resposta, a coordenada e a
ficha médica não têm onde caber, e um teste reprova se alguém criar uma.

---

## 1. Migrations a aplicar no Supabase — ✅ APLICADAS (2026-07-17)

Aplicadas pelo agente via **Management API** (`/v1/projects/{ref}/database/query`), usando um Personal Access Token fornecido pelo dono. Verificadas no schema real.

| Migration | O que faz | Status |
| --- | --- | --- |
| `supabase/migrations/20260710000000_stripe_billing.sql` | Colunas Stripe em `profiles` | ✅ Aplicada — 4 colunas confirmadas |
| `supabase/migrations/20260710010000_hazard_tables.sql` | 5 tabelas de hazard (RLS) | ✅ Aplicada — 5 tabelas + policies confirmadas |
| `supabase/migrations/20260705000000_auto_create_profile.sql` | Trigger `handle_new_user` + backfill | ✅ Aplicada — trigger existe; 0 usuários sem perfil |

> Nota: as colunas Stripe existem e o fluxo de faturamento Live está ativo; a migration só criou onde gravar.

---

## 2. Stripe — Monetização (D-042) — 🟢 LIVE ATIVO (2026-07-21)

> **LIVE cutover feito (LA-T02).** Conta real `acct_1TuL40IaCSStSVaq` (EOS, US, ativada). Produtos/preços Live ($9.90/$19.90), webhook Live e as 4 env vars da Vercel Production trocadas para `sk_live`/whsec live/price IDs live; deploy fresco. IDs de customer/subscription do sandbox foram limpos dos profiles (o guard do checkout recria em live se preciso). Statement descriptor = "EOS BRIGHTSCALE". **Falta só**: o dono rotacionar as chaves expostas no chat (sk_live, Vercel token, Supabase PAT) e, se quiser, um teste com cartão real + reembolso.

> **Test mode também foi validado** (2026-07-20): pagamento logado com cartão 4242 atualizou `profiles.plan`. Test e Live são ambientes separados; a produção agora usa Live.

Estado atual: os botões de upgrade abrem Checkout em Live mode. Próxima validação opcional: pagamento real pequeno + reembolso.

> **Decisão 2026-07-17 (Rota A):** o EOS terá **conta Stripe própria**, sob a mesma empresa/Organização do site existente do dono, para não misturar marca, statement descriptor, payouts e relatórios. Verificado no código: o webhook resolve o perfil por `user_id`/`stripe_customer_id`, então mesmo numa conta compartilhada um site não corromperia os dados do outro — o motivo de separar é brand/dinheiro/contabilidade, não integridade de dados.
> **Runbook copy-paste passo-a-passo: `docs/stripe-setup-eos.md`.** O checklist abaixo é o resumo; o runbook tem os detalhes (Test mode primeiro, statement descriptor, cartão 4242, etc.).

**Checklist:**
1. [x] ~~Aplicar a migration `20260710000000_stripe_billing.sql`~~ — ✅ feito 2026-07-17 (seção 1).
2. [x] ~~No **Stripe Dashboard**, criar **2 produtos com preço recorrente**~~ — ✅ Test mode 2026-07-19; Live mode 2026-07-21:
       - Plano **Família** (mensal) → copiar o **Price ID** (`price_...`).
       - Plano **Premium** (mensal) → copiar o **Price ID**.
3. [x] ~~No **Vercel** (Production), setar as 4 env vars Live~~ — ✅ feito 2026-07-21:
       - `STRIPE_SECRET_KEY` (`sk_live_...`)
       - `STRIPE_WEBHOOK_SECRET` (`whsec_...` — vem do passo 4)
       - `STRIPE_PRICE_FAMILY` (o Price ID do Família)
       - `STRIPE_PRICE_PREMIUM` (o Price ID do Premium)
4. [x] ~~No Stripe, registrar o **endpoint de webhook**~~ — ✅ Test mode 2026-07-19; Live mode 2026-07-21:
       `https://eos-app-fawn.vercel.app/api/billing/webhook`
       eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
       Copiar o **Signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.
5. [x] ~~**Redeploy** (`vercel --prod --yes`)~~ — ✅ deploy fresco carregou as env vars Live em 2026-07-21.
6. [x] ~~Pagamento de teste logado com cartão `4242 4242 4242 4242` e validação de `profiles.plan`~~ — ✅ feito 2026-07-20 (`plan=family`, `plan_status=active`).
7. [x] ~~Antes do lançamento pago: refazer produtos/keys/webhook em **Live mode**, trocar env vars test → live e redeploy~~ — ✅ LA-T02 completo 2026-07-21.

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

## 4b. World Dashboard — revisão obrigatória de rotas/shelters (D-051)

O protótipo HWD-04 usa OpenAI para inferir **shelter/rota candidata** na rota isolada `/dashboard-world`. Isso foi autorizado pelo dono com risco assumido para teste visual/produto, mas **OpenAI não é fonte oficial de rota, mapa, abrigo aberto, shelter status ou segurança de trajeto**.

- [ ] Antes de substituir `/dashboard` pelo World Dashboard, escolher fonte geoespacial/oficial para rotas.
- [ ] Escolher fonte oficial/curada/admin para shelters e status de abertura.
- [ ] Definir como o app mostra confiança, fonte, última verificação e fallback quando rota/shelter não é confiável.
- [ ] Revisar termos/privacidade para localização exata de família no mapa.

## 5. Ordem sugerida

1. Stripe Live cutover → começa a faturar de verdade.
2. Revisão World Dashboard rotas/shelters antes de produção.
3. WeatherKit → previsão principal + nowcast premium; destrava "ALL SYSTEMS LIVE".
4. Xweather (raios) → canal de raios.
5. ShakeAlert / FEMA IPAWS → quando as autorizações saírem.
