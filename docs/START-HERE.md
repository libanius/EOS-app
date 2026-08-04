# START HERE — EOS Session Orientation

> Read this at the start of every new session before opening any implementation file.

---

## What is EOS?

**EOS — Emergency Operating System** is a survival intelligence platform for families facing any emergency. It transforms chaos into prioritized action, and it works with or without internet.

EOS runs as a **Progressive Web App (Next.js 14)** backed by **Supabase** for
auth, data, and vector search, and calls the **OpenAI API** for AI reasoning and
embeddings. D-084 defines EOS as a multi-surface platform: Web/PWA is the
primary validation surface; native mobile, Automotive, and Mesh are future
adapters, not separate products.

---

## Current Status

| Field | Value |
|---|---|
| **Phase** | PHASE 0B complete; next product lane is Preparedness Engine |
| **Current Task** | WV2-T07 — reconcile HWD v1 features that still matter on World v2 according to demand |
| **Last Updated** | 2026-08-03 |

Full details: `docs/09-build-status.md`

### What is working in production (verified 2026-06-30)

| Feature | Status |
|---|---|
| Auth (signup/login/recovery) | ✅ Working |
| Onboarding (profile + family) | ✅ Working |
| Resource inventory + readiness score | ✅ Working |
| Decision Engine / Pilot — CONNECTED mode (OpenAI + RAG + Rules Engine) | ✅ Working |
| Knowledge base (3887 chunks, 14 sources) | ✅ Ingested |
| pgvector RAG (`match_documents` RPC) | ✅ Working |
| Scenarios + threat monitoring panel | ✅ Working |
| Checklist generation | ✅ Working |
| Circles — invite, roles (Admin/Editor/Viewer), QR | ✅ Working |
| Circles — action plans, member monitoring | ✅ Working |
| Ficha Pessoal + public QR (`/ficha/[id]`) | ✅ Working |
| Ficha Master — unified identity + completion % | ✅ Working |
| Household health card — gap detection | ✅ Working |
| Family member ↔ circle profile link | ✅ Working |
| Monitoring — NWS weather + USGS earthquakes | ✅ Working |
| Monitoring — multi-location (circle members) | ✅ Working |
| Feature gates — free/family/premium tiers | ✅ Working |
| Cross-device sync — Realtime + offline queue | ✅ Working |
| Push notifications (VAPID, Web Push) | ✅ Working |
| Stripe Test mode checkout + webhook | ✅ Working |
| EOS Pilot concept/spec | ✅ Documented (`docs/15-eos-pilot.md`) |
| PWA / offline SURVIVAL mode | ✅ Working |
| Safe area insets (iPhone notch + home bar) | ✅ Fixed |
| Bottom navigation (5 abas) | ✅ Working |
| PWA icons (192px, 512px) | ✅ Working |
| i18n — PT/EN bilíngue | ✅ Working |
| Landing page (pitch + CTAs) | ✅ Working |
| LOCAL_AI mode | ❌ Not implemented |
| Native mobile app | ❌ Blocked by G-03 |
| Automotive companion | ❌ Blocked by G-06 |

---

## Orientation Checklist (run at session start)

1. Read `AGENTS.md` — understand the SDD rules
2. Read `docs/09-build-status.md` — know exactly what is done and what is next
3. Read `docs/07-roadmap.md` — know what phase and task you're in
4. Read `docs/11-product-memory.md` — know the context that doesn't live in the code
5. Check Supabase project is not paused (supabase.com → project `alxurmgpyxjhvnliivbf`)
6. Then, and only then, open implementation files

---

## Key Entry Points in the Codebase

