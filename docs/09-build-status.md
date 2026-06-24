# 09 — Build Status

> The single most important file for resuming a session. Read this first after AGENTS.md.
> Last updated: 2026-06-23

---

## Current State

| Field | Value |
|---|---|
| **Current Phase** | Phase 1 — MVP Hardening |
| **Current Task** | P1-T02: Knowledge base ingestion — ✅ COMPLETE |
| **Task Status** | ✅ COMPLETE |
| **Product code changes** | scripts/ingest.mjs (new), scripts/pdf_to_text.py (new) |
| **Next Task** | P1-T06: End-to-end test — verify CONNECTED mode works in production |

---

## Phase 0 Progress

| Task | Status | Completed |
|---|---|---|
| P0-T01: Install SDD/App Spine structure | ✅ COMPLETE | 2026-06-23 |
| P0-T02: Review existing product baseline | ✅ COMPLETE | 2026-06-23 |
| P0-T03: Confirm MVP scope | ✅ COMPLETE | 2026-06-23 |
| P0-T04: Sequence first real implementation task | ✅ COMPLETE | 2026-06-23 |

---

## Phase 1 Progress

| Task | Status | Completed |
|---|---|---|
| P1-T01: Fix Decision Engine | ✅ COMPLETE | 2026-06-23 |
| P1-T02: Ingest knowledge base | ✅ COMPLETE | 2026-06-23 |
| P1-T06: End-to-end test | PENDING | — |

---

## What Was Done This Session (2026-06-23, continued)

**P1-T02 — Knowledge base ingested:**

The original `scripts/ingest.ts` (using `pdf-parse` + tsx) had two compounding failures:
1. `pdf-parse` loaded entire PDFs into V8 heap — OOM on SAS (34MB) and John Seymour (26MB)
2. `chunkText()` had an infinite loop bug: when `breakAt >= clean.length`, `nextStart = breakAt - CHUNK_OVERLAP` never advanced past the last window, creating millions of duplicate chunks and filling 4GB of heap even on 2KB files
3. The tsx/openai-v6 stack consumed 2-4GB of heap just during module compilation (openai package = 13MB of JS)

**Final pipeline (two steps):**

Step 1 — `python3 scripts/pdf_to_text.py`
- Uses PyMuPDF (fitz) to extract text page-by-page
- Saves 14 `.txt` files to `docs/text/` (total ~4MB vs 94MB of PDFs)
- One-time operation; only re-run if PDFs change

Step 2 — `npm run ingest`  (runs `node scripts/ingest.mjs`)
- Plain ESM JavaScript — no tsx, no openai SDK, no supabase-js SDK
- Uses native Node `fetch` for both OpenAI Embeddings API and Supabase REST API
- Fixed `chunkText`: added `if (breakAt >= clean.length) break` to prevent infinite loop
- Chunks incrementally (EMBEDDING_BATCH=20), upserts immediately — no memory accumulation

**Result:** 3850 chunks stored across 14 files. One batch in SAMHSA_Tips skipped (20 chunks with `\u0000` null bytes that Postgres rejects — non-critical).

**Supabase project was paused** (free tier, idle > 1 week). Resumed manually from dashboard before ingest succeeded. Keep in mind for future sessions.

---

## What Is Next

**P1-T06: End-to-end test — verify CONNECTED mode works in production**

Deploy to Vercel and manually verify:
1. Sign up → onboarding → add family member → set inventory → go to Scenario
2. Describe a scenario, click Generate
3. Confirm the response badge shows `CONNECTED` (not `SURVIVAL`)
4. Confirm knowledge sources are listed (SAS, Red Cross, CDC, etc.)
5. Confirm action plan is persisted in Supabase (`action_plans` table has a new row)

Also verify in Supabase SQL editor: `SELECT COUNT(*) FROM knowledge_base;` → should return 3850.

---

## Known Issues Found During Audit

| Issue | Severity | File | Notes |
|---|---|---|---|
| ~~`action_plans.priority` schema mismatch~~ | ~~HIGH~~ | `app/api/analyze/route.ts` | FIXED 2026-06-23 |
| ~~Knowledge base empty~~ | ~~HIGH~~ | `lib/knowledge.ts` | FIXED 2026-06-23 — 3850 chunks ingested |
| SAMHSA_Tips 20 chunks skipped | LOW | `docs/text/SAMHSA_Tips_for_Survivors_Managing_Stress.txt` | Null bytes (\u0000) in extracted text; 49/69 chunks stored, non-critical |
| `icon-192.png` and `icon-512.png` missing | LOW | `public/manifest.json` | Referenced but not found in `/public/` |
| Landing page is a placeholder | MEDIUM | `app/page.tsx` | Text says "Foundation ready. Auth and database next." — not suitable for users |
| Offline write sync not implemented | MEDIUM | `lib/offline-storage.ts` | Writes to IndexedDB are not synced back to Supabase on reconnect |
| LOCAL_AI mode not implemented | MEDIUM | `app/api/analyze/route.ts` | Mode type exists but no llama.rn integration |
| `OPENAI_MODEL=gpt-5` in .env.example | LOW | `.env.example` | gpt-5 does not exist as of 2026-06-23; likely meant gpt-4o or similar |
| React Native project not initialized | MEDIUM | `mobile/` | `/mobile/` has template files but `npx react-native init` not run |
| Supabase free tier auto-pauses | MEDIUM | — | Project paused after ~1 week idle. Must resume manually from dashboard before any ingest or backend work. |

---

## Ingest Pipeline Reference

| Command | Purpose |
|---|---|
| `python3 scripts/pdf_to_text.py` | Convert PDFs in `docs/` → text files in `docs/text/` |
| `npm run ingest` | Chunk + embed + upsert all `.txt` files in `docs/text/` |

To add a new knowledge source: drop PDF in `docs/`, re-run both commands.
PyMuPDF required: `pip install pymupdf`

---

## Environment Variables Status

| Variable | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required — must be set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service role | Required |
| `NEXT_PUBLIC_SITE_URL` | Auth redirect base URL | Required |
| `OPENAI_API_KEY` | Embeddings + LLM | Required |
| `OPENAI_MODEL` | OpenAI model for chat | Value `gpt-5` in .env.example is likely wrong |
| `UPSTASH_REDIS_REST_URL` | Rate limiting (production) | Optional — falls back to in-memory |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (production) | Optional |
| `SENTRY_DSN` | Error monitoring | Optional |

---

## Deployment

- **Hosting**: Vercel (confirmed `.vercel/project.json`)
- **Branch**: `main`
- **Deploy command**: Automatic on push to main (Vercel default)
- **Build command**: `next build`

---

*Update this file after every session. Mark tasks complete. Document what changed and what's next.*
