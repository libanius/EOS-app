# 07 — Roadmap

> Last updated: 2026-06-28

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
| P1-T07 | Verify Sentry is capturing errors in production | NEXT UP | MEDIUM |
| P1-T08 | Rate limit validation: confirm Upstash Redis is connected in production | DRAFT | MEDIUM |

---

## Phase 2 — Círculos, Fichas & Household (Web PWA)

*Spec completa em `docs/12-circle-model.md`*

| Task ID | Description | Status | Priority |
|---|---|---|---|
| P2-T00 | Circle model spec + decisions documented | ✅ COMPLETE | HIGH |
| P2-T01 | Ficha Pessoal: perfil de emergência + QR público (`/ficha/[id]`) | ✅ COMPLETE | HIGH |
| P2-T06 | Ficha Master: identidade central unificada + onboarding progressivo | ✅ COMPLETE | HIGH |
| P2-T07 | Subscription tiers: `profiles.plan` + `lib/feature-gates.ts` + UI de upgrade | PENDING | HIGH |
| P2-T02 | Círculos: convite por código/QR + aprovação + roles (Admin/Editor/Viewer) | PENDING | HIGH |
| P2-T03 | Inventário: toggle compartilhar por campo + `shared_fields` na DB | PENDING | MEDIUM |
| P2-T04 | Household view: visão agregada dos recursos compartilhados no círculo | PENDING | MEDIUM |
| P2-T05 | Merge de membro manual → vinculado (badge + decisão do usuário) | PENDING | MEDIUM |
| P2-T08 | Localização: `profiles.location_lat/lng` + geocoding (pré-req monitoramento) | PENDING | HIGH |
| P2-T09 | `/api/monitor` — agregador server-side NWS + USGS (tier gratuito) | PENDING | HIGH |
| P2-T10 | Tela Cenário redesenhada: painel de ameaças + campo livre abaixo | PENDING | HIGH |
| P2-T11 | Feature gates de monitoramento em `lib/feature-gates.ts` | PENDING | HIGH |
| P2-T12 | Monitoramento multi-localização (membros do círculo, tier Família) | PENDING | MEDIUM |

**Spec de monitoramento**: ver `docs/14-monitoring.md`.

---

## Phase 3 — Mobile App (React Native)

*Goal: Initialize the React Native project, integrate the intelligence layer, and ship LOCAL_AI mode.*

> Blocked until Phase 1 is complete and Gate G-03 is cleared.

| Task ID | Task | Status |
|---|---|---|
| P2-T01 | Initialize React Native project (npx react-native@latest init EOSMobile) | BLOCKED |
| P2-T02 | Install mobile dependencies (llama.rn, RNFS, Zustand, NetInfo, etc.) | BLOCKED |
| P2-T03 | Integrate `/mobile/eos-intelligence-layer.ts` | BLOCKED |
| P2-T04 | Implement LOCAL_AI mode with llama.rn | BLOCKED |
| P2-T05 | Wire up SURVIVAL mode (same Rules Engine, no server) | BLOCKED |
| P2-T06 | Auth with Supabase JWT in SecureStore | BLOCKED |
| P2-T07 | Implement LoRa BLE bridge screen (`mobile/screens/LoRaMeshScreen.tsx`) | BLOCKED |
| P2-T08 | Submit to App Store and Google Play | BLOCKED |

---

## Phase 3 — Community & Scale

*Goal: Expand Circles feature, add notifications, and prepare for user growth.*

> Not yet sequenced. Dependent on Phase 2 and confirmed monetization decision.

| Task ID | Task | Status |
|---|---|---|
| P3-T01 | Circle: share action plan with members | DRAFT |
| P3-T02 | Push notifications (emergency alerts from circle leaders) | DRAFT |
| P3-T03 | Multi-language support (i18n) | DRAFT |
| P3-T04 | Monetization: subscription model decision and implementation | GATE NEEDED |
| P3-T05 | Emergency contact sharing within circles | DRAFT |

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
