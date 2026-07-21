# 08 — Decisions Log

> Decisions made. Not up for re-discussion without a new entry.

---

## D-053 — HWD-05 Pilot action integration prototype scope

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: HWD-05 pede que a Pilot Capsule deixe de ser apenas seletor visual e passe a integrar estados e ações reais no `/dashboard-world`: GO/LIMITED/WAIT/AVOID/PRIORITY OVERRIDE, abrir cenário, checklist, notificar família e focar rota candidata.

**Decision**:
1. A primeira entrega de HWD-05 será **determinística e client-side**, usando `RiskProvider`, alertas, clima atual, checklist, família/círculos e guidance já carregados pelo World Dashboard.
2. Não será criado novo schema de persistência de preferências/histórico do Pilot nesta etapa. Aprendizado avançado continua fora do MVP.
3. `PRIORITY OVERRIDE` vence sempre quando `state=critical` ou alerta oficial crítico existe.
4. Estados `GO`, `LIMITED`, `WAIT` e `AVOID` serão calculados por regras conservadoras de clima/risco/readiness para o activity intent selecionado.
5. Ações reais nesta etapa: abrir `/scenario`, abrir `/checklist`, enviar push para círculo administrado quando permitido pela rota existente, e focar a rota/shelter candidata no mapa.

**Consequence**: HWD-05 entrega comportamento útil e testável sem acoplar o Pilot a um novo backend prematuro. Métricas, preferências aprendidas e payload persistente do Pilot permanecem pendências para evolução posterior.

---

## D-052 — World Dashboard runtime map base toggle

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois do deploy com `NEXT_PUBLIC_MAPTILER_KEY`, o World Dashboard passou a abrir em MapTiler hybrid/satélite. O dono pediu uma opção para voltar ao visual anterior, escuro, semelhante ao protótipo operacional com ruas/labels em dark mode.

**Decision**:
1. `/dashboard-world` deve oferecer um toggle de base visual no painel "Camadas ao vivo": **Híbrido** e **Dark**.
2. **Híbrido** mantém MapTiler hybrid + terreno 3D quando a key pública está configurada.
3. **Dark** força o estilo keyless CARTO dark, mesmo quando existe `NEXT_PUBLIC_MAP_STYLE_URL` ou MapTiler key, para restaurar o visual operacional anterior.
4. A preferência é local do dispositivo/browser (`localStorage`) e não altera dados EOS, localização, hazards, radar, família ou guidance.

**Consequence**: O usuário consegue alternar entre inspeção satelital e leitura operacional dark sem redeploy/env var. Como MapLibre remove fontes/layers ao trocar style, a implementação remonta o mapa e reanexa rota, radar, hazards e marcadores no `load`.

---

## D-051 — HWD-04 privacy baseline + OpenAI inferred route/shelter prototype

**Date**: 2026-07-21
**Status**: DECIDED / PROTOTYPE AUTHORIZED

**Context**: HWD-04 was blocked on privacy/data choices for family location, routing, and shelter source. The owner explicitly chose: family location requires consent, exact point is acceptable, freshness must be visible, and MVP retention is only the latest point. For routes and shelters, the owner asked to use the OpenAI API for now and accepts the risk.

**Decision**:
1. **Family location**: HWD may show exact points for circle/family members whose location is already exposed through EOS circle/profile data. The UI must show freshness/availability state; MVP does not implement location history.
2. **Retention**: MVP stores/uses only the latest known profile/current location. No trail, replay, or historical route.
3. **Routes/shelters**: OpenAI API may be used temporarily as an **inference layer** for candidate shelter/route guidance in the isolated `/dashboard-world` prototype.
4. **Important limitation**: OpenAI is **not** an official geospatial, routing, emergency management, or shelter-status source. Any route/shelter generated this way must be labeled as AI/inferred/candidate, not official or guaranteed safe.
5. **Review debt**: before production replacement of `/dashboard`, shelters and routing must be reviewed and moved to appropriate official/geospatial providers or curated/admin-verified data.

**Consequence**: HWD-04 is unblocked for a prototype implementation only. Production rollout remains blocked until HWD-06 validation and the route/shelter source review.

---

## D-050 — Dono autoriza a implementação do Hybrid World Dashboard (gate liberado)

**Date**: 2026-07-21
**Status**: DECIDED / AUTORIZADO

**Context**: `docs/16-hybrid-world-dashboard.md` (D-047) definiu a arquitetura do World Dashboard mas com gate explícito: *"NO IMPLEMENTATION AUTHORIZED until the owner explicitly approves"*. Ao revisar por que o dashboard no código (Living Dashboard v2 — mostrador + tactical cards) não batia com a imagem que o dono criou no Higgsfield, ficou claro que a imagem **é** o World Dashboard. O dono então **autorizou iniciar a implementação**.

**Decision**:
1. Gate do doc 16 **liberado**. Começar por **HWD-01** (protótipo visual estático): rota isolada `/dashboard-world`, imagem do Higgsfield como fundo temporário, HUD em componentes React reais (Status Rail, Pilot Capsule, Location Brief, Environmental Ticker, Alert Counter), marcadores de família/rota **mock rotulados**, dados reais do `RiskProvider` onde seguro, responsivo, reduced-motion. **Sem MapLibre ainda** (isso é HWD-02).
2. **Não** substituir `/dashboard` — o World Dashboard fica isolado e reversível até os critérios de saída (doc 16 §33).
3. O EOS Pilot (D-046) passa a ter como casa alvo a **Pilot Capsule** do World Dashboard; o protótipo de complication no v2 (PILOT-T01) fica em espera.

**Consequence**: roadmap ganha a seção **Hybrid World Dashboard (HWD)** — HWD-00 completo, HWD-01 em andamento. O Pilot entra via HWD-05.

---

## D-048 — Stripe Live cutover concluído

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: O Stripe Test mode já estava validado ponta-a-ponta em LA-T01, mas o app ainda não podia cobrar de verdade. LA-T02 exigia repetir a configuração em Live mode, trocar as env vars da Vercel e fazer um deploy fresco.

**Decision**:
1. Ativar o faturamento real do EOS em Stripe Live mode na conta `acct_1TuL40IaCSStSVaq` (EOS, US, ativada).
2. Manter o mesmo modelo de monetização de D-042: Stripe Checkout hospedado, Billing Portal e webhook como fonte de verdade de `profiles.plan`.
3. Usar produtos/preços Live mensais para Family ($9.90) e Premium ($19.90), referenciados apenas via `STRIPE_PRICE_FAMILY` e `STRIPE_PRICE_PREMIUM`.
4. Trocar as env vars Production da Vercel para `sk_live`, `whsec` Live e Price IDs Live, seguido de redeploy.
5. Limpar IDs sandbox obsoletos dos profiles para que checkout/portal recriem customer/subscription no ambiente Live.

