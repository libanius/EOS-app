# START HERE — EOS Session Orientation

> Read this at the start of every new session before opening any implementation file.

---

## What is EOS?

**EOS — Emergency Operating System** is a survival intelligence platform for families facing any emergency. It transforms chaos into prioritized action, and it works with or without internet.

EOS runs as a **Progressive Web App (Next.js 14)** backed by **Supabase** for auth, data, and vector search, and calls the **Claude API (Anthropic)** for AI reasoning. A **React Native mobile app** is in preparation but not yet initialized.

---

## Current Status

| Field | Value |
|---|---|
| **Phase** | Phase 1 — MVP Hardening |
| **Current Task** | P1-T03: Add PWA icons |
| **Last Updated** | 2026-06-24 |

Full details: `docs/09-build-status.md`

### What is working in production (verified 2026-06-24)

| Feature | Status |
|---|---|
| Auth (signup/login/recovery) | ✅ Working |
| Onboarding (profile + family) | ✅ Working |
| Resource inventory | ✅ Working |
| Decision Engine — CONNECTED mode (Claude + RAG) | ✅ Working |
| Knowledge base (3887 chunks, 14 sources) | ✅ Ingested |
| pgvector RAG (`match_documents` RPC) | ✅ Working |
| Scenarios + action_plans persist | ✅ Working |
| Checklist generation | ✅ Working |
| Circles (family groups) | ✅ Working |
| PWA / offline SURVIVAL mode | ✅ Working |
| Bottom navigation (5 abas) | ✅ Working |
| PWA icons (192px, 512px) | ❌ Missing — P1-T03 |
| Landing page (pitch + CTAs) | ✅ Working |
| LOCAL_AI mode | ❌ Phase 2 |
| React Native app | ❌ Phase 2 |

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
| `app/(app)/scenario/page.tsx` | Decision Engine UI (AI streaming action plans) |
| `app/(app)/inventory/page.tsx` | Resource inventory + readiness score |
| `app/(app)/family/page.tsx` | Family member management |
| `app/(app)/checklist/page.tsx` | Preparedness checklist |
| `app/(app)/circles/page.tsx` | Community resilience groups |
| `app/api/analyze/route.ts` | Main AI orchestration endpoint (streaming SSE) |
| `lib/knowledge.ts` | RAG retrieval via pgvector (`match_documents` RPC) |
| `lib/offline-storage.ts` | IndexedDB offline cache |
| `lib/rate-limit.ts` | Upstash Redis rate limiting (falls back to in-memory) |
| `middleware.ts` | Auth route protection |
| `eos_schema.sql` | Supabase database schema (canonical reference) |
| `supabase/migrations/` | Applied migrations (most recent: 20260624) |
| `scripts/pdf_to_text.py` | Step 1 of ingest: PDFs → text files |
| `scripts/ingest.mjs` | Step 2 of ingest: text files → knowledge_base embeddings |
| `mobile/` | React Native templates (NOT a runnable RN project yet) |

---

## Tech Stack Summary

- **Framework**: Next.js 14 (App Router, TypeScript strict)
- **Database + Auth**: Supabase (PostgreSQL + pgvector + RLS)
- **AI (Reasoning)**: Anthropic Claude API (`claude-sonnet-4-20250514`)
- **AI (Embeddings/RAG)**: OpenAI `text-embedding-3-small` via pgvector
- **Offline Storage**: IndexedDB via `idb`
- **PWA**: `next-pwa` with service worker and runtime caching
- **Rate Limiting**: Upstash Redis (sliding window, 10 req/60s)
- **Error Monitoring**: Sentry (`@sentry/nextjs`)
- **Mobile (planned)**: React Native bare workflow + llama.rn local AI

---

## Intelligence Modes

EOS operates in three modes — a fallback chain, not feature toggles:

| Mode | Description | Status |
|---|---|---|
| `CONNECTED` | Full Claude API + pgvector RAG + Rules Engine | ✅ Working |
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
