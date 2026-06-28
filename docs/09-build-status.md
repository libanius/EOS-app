# 09 — Build Status

> The single most important file for resuming a session. Read this first after AGENTS.md.
> Last updated: 2026-06-28

---

## Current State

| Field | Value |
|---|---|
| **Current Phase** | Phase 1 — MVP Hardening |
| **Last Completed Task** | Family: medical notes + AI tags + medications (2026-06-28) |
| **Next Task** | P2-T01: Ficha Pessoal + QR público (Incremento 1 — Círculos) |
| **Build** | ✅ Passing — `npm run build` clean as of commit `8776817` |
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
| P1-T04: Landing page | ✅ COMPLETE | 2026-06-28 |
| P1-T09: Bottom navigation (5 tabs) | ✅ COMPLETE | 2026-06-28 |
| P1-T10: E2E test agent | ✅ COMPLETE | 2026-06-28 |
| P1-T11: Recursos screen — checklist integration + inventory sync | ✅ COMPLETE | 2026-06-28 |
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

## Phase 2 Progress — Círculos & Fichas

| Task | Status | Completed |
|---|---|---|
| P2-T00: Circle model spec + decisions documented | ✅ COMPLETE | 2026-06-28 |
| P2-T01: Ficha Pessoal + QR público | NEXT UP | — |
| P2-T02: Circle invitations + approval + roles | PLANNED | — |
| P2-T03: Inventory sharing toggle per field | PLANNED | — |
| P2-T04: Household view in Círculos screen | PLANNED | — |

**Spec**: ver `docs/12-circle-model.md` antes de implementar qualquer tarefa P2.

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
| Landing page | ✅ DONE | `app/page.tsx` | Pitch + CTAs deployed |
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
| `ANTHROPIC_API_KEY` | (removido — todo LLM migrado para OpenAI) | ❌ Não usado |
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

## What Was Done — Session 2026-06-24 (cont.)

**Landing page (P1-T04):**
- `app/page.tsx` rewritten: brand, headline, 4 feature bullets, CTAs (signup + login)
- Server component: redirects authenticated users to `/scenario`
- Auth redirect URLs fixed: `getSiteUrl()` now uses `VERCEL_PROJECT_PRODUCTION_URL` (auto-set by Vercel)
- Supabase URL Config corrected: Site URL = `https://eos-app-fawn.vercel.app`, added redirect wildcard

**Bottom navigation + UX fix (P1-T09):**
- `components/BottomNav.tsx` created: 5-tab nav (Cenário/Família/Recursos/Checklist/Círculos)
  - SVG icons, active state via `usePathname()`, 56px touch targets, safe-area inset
- `app/(app)/layout.tsx` created: shared layout for all authenticated pages
- `lib/auth/actions.ts`: post-login redirect changed from `/family` → `/scenario`
- `app/globals.css` `.nb`: improved touch targets (56px min-height, touch-action: manipulation)

**Git hygiene:**
- `public/sw.js` and `public/workbox-*.js` removed from git tracking (Vercel regenerates on each build)
- `EOS documents/` removed from git tracking (nested git repo, personal docs — not app code)
- `supabase/.temp/` added to `.gitignore`
- All three added to `.gitignore`

---

---

## What Was Done — Session 2026-06-28 (cont.)

**Checklist LLM fixed (P1-T10 / bugfix):**
- Root cause 1: `OPENAI_MODEL=gpt-5` in Vercel env — model doesn't exist; hardcoded `gpt-4o-mini` directly in route to bypass broken env var
- Root cause 2: Unique index used `COALESCE(scenario_id,...)` expression — PostgREST `onConflict` can't match expression indexes; fixed to `UNIQUE (profile_id, canonical_key)`
- Root cause 3: LLM generated duplicate `canonical_key` items; fixed by deduping before upsert
- Migration applied: `20260628000200_fix_checklists_conflict_constraint.sql`

**DB hotfixes applied (2026-06-28):**
- `resource_inventory.updated_at` column added (API was selecting it but column didn't exist)
- Circles RLS infinite recursion fixed via `SECURITY DEFINER` helper functions
- Migration: `20260628000100_fix_inventory_updated_at_and_circles_rls.sql`

**E2E test agent created (`scripts/e2e-agent.mjs`):**
- Creates test user via Supabase Admin API, seeds profile + family, logs in, tests all 7 API endpoints, cleans up
- Final result: **14/14 ✅ PASSOU** against production `eos-app-fawn.vercel.app`
- Usage: `node scripts/e2e-agent.mjs [--url https://eos-app-fawn.vercel.app]`

**Known env var issue discovered:**
- `ANTHROPIC_API_KEY` is NOT set in the Vercel project — `/api/analyze` silently falls back to rules-based `buildSurvivalResponse` mode instead of LLM
- `OPENAI_MODEL` no Vercel está setado como `gpt-5` (inválido) — hardcoded `gpt-4o-mini` nos routes afetados

---

## What Was Done — Session 2026-06-28 (cont. — segunda parte)

**Todo LLM migrado de Anthropic → OpenAI (`app/api/analyze/route.ts`):**
- Usuário confirmou: apenas OpenAI é usada no projeto (nunca houve intenção de usar Anthropic)
- `tryCallLLM` reescrita: `openai.chat.completions.stream()` com `gpt-4o-mini`
- Tokens transmitidos via `chunk.choices[0]?.delta?.content`
- Fallback para `buildSurvivalResponse` mantido se LLM falhar
- `ANTHROPIC_API_KEY` removida da tabela de env vars (não é usada)

**Tela de Recursos — Checklist integrado (P1-T11):**
- `app/(app)/inventory/page.tsx` expandido para mostrar itens do checklist por tier
- Barra de progresso por tier (ESSENCIAL / MODERADO / EXCELENTE)
- Toggle de itens diretamente na tela de Recursos (sincroniza via `/api/checklist/toggle`)
- Botão "Gerar Checklist" se não houver itens ainda
- Itens continuam editáveis na tela dedicada `/checklist`

**Sincronização checklist → inventory (P1-T11):**
- Ao marcar um item como adquirido no checklist, o campo correspondente do inventário atualiza automaticamente
- Mapeamento: `agua-*` → `water_liters`, `combustivel-*` → `fuel_liters`, `kit-*-auxilios` → `has_medical_kit`, `radio-*` → `has_communication_device`, `dinero-*` → `cash_amount`
- Usa `Math.max`: valores existentes nunca são reduzidos (apenas aumentam)
- Suporta canonical_keys em Português E Espanhol (o LLM gera itens no idioma do contexto)

**Investigação do bug de save do inventory:**
- Confirmado via teste E2E: o save funciona — Paulo tem linha na DB com valores corretos
- `resource_inventory`: 1 linha para Paulo (water=45, food=7, fuel=5, battery=80%, medical_kit=true, cash=200)
- `updated_at` existia e o bug anterior (coluna não existia) foi corrigido na migration 20260628000100

**Decisão: `OPENAI_MODEL` env var no Vercel está como `gpt-5` (modelo inválido):**
- Hardcoded `gpt-4o-mini` diretamente nos routes afetados para contornar o env var quebrado
- **Ação recomendada**: atualizar `OPENAI_MODEL` no Vercel para `gpt-4o-mini` e remover os hardcodes