**Consequence**: LA-T02 fica completa; o próximo trabalho de produto pode avançar para o protótipo EOS Pilot (`PILOT-T01`). As chaves expostas durante a operação devem ser rotacionadas pelo dono.

---

## D-049 — Aba Família vira vista unificada (roster pessoal + membros do círculo)

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO
> Renumerada de D-047 → D-049 em 2026-07-21 para resolver colisão: **D-047 pertence ao Hybrid World Dashboard** (`docs/16-hybrid-world-dashboard.md`).

**Context**: O dono relatou que, quando familiares entraram no seu círculo, a aba Família **não preencheu automaticamente** com esses membros. Revisão do código confirmou a causa: são dois conceitos separados no banco — a aba Família lê `family_members` (roster pessoal que o usuário cria), enquanto entrar no círculo insere em `circle_members` (aparece na aba Círculos). O fluxo de join/approve (`/api/circles/join`, `/api/circles/[id]/requests/[reqId]`) **não escreve em `family_members`**, e a única ponte era uma sugestão de vínculo por nome (P2-T05) que só surgia se o membro já tivesse sido cadastrado manualmente. Isso é o comportamento MVP documentado ("Nenhum merge automático — usuário decide", `docs/12-circle-model.md`), mas **contradiz a promessa-título da própria spec**: "Entrar num círculo = acesso imediato a tudo que o grupo já configurou; ninguém re-cadastra".

**Decision**:
1. A aba Família passa a ser uma **vista unificada**: mostra o roster pessoal (`family_members`) **mais** os co-membros do círculo, exibidos como cards **somente-leitura** com selo "Do círculo · <nome>". Mesmo padrão do Household de inventário — uma **vista calculada, sem duplicar dado** (nenhuma escrita nova em `family_members`).
2. **Dedup**: um co-membro do círculo não é exibido como card separado se já estiver vinculado a um `family_members` (`linked_user_id`) ou se o nome bater com um membro pessoal existente — nesses casos o card pessoal já o representa (e oferece o vínculo P2-T05).
3. **Escopo das informações nesta 1ª entrega**: usa apenas o que o círculo já expõe via `/api/circles` (nome, role, localização, contato de emergência quando compartilhado). **Ficha médica** dos co-membros (tipo sanguíneo, alergias, medicações) fica como follow-up, pois exige uma decisão de privacidade + ampliação da API (hoje `/api/circles` não expõe campos médicos).
4. Sem mudança de schema. Implementação client-side na tela Família consumindo `/api/circles`.

**Consequence**: entrar/aprovar alguém no círculo passa a refletir na aba Família automaticamente, cumprindo a promessa da spec, sem merge destrutivo nem duplicação. `docs/12-circle-model.md` atualizado. Follow-up registrado: compartilhamento de ficha médica no círculo (privacy-gated).

---

## D-047 — Hybrid World Dashboard (arquitetura híbrida: mundo como interface)

**Date**: 2026-07-21
**Status**: DECIDED / SPEC (implementação autorizada em D-050)

**Decision**: EOS prototipa um Dashboard "mundo como interface" com **MapLibre GL JS** como engine de render, providers de mapa/terreno/imagem substituíveis como base, fontes oficiais de hazard normalizadas, e overlays proprietários do EOS (Risk Index, família, rotas, abrigos, recursos, cenários, Pilot). Meta visual: interface situacional automotive-grade, independente de provider. Primeira implementação **isolada e reversível**, dados mock rotulados, sem persistência de localização de família sem decisão de privacidade separada. Spec completa: `docs/16-hybrid-world-dashboard.md`.

**Consequence**: registra a direção de produto/arquitetura do próximo Dashboard. Gate de implementação estava fechado no doc 16; liberado por D-050.

---

## D-046 — EOS Pilot como camada contextual integrada ao Dashboard

**Date**: 2026-07-20
**Status**: DECIDED / SPEC

**Context**: O EOS resolve preparação, monitoramento e resposta, mas emergências graves são esporádicas. O dono identificou uma oportunidade de uso diário: os mesmos dados que ajudam a decidir evacuação, preparação e risco também podem ajudar a decidir se a família deve pescar, navegar, acampar, viajar ou voltar antes de o contexto piorar. A pergunta central foi: como usar os dados do EOS no dia a dia antes de uma emergência séria?

**Decision**:
1. Criar **EOS Pilot** como a camada contextual de decisão do EOS, não como nova identidade principal do produto.
2. O Pilot começa perguntando **"What's the plan?"** / **"Qual e o plano?"**, aprende por opções progressivas e cruza intenção, ambiente, família, recursos e regras de segurança.
3. No primeiro teste, o Pilot entra como **complication/módulo integrado ao Dashboard**, não como nova aba permanente e não como chatbot genérico.
4. As respostas usam estados objetivos: `GO`, `LIMITED`, `WAIT`, `AVOID` e `PRIORITY OVERRIDE`.
5. Regras críticas e alertas oficiais sempre vencem preferências aprendidas ou interpretação por IA.
6. O Pilot é uma etapa de experiência de produção após a ativação Stripe Live, salvo decisão explícita do dono para prototipar antes.

**Consequence**: A spec fica em `docs/15-eos-pilot.md`; o roadmap ganha a etapa **Production Experience — EOS Pilot**. O próximo item operacional continua sendo LA-T02 (Stripe Live cutover). O Pilot não muda código agora.

---

## D-045 — Landing de conversão v3 ("Prévia Viva") adiada até depois do Stripe no ar

**Date**: 2026-07-19
**Status**: DECIDED / DEFERRED

**Context**: Existe uma landing muito mais ambiciosa documentada em `EOS documents/Landing EOS/` — `eos-landing-v3-interactive-spec.md` (spec da "Prévia Viva": a página inteira é uma máquina de estados de risco SAFE/WATCH/WARNING/CRITICAL, com protótipo navegável) e `eos-landing-v2-preview.jsx` (preview React). A landing **em produção** (`app/page.tsx`) é minimalista e foi estendida em 2026-07-17 com preços públicos + rodapé legal + `/terms`, `/privacy`, `/refund` para a revisão do Stripe.

**Decision**: Priorizar **pôr no ar + ativar o Stripe** com a landing minimalista atual (que já é suficiente para a revisão do processador). A landing de conversão v3 é um projeto de produto à parte, de esforço bem maior, e fica **adiada** para depois do lançamento pago. Registrada no roadmap como tarefa futura (ver P3-T07).

**Consequence**: Não implementar a v3 agora. A landing atual serve tanto ao usuário quanto ao revisor do Stripe. Quando o faturamento estiver ativo, retomar a v3 a partir da spec já escrita.

---

