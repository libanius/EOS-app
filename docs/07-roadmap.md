# 07 — Roadmap

> Last updated: 2026-08-10

---

## Phase 0 — App Spine Migration

*Goal: Install the Spec-Driven Development operating system and document the current baseline before any new feature work.*

| Task ID | Task | Status | Notes |
|---|---|---|---|
| P0-T01 | Install SDD/App Spine structure | ✅ COMPLETE | AGENTS.md + /docs created 2026-06-23 |
| P0-T02 | Review existing product baseline | ✅ COMPLETE | Reviewed 2026-06-23; 4 bug categories found in analyze route |
| P0-T03 | Confirm MVP scope | ✅ COMPLETE | Stakeholder confirmed 2026-06-23; proceed with P1 fixes |
| P0-T04 | Sequence first real implementation task | ✅ COMPLETE | First task: P1-T01 — fix Decision Engine |

**Exit criteria for Phase 0**: All docs confirmed accurate, MVP scope agreed, Phase 1 tasks sequenced.

---

## PHASE 0B — Foundation Alignment Para EOS Platform

*Goal: reconcile the App Spine around EOS as a multi-surface platform before new major product or platform work.*

> Decision: D-084. This phase exists to avoid turning EOS into separate Web,
> iOS, Android, Automotive, and Mesh products. It is documentation/governance
> only; it does not initialize mobile or implement product features.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| P0B-T01 | Decisão EOS Platform | ✅ COMPLETE | D-084 — one operational core, platform adapters at the edge |
| P0B-T02 | Reconciliar platform strategy | ✅ COMPLETE | `docs/05-platform-strategy.md` now uses Product Core / Domain Core / Shared UI / Platform Adapters |
| P0B-T03 | Reconciliar roadmap canônico | ✅ COMPLETE | `docs/07-roadmap.md` remains canonical; older roadmap taxonomies are historical |
| P0B-T04 | Atualizar base do Spine desatualizada | ✅ COMPLETE | Platform/gates/status/memory updated for the current product reality |
| P0B-T05 | Definir gates para Mobile, Automotive e Mesh | ✅ COMPLETE | G-03 and G-05 stay open; G-06 added for Automotive |
| P0B-T06 | Criar plano de execução para Preparedness Engine | ✅ COMPLETE | Preparedness Engine section added below as the next product planning lane |

**Exit criteria for PHASE 0B**: EOS Platform decision recorded, platform strategy
reconciled, gates updated, mobile explicitly not initialized, and the next core
product phase sequenced.

---

## Phase 1 — MVP Hardening (Web PWA)

*Goal: Ensure the existing implemented features are production-ready and the core user loop works end-to-end.*

| Task ID | Task | Status | Priority |
|---|---|---|---|
| P1-T01 | Fix Decision Engine: auth, field names, schema, persist | ✅ COMPLETE | HIGH |
| P1-T02 | Ingest knowledge base (14 PDFs → 3850 chunks in Supabase) | ✅ COMPLETE | HIGH |
| P1-T03 | Add PWA icons (icon-192.png, icon-512.png) referenced in manifest but missing | ✅ COMPLETE | MEDIUM |
| P1-T04 | Landing page: replace placeholder with minimal orienting page | ✅ COMPLETE | MEDIUM |
| P1-T05 | Bilingual PT/EN UI selected in Settings; align all UI copy | ✅ COMPLETE | MEDIUM |
| P1-T06 | End-to-end test: full user flow from signup to action plan in production | ✅ COMPLETE | HIGH |
| P1-T07 | Sentry error monitoring integration | DEFERRED | — ver D-028 |
| P1-T08 | Rate limit validation: confirm Upstash Redis is connected in production | ⏸️ SUPERSEDED | 2026-08-04 — D-118 escolheu Supabase/Postgres como guardrail distribuído v1; Upstash fica opcional, não requisito de produção |

---

## Phase 2 — Círculos, Fichas & Household (Web PWA)

*Spec completa em `docs/12-circle-model.md`*

| Task ID | Description | Status | Priority |
|---|---|---|---|
| P2-T00 | Circle model spec + decisions documented | ✅ COMPLETE | HIGH |
| P2-T01 | Ficha Pessoal: perfil de emergência + QR público (`/ficha/[id]`) | ✅ COMPLETE | HIGH |
| P2-T06 | Ficha Master: identidade central unificada + onboarding progressivo | ✅ COMPLETE | HIGH |
| P2-T07 | Subscription tiers: `profiles.plan` + `lib/feature-gates.ts` + UI de upgrade | ✅ COMPLETE | HIGH |
| P2-T02 | Círculos: convite por código/QR + aprovação + roles (Admin/Editor/Viewer) | ✅ COMPLETE | HIGH |
| P2-T03 | Inventário: toggle compartilhar por campo + `shared_fields` na DB | ✅ COMPLETE | MEDIUM |
| P2-T04 | Household view: visão agregada dos recursos compartilhados no círculo | ✅ COMPLETE | MEDIUM |
| P2-T05 | Merge de membro manual → vinculado (badge + decisão do usuário) | ✅ COMPLETE | LOW |
| P2-T08 | Localização: `profiles.location_lat/lng` + geocoding (pré-req monitoramento) | ✅ COMPLETE | HIGH |
| P2-T09 | `/api/monitor` — agregador server-side NWS + USGS (tier gratuito) | ✅ COMPLETE | HIGH |
| P2-T10 | Tela Cenário redesenhada: painel de ameaças + campo livre abaixo | ✅ COMPLETE | HIGH |
| P2-T11 | Feature gates de monitoramento em `lib/feature-gates.ts` | ✅ COMPLETE | HIGH |
| P2-T12 | Monitoramento multi-localização (membros do círculo, tier Família) | ✅ COMPLETE | MEDIUM |

**Spec de monitoramento**: ver `docs/14-monitoring.md`.

---

## Launch Activation — Stripe & Production Readiness

*Goal: finish the operational launch checklist without adding new product surface.*

| Task ID | Task | Status | Notes |
|---|---|---|---|
| LA-T01 | Stripe test payment: complete Checkout with test card and verify webhook updates `profiles.plan` | ✅ COMPLETE | 2026-07-20 — `BrightScale Group` updated to `plan=family`, `plan_status=active`, `stripe_subscription_id=sub_...` |
| LA-T02 | Stripe Live cutover: create Live products/keys/webhook, swap env vars test → live, redeploy | ✅ COMPLETE | 2026-07-21 — conta Live `acct_1TuL40IaCSStSVaq` (EOS, US, ativada). Produtos/preços Live ($9.90/$19.90), webhook Live e as 4 env vars da Vercel trocadas para live; deploy fresco. IDs sandbox obsoletos limpos dos profiles. Statement descriptor já = "EOS BRIGHTSCALE". |
| LA-T03 | Optional hazard provider keys (WeatherKit/Xweather/etc.) | DRAFT | Not required for launch; keyless providers already live |
| LA-T04 | Rate limit distribuído + health/error log | ✅ COMPLETE | 2026-08-04 — D-118; Upstash continua opcional, Supabase/Postgres vira guardrail distribuído v1; `/api/health` expõe estado operacional |
| LA-T05 | Gift codes (sem Stripe): criação owner-only + resgate + expiração lazy | ✅ COMPLETE | 2026-07-22 — D-061; `/admin/gift-codes` (ADMIN_EMAILS), `/api/billing/redeem`, `lib/plan.ts`, resgate em Settings |
| LA-T06 | Códigos de afiliado (Stripe): cupom "100% off · once" + promotion codes | ✅ COMPLETE | 2026-08-04 — D-099 / `docs/30-affiliate-codes.md`; `/admin/affiliates`, Stripe promotion code, captura `?ref=`, tracker de referrals/conversões e comissão owed. Aplicar migration `20260804000000_affiliate_codes.sql`. |

---

## Hybrid World Dashboard (HWD)

*Goal: build the world-as-interface Dashboard from `docs/16-hybrid-world-dashboard.md` (D-047), authorized by the owner (D-050). Isolated & reversible; production `/dashboard` untouched.*

> Spec: `docs/16-hybrid-world-dashboard.md`. The EOS Pilot (D-046) lives here as the Pilot Capsule (HWD-05) — so PILOT-T01 on the v2 dashboard is superseded/on hold.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| HWD-00 | Architecture + visual direction spec | ✅ COMPLETE | 2026-07-21 — D-047 / doc 16 |
| HWD-01 | Static visual prototype: isolated `/dashboard-world`, Higgsfield image bg, real HUD components, mock family/route labeled, real RiskProvider data, responsive, reduced-motion — no map SDK | ✅ COMPLETE | 2026-07-21 — plates por estado (safe/watch/storm) geradas via Higgsfield MCP |
| HWD-02 | Live hybrid map prototype: MapLibre + tile/terrain provider, Parkland camera, GeoJSON mock overlays | ✅ COMPLETE (prototype) | 2026-07-21 — MapLibre GL 5.24, provider keyless CARTO dark (config provider-neutra `lib/world/providers.ts`), câmera Parkland pitch 56°, rota+família mock em GeoJSON, fallback para a placa estática. **Terreno 3D** = plugar `NEXT_PUBLIC_MAPTILER_KEY` (opcional). |
| HWD-03 | Real EOS data on map: location, weather/hazard layers, alert tags, Risk Index, inventory/readiness + textual a11y | ✅ COMPLETE | 2026-07-21 — mapa centraliza na **localização real** (RiskProvider coords, flyTo, fallback Parkland); RainViewer keyless via `/api/world/radar`; hazards reais de `/api/hazards` como polígonos/pontos + tags geo-ancoradas; equivalente textual (§22). |
| HWD-04 | Family + routing foundation (separate privacy/data decisions) | ✅ COMPLETE (prototype) | 2026-07-21 — D-051: pontos familiares EOS/círculo no mapa com freshness; rota/shelter via OpenAI como candidato inferido, não oficial; pendência de revisão antes de produção. |
| HWD-05 | Pilot action integration (Pilot Capsule states + actions) — absorbs EOS Pilot | ✅ COMPLETE (prototype) | 2026-07-21 — D-053: deterministic GO/LIMITED/WAIT/AVOID/PRIORITY OVERRIDE + scenario/checklist/notify-family/route-focus actions |
| HWD-06 | Production validation (perf, a11y, responsive, cost, privacy, E2E, rollout) | ⏸️ SUPERSEDED | 2026-07-27 — D-062: o HUD do v1 deixou de ser o caminho de produção. `/dashboard-world` permanece como referência histórica. Os gates abertos migraram para WV2-T05. |

---

## World Dashboard v2 (WV2)