| Path | Description |
|---|---|
| `app/page.tsx` | Root landing page (currently a placeholder) |
| `app/layout.tsx` | Root layout, PWA metadata, viewport config |
| `app/(app)/` | All authenticated app pages |
| `app/(app)/dashboard/page.tsx` | World v2 front door |
| `app/(app)/scenario/page.tsx` | Scenario simulator |
| `app/(app)/sim/[token]/page.tsx` | Simulation invite bridge; preserves onboarding context |
| `app/(app)/onboarding/page.tsx` | First-run profile setup; can show simulation invite context |
| `app/(app)/preparedness/page.tsx` | Unified readiness, resources, and checklist/tasks |
| `app/(app)/comms/page.tsx` | App-level Comms: circle chat, editable family radio frequencies, quick radio guide, and Mesh boundary |
| `app/(app)/edu/page.tsx` | Approved EDU catalog by scenario tag |
| `app/(app)/admin/edu/page.tsx` | Owner/admin EDU publishing surface |
| `app/(app)/inventory/page.tsx` | Redirects to `/preparedness` |
| `app/(app)/checklist/page.tsx` | Redirects to `/preparedness` |
| `app/(app)/family/page.tsx` | Family location/readiness command surface |
| `app/(app)/plan/page.tsx` | Family emergency plans |
| `app/(app)/checklist/page.tsx` | Preparedness checklist |
| `app/(app)/circles/page.tsx` | Community resilience groups |
| `app/api/pilot/chat/route.ts` | Pilot conversation endpoint |
| `app/api/profile/personalization/memory/route.ts` | Confirmed Pilot memory writes |
| `app/api/simulation/parse/route.ts` | OpenAI parser for free-text simulator panels |
| `app/api/edu/route.ts` | EDU catalog and owner/admin publishing endpoint |
| `app/api/analyze/route.ts` | Legacy/analyze AI orchestration endpoint |
| `lib/knowledge.ts` | RAG retrieval via pgvector (`match_documents` RPC) |
| `lib/offline-storage.ts` | IndexedDB offline cache |
| `lib/rate-limit.ts` | Upstash Redis rate limiting (falls back to in-memory) |
| `middleware.ts` | Auth route protection |
| `eos_schema.sql` | Supabase database schema (canonical reference) |
| `supabase/migrations/` | Applied migrations |
| `scripts/pdf_to_text.py` | Step 1 of ingest: PDFs → text files |
| `scripts/ingest.mjs` | Step 2 of ingest: text files → knowledge_base embeddings |
| `mobile/` | Native mobile templates/concepts (NOT a runnable app yet) |
| `docs/15-eos-pilot.md` | EOS Pilot product concept/spec |
| `docs/20-preparedness-engine.md` | Preparedness Engine spec |
| `docs/21-comms.md` | App-level Comms spec |
| `docs/22-edu.md` | EDU catalog and future RAG provenance spec |
| `docs/23-onboarding-by-simulation.md` | Contextual onboarding from simulation invites |
| `docs/24-simulation-preparedness-actions.md` | Simulation debrief to confirmed preparedness actions |
| `docs/25-pilot-situational-educator.md` | Pilot educator to confirmed preparedness actions |
| `docs/26-simulation-natural-language-panels.md` | Free-text simulator input to reviewable panels |
| `docs/27-pilot-memory-confirmed-writes.md` | Confirmed Pilot memory writes and audit trail |

---

## Tech Stack Summary

- **Framework**: Next.js 14 (App Router, TypeScript strict)
- **Database + Auth**: Supabase (PostgreSQL + pgvector + RLS)
- **AI (Reasoning)**: OpenAI API (Pilot default documented in build status)
- **AI (Embeddings/RAG)**: OpenAI embeddings via pgvector
- **Offline Storage**: IndexedDB via `idb`
- **PWA**: `next-pwa` with service worker and runtime caching
- **Rate Limiting**: Upstash Redis (sliding window, 10 req/60s)
- **Sync**: Supabase Realtime (`postgres_changes`) + `localStorage` write queue + `sessionStorage` snapshots
- **Push**: Web Push API (VAPID) via `web-push` + next-pwa `customWorkerSrc`
- **i18n**: Custom `useLanguage()` hook with PT/EN translations in `lib/i18n.tsx`
- **Error Monitoring**: Sentry (`@sentry/nextjs`)
- **Mobile (planned)**: native shell blocked by G-03; approach not initialized

---

## Intelligence Modes

EOS operates in three modes — a fallback chain, not feature toggles:

| Mode | Description | Status |
|---|---|---|
| `CONNECTED` | OpenAI + pgvector RAG + Rules Engine | ✅ Working |
| `LOCAL_AI` | On-device LLM via llama.rn (mobile only) | ❌ Not implemented |
| `SURVIVAL` | Rules Engine only — fully offline, no AI | ✅ Always available |

---

## What NOT to Do at Session Start

- Do not open implementation files before reading the docs above
- Do not add features that are not on the roadmap
- Do not change the data model without reading `docs/06-data-model.md` first
- Do not start a new task without confirming the current one is complete

---

*For the full SDD protocol, see `AGENTS.md`.*
