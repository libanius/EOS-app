# START HERE — Session Orientation

> Read this at the start of every session, after AGENTS.md.

---

## What is EOS?

EOS (Emergency Operating System) is a family emergency preparedness app.
It helps a family head make the right decisions in the first 15 minutes of a crisis.

**Core loop:** Describe your emergency → Get a prioritized action plan → Execute.

---

## Current Status

| Area | Status |
|---|---|
| Auth (signup/login/recovery) | ✅ Implemented |
| Onboarding (profile + family) | ✅ Implemented |
| Resource inventory | ✅ Implemented |
| Decision Engine (CONNECTED mode) | ✅ Fixed 2026-06-23 |
| Knowledge base (RAG) | ✅ Ingested 2026-06-23 — 3850 chunks |
| Checklist generation | ✅ Implemented |
| Circles (family groups) | ✅ Implemented |
| PWA / offline SURVIVAL mode | ✅ Implemented |
| LOCAL_AI mode (llama.rn) | ❌ Not implemented |
| React Native app | ❌ Not initialized |
| Landing page | ❌ Placeholder only |
| PWA icons | ❌ Missing |

---

## Key Codebase Entry Points

| What | Where |
|---|---|
| Decision Engine API | `app/api/analyze/route.ts` |
| Rules Engine | `lib/rules-engine.ts` |
| RAG knowledge search | `lib/knowledge.ts` |
| Supabase server client | `lib/supabase/server.ts` |
| Scenario UI | `app/(app)/scenario/page.tsx` |
| Ingest pipeline | `scripts/pdf_to_text.py` + `scripts/ingest.mjs` |

---

## Tech Stack

- **Framework**: Next.js 14 App Router, TypeScript strict
- **Database**: Supabase (PostgreSQL + pgvector + RLS)
- **Auth**: @supabase/ssr (SSR cookies — NOT localStorage tokens)
- **AI**: OpenAI (embeddings: text-embedding-3-small, chat: gpt-4o)
- **Hosting**: Vercel (auto-deploy on push to main)
- **PWA**: next-pwa with service worker
- **Rate limiting**: Upstash Redis (optional, falls back to in-memory)

---

## Orientation Checklist

Before starting work:
- [ ] Read `docs/09-build-status.md` — what is the current task?
- [ ] Read `docs/07-roadmap.md` — what phase are we in?
- [ ] Read `docs/11-product-memory.md` — any non-obvious context?
- [ ] Check Supabase project is not paused (supabase.com dashboard)