*Goal: rebuild every surface above the map on an Apple-grade design system, and make it the app's front door.*

> Decisions: D-062 (design system + Pilot local-first), D-063 (promoção a `/dashboard` + rollout).
> Código: `components/world-v2/`. O `WorldMap` do HWD é reaproveitado **sem alteração**, travado em base dark.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| WV2-T01 | Fundações: tokens de material iOS, escala tipográfica com tracking óptico, spacing em `rem`, 3 sinais de a11y, e `motion.ts` como fonte única de física | ✅ COMPLETE | 2026-07-27 — D-062 |
| WV2-T02 | `DetentSheet`: sheet com gesto real — tracking 1:1, handoff de velocidade, projeção de momentum, rubber-banding, interrompível, só `transform` | ✅ COMPLETE | 2026-07-27 — substitui o sheet do HWD-06 que animava `height` por clique |
| WV2-T03 | Pilot copiloto: orbe "liquid glass fumê" + console; motor determinístico local (`pilot-engine.ts`) sobre RiskProvider, inventário, ficha e `RulesEngine` | ✅ COMPLETE | 2026-07-27 — D-062.1; 5 intenções; evacuação nunca inferida; declara o que não sabe |
| WV2-T04 | Promoção a `/dashboard`: redirects de entrada, botão central no BottomNav, legacy preservado | ✅ COMPLETE | 2026-07-27 — D-063 |
| WV2-T05 | Validação de produção da v2: E2E de navegador, a11y/perf medidos, custo de provider, revisão de privacidade/proveniência | ✅ COMPLETE | 2026-08-04 — D-097 / `docs/29-world-v2-production-validation.md`; `npm run test:world-v2` audita `/dashboard` em mobile/desktop com Playwright, mede load/bytes/recursos e valida a11y/proveniência básica. |
| WV2-T06 | Rótulos dos controles de mapa no toque | ✅ COMPLETE | 2026-07-29 — legenda visível sob cada ícone (Você / Atualizar / Painel). Toque não tem hover, então o rótulo passou a existir. |
| WV2-T07 | Reconciliar features do HWD v1 sobre a v2 conforme demanda | ✅ COMPLETE | 2026-08-04 — D-098. Camadas ao vivo e toggle de base já estão na v2; notificar círculo migrou para ações contextuais em `MemberSheet`/execução de plano; novos itens de mapa devem virar tarefas específicas. |
| WV2-T13 | Camada premium de vento animado no mapa existente | ✅ COMPLETE | 2026-08-09 — D-141; sem mapa novo, canvas lazy, contrato vetorial U/V, popup WIND, gate Premium e Open-Meteo como fonte pública v1. |
| WV2-T14 | Refazer vento animado como `WindParticleLayer` com bilinear e sem flicker | ✅ COMPLETE | 2026-08-10 — D-142; layer engine imperativo, grid regular 9×9+ por viewport, bilinear, sem React por frame e sem wash piscando. |
| WV2-T15 | Expandir vento para campo escalar premium no WorldMap inteiro | ✅ COMPLETE | 2026-08-10 — D-143; canvas escalar cliente a partir de grid numérico, sem raster tile layer, com partículas vetoriais por cima e gate Premium preservado. |
| WV2-T16 | Transformar vento em modo de mapa premium mundial | ✅ COMPLETE | 2026-08-10 — D-144; `Escuro/Satélite/Vento` como bases mutuamente claras, câmera mundial e grid global mais denso sem travar pan/zoom. |
| WV2-T17 | Sincronizar vento premium com Hurricane Tracker | ✅ COMPLETE | 2026-08-10 — D-145; frames horários Open-Meteo `best_match`, timeline única, posição interpolada do ciclone e perfil paramétrico NHC perto do centro. |
| WV2-T18 | Tornar rastros do vento perceptíveis em vento fraco | ✅ COMPLETE | 2026-08-10 — D-146; mínimo visual de rastro e paleta de partículas com contraste real sobre o campo escalar. |
| WV2-T19 | Transformar ticks do vento em fluxo contínuo com cauda real | ✅ COMPLETE | 2026-08-10 — D-147; mover a partícula pelo passo visual mínimo, fade lento e vida maior antes do respawn. |
| WV2-T20 | Eliminar linhas retas artificiais no vento animado | ✅ COMPLETE | 2026-08-10 — D-148; escolher cópia de mundo mais próxima e descartar segmentos longos de projeção/respawn. |
| WV2-T21 | Manter densidade no zoom e velocidade proporcional ao vento | ✅ COMPLETE | 2026-08-11 — D-149; respawn na viewport visível e passo visual proporcional à velocidade. |
| WV2-T22 | Sliders de densidade e rastro do vento | ✅ COMPLETE | 2026-08-11 — D-150; usuário controla quantidade de partículas e tamanho/memória do rastro sem refetch. |
| WV2-T23 | Controles de vento colapsáveis no mobile | ✅ COMPLETE | 2026-08-11 — D-151; painel lateral compacto no celular, aberto no desktop. |
| WV2-T24 | Painel de vento flutuante com transparência | ✅ COMPLETE | 2026-08-11 — D-152; colapsável em desktop/mobile, fecha ao clicar fora e slider `Mapa` controla opacidade do overlay. |
| WV2-T25 | Slider para setas fallback do vento | ✅ COMPLETE | 2026-08-11 — D-153; controle `Setas` oculta ou mostra ícones/labels `eos-wind` sem refetch. |
| WV2-T26 | `Resolver` do card de risco navega para Preparação | ✅ COMPLETE | 2026-08-12 — D-154; ação doméstica usa botão programático para `/preparedness`. |

---

## Family Location (FAM)

*Goal: answer "where is my family right now" — the central question of an emergency — without turning EOS into a surveillance product.*

> Decisão: **D-064**. Mantém D-051 §2 (só o último ponto, sem histórico).
> Consentimento é opt-in explícito por círculo, via `shared_fields = 'location'`.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| FAM-T00 | Decisão + spec: localização ao vivo, consentimento próprio, freshness, retenção | ✅ COMPLETE | 2026-07-27 — D-064; docs 06 e 12 atualizados |
| FAM-T01 | Migration `20260727000000_live_location.sql`: `last_location_*` em profiles | ✅ COMPLETE | 2026-07-27 — aplicada em produção pelo dono e verificada por REST service-role. |
| FAM-T02 | Corrigir vazamento: gatear `location_lat/lng` em `/api/circles` por `shared_fields` | ✅ COMPLETE | 2026-07-27 — sem consentimento não sai coordenada; retorna `location_source`/`location_at` para a UI rotular |
| CIR-T01 | Círculos: audit 7/20 → reconstrução no design system | ✅ COMPLETE | 2026-08-04 — D-124; 3 funções que nunca funcionaram corrigidas (500 em /plans, defeito latente em /monitoring, RPC inexistente do inventário); 12 controles por membro viram 1 toque; 8/8 |
| HH-T01 | Modelo da casa: fonte única de "quem é a casa e quanto ela tem" | ✅ COMPLETE | 2026-08-04 — D-123 Fase 1; `lib/household.ts` + migration `20260804200000`; cálculos religados só depois de aplicada |
| HH-T02 | Marcar "mora comigo" em Círculos com confirmação | ✅ COMPLETE | 2026-08-04 — D-123 Fase 2; rótulos separados (🏠 casa / ✚ ficha), só a própria pessoa confirma, círculo com distância; `household-consent-test` 6/6 |
| HH-T03 | Dependentes com cuidador, relação e descrição | ✅ COMPLETE | 2026-08-04 — D-123 Fase 3; `relationship` + `care_notes` (instrução de resgate, não ficha médica) e "quem depende de mim" na Ficha; 11/11 |
| FAM-T03 | `POST /api/location` + hook de envio periódico enquanto o app está aberto | ✅ COMPLETE | 2026-07-27 — `LocationReporter` nunca dispara prompt de permissão; 2 min, só com aba visível; servidor grava só o último ponto |
| FAM-T04 | Toggle próprio de localização na tela de Círculos + marcadores reais com freshness no mapa v2; remover mocks do `WorldMap` | ✅ COMPLETE | 2026-07-27 — mocks 'Paulo/Isadora/Ana' + rota + `SHELTER · mock` removidos das duas telas |
| FAM-T05 | Fonte de rota/abrigo (dívida D-051 §5) | ✅ COMPLETE (decisão) | 2026-07-27 — **D-065**: FEMA NSS para abrigo; navegação entregue ao app de mapas; rumo/distância on-device. Dívida D-051 §5 resolvida. |
| FAM-T06 | Provider FEMA NSS: proxy `/api/shelters` com cache + camada no mapa v2 | ✅ COMPLETE | 2026-07-27 — `lib/world/shelters.ts`; verificado ao vivo: 4 abrigos reais perto de Bend/OR, `empty:true` em Parkland |
| FAM-T07 | Rumo/distância on-device + botão "Como chegar" (deep-link) + adaptador de rotas | ✅ COMPLETE | 2026-07-27 — `lib/world/navigation.ts`; Pilot passa a citar abrigo aberto em "ficar ou sair" |
| FAM-T10 | Localização em tempo real (watchPosition) + interação ao tocar no rosto | ✅ COMPLETE | 2026-07-29 — D-073. Verificado: painel abre com rota e 6 mensagens, e "rota até ela" desenha o trajeto no mapa do EOS |
| FAM-T09 | Foto dos membros no mapa + ponto de perfil visualmente aproximado | ✅ COMPLETE | 2026-07-29 — avatar por URL assinada; marcador tracejado quando é endereço e não posição. Corrigido também o bloqueio do reporter em iOS |
| FAM-T08 | Cache offline dos abrigos (`lib/offline-storage.ts`) | ✅ COMPLETE | 2026-07-29 — última lista boa guardada em IndexedDB e servida quando a rede cai; distâncias recalculadas contra a posição atual, `fetchedAt` original preservado |

---

## Cenário — Simulador (SIM)

*Goal: transformar o Cenário num simulador aeronáutico — a família configura o ambiente e o EOS inteiro responde como se fosse verdade.*