## D-044 — 3 agentes de sobrevivência (MacGyver/SEAL/SAS) + fix de truncagem da análise

**Date**: 2026-07-11
**Status**: DECIDED / IMPLEMENTADO

**Context**: Após a análise determinística/base na tela Cenário, o dono quis dar ao usuário a opção de aprofundar com 3 "especialistas de sobrevivência": improviso (MacGyver), operação (Navy SEAL) e sobrevivência de campo (SAS). Além disso, o texto da análise aparecia **cortado no final** (palavras incompletas, raciocínio não conclui).

**Decision**:
1. **Agente = experiência distinta, não o mesmo plano com outro tom.** (Refinado em 2026-07-12 a pedido do dono: a 1ª versão saía "quase idêntica ao determinístico".) Quando `agent` está setado, `/api/analyze` usa `buildAgentPrompt` (não o formato rígido) — um **companheiro/mentor** que, nesta ordem, lê o **inventário**, checa **cada ficha da família** (idade/condições/medicamentos/mobilidade/bebês), consulta o **clima ao vivo** da localização (via `fetchOpenMeteoForecast` + alertas NWS, injetado no prompt) e o que a pessoa está **planejando** (próximas horas/dias), e então **soma tudo** para dar sugestões personalizadas por perfil, ensinando o porquê. Saída **conversacional livre** (`raw_text`), **sem seções rígidas e sem disclaimers**. O Rules Engine ainda roda e informa a prioridade (grounding), mas não força o formato. RAG enriquecido por agente. Consultas de agente **não são persistidas**.
2. **UI**: na tela Cenário, após o resultado base, um seletor com os 3 agentes (glyphs vetoriais, sem emoji); tocar re-executa com aquele companheiro e mostra badge do agente ativo. A resposta do agente é renderizada em tipografia de leitura (DM Sans), não monoespaçada. O cliente envia lat/lng para o clima. Bilíngue PT/EN. Verificado com OpenAI: saída calorosa, cita inventário real, personaliza por membro (bebê/idoso/condição médica), usa o clima real, sem disclaimer.
3. **Fix de truncagem (2 causas)**: (a) `useTypewriter` não resetava o índice na transição para "done" — quando o texto formatado era mais curto que o índice já digitado do stream bruto, o `displayed` congelava no stream bruto (cortado pelo `max_tokens`). Agora o typewriter só anima durante o streaming e o texto **completo** é renderizado ao concluir. (b) `max_tokens` 1500 → **2400** e timeout 30s → 45s, para o LLM não parar no meio da última ação. Também corrigido um bug pré-existente: a mensagem do usuário mandava `\${body.scenario}` literal (com `$` escapado) em vez do cenário real.

**Consequence**: o usuário recebe a análise base determinística e pode pedir a visão de cada especialista; o texto nunca mais aparece cortado. O Rules Engine continua sendo a fonte de verdade de prioridade/riscos. Build/lint/tsc limpos; 41 testes passam.
---

## D-043 — Rede de inteligência de riscos: subsistema `lib/hazards/` desacoplado + honestidade de estado

**Date**: 2026-07-10
**Status**: DECIDED / IMPLEMENTADO (fundação); Fase 2 (persistência + push por hazard) deferida e documentada

**Context**: Pedido de auditoria completa das integrações meteorológicas/emergência e implementação das ausentes (WeatherKit, nowcast, NHC, raios, IPAWS, ShakeAlert) + um componente visual "Live Intelligence Network" com estado real. Auditoria (`docs/hazard-data-integrations-audit.md`) confirmou: previsão real é Open-Meteo (não WeatherKit), NWS/USGS parciais, NHC/raios/IPAWS/ShakeAlert/nowcast ausentes, push só manual.

**Decision**:
1. **Subsistema novo e aditivo** em `lib/hazards/` — não altera `lib/monitor.ts` nem `lib/weather/` (não quebrar o existente).
2. **Modelo unificado `HazardEvent`** + interfaces desacopladas por provider.
3. **Providers reais keyless**: NWS (normalização completa + dedup), USGS (distância/tsunami/relevância), NHC (`CurrentStorms.json`), Open-Meteo `minutely_15` (nowcast).
4. **Adapters `NOT_CONFIGURED`** para WeatherKit/AccuWeather/Xweather/ShakeAlert/FEMA IPAWS — interface + env + flag, **sem chamada falsa, sem chave fake, sem "connected" simulado**.
5. **Honestidade de estado** (`aggregateNetworkStatus`): "ALL SYSTEMS LIVE" só quando todo canal obrigatório+configurado está `live` e nenhum em fallback. Estado atual real: `USING BACKUP WEATHER SOURCE` (WeatherKit ausente → Open-Meteo).
6. **Componente `LiveIntelligenceNetwork`** na tela Cenário (rotativo, reduce-motion, expansível), consumindo `GET /api/hazards`.
7. **Segredos só no servidor** (`lib/hazards/env.ts`); thresholds centralizados (`config.ts`).
8. **Deferido**: persistência (migration `20260710010000_hazard_tables.sql` com RLS, a aplicar) e automação de push por hazard.

**Consequence**: EOS passa a ter uma central multi-fonte com status verificável e classificação visual que separa alerta oficial de análise do EOS. Ativar um provider comercial = preencher env vars + implementar o branch real do adapter (ver `hazard-provider-setup.md`). 41 testes passam; build/lint/types limpos.
---

## D-042 — Monetização (P3-T04): Stripe self-serve, preços via env, downgrade na expiração

**Date**: 2026-07-10
**Status**: DECIDED / IMPLEMENTADO (código pronto; ativação depende de checklist do dono)

**Context**: Os 3 tiers (D-020) e o mapa completo de features→tier (`lib/feature-gates.ts`, D-021/D-025) já estavam prontos e sendo **lidos** em Settings/Círculos, mas **não existia caminho de escrita** para `profiles.plan` — nenhum código de cobrança. O botão "Fazer upgrade" só dava `alert(...)`. Sem isso, o freemium não gera receita e ninguém consegue subir de plano. Único item aberto do roadmap.

**Decision** (confirmada pelo dono em 2026-07-10):
1. **Provedor: Stripe.** Checkout hospedado + Billing Portal (usuário gerencia/cancela sozinho) + webhooks como fonte de verdade. Cartão internacional; Pix fica para depois via parceiro.
2. **Escopo: self-serve completo.** Checkout → webhook escreve `profiles.plan` automaticamente → Portal para gerenciar → **downgrade para `free` quando a assinatura expira/cancela**.
3. **Preços via env var (Price IDs).** O código referencia `STRIPE_PRICE_FAMILY` e `STRIPE_PRICE_PREMIUM`; o dono cria produtos/preços (valor, moeda, mensal/anual) no Stripe Dashboard. Nenhum valor hardcoded — trocar preço = trocar env var, sem deploy de código.

