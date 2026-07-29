# 07 — Roadmap

> Last updated: 2026-07-27

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
| P1-T08 | Rate limit validation: confirm Upstash Redis is connected in production | DRAFT | MEDIUM |

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
| LA-T04 | Upstash Redis rate-limit validation | DRAFT | App currently falls back to in-memory limiter |
| LA-T05 | Gift codes (sem Stripe): criação owner-only + resgate + expiração lazy | ✅ COMPLETE | 2026-07-22 — D-061; `/admin/gift-codes` (ADMIN_EMAILS), `/api/billing/redeem`, `lib/plan.ts`, resgate em Settings |
| LA-T06 | Códigos de afiliado (Stripe): cupom "100% off · once" + promotion codes | PENDING | falta params do dono + Stripe Live key; checkout já aceita promo code |

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
| WV2-T05 | Validação de produção da v2: E2E de navegador, a11y/perf medidos, custo de provider, revisão de privacidade/proveniência | 🔵 EM CURSO | `scripts/browser-walkthrough.mjs` (Playwright) percorre login→dashboard→sheet→Pilot→busca→simulação com prints. Falta a11y/perf medidos e custo. | Herda os gates abertos do HWD-06. **Rollout ocorreu antes destes gates**, por decisão do dono (D-063). |
| WV2-T06 | Rótulos dos controles de mapa no toque | PENDING | `aria-label`/`title` cobrem leitor de tela e hover; no toque não há hover. Alternativas: legenda curta ou mover as ações para dentro do sheet. |
| WV2-T07 | Reconstruir features do HWD v1 sobre a v2 conforme demanda | PENDING | Camadas ao vivo, toggle de base, notificar círculo. Marcadores de família saíram daqui para a seção FAM. |

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
| FAM-T03 | `POST /api/location` + hook de envio periódico enquanto o app está aberto | ✅ COMPLETE | 2026-07-27 — `LocationReporter` nunca dispara prompt de permissão; 2 min, só com aba visível; servidor grava só o último ponto |
| FAM-T04 | Toggle próprio de localização na tela de Círculos + marcadores reais com freshness no mapa v2; remover mocks do `WorldMap` | ✅ COMPLETE | 2026-07-27 — mocks 'Paulo/Isadora/Ana' + rota + `SHELTER · mock` removidos das duas telas |
| FAM-T05 | Fonte de rota/abrigo (dívida D-051 §5) | ✅ COMPLETE (decisão) | 2026-07-27 — **D-065**: FEMA NSS para abrigo; navegação entregue ao app de mapas; rumo/distância on-device. Dívida D-051 §5 resolvida. |
| FAM-T06 | Provider FEMA NSS: proxy `/api/shelters` com cache + camada no mapa v2 | ✅ COMPLETE | 2026-07-27 — `lib/world/shelters.ts`; verificado ao vivo: 4 abrigos reais perto de Bend/OR, `empty:true` em Parkland |
| FAM-T07 | Rumo/distância on-device + botão "Como chegar" (deep-link) + adaptador de rotas | ✅ COMPLETE | 2026-07-27 — `lib/world/navigation.ts`; Pilot passa a citar abrigo aberto em "ficar ou sair" |
| FAM-T08 | Cache offline dos abrigos (`lib/offline-storage.ts`) | PENDING | Destino precisa estar no aparelho quando a torre cair |

---

## Cenário — Simulador (SIM)

*Goal: transformar o Cenário num simulador aeronáutico — a família configura o ambiente e o EOS inteiro responde como se fosse verdade.*

> Decisão: **D-067**. Spec completa: `docs/19-scenario-simulator.md`.
> Princípio: **mesmos instrumentos, entradas injetadas.** A injeção acontece no `RiskProvider`, não nas telas.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| SIM-T00 | Spec + decisão do simulador | ✅ COMPLETE | 2026-07-27 — D-067 / doc 19 |
| SIM-T01 | `SimulationProvider` + injeção no `RiskProvider` + cromo persistente + travas de segurança | ✅ COMPLETE | 2026-07-28 — verificado em navegador: risco real 11 → simulado 81, Pilot muda para "Aja agora", faixa some ao encerrar |
| SIM-T02 | Painéis de configuração (ameaça, clima, recursos, saúde, infraestrutura, posição) | ✅ COMPLETE (MVP) | 2026-07-28 — ameaça, severidade, chegada, infraestrutura, mobilidade/medicação, reservas. **Falta**: traduzir o texto livre para os painéis (hoje é só descrição) |
| SIM-T03 | Sessão: briefing pelo Pilot com RAG, rodar, sair a um toque | ✅ COMPLETE | 2026-07-28 — `/api/pilot/chat` com RAG; o Pilot sabe quando está em simulação |
| SIM-T04 | Injeção de eventos e avanço de tempo ("+6h", "a energia caiu") | ✅ COMPLETE | 2026-07-28 — a faixa de simulação abre controles: +3h, +6h, Impacto, e cortar luz/rede/vias em tempo real |
| SIM-T05 | Debrief com lacunas quantificadas + escrita confirmada no checklist | ✅ COMPLETE | 2026-07-28 — `lib/simulation-debrief.ts`. Verificado: veredito, exigia 6 dias vs tinha 0.9, 5 lacunas, e adicionar gravou no checklist real |
| SIM-T06 | Execução contra o Plano da Família | PENDING | Depende de PLAN-T01. É o que vira ensaio de família |
| SIM-T07 | Drills compartilhados no círculo + registro de treino | ✅ COMPLETE | 2026-07-28 — D-071. Migration aplicada e verificada com dois navegadores: convite chega, aceite entra na simulação, encerrar propaga para todos. |