> Decisão: **D-067**. Spec completa: `docs/19-scenario-simulator.md`.
> Princípio: **mesmos instrumentos, entradas injetadas.** A injeção acontece no `RiskProvider`, não nas telas.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| SIM-T00 | Spec + decisão do simulador | ✅ COMPLETE | 2026-07-27 — D-067 / doc 19 |
| SIM-T01 | `SimulationProvider` + injeção no `RiskProvider` + cromo persistente + travas de segurança | ✅ COMPLETE | 2026-07-28 — verificado em navegador: risco real 11 → simulado 81, Pilot muda para "Aja agora", faixa some ao encerrar |
| SIM-T02 | Painéis de configuração (ameaça, clima, recursos, saúde, infraestrutura, posição) | ✅ COMPLETE | 2026-07-28 — ameaça, severidade, chegada, infraestrutura, mobilidade/medicação, reservas |
| SIM-T08 | Painel de instrumentos: cada fonte ao vivo / simulada / fora do ar + leituras ajustáveis | ✅ COMPLETE | 2026-07-28 — 7 fontes em 3 modos, 8 leituras com stepper. Follow-up D-204: toda leitura numérica também aceita slider para ajuste contínuo em qualquer device. O Pilot recebe as fontes caídas e nomeia a cegueira. Verificado em navegador |
| SIM-T09 | Traduzir o texto livre do cenário para os painéis, revisável antes de rodar | ✅ COMPLETE | 2026-08-03 — D-094 / `docs/26-simulation-natural-language-panels.md`; OpenAI infere patch validado e usuário revisa antes de iniciar |
| SIM-T10 | Escolher círculos e convidar de fora por link | ✅ COMPLETE | 2026-07-28 — D-072. Migration aplicada. Verificado com 3 contas e 2 círculos: seleção múltipla, membro recebe pop-up, convidado externo entra pelo link em ~6s, reabrir não reseta. |
| SIM-T03 | Sessão: briefing pelo Pilot com RAG, rodar, sair a um toque | ✅ COMPLETE | 2026-07-28 — `/api/pilot/chat` com RAG; o Pilot sabe quando está em simulação |
| SIM-T04 | Injeção de eventos e avanço de tempo ("+6h", "a energia caiu") | ✅ COMPLETE | 2026-07-28 — a faixa de simulação abre controles: +3h, +6h, Impacto, e cortar luz/rede/vias em tempo real |
| SIM-T05 | Debrief com lacunas quantificadas + escrita confirmada no checklist | ✅ COMPLETE | 2026-07-28 — `lib/simulation-debrief.ts`. Verificado: veredito, exigia 6 dias vs tinha 0.9, 5 lacunas, e adicionar gravou no checklist real |
| SIM-T06 | Execução contra o Plano da Família | ✅ COMPLETE | 2026-07-30 — `lib/plan-drill.ts`. O debrief passou a cobrar a DECISÃO, não só o estoque: ponto de encontro inalcançável a pé no cenário, ausência de rota a pé com vias bloqueadas, plano sem gatilho, e quem não reconheceu a versão em vigor. Só checagem computável — nada de casar texto livre com cenário. 10 testes unitários + prova de ponta a ponta no navegador. |
| SIM-T07 | Drills compartilhados no círculo + registro de treino | ✅ COMPLETE | 2026-07-28 — D-071. Migration aplicada e verificada com dois navegadores: convite chega, aceite entra na simulação, encerrar propaga para todos. |

---

## Planos de Emergência da Família (PLAN)

*Goal: carregar o combinado operacional da família — para onde ir e como se encontrar quando nada estiver funcionando.*

> Decisão: **D-066**. Spec completa: `docs/18-family-plans.md`.
> Princípio: **o plano precisa funcionar exatamente quando o EOS não funciona.**

| Task ID | Task | Status | Notes |
|---|---|---|---|
| PLAN-T00 | Spec + decisão do conceito de plano de voo familiar | ✅ COMPLETE | 2026-07-27 — D-066 / doc 18 |
| PLAN-T01 | Modelo de dados + RLS por círculo + API autenticada | ✅ COMPLETE | 2026-07-29 — migration aplicada. Verificado com 2 contas: v1 salva e lida, membro reconhece, autor salva v2 e **o ack da v1 não é carregado adiante**, e reconhecer versão antiga é recusado (`stale`). |
| PLAN-T02 | Editor: pontos de encontro (1/2/3), lugares conhecidos, papéis, gatilhos | ✅ COMPLETE | 2026-07-30 — `/plan` no design system da v2. Escada nomeada pelo caso que resolve; distância/rumo/tempo a pé desde casa; ponto e papel obrigatórios com as lacunas ditas na tela. Gatilhos degradam sozinhos até a migration ser aplicada. |
| PLAN-T03 | Desenho de rotas no mapa + edição de traçado | ✅ COMPLETE | 2026-07-30 — `components/world-v2/RouteDraw.tsx`. Mapa plano para precisão, âncoras nomeadas, traçado ancorado em dois lugares do plano, comprimento/tempo a pé reais, notas de conhecimento local. Provado no navegador: 5 pontos viraram LineString no banco. |
| PLAN-T04 | Versionamento, push ao círculo e reconhecimento explícito | ✅ COMPLETE | 2026-07-30 — versão e idade sempre visíveis; push ao salvar; reconhecimento explícito e lista de quem já viu. Teste prova que a v2 **invalida** o ack da v1. |
| PLAN-T05 | Cache offline do plano + execução sem rede | ✅ COMPLETE | 2026-07-30 — D-075. IndexedDB por círculo com versão e sincronização; `GET /api/plans` NetworkOnly para o cache do SW não mentir idade. Verificado com a rede derrubada no navegador. |
| PLAN-T06 | Envelope do plano + carta offline | ✅ COMPLETE | 2026-07-30 — `lib/plan-envelope.ts` (bounds com margem, área corrigida pelo cosseno da latitude, projeção e barra de escala; 11 testes) + `PlanChart.tsx`, desenho SVG do plano **sem tile nenhum**. Download de tiles fica fora por termos de provedor: CARTO keyless não autoriza cache em massa e não há chave MapTiler. |
| PLAN-T07 | Pilot propõe/revisa planos com confirmação elemento a elemento | ✅ COMPLETE | 2026-08-03 — D-096 / `docs/28-pilot-plan-review.md`; `/plan` mostra propostas do Pilot e aplica cada item só ao rascunho; persistência continua no salvar versionado |
| PLAN-T08 | Executar Plano: Pilot host situacional + painel de ação familiar | ✅ COMPLETE (MVP local) | 2026-07-31 — D-079. Tocar no próprio rosto no mapa abre ferramentas de comando; o host deriva passos da versão atual do plano e alerta o círculo para executar agora. Timeline compartilhada e `family_plan_executions` ficam como próxima evolução. |
| PLAN-T09 | Múltiplos planos + cancelar execução | ✅ COMPLETE | 2026-07-31 — D-080. Remove a regra de um plano ativo por círculo, permite criar/alternar planos por situação e torna cancelamento/falso alarme explícito. Passos fixos do EOS saem da lista numerada editável. |
| PLAN-T10 | Handoff de rota multi-stop para Google Maps | ✅ COMPLETE | 2026-07-31 — D-082. A rota autoral/offline do EOS abre o Google Maps com origem, destino e paradas intermediárias na ordem do traçado. Sem migration. |
| PLAN-T11 | Execução por protocolo dentro do plano | ✅ COMPLETE | 2026-08-17 — D-207. Plano é envelope; gatilhos salvos viram protocolos acionáveis. O host escolhe o protocolo antes de montar os passos locais. |
| PLAN-T12 | Protocolos com tipo de ação, destino e rota | ✅ COMPLETE | 2026-08-17 — D-208. Gatilho deixa de ser frase engessada; protocolo ganha intenção operacional estruturada e campos opcionais retrocompatíveis. Migration `20260817000000_family_plan_protocol_fields.sql` aplicada pelo dono em 2026-08-17. |

---

## Execução de Plano (EXEC)

*Goal: transformar o plano da família de documento editável em modo operacional
offline-first, com playbook por papel e disparo explícito.*

> Decisão: **D-212**. Spec Ready: `specs/PLAN-EXEC-001-execucao-de-plano.md`.
> Escopo do primeiro ciclo: arquétipo `meet`. Execução é modo global do EOS, não
> folha dentro do `MemberSheet`. Uma fase por vez; EXEC-T00 é bloqueante.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| EXEC-T00 | Cache offline por `(circleId, planId)` | ✅ COMPLETE | 2026-08-19 — Documento cacheado por plano, lista do círculo cacheada para seletor offline, migração do cache legado por círculo e teste automatizado do caso N planos sem rede. |
| EXEC-T01 | `circle_places` + waypoint por referência | ✅ COMPLETE | 2026-08-19 — Catálogo por círculo, migration de waypoints legados com `precision: unknown`, waypoint por `place_id`, trava de arquivo para lugar usado em plano ativo e versionamento só quando coordenada move > 50 m. |
| EXEC-T02 | `plan_sessions` + armar/desarmar | ✅ COMPLETE | 2026-08-19 — Sessão local-first com banner permanente, pessoas presentes, dependentes, pontos do dia e desarme perguntado quando expirar. D-213 fecha uma sessão armada por círculo; saída por raio fica fora dos critérios automatizados desta fase. Migration aplicada e verificada por REST. |
| EXEC-T03 | `family_plan_executions` + disparo por gesto | ✅ COMPLETE | 2026-08-19 — Migration aplicada e verificada por REST: `family_plan_executions` e `family_plan_execution_events` → 200. API cria execução + evento `started` + aviso no mesmo ato; `MemberSheet` virou seleção/hold de 1,5 s; banner global mostra undo por 30 s sem modal. |
| EXEC-T04 | Playbook por papel offline-first | IMPLEMENTED — MIGRATION PENDING | 2026-08-19 — Playbook global lê documento por `(circleId, planId)` do cache antes da rede, escolhe protocolo em `family_plan_executions.protocol_index`, lista passos por usuário, calcula rumo/distância/minutos sem tile e separa carta do dependente/avisos da numeração. Pendente aplicar `20260819131113_exec_t04_dependent_briefs.sql`. D-214: brilho máximo real fica para Native futuro; PWA só aplica legibilidade e números ampliados. |
| EXEC-T05 | Estado compartilhado e encerramento | NOT STARTED | Estados com idade, dependentes `sem aparelho`, escalonamento sugerido e encerrar como resolvida/cancelada. |
| EXEC-T06 | Promoção de ponto do dia + basemap persistente | NOT STARTED | Oferecer promover pontos no encerramento e persistir preferência de basemap para todas as superfícies de mapa. |

---

## Unified Profile & Pilot Personalization (UPP)

*Goal: make the Ficha Master the authenticated source of long-term user context for EOS Pilot, without exposing private preferences through the public emergency QR.*