**Implementação**:
- **DB** (`supabase/migrations/20260710000000_stripe_billing.sql`): `profiles` ganha `stripe_customer_id`, `stripe_subscription_id`, `plan_status`, `plan_current_period_end`. **Precisa ser aplicada no SQL Editor** (sem credencial de DB no ambiente do agente — mesmo padrão de D-038).
- **`lib/stripe.ts`**: client server-only (`getStripe()` → null se sem chave, degrada limpo); `planForPriceId()` (reverse map preço→plano) e `priceIdForPlan()`.
- **Rotas**: `POST /api/billing/checkout` (cria/reusa customer, abre Checkout Session), `POST /api/billing/portal` (abre Billing Portal), `POST /api/billing/webhook` (verifica assinatura com `STRIPE_WEBHOOK_SECRET`, raw body, escreve plano via service-role em `checkout.session.completed` / `customer.subscription.updated` / `.deleted`).
- **UI**: Settings — botão de upgrade abre Checkout; botão "Gerenciar assinatura" (Portal) quando plano ≠ free; trata retorno `?billing=success|cancelled`.

**Checklist de ativação (dono)** — feature fica inerte (503) até:
1. Aplicar a migration no Supabase SQL Editor.
2. Criar 2 produtos/preços recorrentes no Stripe → copiar os Price IDs.
3. Setar no Vercel (Prod+Preview): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FAMILY`, `STRIPE_PRICE_PREMIUM`.
4. Registrar o endpoint de webhook no Stripe: `https://eos-app-fawn.vercel.app/api/billing/webhook` (eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`).
5. Redeploy.

**Consequence**: com o checklist feito, qualquer usuário faz upgrade/downgrade sozinho e o plano reflete a assinatura real. `profiles.plan` deixa de ser manual. Enquanto o checklist não roda, as rotas degradam para 503 e a UI mantém o estado atual (nada quebra).
---

## D-041 — Entrar num círculo por convite é grátis (só criar é gate Família)

**Date**: 2026-07-08
**Status**: DECIDED / IMPLEMENTADO

**Context**: A tela `/circles` inteira era bloqueada para o plano `free` (gate `circulos: 'family'`). Consequência: quem era **convidado** (e está no free) não conseguia nem inserir o código para aceitar o convite — teria que fazer upgrade só para entrar. Isso trava a viralização (o dono paga, mas cada convidado esbarra num paywall).

**Decision**: **Entrar** num círculo (código, QR, busca por nome, pedir para entrar) e **ver** círculos dos quais já é membro passam a ser **grátis para todos**. Apenas **criar** um círculo permanece no plano Família. Na UI, o card "Criar" mostra prompt de upgrade para o free; o card "Entrar" fica sempre funcional. As rotas de API de join/requests nunca checaram plano (o gate era só de UI), então a mudança é só na página.

**Consequence**: o modelo freemium fica: organizar/criar círculo = pago; ser convidado e participar = grátis. `circulos: 'family'` agora significa "criar". `qr_emergencia` e monitoramento multi-local seguem gated normalmente.
---

## D-040 — Fluxo completo de adicionar membros (6 formas) + aprovação

**Date**: 2026-07-05
**Status**: DECIDED / IMPLEMENTADO E TESTADO (19/19 E2E)

**Context**: O doc `12-circle-model.md` descreve 6 formas de adicionar membro, mas só 1½ estavam implementadas (família manual; join por código era instantâneo, sem a aprovação que o spec pede). Faltava: aprovação, pedido sem código (busca por nome), e scanner de QR (convite e ficha).

**Decision** — implementadas todas as 6 formas:
1. **Família manual** — já existia (`/api/family-members`).
2. **Escanear ficha → membro manual** — botão 📷 na Família abre `QRScanner`; ao ler `/ficha/[id]`, lê a ficha pública e pré-preenche o cadastro.
3. **Convite por código** — `POST /api/circles/join` agora cria **pedido pendente** (não entra direto); Admin aprova.
4. **Convite por QR** — o QR do círculo embute o código; `QRScanner` na tela Círculos lê e preenche o código.
5. **Pedido por busca (sem código)** — `GET /api/circles/search?q=` + `POST /api/circles/[id]/requests`.
6. **Escanear ficha → convidar** — mesmo scanner; ficha reconhecida abre a ficha pública.

**Aprovação** (novo): tabela `circle_join_requests` (pending/approved/rejected, migration `20260705000100`). Rotas: `[id]/requests` (GET Admin lista / POST pedir), `[id]/requests/[reqId]` (aprovar/rejeitar), `my-requests`. Admin verificado em app-code; operações cross-user via **service-role client** (`lib/supabase/admin.ts`) para não recair na recursão de RLS de círculos.

**Bugs corrigidos no caminho** (RLS/embed): (a) join resolvia o círculo pelo código com o client do usuário, mas `circles` é member-only sob RLS → não-membro via 404 → agora resolve via service-role; (b) embeds PostgREST `profiles(...)` em `circle_members` e `circle_join_requests` **não funcionam** porque `user_id`/`requester_id` referenciam `auth.users` (não `profiles`) e `profiles` é owner-only → a lista de membros vinha **vazia até para o criador** → agora busca perfis em query separada via service-role.

**Scanner**: `html5-qrcode` (client-only, import dinâmico) + `lib/qr-parse.ts` (parser puro, distingue código de 6 chars vs URL `/ficha/[id]`, testado 8/8). Câmera testada no dispositivo pelo usuário.

**Consequence**: entrar num círculo agora exige aprovação do Admin (muda o comportamento anterior de join instantâneo — alinhado ao spec). Verificado E2E com `scripts/_members.mjs`: 19/19 (criar → pedir por código/busca → listar com nome → aprovar/rejeitar → virar membro → autorização de não-admin).
---

## D-001 — Next.js App Router (not Pages Router)
**Date**: Project init  
**Decision**: Use Next.js 14 App Router with TypeScript strict mode.  
**Rationale**: Server components, streaming, built-in middleware auth support.

---

## D-002 — Supabase as Backend
**Date**: Project init  
**Decision**: Supabase for PostgreSQL + pgvector + auth + RLS.  
**Rationale**: Managed Postgres with vector search built-in. No separate vector DB needed.

---

## D-003 — SSR Cookie Auth (not localStorage)
**Date**: 2026-06-23  
**Decision**: All auth uses @supabase/ssr with SSR cookies.  
**Rationale**: localStorage tokens are empty in server components and API routes. Cookies work everywhere. This fixed the Decision Engine 401 bug.

---

## D-004 — Rules Engine is Sacred
**Date**: 2026-06-23  
**Decision**: The Rules Engine always runs before the LLM and the LLM cannot downgrade its urgency output.  
**Rationale**: Safety guarantee. In a real emergency, a false "LOW" from the LLM could cost lives. The rules are deterministic and conservative.

