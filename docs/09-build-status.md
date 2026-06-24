# 09 — Build Status

> The single most important file for resuming a session. Read this first after AGENTS.md.
> Last updated: 2026-06-24

---

## Current State

| Field | Value |
|---|---|
| **Current Phase** | Phase 1 — MVP Hardening |
| **Last Completed Task** | P1-T06: End-to-end test — CONNECTED mode verified in production |
| **Next Task** | P1-T03: Add PWA icons (icon-192.png, icon-512.png) |
| **Build** | ✅ Passing — `npm run build` clean as of commit `e4f4998` |
| **Vercel** | ✅ Deployed — auto-deploys on push to `main` |
| **Supabase** | ✅ Healthy — project ref `alxurmgpyxjhvnliivbf` |

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
| P1-T01: Fix Decision Engine (auth, field names, schema, persist) | ✅ COMPLETE | 2026-06-23 |
| P1-T02: Ingest knowledge base (14 PDFs → 3887 chunks) | ✅ COMPLETE | 2026-06-23 |
| P1-T06: End-to-end test — CONNECTED mode verified in production | ✅ COMPLETE | 2026-06-24 |
| P1-T03: Add PWA icons | NEXT UP | — |
| P1-T04: Landing page | DRAFT | — |
| P1-T05: Language strategy | DRAFT | — |
| P1-T07: Verify Sentry in production | DRAFT | — |
| P1-T08: Rate limit validation (Upstash) | DRAFT | — |

---

## What Was Done — Session 2026-06-23

**P1-T01 — Decision Engine fixed:**
- `app/api/analyze/route.ts`: replaced Bearer token auth with SSR cookie client (`@/lib/supabase/server`)
- Fixed all DB field names: `profiles.id`, `family_members.profile_id`, `resource_inventory.profile_id`, `fuel_liters`, `battery_percent`, `has_medical_kit`
- Fixed `action_plans` persist: creates `scenarios` row first (required FK), maps priority string → smallint (CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1)
- `app/(app)/scenario/page.tsx`: removed manual Authorization header — cookies are automatic for same-origin fetch

**P1-T02 — Knowledge base ingested:**
- Two-step pipeline: `python3 scripts/pdf_to_text.py` → `node scripts/ingest.mjs`
- 3850 chunks ingested from 14 PDFs (3887 total including 37 pre-existing rows)
- Root cause of all past OOM: `chunkText()` infinite loop when at end of file — fixed with `if (breakAt >= clean.length) break`

**App Spine installed:**
- `AGENTS.md` + all 11 `/docs/` files created and committed
- `progress/index.html` stakeholder dashboard created

---

## What Was Done — Session 2026-06-24

**Build errors fixed (3 issues):**
1. `app/api/analyze/route.ts` line 1: `import { NextRequest }` → `import type { NextRequest }` (TypeScript strict type-only import rule)
2. `tsconfig.json`: added `"scripts"` to `exclude` array — scripts/ contains Node CLI tools, not app code; was causing type errors
3. Removed empty `node_modules/@types/` directories with spaces in names (`eslint 2`, `estree 2`, `glob 2`, `json-schema 2`) — created by npm's `typesVersions` resolution, caused TS2688 phantom type errors. Also added `"typeRoots": ["./node_modules/@types"]` to prevent recurrence.

**Supabase schema migration applied:**
- Created and applied `supabase/migrations/20260624000000_missing_tables.sql`
- Creates: `resource_inventory`, `scenarios`, `action_plans` tables with RLS policies
- Creates: `match_documents` pgvector RPC — this was missing; without it RAG silently failed and app always fell back to SURVIVAL mode

**End-to-end test (P1-T06) — verified via automated test against production Supabase:**
- `match_documents` RPC: ✅ returns FEMA/Red Cross chunks with real similarity scores (0.5–0.53 for flood query)
- Profile + family: ✅ Paulo Libanio Neto with 3 family members exist in DB
- `scenarios` insert: ✅ working
- `action_plans` insert: ✅ working
- Knowledge base count: ✅ 3887 chunks

---

## What Is Next

**P1-T03: Add PWA icons**

`public/manifest.json` references `icon-192.png` and `icon-512.png` but neither file exists in `/public/`. This causes install-to-homescreen to show a blank icon on some devices.

Steps:
1. Create or source a 512×512 PNG icon for EOS (shield or radar symbol — must read at 48px)
2. Resize to 192×192 and 512×512
3. Save both as `/public/icon-192.png` and `/public/icon-512.png`
4. Verify `public/manifest.json` icon references match the filenames

---

## Known Issues

| Issue | Severity | File | Status |
|---|---|---|---|
| PWA icons missing (icon-192.png, icon-512.png) | MEDIUM | `public/` | P1-T03 — next task |
| Landing page is a placeholder | MEDIUM | `app/page.tsx` | P1-T04 |
| Offline write sync not implemented | MEDIUM | `lib/offline-storage.ts` | Writes to IndexedDB not synced back to Supabase on reconnect |
| LOCAL_AI mode not implemented | MEDIUM | `app/api/analyze/route.ts` | Phase 2 |
| React Native project not initialized | MEDIUM | `mobile/` | `/mobile/` has template files but `npx react-native init` not run — Phase 2 |
| Sentry DSN not confirmed in Vercel | LOW | Vercel env vars | P1-T07 — confirm `SENTRY_DSN` is set |
| Upstash Redis not confirmed in Vercel | LOW | Vercel env vars | P1-T08 — rate limit falls back to in-memory without it |
| SAMHSA_Tips 20 chunks skipped (null bytes) | LOW | knowledge_base | 49/69 chunks stored — non-critical |

---

## Ingest Pipeline Reference

| Command | Purpose |
|---|---|
| `python3 scripts/pdf_to_text.py` | Convert PDFs in `docs/` → text files in `docs/text/` |
| `npm run ingest` | Chunk + embed + upsert all `.txt` files from `docs/text/` to `knowledge_base` |

Requires: PyMuPDF (`pip install pymupdf`), `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

To add a new knowledge source: drop PDF in `docs/`, re-run both commands.

---

## Environment Variables Status

| Variable | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ Set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access | ✅ Set |
| `NEXT_PUBLIC_SITE_URL` | Auth redirect base URL | ✅ Set |
| `OPENAI_API_KEY` | Embeddings for RAG | ✅ Set |
| `ANTHROPIC_API_KEY` | Claude for AI reasoning (used in `app/api/analyze/route.ts`) | ✅ Set |
| `UPSTASH_REDIS_REST_URL` | Rate limiting (production) | ⚠️ Not confirmed in Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (production) | ⚠️ Not confirmed — falls back to in-memory |
| `SENTRY_DSN` | Error monitoring | ⚠️ Not confirmed — errors silently dropped without it |

---

## Deployment

- **Hosting**: Vercel — project linked via `.vercel/project.json`
- **Branch**: `main` → production (no staging environment)
- **Build**: `next build` — verified clean as of 2026-06-24, commit `e4f4998`
- **Deploy**: automatic on push to `main`

---

*Update this file after every session. Mark tasks complete. Document what changed and what's next.*