> Decision: D-059. This runs as an owner-directed parallel slice while HWD-06 remains isolated.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| UPP-00 | Spec + data model decision for profile personalization and Pilot memory | ✅ COMPLETE | 2026-07-21 — D-059; requirements, data model, Ficha Master and Pilot specs updated |
| UPP-01 | MVP implementation: `profile_personalization` table, authenticated API, Ficha Master editor, avatar in World Dashboard | ✅ COMPLETE | 2026-07-21 — no public QR exposure; Pilot memory writes remain explicit/user-controlled |
| UPP-02 | Profile photo upload pipeline using private storage policy | ✅ COMPLETE | 2026-07-21 — D-060; private `profile-photos` bucket, owner-only RLS, signed URL for authenticated components. Apply migration `20260721021000_profile_photo_storage.sql` in Supabase. |
| UPP-03 | Pilot confirmed-write memory flow and audit trail | ✅ COMPLETE | 2026-08-03 — D-095 / `docs/27-pilot-memory-confirmed-writes.md`; `pilot_memory_events` + RPC atômica; migration `20260803003000_pilot_memory_events.sql` aplicada pelo dono e verificada via service-role |

---

## Production Experience — EOS Pilot

*Goal: add a daily-use decision layer that increases EOS usefulness before emergencies while preserving safety priority.*

> Spec: `docs/15-eos-pilot.md`. **Superseded home:** with D-050, Pilot's target surface is the World Dashboard Pilot Capsule (HWD-05). The v2-dashboard complication (PILOT-T01) is ON HOLD.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| PILOT-T00 | EOS Pilot concept/spec inserted into App Spine | ✅ COMPLETE | 2026-07-20 — D-046 / `docs/15-eos-pilot.md` |
| PILOT-T01 | Dashboard complication prototype: "What's the plan?" entry point | ON HOLD | superseded by HWD-05 (D-050); component `PilotComplication` drafted, not shipped |
| PILOT-T02 | MVP activity flow: Fishing, Boating, Camping, Family Outdoor, Road Trip | ⏸️ SUPERSEDED | 2026-07-28 — substituído pela conversa com especialista; as 5 intenções cobrem a decisão |
| PILOT-T05 | Pilot conversacional: tom por índice de risco + tarefas executáveis | ✅ COMPLETE | 2026-07-28 — `/api/pilot/chat` (RAG + tom por estado); o que o Pilot recomenda vira item do checklist com um toque, nunca automático |
| PILOT-T06 | Checklist reconstruído no design system da v2 | ✅ COMPLETE | 2026-07-28 — prontidão como manchete, tiers viram horizontes (3/7/30 dias). Antigo em `/checklist-legacy` |
| PILOT-T07 | Pilot com dados ao vivo, coordenadas consentidas, busca de lugares e navegação | ✅ COMPLETE | 2026-07-28 — D-068/D-069. `findPlaces` (Nominatim) dá ao Pilot capacidade de procurar POIs reais; trajeto vira camada do EOS |
| WV2-T08 | `/weather` no design system da v2, sem alterar funções | ✅ COMPLETE | 2026-07-28 — escopo `.wv2` para herdar tipografia e tokens; ritmo único de espaçamento por `gap`; raios alinhados. Zero mudança de comportamento |
| WV2-T09 | Prontidão pareada ao índice de risco no dashboard | ✅ COMPLETE | 2026-07-28 — os dois números só significam algo juntos: risco 9 lê diferente a 20% e a 90% de prontidão |
| WV2-T10 | Responsividade no celular: câmera do usuário, teclado e entrada única | ✅ COMPLETE | 2026-07-28 — D-070. A recentragem automática recolhia o sheet em uso; agora a câmera segue só na 1ª leitura e apenas gestos reais recolhem o HUD |
| WV2-T11 | PilotBar substitui a busca — o Pilot vira a entrada única | ✅ COMPLETE | 2026-07-28 — D-070; `MapSearch` aposentado |
| WV2-T12 | Camadas especializadas no mapa: flood area, storm surge, wind impact e direção oficial de tornado | ✅ COMPLETE | 2026-07-31 — D-081. Primeira versão usa polígonos oficiais NWS e impacto de vento derivado do grid existente; tornado só desenha direção se o aviso oficial trouxer movimento. |
| PILOT-T03 | Rule-backed recommendation states: GO, LIMITED, WAIT, AVOID, PRIORITY OVERRIDE | ✅ COMPLETE | 2026-08-07 — D-125; `lib/pilot-guard.ts` determinístico, veredito como etiqueta (não texto injetado), streaming SSE e rolagem que respeita quem lê |
| PILOT-T04 | Metrics instrumentation for discovery, trust, retention, personalization, safety | DONE (D-132) | `pilot_events` + `/api/pilot/metrics`. Sem texto livre por construção. Compreensão fica por proxy (`handle`) — a pergunta real precisa de pesquisa, não de telemetria. Falta o dono aplicar a migration. |

---

## Preparedness Engine (PREP / EDU / COMMS / ONB)

*Goal: turn EOS from monitoring-only behavior into a preparation operating layer that educates, simulates, assigns, and converts knowledge into concrete family readiness.*