---

## D-005 — Three-Tier Intelligence (not two)
**Date**: Project design  
**Decision**: CONNECTED → LOCAL_AI → SURVIVAL as a fallback chain, not feature flags.  
**Rationale**: The app must work in zero-infrastructure scenarios. Degrading gracefully is a core product requirement.

---

## D-006 — text-embedding-3-small for RAG
**Date**: Project design  
**Decision**: Use OpenAI text-embedding-3-small (1536 dims) with HNSW index and 0.78 cosine threshold.  
**Rationale**: Balance of quality and cost. 1536 dims > 1024 (ada-002 small) without the cost of large.

---

## D-007 — PDF → Text → Embed (two-step ingest)
**Date**: 2026-06-23  
**Decision**: Ingest pipeline is split: Python (PyMuPDF) extracts text, then Node (native fetch) embeds and upserts.  
**Rationale**: pdf-parse + tsx caused OOM (openai SDK v6 = 13MB JS exhausts V8 heap before any code runs). PyMuPDF handles 34MB PDFs trivially. Native fetch avoids all SDK overhead.

---

## D-008 — Knowledge Base: 14 Emergency PDFs
**Date**: 2026-06-23  
**Decision**: Ingest 14 curated emergency PDFs. Exclude Bibles (docs/bibles/).  
**Rationale**: The knowledge base should be domain-specific emergency content. Religious texts are personal, not emergency protocol.

---

## D-009 — Vercel for Hosting
**Date**: Project init  
**Decision**: Deploy to Vercel, auto-deploy on push to main.  
**Rationale**: Zero-config Next.js deployment. Edge functions for middleware.

---

## D-010 — SDD / App Spine Methodology
**Date**: 2026-06-23  
**Decision**: Adopt Spec-Driven Development. /docs is the source of truth. Code follows spec.  
**Rationale**: The project has grown organically with many uncommitted or undocumented decisions. SDD provides a structured way to maintain alignment across sessions and collaborators.

---

## Pending Decisions

| ID | Question | Blocking |
|---|---|---|
| PD-001 | Language strategy: English-only vs bilingual (PT/EN)? | P1-T05 |
| PD-002 | Landing page approach: minimal orienting page vs full marketing? | P1-T04 |
| PD-003 | Monetization model: freemium, subscription, or free? | Phase 3 |
| PD-004 | Mobile timeline: when to initialize React Native? | P2 start |

---

## D-011 — Apenas OpenAI como provedor LLM
**Date**: 2026-06-28  
**Decision**: O projeto usa exclusivamente a API da OpenAI. Anthropic nunca foi intencional.  
**Rationale**: O usuário confirmou: "eu nunca quis usar a api da anthropic pois eu uso da open ai". Todo código com Anthropic SDK foi removido. `/api/analyze` e `/api/checklist/generate` usam `gpt-4o-mini`.

---

## D-012 — Checklist integrado na tela de Recursos
**Date**: 2026-06-28  
**Decision**: Os itens do checklist são exibidos e interativos na tela de Recursos (inventory), não apenas na tela dedicada `/checklist`.  
**Rationale**: O usuário quer ver os recursos e o checklist juntos — "devem estar integrados tudo que é gerado o checklist com a tela de Recursos". Marcar um item como adquirido atualiza automaticamente o inventário.

---

## D-013 — Sync unidirecional: checklist → inventory (nunca decresce)
**Date**: 2026-06-28  
**Decision**: Marcar um item do checklist como adquirido ATUALIZA o inventário (via `Math.max`). Desmarcar NÃO diminui o inventário.  
**Rationale**: Preservar dados inseridos manualmente. Se o usuário já tem 100L de água no inventário e marca um item de 45L, o inventário continua 100L. A sincronização é aditiva, não substitutiva.
---

## D-014 — Círculo como espaço compartilhado (não lista de contatos)
**Date**: 2026-06-28
**Decision**: Entrar num círculo dá acesso imediato a todos os dados do grupo — membros, inventário, checklist, fichas.
**Rationale**: O usuário não deve re-cadastrar o que o líder já configurou. O círculo é o "sistema nervoso" da família preparada.

---

## D-015 — Household inventory = soma calculada (não entidade separada)
**Date**: 2026-06-28
**Decision**: Não existe tabela "household_inventory". O Household é uma vista calculada: soma dos itens pessoais de cada membro onde `shared = true`.
**Rationale**: Evita duplicação de dados e conflitos de sync. Cada pessoa é dona dos seus itens. O sharing é granular por campo, não por perfil inteiro.

---

## D-016 — Roles no círculo: Admin / Editor / Viewer
**Date**: 2026-06-28
**Decision**: Três roles com permissões distintas. Admin = full control + nomear roles. Editor = editar dados, não gerenciar membros. Viewer = leitura + comentários.
**Rationale**: Família tem hierarquia natural. Pai e mãe têm controle total, filha mais velha pode editar, filha mais nova só visualiza. O líder (criador) é sempre Admin e não pode ser rebaixado.

---

## D-017 — Merge de membro manual ao entrar como vinculado: badge + decisão do usuário
**Date**: 2026-06-28
**Decision**: Quando um membro vinculado (conta real) entra no círculo e já existe um cadastro manual para a mesma pessoa, mostra badge "possível duplicata". O Admin decide vincular ou manter separado. Nenhum merge automático no MVP.
**Rationale**: Merge automático por nome/idade é propenso a erro. Melhor deixar o humano decidir.

---

## D-018 — UX: nunca bloquear com erro por falta de círculo
**Date**: 2026-06-28
**Decision**: Se o usuário tenta convidar alguém ou compartilhar ficha sem ter um círculo, o app guia para criar o círculo primeiro — nunca exibe erro cru.
**Rationale**: O usuário não pensa em "criar círculo" e "convidar" como passos separados. Ele pensa em "trazer minha filha para o app". A sequência técnica não pode vazar para a UX.

---

## D-019 — Ficha Master como identidade central do usuário logado
**Date**: 2026-06-28
**Decision**: Não existe "perfil" separado de "ficha". Existe uma única **Ficha Master** que é a identidade central do usuário — coletada progressivamente desde o onboarding e presente em todas as partes do app.
**Rationale**: Atualmente os dados do usuário estão fragmentados: nome em `profiles`, localização em `profiles`, tipo sanguíneo em `/ficha`, role do círculo em outra tela. O usuário não sabe quem ele é no sistema. A Ficha Master é o ponto único de identidade de onde tudo deriva: análise de cenário, checklist personalizado, QR de emergência, e o que os membros do círculo enxergam sobre ele.
**Impacto**: A tela `/ficha` atual é um rascunho. Precisa ser redesenhada como Ficha Master com coleta progressiva desde o onboarding.

