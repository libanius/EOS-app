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
- P1-T05 completed: authenticated screens, auth, landing, and the public Emergency Card support PT/EN. Client surfaces use `lib/i18n.tsx`; server-rendered public surfaces read the `eos-language` cookie.

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

---

## Círculos

- Roles: `Admin` / `Editor` / `Viewer` (migrado de `LEADER`/`MEMBER` em 2026-06-30)
- Admin pode: alterar roles, remover membros, enviar push, criar/editar planos de ação
- Editor pode: criar/editar planos de ação
- Viewer: só leitura
- `circle_members.shared_fields: text[]` — campos de inventário compartilhados por campo (`water`, `food`, `medical`, `comms`, `emergency_contact`)
- `circle_members.share_inventory: bool` — toggle geral de compartilhamento (pré-requisito para shared_fields ter efeito)
- Criador do círculo é inserido automaticamente com role `Admin`
- Novos membros (join por código) entram com role `Viewer`

---

## Sync Cross-Device

- Estratégia: 3 camadas (ver D-029)
- Snapshot cache: `sessionStorage` com prefixo `eos:snap:` — carregado imediatamente ao abrir a página, antes do fetch
- Fila offline: `localStorage['eos:offline_queue']` — escrita enfileirada quando `navigator.onLine === false`, flush automático no evento `online`
- Realtime: `useRealtimeSync(tables, cb)` — inscreve em `postgres_changes` para as tabelas especificadas; chama `cb(table)` em qualquer INSERT/UPDATE/DELETE
- Proteção de formulário: `isDirtyRef` impede Realtime de sobrescrever formulário com mudanças pendentes

---

## Feature Gates

- `lib/feature-gates.ts` — `canAccess(feature, userPlan)` retorna `boolean`
- `profiles.plan: 'free' | 'family' | 'premium'`
- Hierarquia: free < family < premium
- Free: análise IA básica, monitoramento clima+terremoto
- Família: círculos, monitoramento multi-local, QR emergência, AQI, FEMA, FIRMS
- Premium: CDC, FDA, push notifications, histórico 30 dias, múltiplos círculos, exportar ficha
- Ao adicionar feature nova, cadastrar em `FEATURE_GATES` antes de implementar a UI

---

## Service Role Key & rotas que dependem dela (D-035)

- Três lugares usam `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS): `app/ficha/[id]/page.tsx` (ficha pública/QR), `app/api/profile/ficha/route.ts` (POST leitura por socorristas), `lib/knowledge.ts` (RAG).
- **Se a chave faltar no ambiente**: página e rota POST agora degradam limpo (notFound / 503) em vez de 500 vazio; RAG retorna `[]` (Motor de Decisão degrada para modo sem base de conhecimento).
- Esta chave **estava ausente no Vercel** até 2026-07-05 — adicionada em Production + Preview. Ao reconfigurar o projeto Vercel, **sempre confirmar as 3 chaves não-públicas**: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY` (todas ✅ setadas em 2026-07-05).
- Verificar com `npx vercel env ls production`.
- **Pegadinha ao setar via CLI**: o valor no `.env.local` está entre aspas duplas e no formato novo `sb_secret_...` (41 chars). Grave SEM as aspas: `grep ... | cut -d= -f2- | tr -d '"' | tr -d '[:space:]'`, senão o Vercel armazena a chave com aspas literais → RLS aplicada → 404. Vars "Sensitive" não são lidas de volta por `vercel env pull` (validar pelo comportamento em produção). Após alterar env var, **é preciso um novo deploy** (`vercel --prod --yes`) — não afeta deploys já existentes.
- A **mesma classe de bug** atingiu `OPENAI_MODEL` (estava `"gpt-5\n"` no Vercel — aspas + newline). Para valores curtos/manuais, gravar via `printf 'valor' > /tmp/f; vercel env add NOME env < /tmp/f`. `getOpenAIModel()` faz `.trim()` defensivo (D-036).

## Push notifications / VAPID (D-036)

- Env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client subscribe + server send, **inlined em build-time** → mudar exige redeploy), `VAPID_PRIVATE_KEY` (server send), `VAPID_SUBJECT` (mailto).
- Público e privado **devem ser um par** gerado junto (`npx web-push generate-vapid-keys`). Setar só um quebra o envio. O par atual foi gerado em 2026-07-05 e está no `.env.local` (gitignored) + Vercel Prod+Preview.
- Rotas: `app/api/push/subscribe` (salva subscription), `app/api/circles/[id]/push` (admin do círculo envia via `web-push`), toggle em `/settings`.

---

## Contratos de API (fáceis de errar em testes)

- `POST /api/checklist/generate` → `{ok:true, count:N}` (NÃO retorna os items; buscar via `GET /api/checklist`)
- `POST /api/checklist/toggle` → body `{canonicalKey, acquired}` (NÃO `{id}`)
- `GET /api/weather-intelligence?lat&lng` e `GET /api/ai/readiness` são **GET**
- `GET /api/monitor?lat&lng` exige lat/lng
- Teste E2E de referência: `scripts/full-journey.mjs` (jornada completa) e `scripts/e2e-agent.mjs` (endpoints core)

---

## Migrações Pendentes (aplicar no Supabase antes de usar em produção)

Estas migrações foram geradas mas podem não estar aplicadas:
- `20260630000100_circle_action_plans.sql` — tabela `circle_action_plans`
- `20260630000200_push_subscriptions.sql` — tabela `push_subscriptions`
- `20260630000300_family_member_link.sql` — coluna `family_members.linked_user_id`

Verificar via Supabase Dashboard → SQL Editor: `SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 5;`