> Decision: D-085. This lane follows D-084: Preparedness, EDU, Comms, and
> onboarding belong to the Web/PWA core first. They are not mobile-only features.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| FAM-T03 | Cadastro da família reconstruído no design system | ✅ COMPLETE | 2026-08-04 — D-122; `/family-legacy` era a ação primária da aba e saía do app; virou `/family/cadastro`, com "o que falta" no lugar do painel de métricas; 9/9 com controles negativos |
| SEC-T03 | Agrupamento automático de defeitos | ✅ COMPLETE | 2026-08-04 — D-121; impressão digital no `context`, `/api/errors` com a lista de defeitos, aviso passa a ser por defeito novo; 11 testes unitários + 6/6 de integração |
| CI-T01 | Portão automático no `main` | ✅ COMPLETE | 2026-08-04 — D-120; tipos, lint, 91 testes unitários e build a cada push/PR; testes de navegador ficam fora porque escrevem no banco de produção |
| SEC-T02 | Erro do navegador no log + aviso ao dono | ✅ COMPLETE | 2026-08-04 — D-119; `ClientErrorReporter` no layout raiz, `/api/client-error` com teto por IP, aviso por push de carona no cron; `client-error-test` 6/6 com 3 controles negativos |
| SEC-T01 | Limite de uso no Pilot + visibilidade de erro de produção | ✅ COMPLETE | 2026-08-04 — D-118; `consume_rate_limit()` atômico no Postgres e `error_log`; `custom-activity` exige login; migration `20260804180000` aplicada pelo dono e `node scripts/guardrails-test.mjs` passou 5/5 |
| NAV-T01 | Reordenar BottomNav: Clima primeiro, Cenário último | ✅ COMPLETE | 2026-08-04 — D-116; ordem visual: Clima, Família, Preparação, World, Comms, Círculos, Cenário |
| NOTIF-T01 | Separar badges por ícone/surface | ✅ COMPLETE | 2026-08-04 — D-117; `unread_by_surface` alimenta Clima, Família, Preparação, Comms e Cenário; Inbox abre filtrado pela surface |
| NAV-T02 | Corrigir links da BottomNav com badges | ✅ COMPLETE | 2026-08-08 — D-138; clique principal navega, badge abre Inbox filtrada |
| NAV-T03 | Corrigir loop do dashboard que congela a BottomNav | ✅ COMPLETE | 2026-08-08 — D-139; `WorldV2` registra contexto do Pilot sem redesenhar o provider; `npm run test:nav` prova os 6 links |
| PREP-T00 | Spec + decisão do Preparedness Engine | ✅ COMPLETE | 2026-08-03 — D-085 / `docs/20-preparedness-engine.md`; no code/migration authorized |
| PREP-T01 | Unificar Checklist + Recursos em Preparação | ✅ COMPLETE | 2026-08-03 — D-086; `/preparedness` is the single surface, `/inventory` and `/checklist` redirect |
| PREP-T02 | Editar e excluir itens do checklist em Preparação | ✅ COMPLETE | 2026-08-04 — D-121; `/preparedness` edita/exclui itens com botões visíveis por linha; `PATCH /api/checklist/[id]` recalcula `canonical_key` no rename; exclusão é por linha |
| PREP-T03 | Arquitetura do Preparedness State v2 (spec) | ✅ COMPLETE | 2026-08-12 — D-155 / `docs/37-preparedness-state.md`; laço fechado canônico, par `Requirement ↔ Holding`, 5 entidades, alertas como gatilho, 3 estados de aquisição, zero notas novas, evolução aditiva. **Sem código, sem migração** |
| PREP-T11 | Checklist para de escrever no estoque + água em galão FEMA | ✅ COMPLETE | 2026-08-12 — D-156 + D-158 + D-159. (1) marcar item não toca em `resource_inventory`; `lib/checklist-inventory.ts` + 7 testes; (2) água em galão em Preparação, Pilot, Família, Círculos, debrief, rules-engine e analyze; (3) constante única em `lib/units.ts` — eram **5** cópias, não 3 (`household`, `simulation-debrief`, `useWorldData`, `usePilotFacts` + 2 inline nas telas legacy); (4) 3 testes que fixavam o número antigo reescritos para derivar da constante; (5) aviso único da régua nova; (6) limiares mantidos 1:1 (PREP-T13); (7) armazenamento segue em litros; (8) sem migração, sem mudança de rota. Lint, typecheck, 216 testes e build de produção limpos. **Correção registrada:** o defeito não era perda de dado — havia `Math.max` desde `f75a7c4`; era quantidade planejada virando medida, e água de mochila virando água de casa |
| PREP-T12 | Decidir a constante de água: 3 L ou 1 galão FEMA | ✅ COMPLETE | 2026-08-12 — D-159; adotado 1 galão americano (3,785 L) por pessoa por dia. Autonomia exibida cai ~21%; a mudança é comunicada ao usuário, não silenciosa |
| PREP-T13 | Revisar limiares da nota de água | ✅ COMPLETE | 2026-08-12 — D-159 levantou: `threshold={4}`/`criticalThreshold={2}` L por pessoa são **absolutos, não por dia** — "adequado" significa 1 dia de água, contra o mínimo FEMA de 3 dias. **Entregue** 2026-08-13 — D-163: adequado = 3 dias/pessoa (piso FEMA), crítico = < 1 dia, baixo entre os dois. Limiares derivados da régua em `lib/units.ts`. Aplicado em rules-engine, nota da Preparação e `/api/analyze`. Racionamento (2 L/dia) **não** muda: é piso de sobrevivência, não meta de estoque. 283 testes |
| PREP-T04 | Holdings + Location padrão (fundação de inventário) | ✅ COMPLETE (migração **aplicada** 2026-08-13) | 2026-08-13 — D-160. Estágio 1 de `docs/37` §28: **aditivo, sem cutover**. Critérios binários: (1) migração cria `locations` e `holdings`, idempotente, com RLS `profile_id = auth.uid()`; (2) `locations` é árvore (`parent_id` auto-referente); (3) `holdings` distingue `CONSUMABLE`/`DURABLE`; (4) toda casa tem uma Location padrão "Casa", criada sob demanda e nunca duplicada; (5) adaptador projeta **apenas `resource_inventory`** como Holdings na Location padrão, sem escrever nada — itens `acquired` **NÃO** viram Holdings (são `Requirement` com status `met`, e isso é PREP-T05: projetá-los aqui repetiria o defeito que PREP-T11 acabou de remover); (6) autonomia projetada = consumíveis sob CASA (D-156) e bate **exatamente** com `autonomyDays` de hoje; (7) código funciona com a migração **ainda não aplicada** (`42P01` → degradação, nunca erro); (8) nenhuma tela muda; (9) nenhum dado é migrado. **Entregue** 2026-08-13: `20260813000000_preparedness_holdings_locations.sql`, `lib/holdings.ts`, `lib/holdings-store.ts`, 21 testes. Lint, typecheck, 237 testes e build limpos. **Pendência operacional: aplicar a migração no SQL Editor** |
| PREP-T05 | Requirements + kits + separação de procedência | ✅ COMPLETE (migração **aplicada** 2026-08-13) | 2026-08-13 — D-161. O outro lado do par. Critérios binários: (1) migração aditiva cria `kits` e `requirements`, idempotente, RLS `profile_id = auth.uid()`; (2) `requirements.provenance` é coluna própria e **fora da chave natural** (D-155 §26.2) — o mesmo item vindo de duas fontes atualiza a procedência, não cria segunda linha; (3) chave natural = `(profile_id, resource_key, kit_id, scenario_id)`, com `NULL` tratado como valor; (4) `Kit` **não tem** discriminador de propósito (D-157); (5) adaptador puro separa `kit_type` em kit **ou** procedência, cobrindo os 8 valores em uso; (6) `acquired` do checklist projeta para `status` (`met`/`needed`); (7) nenhuma tela muda, nenhum dado é migrado, `checklists` segue intocada. **Entregue** 2026-08-13: `20260813120000_preparedness_requirements_kits.sql`, `lib/requirements.ts`, 17 testes. Achado: **`GERAL` não é kit, é linha de base** — sem isso a deduplicação nunca dispararia no dado real. **Pendência: aplicar a migração no SQL Editor** |
| PREP-T06 | Cobertura + Readiness v2 | ✅ COMPLETE | 2026-08-13 — D-162. Critérios binários: (1) motor puro `Requirement × Holdings → covered/partial/missing/unknown/not_applicable`; (2) consumível faz conta de quantidade com compatibilidade de localização e é contado **uma vez**; (3) durável é presença alcançável do escopo; (4) rollup **pior-vence**; (5) **`unknown` nunca sobe para `covered`**, e conjunto VAZIO é `unknown`, não `covered`; (6) unidade não conversível vira `unknown`, nunca zero; (7) **nenhuma nota numérica nova** — a 0–100 existente é rebaixada a "linha de base da casa" no rótulo; (8) autonomia inalterada; (9) sem migração. **Entregue** 2026-08-13: `lib/coverage.ts`, 27 testes. A nota 0–100 passou a se chamar "Linha de base da casa", com a ressalva do que ela não mede. Lint, typecheck, 281 testes e build limpos |
| PREP-T07 | IA da Preparação no eixo Requirement × Holding | ✅ COMPLETE (fases 1 e 2) | 2026-08-13 — D-164. Fase 1: navegação local + extrair "O que falta". Critérios binários: (1) `/preparedness` continua sendo a porta, sem redirecionamento; (2) faixa de chips com **rota real**, fixa no topo, `<nav>`+`aria-current` — **não** `role="tab"`; (3) rota nova `/preparedness/o-que-falta` recebe o checklist; (4) **kit vira filtro** e procedência vira selo de origem — fim do rótulo "Fonte: Bug Out" fingindo ser kit; (5) `/checklist` passa a apontar para a rota nova; (6) BottomNav intocada e PREPARAÇÃO segue acesa nas sub-rotas; (7) gerar/marcar/editar/excluir seguem funcionando **linha a linha** (sem fusão na UI — fusão é backfill, não interface); (8) sem migração. **Fase 1 entregue** 2026-08-13: `PreparednessNav`, `RequirementsPage`, `ChecklistDialogs`, rota `/preparedness/o-que-falta`, `npm run test:prep-nav` (9/9) e `test:nav` (7/7). Visão caiu de ~1600 para 1348 linhas. **Fase 2 IN PROGRESS** (2026-08-13): (1) rota `/preparedness/o-que-tenho` recebe os 6 editores; (2) a Visão vira tela de DECISÃO — nota, **"precisa de atenção"** e portas, sem nenhum editor; (3) a lista de atenção é função pura e testada, derivada de sinais que já existem — sem dado novo; (4) casa de tamanho desconhecido vira item de atenção próprio, nunca conta silenciosa com 1 pessoa; (5) briefing de IA sai do segundo lugar da tela e vira linha que expande; (6) `/inventory` aponta para a rota nova; (7) filtro por localização **só aparece com mais de uma** — filtro de uma opção é ruído; (8) sem migração. **Fase 2 entregue** 2026-08-13 — D-165: `lib/attention.ts` (20 testes), `HoldingsPage`, rota `/preparedness/o-que-tenho`, `/inventory` reapontado, briefing recolhido, EDU virou porta. Visão 1348 → 1173 linhas. `test:prep-nav` 15/15, 303 testes unitários |
| PREP-T14 | Briefing de IA precisa gerar ação, não texto | ✅ COMPLETE | 2026-08-13 — achado do dono: depois da análise, o briefing **não gera CTA**. Viola a regra 1 do D-085 (*"preparação é acionável ou não pertence aqui"*). `next_steps` deve virar requisito confirmável, com `provenance`, pelo mesmo contrato de Pilot/EDU/simulação (D-093/D-119/D-092). **Entregue** 2026-08-13 — D-166: `lib/briefing-actions.ts` (13 testes), confirmação uma a uma, grava como `PILOT_RECOMMENDATION` (sem procedência nova), aparece em "O que falta" com o selo via Pilot. `looksActionable` exportado do EDU em vez de copiado. **Corrigido no mesmo dia (D-167)** após achado do dono: a tarefa precisa carregar o próprio contexto, o prompt passa a dizer que `next_steps` vira tarefa independente, e a lista de verbos aceita infinitivo — antes ela descartava toda prioridade real, inclusive as específicas. 323 testes |
| PREP-T08 | Alerta oficial → reavaliação | ✅ COMPLETE (fases 1 e 2) | 2026-08-13 — D-168. Critérios binários: (1) reavaliação é **determinística e pura**, sem IA — a IA nunca decide se um evento é relevante; (2) **nenhuma chamada de modelo no cron**: a reavaliação acontece quando o usuário chega, onde ele pode confirmar; (3) o alerta ativo aparece na Visão lendo o snapshot global de risco — **sem fetch novo**; (4) propostas gravam com procedência `OFFICIAL_ALERT`, confirmadas uma a uma; (5) alerta sem lacuna correspondente **não inventa tarefa**; (6) o veredito do Rules Engine nunca é suavizado; (7) sem migração, sem mudança no cron. **Fase 1 entregue** 2026-08-13 — D-168: `lib/alert-reassessment.ts` (19 testes), faixa de alerta na Visão lendo o snapshot global. Teste pegou `neve` casando dentro de `nevoeiro` — todos os padrões ganharam fronteira de palavra. **Fase 2 entregue** 2026-08-13 — D-169: lacunas viram propostas confirmáveis com `provenance = OFFICIAL_ALERT` e números determinísticos (quanto falta, para quantos, para quantos dias). 350 testes |
| NAV-T00 | Preparedness State em PAUSA consciente | ✅ REGISTRADO | 2026-08-13 — D-177. `holdings`, `lib/coverage.ts` e `lib/holdings-store.ts` estão corretos, testados e **sem consumidor**, de propósito. "Onde está minha água de reserva?" só tem sentido para quem tem DOIS lugares; enquanto todos tiverem um, `holdings` é redundante com os sete escalares. Não é dívida — é obra parada esperando demanda. Acorda quando alguém tiver fazenda, carro ou depósito |
| NAV-T04 | Plano e Aprender entram na Preparação | ✅ COMPLETE | 2026-08-13 — D-177 fase 1. Critérios binários: (1) `/preparedness/plano` e `/preparedness/aprender` existem e mostram o conteúdo atual de `/plan` e `/edu`; (2) os endereços antigos **redirecionam**, nunca 404 — o atalho do PWA continua funcionando; (3) a faixa da Preparação passa a ter 5 destinos e continua grudando, com o chip ativo sempre visível; (4) o ☰ perde o Plano e fica com Ficha e Configurações; (5) a porta "Aprender" da Visão aponta para a rota nova; (6) BottomNav **intocada** — a barra é NAV-T06; (7) sem migração. **Entregue** 2026-08-13: `/preparedness/plano` e `/preparedness/aprender`, faixa com 5 destinos, ☰ com 2 itens, `/plan` e `/edu` redirecionando. `test:prep-nav` 20/20 (era 15) |
| NAV-T05 | Círculos e Ficha entram em Família | ✅ COMPLETE | 2026-08-13 — D-178. `/family/ficha` e `/family/circulos`, faixa de Família com 4 destinos, ☰ só com Configurações, 8 links internos reapontados. `/ficha/[id]` (QR público) **intocado**, com checagem própria. Faixa virou `DomainNav` compartilhado em vez de segunda cópia. `test:prep-nav` 27/27 (era 20). **Dois slots da barra liberados para NAV-T06** |
| NAV-T06 | Barra encolhe para 5; `/mais` absorve o ☰ | ✅ COMPLETE | 2026-08-14 — D-180. Fase 3. `[ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ MAIS ]`. `/settings` virou `/mais` (com redirecionamento — é o caminho do pagamento), `AppActions` **deletado**, Treino ganhou porta em `/mais`. Clima e Cenário perderam o ícone e **não** o endereço: continuam a um toque no MUNDO. Badges órfãos reancorados pela tabela de propriedade do `docs/35` — `weather` no orbe do MUNDO, `scenario` em MAIS; sem isso a notificação sumiria em silêncio. O canto superior direito ficou **vazio** e a PilotBar recuperou ~98px num telefone de 390px (a reserva era de 88px e estava errada desde D-131). `test:nav` 11/11 (era 7), `test:prep-nav` 30/30 (era 27). **Corrigido no dia seguinte (D-181)** após achado do dono: a porta do Clima no MUNDO era CONDICIONAL — só aparecia com alerta ativo, e sumia no estado normal. Virou incondicional, com rótulo que muda com o estado. `test:nav` 13/13 |
| NAV-T07 | `/weather` desce para dentro do MUNDO | ✅ COMPLETE (fase 1 de 2) | 2026-08-14 — D-182. Fase 4 do Modelo C. Fim do achado A3: `/dashboard/alertas` vira o dono, `/weather` redireciona, MUNDO ganha faixa de domínio (`Mapa · Alertas`). Cartão da folha e tela viram **resumo → detalhe** em vez de duas telas irmãs. A faixa entra nos DOIS ramos de retorno — o teste roda no ramo sem GPS, que foi onde `PlanPage` virou beco sem saída em NAV-T04. **Fase 2 PENDENTE**: `Abrigos` e `Camadas` viram rotas e a faixa cresce para 4. **Dívida registrada**: corpo de `AlertsPage` é todo em inglês (anterior ao i18n) — traduzir só o cabeçalho seria pior. `test:nav` 18/18 (era 13) |
| NAV-T08 | Cenário vira MODO, não destino | ✅ COMPLETE | 2026-08-14 — D-184. Fase 5, e **fim do Modelo C**. `/scenario` → `/mais/treino` (com redirecionamento — convites chegam por `/sim/[token]`), MAIS ganha faixa (`Mais · Treino`), e a **Preparação ganha a porta que o `docs/35` sempre listou e nunca existiu** — o debrief já gravava requisitos com procedência `SIMULATION_DEBRIEF`, então o Simulador já alimentava aquela tela. **Divergência deliberada**: a cabine NÃO virou overlay — 568 linhas de briefing com campo livre e IA são uma página, e o que faz o Simulador ser modo é a faixa global barulhenta, que já existe e já carrega a saída. `test:nav` 30/30 (era 24) |
| NAV-T09 | BottomNav vira pílula expansível | ✅ COMPLETE | 2026-08-15 — D-193. Pedido do dono: copiar o comportamento/estilo do componente React de referência, mantendo os ícones atuais e o MUNDO verde. A barra real ganhou spring de entrada, toque com `whileTap` e rótulo ativo expansível; ativo segue derivado da rota, não de `useState`; badges, i18n, deep-links e os cinco destinos de D-180 ficaram intactos. **Follow-up D-191:** a cápsula central ficou pequena demais; a barra voltou a ocupar a largura inteira do rodapé, sem bordas externas arredondadas, mantendo o comportamento expansível. **Follow-up D-192:** tons roxo/azul removidos da navegação comum em favor do amarelo do Treino; top nav de domínio fica sem faixa de fundo e `Mais/Treino` usa chips amarelos. Validado com `type-check`, build, `test:nav` e capturas mobile |
| NAV-T10 | Componente shadcn BottomNavBar como exemplo standalone | ✅ COMPLETE | 2026-08-15 — D-190. `components/ui/bottom-nav-bar.tsx` e demo adicionados conforme prompt; `lib/utils.ts` cria `cn`; `lucide-react`, `clsx` e `tailwind-merge` instalados. Não substitui a BottomNav real porque o projeto ainda não tem Tailwind/shadcn ativo (`components.json`, `tailwind.config.*`, `postcss.config.*`) e a navegação EOS depende de rotas, badges, i18n e MUNDO verde. `type-check`, `diff --check` e build passaram |
| WV2-T27 | Mapa esconde completamente o sheet do Mundo | ✅ COMPLETE | 2026-08-15 — D-193. Clique ou movimento real do mapa manda o `DetentSheet` para `hidden`, abaixo de `peek`; zona invisível no rodapé reabre por hover/foco/toque. Ações programáticas que precisam contexto seguem usando `peek`. Validado com `type-check`, build, `test:nav` e Playwright (`peek → hidden → peek`) |
| WV2-T28 | Controles laterais do mapa sempre expandidos | ✅ COMPLETE | 2026-08-15 — D-196. Pedido do dono: remover o estado recolhido da coluna lateral. `Você`, `Atualizar` e `Camadas` ficam visíveis em repouso; no desktop, o controle do painel também permanece visível. O botão `.../x` saiu. Validado com `type-check`, `diff --check`, build e Playwright mobile |
| WV2-T29 | Painel de Camadas rola em qualquer device | ✅ COMPLETE | 2026-08-16 — D-197. Pedido do dono: conseguir subir e descer o painel em qualquer dispositivo. `.wv2-layers` ganhou altura máxima responsiva, `overflow-y: auto`, rolagem touch nativa e containment de overscroll para não prender conteúdo atrás da sheet. Validado com `type-check`, `diff --check`, build e Playwright mobile |
| WV2-T30 | Surge usa Peak Storm Surge Forecast do NHC/CPHC | ✅ COMPLETE | 2026-08-16 — D-200. Pedido do dono: `Surge` estava ligado durante Hurricane Lala, mas nada aparecia embora a NOAA tivesse mapa de surge no Havaí. Correção: `/api/world/peak-surge` busca o KML `PeakStormSurge` mais recente por ciclone ativo, converte para GeoJSON e o MapLibre desenha `eos-peak-surge-*`; o antigo surge por alerta fica só como fallback. Validado com `type-check`, `diff --check`, build, teste direto do endpoint e Playwright mobile |
| WV2-T31 | Controles de vento recolhíveis junto ao botão Vento | ✅ COMPLETE | 2026-08-16 — D-201. Pedido do dono: a régua/sliders de `WIND SPEED` poluíam o mapa e popup de clique mostrava vento onde a pessoa tocava. O popup saiu; a régua vira toggle compacto perto do ícone `Vento`, expande/contrai por clique e some ao mover/zoomar o mapa quando está colapsada. Validado com `type-check`, `diff --check`, build e Playwright mobile |
| WV2-T32 | Alça do sheet escondido não rouba o pan do mapa | ✅ COMPLETE | 2026-08-16 — D-205. A zona de retorno do `DetentSheet` escondido deixou de ser uma faixa invisível de 148px e virou alça central de 48px; fora dela, o primeiro gesto volta para o canvas do MapLibre. |
| PREP-T16 | O estoque voltou a salvar | ✅ COMPLETE | 2026-08-14 — D-185. Achado do dono: "Erro ao salvar" em `/preparedness/o-que-tenho`. `/api/inventory` exporta GET e POST; o cliente mandava **PUT** → 405. O verbo trocou na extração de `PreparednessPage` para `HoldingsPage` (D-165) e o estoque parou de gravar por um dia. **Nenhum teste jamais escreveu nesta tela**, e o cliente engolia `status` e corpo sem reportar — o 405 não foi o defeito caro, o silêncio foi. Agora: POST (a rota já é upsert, e criar PUT deixaria duas portas para a mesma escrita), falha de gravação vai para o `error_log`, e `test:prep-nav` **escreve, recarrega e confere**. Verificado ao contrário: com PUT o teste fica vermelho nos dois critérios. Auditados os 60 pares (rota, método) do app — era o único sem par. `test:prep-nav` 32/32 |
| FAM-T09 | O ping deixa de depender só de push | ✅ COMPLETE | 2026-08-14 — D-186. Achado do dono: "Onde você está?" respondia **Não entregou**. O ping era exclusivamente push — sem ele a mensagem não existia em lugar nenhum, nem ao abrir o app. Agora **grava primeiro, empurra depois**: vira `circle_notifications` com `kind = 'family_ping'` na superfície Família, e o push vira reforço. `ok` passa a significar "a mensagem existe"; um campo `push` diz se vibrou; **todas as frases de sucesso começam com "Enviado"**. Assinatura morta (404/410) é apagada e o status de cada falha vai para o `error_log` — a rota colapsava cinco causas numa frase. Diagnóstico: Daniela tem assinatura e `health` diz `push: ok`, logo era `push_failed` sem registro. `test:family` 8/8, e a checagem nº5 dele estava vermelha há 10 dias exigindo um link que D-122 removeu de propósito |
| FAM-T10 | A folha da pessoa volta a responder ao toque | ✅ COMPLETE | 2026-08-14 — D-187. Achado do dono: "tudo embaçado, não consigo mais clicar". A `MemberSheet` reusava `.wv2-pilot-scrim`, que em 09/08 subiu para **z-899** para passar por cima da barra — correto para o Pilot, montado no layout; errado para a folha, que vive dentro de `.wv2`. E `.wv2` é `position: fixed`, logo **cria contexto de empilhamento**: ali 899 não competia com a barra e sim com a folha (7), cobrindo-a e engolindo todo toque. Scrim próprio em z-6, régua de `.wv2` escrita no CSS. **Cinco dias no ar sem uma linha de log** — CSS não lança exceção. `family-page-test` passa a TOCAR o botão (`click` recusa elemento interceptado); verificado ao contrário: com 899 ele falha por timeout. `test:family` 10/10 |
| MAP-T05 | Vento vira camada e sobe para a coluna | ✅ COMPLETE | 2026-08-16 — D-199. Achado do dono: ligar o vento **apagava o satélite**. D-144 fizera dele uma BASE, e `getMapConfig('wind')` carrega o `CARTO_DARK` — além de mudar a câmera para o meio do Atlântico com zoom 1.55. Agora é camada e compõe sobre Escuro ou Satélite; `'wind'` foi **removido** de `MapBaseMode` para não voltar por distração; quem tinha a base salva volta para Escuro com o vento ligado. O botão sobe para a coluna, e a pílula flutuante da legenda morre (duas coisas escritas "Vento"). Enquadrar tempestade passa a **deitar a câmera de propósito** — funcionava por acidente porque a base de vento zerava pitch/bearing. `test:weather` 15/16 |
| MAP-T06 | O cone da tempestade não cabe no enquadramento | ✅ RESOLVIDO | 2026-08-16 — `test:weather` passou a 16/16 depois de D-199 (câmera deita antes do `fitBounds`) e D-204. Era defeito anterior a esta frente, confirmado guardando o trabalho e rodando o código antigo |
| MAP-T10 | A grade global do vento é 900x mais grossa que a local | ⏸ BLOQUEADO — **medição contaminada** | Dono escolheu a opção **B** (pinta grosso, refina depois). Código escrito e **desligado**: não consegui provar que funciona. Medido: grade 25 (625 pts) = **20.280 ms**; grade 57 (3249 pts) = **0 leituras**; grades 13/19/31/41 = **0 leituras** — as pequenas falharem revela que eu queimei o limite do provedor com a própria rajada de testes, então não sei se a fina falha por tamanho ou se tudo falhou por excesso de chamadas. **E os 20s da grade GROSSA mudam o problema**: o gargalo é custo por ponto, não resolução — uma segunda ida com 5x mais pontos levaria minutos. Próximo passo: medir de novo com espaçamento entre chamadas, e considerar cache no servidor da grade global (ela muda de hora em hora, não a cada movimento de mapa) |
| SIM-T12 | Simulador encena eventos no mapa (fase 1) | ✅ COMPLETE | 2026-08-16 — D-200. A pergunta que travava desde 13/08 — *como o falso entra sem contaminar o verdadeiro* — tem resposta: **ele não entra**. `lib/staged-events.ts` é um fluxo separado que o mapa compõe por cima; encerrar o treino apaga por construção, sem operação de desfazer. `simulated: true` é **literal de tipo**, então evento real não satisfaz `StagedEvent`. Determinístico (zero `Math.random()`): o mesmo cenário repete o mesmo furacão, e repetir é metade do valor de treinar. Quatro tipos com geografia (furacão, terremoto, incêndio, fallout); enchente/inverno/apagão **não** viram objeto — apagão não tem ponto. `fallout` entra no `ThreatType`, onde já existia no checklist. Geometria em grande-círculo, não graus-por-km. 24 testes. **Fase 2 PENDENTE: ligar ao mapa e ao painel** |
| SIM-T12b | O evento encenado aparece no mapa e ganha nome | ✅ COMPLETE | 2026-08-16 — D-201. `stagedEvents` chega ao mapa por **prop própria**, nunca misturado em `cyclones`: o mapa nunca precisa perguntar se um evento é real. `simulation.active &&` é a fronteira inteira — encerrar o treino manda coleção vazia e o furacão some **sem ninguém apagá-lo**. Tracejado e roxo `#a78bfa` **não são gosto**: evento real usa linha cheia e paleta de risco, e a cor encenada não pertence a nenhuma severidade. Painel ganha **nome** (o que faz a família falar da *Isadora*, não do "cenário categoria 3") e **rumo em oito chips** — sob estresse ninguém digita 137°. Campos só aparecem para ameaça com geografia, e quando não há a tela **diz por quê** |
| PREP-T09 | Amortecimento do laço | ✅ COMPLETE | 2026-08-13 — D-170: `lib/proposal-dedup.ts` (11 testes). "Já está na lista" derivado do checklist real por `canonical_key`; dispensa durável **por gatilho** — outro evento volta a avisar. **`readiness_assessments` deliberadamente NÃO criada**: nada a leria hoje, e tabela sem consumidor é o que `docs/37` §35 manda evitar. Entra com o orçamento de interrupção por push. 361 testes |
| PILOT-T12 | Pilot diz "zero" quando na verdade não sabe | ✅ COMPLETE | 2026-08-13 — D-174. Causa em `chat/route.ts:764`: a linha das reservas imprimia números do CLIENTE, e mandava `Autonomia 0.0 dias` quando os fatos não tinham carregado. Corrigido lendo as reservas **no servidor** (invariante do `docs/37` §7), com `null` para desconhecido e regra explícita no prompt. Fórmulas unificadas em `lib/household-days.ts` — quinta duplicação da frente. 393 testes |
| PREP-T10 | Estados de aquisição (fase 1 de 4) | ✅ COMPLETE | 2026-08-13 — D-171. `docs/37` §28 diz que **cada estágio é entregável sozinho** e que o cutover é "explícito, decidido, uma tarefa" — então T10 vira quatro. Fase 1 é ADITIVA e não migra dado. Critérios binários: (1) coluna `status` em `checklists`, idempotente, derivada de `acquired` na criação; (2) `acquired` **continua sendo mantida** — nada de legado quebrado; (3) ciclo de vida como módulo puro com transições permitidas; (4) `met` continua vindo do usuário **até haver holdings reais**, e isso fica escrito — a interface não pode prometer o que o domínio ainda não sustenta; (5) `not_applicable` vira ação de verdade: o item some da conta de faltantes e **não volta** na próxima geração; (6) sem backfill, sem escrita dupla, sem cutover. **Entregue** 2026-08-13 — D-171: `lib/acquisition.ts` (16 testes), `status` na API, "não se aplica" na tela com desfazer, progresso ignorando descartado. 377 testes. `checklists.status` verificado por REST em 2026-08-19. |
| PREP-T10b | Escrita dupla | ✅ COMPLETE | 2026-08-13 — D-172. Estágio 3 de `docs/37` §28. Critérios binários: (1) toda escrita em `checklists` espelha em `requirements`; (2) **a escrita nova NUNCA derruba a legada** — falha é registrada, não propagada, porque o legado ainda é a verdade; (3) idempotente: gravar duas vezes o mesmo item não cria duas linhas; (4) o kit é criado sob demanda pelo slug e nunca duplicado; (5) a chave natural usa `COALESCE`, que `on_conflict` do PostgREST não alcança — a conciliação é ler-então-escrever, com o índice único como rede; (6) apagar no legado apaga o espelho; (7) **holdings NÃO entra na escrita dupla**: é integralmente derivável de `resource_inventory` pelo adaptador, e espelhar o que já se projeta adiciona risco sem adicionar informação; (8) sem backfill, sem cutover. **Entregue** 2026-08-13 — D-172: `lib/requirements-sync.ts`, espelho em save-items/toggle/PATCH/DELETE, remoção do espelho antigo no rename. `npm run test:dual-write` valida **contra o banco real** (8 checagens, perfil temporário com limpeza). 386 testes unitários |
| PREP-T10c | Backfill (com simulação a seco antes) | ✅ COMPLETE | 2026-08-13 — D-173. **Aplicado**: 4 perfis, 15 itens, 17 holdings, 4 locais, 0 erros. Re-execução provada idempotente. `npm run backfill:prep` (a seco por padrão; `--apply` escreve) |
| PREP-T10d | Cutover | ✅ COMPLETE | 2026-08-13 — D-176. `requirements` é a verdade; `checklists` **congelada** como retrato para rollback. Congelar e não sincronizar porque a volta é lossy por construção — provado em teste: `legacyKitType('BUG_OUT','PILOT')` perde a procedência. A resposta da API manteve a forma e ganhou `kit_slug` + `provenance` autoritativos; nenhuma tela mudou junto com o banco. **Estágio 6 (aposentadoria) não feito de propósito** |
| PREP-T10e | Aposentadoria do legado (estágio 6) | PENDING | Só depois do cutover provar-se em uso. Remover `acquired`/`acquired_at`, apontar as telas legadas (`checklist-legacy`, `dashboard-legacy`, `WorldDashboard`) e por fim `checklists`. Enquanto isso, elas leem um RETRATO congelado — o que é aceitável para telas legacy e inaceitável se alguma virar caminho principal de novo |
| PREP-T15 | Perfis órfãos: `profiles` não tem FK para `auth.users` | ✅ COMPLETE (migração **pendente de aplicação**) | 2026-08-13 — D-175. FK `profiles.id → auth.users.id ON DELETE CASCADE`; limpeza dos órfãos VAZIOS dentro da própria migração, que **para com erro** se sobrar órfão com dado. Os 9 restantes eram de teste (`Clima`, `Nav Test`, `Ana`), todos com zero dado. O `.catch` mudo do helper de limpeza saiu — ele escondia a falha desde 4/08 |
| COMMS-T01 | Criar aba Comms app-level | ✅ COMPLETE | 2026-08-03 — D-087 / `docs/21-comms.md`; `/comms` agora tem chat do círculo, guia de rádio e limite explícito de Mesh/LoRa |
| COMMS-T02 | Inserir referência de frequências familiares | ✅ COMPLETE | 2026-08-03 — D-088; canais VHF/UHF, NOAA, nacionais/emergência, MURS/GMRS/FRS e guia Baofeng na aba Comms |
| COMMS-T03 | Tornar referência de rádio editável por círculo | ✅ COMPLETE | 2026-08-03 — D-089; `circle_radio_profiles`, `/api/comms/radio`, leitura por membro e edição Admin/Editor |
| COMMS-T04 | Badge e timeline social de notificações | ✅ COMPLETE | 2026-08-04 — D-109; `circle_notifications`, badge vermelho em Comms e timeline de mensagens/convites/entrada/Família íntima |
| COMMS-T05 | Realtime para chat e badge do Comms | ✅ COMPLETE | 2026-08-04 — D-110; Supabase Realtime com RLS controlada para `circle_messages` e `circle_notifications`; polling fica fallback |
| COMMS-T06 | Inbox EOS global com destinos por notificação | ✅ COMPLETE | 2026-08-04 — D-111; Comms abre janela global quando há unread; EDU, simulação, chat e weather entram em `circle_notifications` app-level |
| COMMS-T07 | Polimento Inbox/EDU pós-teste real | ✅ COMPLETE | 2026-08-04 — D-112; chat auto-scroll, timeline colapsada, EDU progressivo, destaque por `view_count` e notificação EDU admin-friendly |
| COMMS-T08 | Inbox social Today/Last 7 days + chat enquadrado | ✅ COMPLETE | 2026-08-04 — D-113; Comms com badge abre Inbox global estilo social; itens levam direto ao destino; chat rola pelo container |
| COMMS-T09 | Clique do Inbox transporta imediatamente para mensagem | ✅ COMPLETE | 2026-08-04 — D-114; Inbox não bloqueia navegação em mark-read e `/comms` reage a `circleId/messageId` por query |
| COMMS-T10 | Notificação de mensagem também atualiza o chat | ✅ COMPLETE | 2026-08-04 — D-115; `circle_notifications` vira fallback realtime do chat e clique do Inbox usa navegação hard com `keepalive` |
| COMMS-T11 | A conversa vira uma coisa (fase 1 de 3) | ✅ COMPLETE | 2026-08-15 — D-188. Pedido do dono: chat individual com gente do círculo, além do grupo. Hoje o thread é **implícito** (`circle_messages.circle_id`) e a tela usa `?view=` em memória. Critérios: (1) `conversations` + `conversation_members` + `circle_messages.conversation_id`, **aditivo e idempotente**; (2) toda conversa nasce dentro de um círculo — a regra de permissão continua sendo UMA (a de D-073); (3) `direct_key` = os dois `user_id` **ordenados**, único por círculo, para que abrir pelos dois lados encontre o mesmo thread; (4) **"excluir" esconde para mim** (`hidden_at`), nunca destrói para todos — histórico compartilhado é registro de quem avisou o quê e quando; (5) mensagem nova reabre a escondida; (6) backfill cria uma conversa por círculo e **falha alto** se sobrar mensagem órfã; (7) nenhuma tela muda ainda. **Entregue** 2026-08-15: `20260815000000_conversations.sql`, `lib/conversations.ts`, 29 testes. 429 testes unitários. `conversations`, `conversation_members` e `circle_messages.conversation_id` verificados por REST em 2026-08-19. |
| COMMS-T12 | Lista de conversas, thread e 1:1 (fase 2 de 3) | ✅ COMPLETE | 2026-08-15 — D-188. Migração aplicada e conferida (2 círculos → 2 conversas, **0 órfãs**). `/comms` = lista, `/comms/[id]` = thread, `/comms/radio` e `/comms/linha-do-tempo` saem de `?view=`; COMMS ganha a faixa — **era o último domínio sem uma**. Servidor completo: `requireParticipant` (o guarda passa a perguntar *"você participa DESTA conversa?"*, porque ser do círculo não dá acesso à conversa de dois outros), `findOrCreateDirect` (ler-então-escrever com o índice único como rede), esconder/desesconder. **Mensagem direta deixou de avisar o círculo inteiro** — vazaria a terceiros que a conversa aconteceu, com trecho do texto junto. Link antigo (`?view=chat&circleId=`) redireciona: os `href` estão **gravados no banco** e histórico não se reescreve. `test:conversations` 18/18 contra o banco real |
| COMMS-T13 | Conversa individual: as portas, e o preset vira mensagem | ✅ COMPLETE | 2026-08-15 — D-193. A 1:1 existia no servidor e **nenhuma tela chamava**. Agora: "Falar com alguém" na lista (sem repetir quem já tem conversa) e porta na folha da pessoa no mapa. **O preset do ping vira MENSAGEM no thread** — era canal paralelo que chegava e acabava ali, sem onde responder. Badge do ping migra de Família para **Comms**, revendo D-186. `circleId` sai do pedido: o servidor descobre o círculo em comum, e essa descoberta **é** a autorização. Achado: `profiles.avatar_url` não existe e a consulta devolvia 200 com lista vazia. `test:conversations` 23/23 |
| COMMS-T14 | O ponto de não lida apaga, e a cor volta ao lugar | ✅ COMPLETE | 2026-08-15 — D-194 e D-195. (1) BottomNav revertida do amarelo: âmbar é `--warn` no EOS, e navegação em âmbar diz "atenção" o tempo todo. O ouro `#f4c75b` — o mesmo da bolha da própria mensagem — passa a marcar **a conversa do círculo**, onde informa em vez de decorar. Nomes ganham `color` explícito: sem ele o `<Link>` herdava azul/roxo do navegador, e "visitado" mudava sozinho por aparelho. (2) `last_read_at` existia no schema, a API sabia gravá-lo e **nenhuma tela chamava** — o ponto vermelho nunca apagava. Testes passaram a ler **cor computada** e **estado de leitura**, coisas que teste de existência não alcança. `test:conversations` 25/25 |
| EDU-T01 | Conteúdo educativo como fonte oficial EOS | ✅ COMPLETE | 2026-08-03 — D-090; `edu_content`, `/edu`, `/admin/edu`, fonte visível, aprovação/versionamento e RAG futuro sem ingestão automática |
| EDU-T02 | Consumo de vídeo aprovado dentro do EOS | ✅ COMPLETE | 2026-08-04 — D-101; `/edu` renderiza player YouTube embutido para `source_url` reconhecida e mantém link de fonte visível |
| EDU-T03 | Ingestão aprovada de EDU para RAG | ✅ COMPLETE | 2026-08-04 — D-103; admin ingere item `approved` + `rag_enabled`, grava chunks em `knowledge_base` com `source=edu:<id>` e `source_version=v<version>` |
| EDU-T04 | Guardrail de qualidade antes da ingestão RAG | ✅ COMPLETE | 2026-08-04 — D-104; link/título/tags não bastam, ingestão exige texto instrucional em resumo/notas e Admin EDU mostra prontidão |
| EDU-T05 | EDU aprovado gera ações confirmáveis de Preparação | ✅ COMPLETE | 2026-08-04 — D-119; `/edu` extrai ações de resumo/notas, usuário confirma e salva em `checklists` com `kit_type=EDU_CONTENT`; sem nova migration |
| EDU-T06 | Curadoria/tradução das ações EDU | ✅ COMPLETE | 2026-08-04 — D-120; `/api/edu/actions` usa OpenAI para limpar/traduzir ações; fallback local remove aspas, markdown e minutagem |
| EDU-T07 | Notificar save administrativo de EDU | ✅ COMPLETE | 2026-08-04 — D-122; todo save cria `edu_content_saved` para o admin/ator; aprovado segue criando `edu_content_approved` para usuários |
| ONB-T01 | Onboarding contextual por convite de simulação | ✅ COMPLETE | 2026-08-03 — D-091 / `docs/23-onboarding-by-simulation.md`; `/sim/[token]` preserva contexto, login/signup mantêm redirect e `/onboarding` devolve ao convite |
| SIM-T11 | Simulação gera preparação acionável | ✅ COMPLETE | 2026-08-03 — D-092 / `docs/24-simulation-preparedness-actions.md`; debrief gera propostas confirmáveis com fonte e salva em `SIMULATION_DEBRIEF` |
| PILOT-T08 | Pilot como educador situacional | ✅ COMPLETE | 2026-08-03 — D-093 / `docs/25-pilot-situational-educator.md`; propostas do Pilot têm tipo/fonte/destino, confirmação explícita e `PILOT_RECOMMENDATION` |
| PILOT-T09 | Pilot lê ficha master e membros detalhados | ✅ COMPLETE | 2026-08-04 — D-105; `/api/pilot/chat` injeta ficha master + dependentes no prompt e não depende só dos agregados do cliente |
| PILOT-T10 | Pilot lê fichas visíveis do círculo | ✅ COMPLETE | 2026-08-04 — D-106; `/api/pilot/chat` injeta membros do círculo com gates `medical`, `emergency_contact` e `location` |
| PILOT-T11 | Fechar Pilot clicando fora da janela | ✅ COMPLETE | 2026-08-09 — D-140; scrim externo é `fixed`; `pilot-orb-test` prova que tocar fora fecha |
| FAM-T11 | Separar círculo de Família íntima | ✅ COMPLETE | 2026-08-04 — D-107; `family_access_status` cria pedido/aprovação dentro do círculo e o Pilot só lê ficha master de co-membro aprovado |
| FAM-T12 | Convite de Família íntima aceito pelo dono da ficha | ✅ COMPLETE | 2026-08-04 — D-108; Admin convida outro membro, mas só o próprio membro aceita/nega acesso à ficha master |

