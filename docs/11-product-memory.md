# 11 — Product Memory

> Non-obvious facts that don't belong in code comments but must survive across sessions.
> Last updated: 2026-06-23

---

## North Star

The product exists for one moment: a family head in the first 15 minutes of a crisis.
Every feature decision must answer: "does this help in the next 15 minutes?"

## Ficha Master

- `profiles` is the only identity record; there is no separate Master Profile table.
- `/ficha` is the unified editor for identity, location, medical information, emergency contact, and public QR.
- Completion is a UI calculation over seven signals defined in `docs/13-ficha-master.md`; it is not persisted in the database.

---

## Intelligence Modes

There are three intelligence modes, not two. They are a **fallback chain**, not a feature toggle:

1. **CONNECTED** — Claude API + RAG from knowledge_base. Requires internet + auth.
2. **LOCAL_AI** — llama.rn on-device model. Planned, not yet implemented.
3. **SURVIVAL** — Rules Engine only. Always available. Cannot be disabled.

The Rules Engine runs **before** the LLM on every request. The LLM **cannot downgrade** the urgency level set by the Rules Engine. This is a safety guarantee, not a UX choice.

---

## Auth Pattern

The app uses `@supabase/ssr` with **SSR cookies**, not localStorage tokens.
- API routes must use `createClient()` from `@/lib/supabase/server` (async, reads cookies)
- Never use `createClient(url, anonKey)` with a Bearer token in API routes
- Never read `localStorage.getItem('supabase_token')` — it will always be empty
- Same-origin fetch calls do not need an Authorization header — cookies are automatic

---

## Knowledge Base

- **3850 chunks** stored in `knowledge_base` table (as of 2026-06-23)
- **14 source PDFs** covering: CDC, FEMA, IASC, John Seymour, Military FM, Navy SEAL, NCTSN, Red Cross, SAMHSA (3), SAS, WHO
- **Embedding model**: `text-embedding-3-small` (1536 dimensions), HNSW index, cosine similarity, threshold 0.78
- **Scenario type**: inferred from filename — all current PDFs map to `GENERAL` except CDC files (`PANDEMIC`)

### Ingest pipeline (two steps — order matters):

```
python3 scripts/pdf_to_text.py   # PDFs → docs/text/*.txt  (PyMuPDF)
npm run ingest                    # docs/text/*.txt → knowledge_base (native fetch)
```

**Why two steps**: Node.js OOM crashed on large PDFs (SAS 34MB, John Seymour 26MB) when using `pdf-parse`. PyMuPDF handles them trivially. The Node script uses zero heavy dependencies (no openai SDK, no supabase-js) — openai v6 alone is 13MB of JS that V8 can't compile without exhausting heap.

**Known skip**: 20 chunks from SAMHSA_Tips_for_Survivors_Managing_Stress skipped due to `\u0000` null bytes in extracted text (Postgres rejects them). Non-critical — 49/69 chunks stored.

To add new sources: drop PDF in `docs/`, re-run both commands.
PyMuPDF dependency: `pip install pymupdf`

---

## Supabase Free Tier

Supabase free tier projects **auto-pause after ~1 week of inactivity**. When paused:
- DNS still resolves but HTTP returns errors
- Actually: DNS may stop resolving entirely (ENOTFOUND)

Before any session involving Supabase (ingest, backend testing, schema changes):
1. Go to supabase.com → your project
2. Check status — if paused, click "Resume project"
3. Wait ~30 seconds for healthy status

---

## chunkText Bug (fixed 2026-06-23)

The `chunkText` function in `scripts/ingest.mjs` had an infinite loop:
when `breakAt >= clean.length` (last chunk of file), `nextStart = breakAt - CHUNK_OVERLAP`
was always less than `clean.length`, so the while loop never terminated.

Fix: `if (breakAt >= clean.length) break` after creating the last chunk.
Also: `if (nextStart <= start) break` as a safety guard against any future regression.

This bug existed in all previous versions of the ingest script and is the root cause of all historical OOM crashes (the heap filled with millions of duplicate chunks, not the PDF size).

---

## UI / Styling

- CSS custom properties (no Tailwind)
- No design system — raw CSS variables in globals.css
- PWA PNG icons are derived from the canonical `public/icon.svg`; update the SVG first if the app mark changes, then regenerate both PNG sizes.
- UI language is explicitly selected in `/settings`; `lib/i18n.tsx` is the canonical client-side PT/EN dictionary and persists the preference under `eos-language`.
- Page translation is being migrated incrementally under P1-T05; Settings, navigation, Onboarding, private Emergency Card editor, Checklist, and Circles currently consume the shared dictionary.

---

## Platform Status

- **Web PWA**: active, deployed on Vercel, auto-deploys on push to main
- **React Native**: `/mobile/` folder has template files but `npx react-native init` has NOT been run
- **LoRa firmware**: prototype exists, long-horizon, blocked on mobile app

---

## Sentry

Sentry is wired up (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) but requires `SENTRY_DSN` environment variable to be set in Vercel. Without it, errors are silently dropped.

---

## Vercel Deployment

- Auto-deploys on every push to `main`
- No staging environment — `main` is production
- Environment variables must be set in Vercel dashboard (not just `.env.local`)