---

## D-020 — Modelo de assinatura: Gratuito / Família / Premium
**Date**: 2026-06-28
**Decision**: Três tiers de assinatura. A Ficha Master é o ponto de entrada e apresenta o que está disponível e o que requer upgrade. Tiers: `free`, `family`, `premium`.
**Rationale**: O produto tem valor diferenciado por nível de preparação e tamanho do círculo. Features futuras serão atribuídas a tiers sem refatoração de banco.
**Campo no banco**: `profiles.plan` enum `('free', 'family', 'premium')` com default `'free'`.

---

## D-021 — Feature gates em código, não em banco

**Date**: 2026-06-28
**Decision**: O mapeamento de features → tiers vive num único arquivo de configuração no código (ex: `lib/feature-gates.ts`). O banco guarda apenas `profiles.plan`. Adicionar uma nova feature a um tier = modificar só esse arquivo, sem migration.
**Rationale**: Flexibilidade total para evoluir o modelo de negócio. Hoje são 3 tiers e X features; amanhã podem ser 4 tiers e 3X features. A regra de acesso não pode estar espalhada pelo código.
**Estrutura**:
```
FEATURE_GATES = {
  qr_emergencia:      'family',
  circulos_multiplos: 'premium',
  analise_ia:         'family',
  exportar_ficha:     'premium',
  ...
}
```

---

## D-022 — Monitoramento como camada proativa (não reativa)
**Date**: 2026-06-28
**Decision**: O EOS passa de reativo (usuário descreve → recebe plano) para proativo (app detecta ameaças → alerta usuário → plano com contexto real). O monitoramento não substitui o campo livre de descrição — enriquece o contexto da análise AI com dados oficiais antes de o usuário digitar.
**Rationale**: A maior dor de um pai de família em emergência é não saber o que está acontecendo nem se deve agir. Dados em tempo real de NWS, USGS, FEMA eliminam esse vazio. Spec completa em `docs/14-monitoring.md`.

---

## D-023 — Tela Cenário redesenhada como hub de monitoramento
**Date**: 2026-06-28
**Decision**: A tela Cenário é redesenhada para mostrar um painel de status de ameaças (clima, terremoto, incêndio, qualidade do ar, desastres FEMA) ANTES do campo de descrição livre. Tocar num alerta pré-preenche o campo e dispara análise com contexto real.
**Rationale**: O campo de texto vazio é intimidador sem contexto. Com o painel de monitoramento, o usuário vê imediatamente o que é relevante para sua localização e pode agir com um toque. O campo livre continua disponível para situações não monitoradas.

---

## D-024 — Localização deve ser lat/lng, não texto livre
**Date**: 2026-06-28
**Decision**: `profiles.location` (texto) continua como label legível na UI, mas adiciona-se `profiles.location_lat float8` e `profiles.location_lng float8`. Geocodificação via Nominatim (OpenStreetMap, gratuito) ao salvar a localização.
**Rationale**: Todas as APIs de monitoramento (NWS, USGS, AirNow, NASA FIRMS, FEMA) são geo-baseadas e requerem coordenadas. Sem lat/lng, nenhuma delas funciona. Este campo é pré-requisito (P2-T08) para toda a feature de monitoramento.

---

## D-025 — Fontes de monitoramento por tier
**Date**: 2026-06-28
**Decision**: Gratuito = NWS + USGS (universalmente úteis, sem chave). Família = + AirNow + FEMA + NASA FIRMS + monitoramento de múltiplas localizações do círculo. Premium = + CDC + FDA + notificações push + histórico 30 dias.
**Rationale**: As fontes gratuitas cobrem as ameaças mais imediatas (clima severo e terremotos) e são suficientes para o valor básico do produto. Fontes especializadas (qualidade do ar, recalls, surtos) justificam upgrade.

---

## D-026 — Idioma bilíngue PT/EN selecionado em Settings
**Date**: 2026-06-28
**Decision**: EOS terá interface bilíngue Português/Inglês. O usuário escolhe o idioma no menu Settings; a preferência é persistida no dispositivo e aplicada sem exigir uma mudança de conta ou plano.
**Rationale**: A base atual mistura os dois idiomas e o produto atende famílias em contextos internacionais. Uma preferência explícita evita inferências incorretas pelo navegador e mantém o controle com o usuário.

---

## D-028 — Sentry: Deferido até pós-viabilidade de MVP
**Date**: 2026-06-29
**Decision**: Não configurar `SENTRY_DSN` no Vercel nem ativar o Sentry no MVP. Tarefa P1-T07 movida para DEFERRED.
**Rationale**: Os configs `sentry.*.config.ts` existem e são guardados por `if (dsn)` — sem `SENTRY_DSN` configurada, o SDK não inicializa e nenhum overhead é adicionado. Para um MVP com base de usuários pequena, os logs de funções do Vercel cobrem erros críticos sem custo ou complexidade adicionais. Configurar Sentry agora não resolve nenhum problema presente.
**Quando reavaliar**: >50 usuários ativos OU primeiro bug de produção que não aparece nos logs do Vercel. Pré-requisito: criar conta Sentry, obter DSN, adicionar `SENTRY_DSN` (server) e `NEXT_PUBLIC_SENTRY_DSN` (client) no Vercel.
**Alternatives considered**: Ativar agora (rejeitado — custo de setup > benefício no MVP), Remover configs (rejeitado — já existem, não atrapalham nada desativados).

---

## D-027 — Repriorizar Ficha Master antes de concluir alinhamento bilíngue
**Date**: 2026-06-29
**Decision**: P1-T05 retorna a PENDING com trabalho restante preservado. P2-T06 passa a IN PROGRESS por solicitação explícita do usuário. Após a Ficha Master, P1-T05 deve ser retomada; não está cancelada nem considerada concluída.
**Rationale**: A Ficha Master é a base de identidade usada pelos próximos incrementos de assinatura e Círculos. Consolidá-la agora reduz retrabalho nas telas subsequentes.

---

## D-029 — Cross-device sync: 3 camadas (cache + Realtime + fila offline)
**Date**: 2026-06-30
**Decision**: Sincronização cross-device implementada em 3 camadas: (1) TTL da cache Workbox reduzido de 24h para 2min para APIs; (2) Supabase Realtime `postgres_changes` invalida e refaz fetch em tempo real; (3) Fila de escrita offline em `localStorage` (`eos:offline_queue`) com flush automático ao reconectar.
**Rationale**: A raiz do problema era o Workbox com `NetworkFirst` e TTL de 24h — dados atualizados no servidor não chegavam ao dispositivo até a cache expirar. Realtime garante propagação imediata entre dispositivos. A fila offline garante que escritas feitas sem internet não se perdem.
**Arquivos**: `lib/sync.ts`, `hooks/useRealtimeSync.ts`, `hooks/useOfflineQueue.ts`, `components/SyncStatus.tsx`