---

## Phase 3 — Mobile App (React Native)

*Goal: Initialize the native mobile shell only after G-03 is cleared, then wrap the shared EOS core with platform-specific capabilities.*

> Blocked until Gate G-03 is cleared. D-084 explicitly does **not** authorize
> `react-native init`, Expo, Capacitor, or store submission.

| Task ID | Task | Status |
|---|---|---|
| M-T01 | Choose native shell approach and initialize only after G-03 | BLOCKED |
| M-T02 | Install mobile dependencies (llama.rn, RNFS, Zustand, NetInfo, etc.) | BLOCKED |
| M-T03 | Integrate `/mobile/eos-intelligence-layer.ts` | BLOCKED |
| M-T04 | Implement LOCAL_AI mode with llama.rn | BLOCKED |
| M-T05 | Wire up SURVIVAL mode (same Rules Engine, no server) | BLOCKED |
| M-T06 | Auth with Supabase JWT in SecureStore | BLOCKED |
| M-T07 | Implement LoRa BLE bridge screen (`mobile/screens/LoRaMeshScreen.tsx`) | BLOCKED |
| M-T08 | Submit to App Store and Google Play | BLOCKED |

---

## Automotive Companion

*Goal: provide a restricted driver-safe companion mode for active risk, route handoff, check-in, limited communication, and plan execution state.*