---

## Planos de Emergência da Família (PLAN)

*Goal: carregar o combinado operacional da família — para onde ir e como se encontrar quando nada estiver funcionando.*

> Decisão: **D-066**. Spec completa: `docs/18-family-plans.md`.
> Princípio: **o plano precisa funcionar exatamente quando o EOS não funciona.**

| Task ID | Task | Status | Notes |
|---|---|---|---|
| PLAN-T00 | Spec + decisão do conceito de plano de voo familiar | ✅ COMPLETE | 2026-07-27 — D-066 / doc 18 |
| PLAN-T01 | Modelo de dados + RLS por círculo + API autenticada | PENDING | 5 tabelas; endpoints públicos de ficha nunca tocam nelas |
| PLAN-T02 | Editor: pontos de encontro (1/2/3), lugares conhecidos, papéis, gatilhos | PENDING | Ponto de encontro e papéis são obrigatórios; o resto é opcional |
| PLAN-T03 | Desenho de rotas no mapa + edição de traçado | PENDING | Rotas são autorais, não roteadas (D-066 §2) |
| PLAN-T04 | Versionamento, push ao círculo e reconhecimento explícito | PENDING | **Parte difícil, não adiável.** Duas versões diferentes = famílias em lugares diferentes |
| PLAN-T05 | Cache offline do plano + execução sem rede | PENDING | Critério de aceitação: avião no chão (doc 18 §13) |
| PLAN-T06 | Envelope do plano como recorte do download de mapas offline | PENDING | É o que torna o download finito e certo |
| PLAN-T07 | Pilot propõe/revisa planos com confirmação elemento a elemento | PENDING | Depende de UPP-03; sem escrita silenciosa |

---

## Unified Profile & Pilot Personalization (UPP)

*Goal: make the Ficha Master the authenticated source of long-term user context for EOS Pilot, without exposing private preferences through the public emergency QR.*

> Decision: D-059. This runs as an owner-directed parallel slice while HWD-06 remains isolated.

| Task ID | Task | Status | Notes |
|---|---|---|---|
| UPP-00 | Spec + data model decision for profile personalization and Pilot memory | ✅ COMPLETE | 2026-07-21 — D-059; requirements, data model, Ficha Master and Pilot specs updated |
| UPP-01 | MVP implementation: `profile_personalization` table, authenticated API, Ficha Master editor, avatar in World Dashboard | ✅ COMPLETE | 2026-07-21 — no public QR exposure; Pilot memory writes remain explicit/user-controlled |
| UPP-02 | Profile photo upload pipeline using private storage policy | ✅ COMPLETE | 2026-07-21 — D-060; private `profile-photos` bucket, owner-only RLS, signed URL for authenticated components. Apply migration `20260721021000_profile_photo_storage.sql` in Supabase. |
| UPP-03 | Pilot confirmed-write memory flow and audit trail | PENDING | No silent long-term memory mutation |

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
| PILOT-T03 | Rule-backed recommendation states: GO, LIMITED, WAIT, AVOID, PRIORITY OVERRIDE | BLOCKED | Critical rules must override AI |
| PILOT-T04 | Metrics instrumentation for discovery, trust, retention, personalization, safety | BLOCKED | Needed before production rollout |

---

## Phase 3 — Mobile App (React Native)

*Goal: Initialize the React Native project, integrate the intelligence layer, and ship LOCAL_AI mode.*

> Blocked until Gate G-03 is cleared.

| Task ID | Task | Status |
|---|---|---|
| M-T01 | Initialize React Native project (npx react-native@latest init EOSMobile) | BLOCKED |
| M-T02 | Install mobile dependencies (llama.rn, RNFS, Zustand, NetInfo, etc.) | BLOCKED |
| M-T03 | Integrate `/mobile/eos-intelligence-layer.ts` | BLOCKED |
| M-T04 | Implement LOCAL_AI mode with llama.rn | BLOCKED |
| M-T05 | Wire up SURVIVAL mode (same Rules Engine, no server) | BLOCKED |
| M-T06 | Auth with Supabase JWT in SecureStore | BLOCKED |
| M-T07 | Implement LoRa BLE bridge screen (`mobile/screens/LoRaMeshScreen.tsx`) | BLOCKED |
| M-T08 | Submit to App Store and Google Play | BLOCKED |

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