---

## D-030 — Salvar formulários só no blur / ação explícita (não debounce)
**Date**: 2026-06-30
**Decision**: Formulários de edição (ex: Ficha) não salvam automaticamente enquanto o usuário digita. Salvamento ocorre: (a) ao sair do campo (`onBlur`), (b) ao clicar em botão "Salvar" explícito, (c) em ações discretas (selecionar tipo sanguíneo, adicionar/remover item de lista). Flag `isDirtyRef` impede o Realtime de sobrescrever o formulário com mudanças não salvas.
**Rationale**: Debounce de 700ms combinado com Realtime causava sobrescrita do campo enquanto o usuário digitava. `onBlur` é o contrato correto: o usuário terminou de editar quando saiu do campo.

---

## D-031 — Safe area insets via CSS env() no body (não por página)
**Date**: 2026-06-30
**Decision**: `viewportFit: 'cover'` + `statusBarStyle: 'black-translucent'` no manifest causavam conteúdo "sangrando" sob o notch do iPhone. Solução: variáveis CSS `--sat/--sab/--sal/--sar` em `:root` + `padding-top: var(--sat)` no `body`. Elementos `position: fixed` (AppActions, SyncStatus) requerem tratamento individual com `env(safe-area-inset-top/bottom)`.
**Rationale**: Aplicar no `body` cobre todas as páginas automaticamente sem precisar modificar cada inline style. Elementos fixed não herdam padding do body, então precisam de `env()` direto.

---

## D-032 — Push notifications via VAPID + Web Push API
**Date**: 2026-06-30
**Decision**: Notificações push usam VAPID (Voluntary Application Server Identification) via `web-push` npm package. Chaves geradas uma vez e armazenadas em Vercel env vars. ServiceWorker injeta handlers de `push` e `notificationclick` via `next-pwa` `customWorkerSrc`. Inscrições armazenadas em `push_subscriptions` com RLS (usuário gerencia as próprias).
**Rationale**: Web Push é o padrão W3C para PWAs. VAPID elimina a necessidade de conta em serviços de push de terceiros. Admin de círculo pode enviar alertas de emergência para todos os membros inscritos.

---

## D-033 — Weather Intelligence uses Open-Meteo as primary provider

**Date**: 2026-07-01
**Status**: DECIDED

**Context**: Weather Intelligence feature needs global weather data (temperature, wind, rain probability, UV, AQI, hourly forecast). NWS only covers US. Open-Meteo covers globally, has no API key requirement, and returns WMO-coded conditions.

**Decision**: Open-Meteo forecast + air quality as primary. NWS alerts (via existing monitor.ts) and USGS earthquakes layered on top. Provider statuses tracked in WeatherSnapshot.providers map.

**Consequence**: App works globally. Adding future providers (NOAA, ECMWF, etc.) only requires a new file in lib/weather/providers/ and one parallel fetch in the API route.

---

## D-034 — Weather Intelligence engine runs client-side, not server-side

**Date**: 2026-07-01
**Status**: DECIDED

**Context**: 29 activity toggles need instant response — 0ms latency. Running generateRecommendations() on the server would require a round-trip per toggle.

**Decision**: generateRecommendations(snapshot, activeActivities) is a pure function in lib/weather/engine.ts imported directly into the weather page. It runs in the browser with no network call when activities are toggled.

**Consequence**: Recommendations are instant. The WeatherSnapshot is fetched once from /api/weather-intelligence (server → Open-Meteo → cache 5min) and reused client-side.

---

## D-035 — `SUPABASE_SERVICE_ROLE_KEY` estava ausente no Vercel (bug crítico de produção)

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Teste E2E de jornada completa (usuário real: onboarding → ficha master → família → inventário → checklist → círculos → weather → analyze) revelou que a **página pública da ficha de emergência** `/ficha/[id]` (destino do QR code) e a rota `POST /api/profile/ficha` (leitura por socorristas) retornavam **HTTP 500 com corpo vazio** para qualquer ID. Causa raiz: `SUPABASE_SERVICE_ROLE_KEY` **não estava configurada nas env vars do Vercel** (confirmado via `vercel env ls production` — só existiam ANON_KEY, URL, OPENAI, VAPID, SITE_URL). Sem a chave, `createClient(url, undefined)` lança exceção síncrona → crash da função serverless. O mesmo faltante fazia o RAG (`lib/knowledge.ts → getRelevantChunks`) retornar `[]` silenciosamente, então o Motor de Decisão **nunca usou a base de conhecimento** (3887 chunks ingeridos) em produção — sempre degradava para modo sem-RAG.

**Decision**:
1. Adicionada `SUPABASE_SERVICE_ROLE_KEY` ao Vercel (Production + Preview) via `vercel env add`.
2. Adicionadas guardas defensivas em `app/ficha/[id]/page.tsx` (retorna `notFound()` em vez de crashar) e `app/api/profile/ficha/route.ts` (retorna 503 JSON em vez de 500 vazio) para que uma env var faltante nunca mais derrube a função serverless de forma abrupta.

**Consequence**: A ficha de emergência pública volta a funcionar; o RAG passa a usar a base de conhecimento real; falhas futuras de configuração degradam de forma limpa. A tabela de env vars em `09-build-status.md` foi atualizada.

**Gotcha (importante)**: o valor de `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` está **entre aspas duplas** (`="sb_secret_..."`) e no formato NOVO da Supabase (`sb_secret_...`, 41 chars — não é JWT longo). Na primeira tentativa a chave foi gravada no Vercel **com as aspas literais** → o client instanciava mas não autenticava como service_role → RLS aplicada → `404`. Ao setar via CLI, **remover aspas/whitespace**: `grep ... | cut -d= -f2- | tr -d '"' | tr -d '[:space:]'`. Vercel Sensitive vars não podem ser lidas de volta (`vercel env pull` redige), então valide pelo comportamento em produção, não pelo pull.

**Verificação (2026-07-05)**: `scripts/full-journey.mjs` → **31/31 ✅** contra produção. `POST /api/profile/ficha` e página `/ficha/[id]` retornam 200 com dados reais.

---

## D-036 — VAPID_PRIVATE_KEY + OPENAI_MODEL corrigidos no Vercel

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Duas configs pendentes/quebradas em produção:
1. **Push notifications**: `VAPID_PRIVATE_KEY` estava ausente no Vercel (só a pública `NEXT_PUBLIC_VAPID_PUBLIC_KEY` existia). Sem a privada, `webpush.setVapidDetails` falha e `/api/circles/[id]/push` retorna erro. A privada correspondente à pública existente estava **perdida** (não estava no `.env.local` nem no Vercel).
2. **OPENAI_MODEL**: o valor no Vercel estava corrompido como `"gpt-5\n"` (aspas + newline literal). Só `app/api/ai/readiness` lê essa var (`getOpenAIModel`); as demais rotas tinham `gpt-4o-mini` hardcoded como contorno.