> Blocked until Gate G-06 is cleared and the native mobile core exists.

| Task ID | Task | Status |
|---|---|---|
| AUTO-T00 | Review CarPlay/Android Auto platform rules and define allowed EOS scope | BLOCKED |
| AUTO-T01 | Design restricted companion information model | BLOCKED |
| AUTO-T02 | Implement mobile adapter for automotive surface | BLOCKED |
| AUTO-T03 | Validate driver-safe interactions and release requirements | BLOCKED |

---

## Phase 3 — Community & Scale

*Goal: Expand Circles feature, add notifications, and prepare for user growth.*

> Code complete except deferred landing v3. Monetization is in Test mode; launch activation tracked above.

| Task ID | Task | Status |
|---|---|---|
| P3-T01 | Circle: share action plan with members | ✅ COMPLETE |
| P3-T02 | Push notifications (emergency alerts from circle leaders) | ✅ COMPLETE |
| P3-T03 | Multi-language support (i18n) | ✅ COMPLETE |
| P3-T04 | Monetization: subscription model decision and implementation | ✅ COMPLETE (código) — D-042; ativação depende de checklist do dono |
| P3-T05 | Emergency contact sharing within circles | ✅ COMPLETE |
| P3-T06 | Cross-device sync: Realtime + offline queue + snapshot cache | ✅ COMPLETE |
| P3-T07 | Landing de conversão v3 ("Prévia Viva" — máquina de estados de risco) — spec em `EOS documents/Landing EOS/eos-landing-v3-interactive-spec.md` | DEFERRED — D-045; retomar após Stripe ativo |

---

## Phase 4 — LoRa Mesh Integration

*Goal: Integrate the ESP32 LoRa firmware with the mobile app for fully offline mesh communication.*

> Blocked until Gate G-05 is cleared.

| Task ID | Task | Status |
|---|---|---|
| P4-T01 | Test firmware end-to-end (2 ESP32 boards, 2 phones) | BLOCKED |
| P4-T02 | Integrate `LoRaBleService.ts` into React Native project | BLOCKED |
| P4-T03 | LoRa mesh screen functional in app | BLOCKED |
| P4-T04 | Region frequency configuration (US/EU/Asia) | BLOCKED |

---

## Status Legend

| Symbol | Meaning |
|---|---|
| ✅ COMPLETE | Task is done and verified |
| PENDING | Ready to start; waiting for session to pick it up |
| IN PROGRESS | Currently being worked on |
| BLOCKED | Cannot start — depends on another task or decision gate |
| DRAFT | Tentatively planned but not yet confirmed in scope |
| GATE NEEDED | Cannot be sequenced until a decision gate is resolved |

---

*Update this file after every implementation session. Mark tasks complete. Promote next task to PENDING or IN PROGRESS.*