**Decision**:
1. **VAPID**: como `push_subscriptions` tinha **0 linhas** (push nunca funcionou), gerar um **par novo** é seguro (nada a invalidar). Novo par via `web-push generate-vapid-keys`; gravadas `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (substituída) + `VAPID_PRIVATE_KEY` (nova) em Production + Preview e no `.env.local` (gitignored) para não perder a privada de novo.
2. **OPENAI_MODEL**: regravado limpo como `gpt-4o-mini` (sem aspas/newline) em Production + Preview. `getOpenAIModel()` agora faz `.trim()` defensivo. Os 4 `model: 'gpt-4o-mini'` hardcoded (`analyze`, `checklist/generate`, `suggest-tags`, `weather custom-activity`) foram trocados por `getOpenAIModel()` → **fonte única de verdade** (conforme "ação recomendada" registrada em 09-build-status).

**Consequence**: Push notifications passam a funcionar; o modelo OpenAI é configurável por uma única env var saneada. A pública VAPID é inlined em build-time (`NEXT_PUBLIC_`), então exigiu redeploy. Chaves VAPID futuras: **público e privado devem ser um par** — não setar um sem o outro.

---

## D-037 — Gestão de conta em Settings: logout + excluir conta (self-service)

**Date**: 2026-07-05
**Status**: DECIDED / IMPLEMENTADO

**Context**: A tela `/settings` tinha idioma, plano e push, mas **faltava o básico de qualquer app**: botão de logout e gestão da própria conta. O `signOut()` já existia em `lib/auth/actions.ts` mas não estava exposto em nenhuma UI.

**Decision**: Adicionados em `/settings`:
- **Card "Conta"**: e-mail logado, link "Editar meus dados" → `/ficha` (a Ficha Master concentra o CRUD dos dados pessoais), e botão **Sair** (logout via `supabase.auth.signOut()` no browser → redirect `/auth/login`).
- **Card "Zona de perigo"**: botão **Excluir minha conta** com `confirm()`, chamando a nova rota `POST /api/account/delete`.
- Nova rota `app/api/account/delete/route.ts`: autentica o usuário e apaga, em ordem de dependência, todos os dados (action_plans → scenarios → checklists → resource_inventory → family_members → círculos liderados + participações → push_subscriptions → profiles) e por fim o auth user (service role). Desvincula `linked_user_id` em fichas de terceiros. Guarda defensiva se `SUPABASE_SERVICE_ROLE_KEY` faltar (503).

**Consequence**: Usuário pode sair e excluir a própria conta sem suporte. O CRUD de dados de domínio (ficha, família, inventário, checklist) já existia nas telas próprias; Settings passa a ser o hub de conta. Bilíngue PT/EN inline.

---

## D-038 — Perfil ausente quebrava Ficha e Recursos ("Cannot coerce" / FK constraint)

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Usuário real (Paulo, após re-cadastro) viu dois erros que os testes automatizados **não** pegaram:
- Ficha Master: `Cannot coerce the result to a single JSON object`
- Recursos: `insert or update on table "resource_inventory" violates foreign key constraint "resource_inventory_profile_id_fkey"`

**Causa raiz**: o usuário **não tinha linha em `profiles`**. A linha só é criada no **onboarding** (`POST /api/profile`). Mas o **login por senha redireciona para `/scenario`** (não onboarding), e a confirmação de e-mail vai para `/onboarding` que pode não ser concluído. Quem chega em Ficha/Recursos sem perfil quebra: `profiles...single()` com 0 linhas → "Cannot coerce"; insert com `profile_id`/`leader_id` FK → violação. **Por que os testes passavam**: `full-journey.mjs` sempre criava o perfil no passo 1 (onboarding). Reproduzido com `scripts/_noprofile.mjs` (usuário sem perfil) → 6/6 erros idênticos aos prints.

**Decision** (defesa em profundidade):
1. **App self-heal**: `lib/ensure-profile.ts` — `ensureProfile(supabase, user)` faz upsert idempotente (`ON CONFLICT DO NOTHING`) da linha `profiles` usando `full_name` do metadata / prefixo do e-mail / 'Usuário'. Chamado logo após `getUser()` em: ficha (GET+PATCH), inventory (POST), family-members (POST), profile/plan (GET), analyze (POST), checklist/generate (POST). RLS permite o usuário inserir o próprio perfil.
2. **Backfill imediato** (service role): criado perfil para o usuário existente sem um (Paulo). 21 perfis órfãos de testes antigos identificados (auth user deletado, profile ficou) — inofensivos.
3. **Trigger no banco** (`supabase/migrations/20260705000000_auto_create_profile.sql`): `handle_new_user` cria `profiles` em todo INSERT em `auth.users` + backfill. Não aplicado via CLI (sem credenciais de DB no ambiente); a self-heal do app cobre o caso em produção. Aplicar no Supabase Dashboard quando possível.

**Consequence**: qualquer usuário autenticado passa a ter perfil garantido on-demand, independente de completar onboarding. Os erros de Ficha/Recursos não ocorrem mais.

---

## D-039 — "Não autenticado" na Ficha: rotas autenticadas fora do PROTECTED_ROUTES

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Usuário com sessão expirada/ausente abria `/ficha` e via o banner **"Não autenticado."** (a API `/api/profile/ficha` retorna 401). Em rotas protegidas (ex: `/scenario`) ele seria redirecionado ao login; mas **`/ficha`, `/settings` e `/weather` não estavam em `PROTECTED_ROUTES`** no `middleware.ts`, então o usuário sem sessão não era redirecionado — ficava preso numa página autenticada quebrada.

**Decision**:
1. Adicionados `/settings` e `/weather` a `PROTECTED_ROUTES`.
2. `/ficha` adicionado a uma nova lista **`PROTECTED_EXACT`** (match exato), **não** ao prefixo — porque `/ficha/[id]` é a **ficha de emergência pública** (destino do QR) e precisa continuar acessível a socorristas sem login. Proteger o prefixo `/ficha/` teria quebrado o QR.
3. `app/(app)/ficha/page.tsx`: em resposta 401 no load ou no save, redireciona para `/auth/login?redirectTo=/ficha` (trata expiração de sessão no meio do uso, em vez de mostrar o erro).

**Consequence**: sessão inválida em página autenticada leva ao login (com retorno), não a uma tela quebrada. A ficha pública permanece aberta. Aplica o mesmo padrão de proteção que as demais telas do app já tinham.
