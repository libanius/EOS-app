# 11 — Product Memory

> Non-obvious facts that don't belong in code comments but must survive across sessions.
> Last updated: 2026-07-21

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

## Hybrid World Dashboard (D-047 / D-050)

- **Rota isolada** `app/(app)/dashboard-world/page.tsx` (protegida no `middleware.ts`). **Não** substitui `/dashboard` (produção); reversível (doc 16 §26). Spec: `docs/16-hybrid-world-dashboard.md`.
- **Renderer = MapLibre GL** (`maplibre-gl`, lazy-loaded via `await import` para não pesar o bundle inicial). Config **provider-neutra** em `lib/world/providers.ts`: sem chave → **CARTO dark** (keyless, `basemaps.cartocdn.com`); com `NEXT_PUBLIC_MAPTILER_KEY` → **MapTiler hybrid (satélite) + terreno 3D** (raster-dem). Trocar de provider = mexer só nesse arquivo.
- **MapTiler key**: env var **pública** `NEXT_PUBLIC_MAPTILER_KEY` (inlined em build-time → mudar exige **redeploy fresco**, não só env var). A key em produção é **protegida por origem** (`eos-app-fawn.vercel.app`) no painel MapTiler → **não funciona em localhost nem em preview** (origem diferente) e **não dá para curl-testar** server-side (sem header `Origin`). Formato de origin no MapTiler é **só domínio** (sem `https://`, sem porta).
- **Base visual do mapa (D-052)**: `/dashboard-world` tem toggle local **Híbrido/Dark** no painel "Camadas ao vivo". Híbrido usa MapTiler hybrid + terreno quando configurado; Dark força CARTO dark keyless para recuperar o visual operacional anterior. A escolha persiste em `localStorage['eos-world-map-base']`; ao alternar, o MapLibre é remontado e reanexa rota, radar, hazards e marcadores.
- **Placas de fundo** em `public/world/parkland{,-safe,-storm}.webp` foram **geradas via Higgsfield MCP** (aerials limpos de Parkland, sem HUD embutido) e trocam por estado de risco. Servem de fallback quando o MapLibre/WebGL falha (§28). Nota: o modelo `nano_banana_2` às vezes é coagido para `nano_banana_flash` pelo servidor e a 1ª tentativa pode falhar — repetir.
- **HUD = componentes React reais** (`components/world-dashboard/`), nunca dados assados na imagem (§8.2). Cores de risco **reusam os tokens v2** (safe verde / watch violeta / warning âmbar / critical vermelho), não a prosa do §19.3.
- **RiskProvider** (`components/v2/RiskProvider.tsx`) agora expõe `coords` (além de `hasCoords`) — o World Dashboard centraliza o mapa na localização real. Suporta forçar estado via URL: `?risk=safe|watch|warning|critical` e `?esc=3:warning`.
- **HWD-03 entregue**: `/api/world/radar` normaliza o frame de radar mais recente do RainViewer keyless (`weather-maps.json`) e devolve um template raster MapLibre (`/256/{z}/{x}/{y}/2/1_1.png`, max zoom nativo 7). `WorldMap` adiciona essa camada como overlay raster com opacidade controlada. Se RainViewer falhar, o mapa continua sem radar.
- **Hazards no mapa**: `WorldMap` consome `/api/hazards?lat&lng`, renderiza eventos reais como fonte GeoJSON (`eos-hazard-polygons` e `eos-hazard-points`) e cria até 5 tags DOM geo-ancoradas. Tags usam `textContent` para texto vindo de provider; sem `innerHTML`. Falhas de hazard são aditivas e não afetam Risk Index/HUD/textual a11y.
- **Visibilidade de camadas**: radar RainViewer pode parecer invisível quando não há precipitação no viewport. `WorldDashboard` exibe uma faixa "Camadas ao vivo" com provider do radar, frame UTC, contagem de hazards e preview de alertas para tornar a integração verificável na tela.
- **HWD-04 prototype (D-051)**: família no mapa usa pontos exatos vindos de dados EOS/círculo quando disponíveis; sem histórico, apenas último ponto conhecido. Freshness visual no MVP é "agora" para o usuário atual via GPS/RiskProvider e "perfil" para coordenadas de perfil dos co-membros. `/api/world/guidance` usa OpenAI como inferência temporária para shelter/rota candidata, mas isso **não é fonte oficial** e deve ser revisado antes de qualquer rollout da `/dashboard-world` para `/dashboard`.
- **Map interaction**: `.world-hud` is full-screen above MapLibre but must have `pointer-events: none`; only concrete controls/panels re-enable pointer events. Otherwise click-drag on the map is blocked even when MapLibre `interactive: true`.
- **Pilot Capsule / HWD-05 (D-053)**: implementa estados determinísticos `GO/LIMITED/WAIT/AVOID/PRIORITY OVERRIDE` no `/dashboard-world` após escolha de atividade. `PRIORITY OVERRIDE` vence sempre quando `state==='critical'` ou alerta CRITICAL. Ações reais disponíveis: abrir `/scenario`, abrir `/checklist`, notificar família via `/api/circles/[id]/push` quando o usuário é Admin de círculo elegível, e focar rota/shelter candidata no MapLibre. Ainda não há persistência/aprendizado de preferências do Pilot.
- **Responsive HUD / HWD-06 pass (D-054)**: no mobile, não posicionar Status Rail, layers, alerts e ticker como painéis absolutos concorrentes; eles vivem em um bottom sheet com snap states `peek`/`half`/`full`, alça e scroll interno. O padrão foi inspirado no Drawer do 21st.dev, mas implementado com CSS/React locais sem dependência nova. Interações do MapLibre recolhem o sheet; no desktop, scroll/gesto de mapa colapsa rail/sensors/ticker e hover/foco reabre.
- **Status Rail / readiness card (D-055)**: o card esquerdo deve parecer um instrumento de "casa pronta", não uma lista administrativa. Hierarquia: conexão/estado, Risk Index grande, diagrama de casa, autonomia, barras de água/comida/energia/combustível, família e comms. A casa é SVG local no React para continuar dinâmica; energia vem de `battery_percent` e combustível de `fuel_liters` até refinarmos o modelo.
- **Center map text (D-056)**: não renderizar "Your Area/Sua área" no centro do `/dashboard-world`; o mapa deve ficar visualmente limpo entre o readiness card, Pilot e overlays. O resumo textual continua apenas para screen readers.
- **Alert counter + rail scroll (D-057)**: o contador de alertas não deve ficar no topo direito porque colide com controles globais e fica ilegível; manter no rodapé direito acima da bottom nav. O Status Rail desktop deve terminar acima da nav fixa (`bottom: calc(88px + safe-area)`) e ter scroll interno até o C/W/R.
- **HWD-06 validation status (D-058)**: `/dashboard-world` passou validação objetiva em 2026-07-21 (`type-check`, lint, Jest 45/45, build, full production journey 31/31, members/circles E2E 19/19, route protection, RainViewer, hazards). Ainda **não** substituir `/dashboard`: faltam aprovação visual/device do dono, browser UI E2E, a11y/perf, custos/providers, privacidade/proveniência e decisão explícita. Relatório: `docs/17-hwd-06-validation.md`.

## Billing / Stripe (D-042)

- **Provedor**: Stripe. Self-serve: Checkout hospedado + Billing Portal + webhook como **fonte de verdade** de `profiles.plan`.
- **Preços NÃO são hardcoded**: `STRIPE_PRICE_FAMILY` / `STRIPE_PRICE_PREMIUM` (Price IDs) em env var. `lib/stripe.ts` faz o mapa preço↔plano nos dois sentidos. Trocar preço = trocar env var, sem deploy de código.
- **Fluxo**: `/api/billing/checkout` (POST `{plan}`) cria/reusa customer e abre Checkout → usuário paga → Stripe chama `/api/billing/webhook` → webhook escreve `profiles.plan` via service-role. `/api/billing/portal` abre o portal (gerenciar/cancelar). Downgrade → `free` em `customer.subscription.deleted` ou status não-ativo.
- **Webhook**: usa `req.text()` (raw body) + `stripe.webhooks.constructEvent` com `STRIPE_WEBHOOK_SECRET`. `runtime = 'nodejs'`. Resolve o perfil por `metadata.user_id` (preferido) ou `stripe_customer_id`.
- **Degrada limpo**: sem `STRIPE_SECRET_KEY`/secret, todas as rotas respondem **503** (não crasham) — a UI mantém o estado atual. Verificado local.
- **Ativação test mode (2026-07-20)**: migration Stripe aplicada; produtos/preços test criados; 4 env vars Stripe Production setadas; webhook test registrado e ACKando eventos reais. Pagamento teste logado validado: `BrightScale Group` ficou `plan=family`, `plan_status=active`, `stripe_subscription_id=sub_...`.
- **Live cutover (LA-T02, 2026-07-21)**: conta Live `acct_1TuL40IaCSStSVaq` (EOS, US, ativada); produtos/preços Live ($9.90/$19.90), webhook Live e 4 env vars Vercel Production trocadas para Live; deploy fresco em `0981f15`. IDs sandbox obsoletos limpos dos profiles para checkout/portal recriarem customer/subscription em Live. Statement descriptor: `EOS BRIGHTSCALE`. Dono deve rotacionar chaves expostas durante a operação.
- **Pegadinha de conta Stripe (2026-07-21)**: o Stripe CLI local pode ficar autenticado em outra conta Live (`acct_1SajtUIM02ulsUHv`, BrightScale Group LLC) e mostrar 0 produtos EOS ou webhook Supabase antigo. Antes de qualquer verificação/alteração Stripe, confirmar que a conta é `acct_1TuL40IaCSStSVaq` (EOS).
- **Env URL pegadinha (2026-07-19)**: o Checkout falhou com 500 porque Stripe recebeu `success_url` inválida (`url_invalid / Not a valid URL`) por formatação ruim de env URL. `lib/site-url.ts` agora normaliza aspas simples/duplas, whitespace, `\n` literal, barras finais e domínios sem protocolo; checkout/portal/auth usam esse helper. Ainda assim, grave env vars sem aspas/newline sempre que possível.
- **`profiles.plan`** continua sendo o único campo que o resto do app lê (gates via `lib/feature-gates.ts`). As colunas novas (`stripe_customer_id` etc.) são só para reconciliação/portal.

## App Spine status alignment (2026-07-20)

- Roadmap/build-status/gates were realigned after Stripe Checkout reached Live mode.
- Current phase is **Production Experience — EOS Pilot**, not Launch Activation. Phase 2 and LA-T02 are complete.
- Current actionable task is **PILOT-T01**: Dashboard complication prototype ("What's the plan?").
- **G-02 Landing Page** and **G-04 Monetization** are cleared. Landing v3 remains deferred (D-045); monetization business model is decided (D-042).
- **G-03 Mobile Readiness** and **G-05 LoRa Mesh Priority** remain open and block their respective phases.

## EOS Pilot (D-046)

- EOS Pilot is the daily-use contextual decision layer of EOS, documented in `docs/15-eos-pilot.md`.
- It starts with **"What's the plan?"** and learns through progressive options, not generic chat.
- First implementation should be a Dashboard complication/module, not a new permanent tab.
- Pilot recommendation states: `GO`, `LIMITED`, `WAIT`, `AVOID`, `PRIORITY OVERRIDE`.
- Critical rules and official alerts always override recreation and learned preferences.
- Sequencing: Pilot prototype is now unblocked because **LA-T02 Stripe Live cutover is complete**.

---

## Contratos de API (fáceis de errar em testes)

- `POST /api/checklist/generate` → `{ok:true, count:N}` (NÃO retorna os items; buscar via `GET /api/checklist`)
- `POST /api/checklist/toggle` → body `{canonicalKey, acquired}` (NÃO `{id}`)
- `GET /api/weather-intelligence?lat&lng` e `GET /api/ai/readiness` são **GET**
- `GET /api/monitor?lat&lng` exige lat/lng
- Teste E2E de referência: `scripts/full-journey.mjs` (jornada completa) e `scripts/e2e-agent.mjs` (endpoints core)

---

## Migrações — auditoria de produção (atualizada 2026-07-19)

Verificado por existência de tabela/coluna via service-role REST (`scripts/` ad-hoc):
- ✅ `20260630000100_circle_action_plans.sql` — tabela `circle_action_plans` **APLICADA**
- ✅ `20260630000200_push_subscriptions.sql` — tabela `push_subscriptions` **APLICADA**
- ✅ `20260630000300_family_member_link.sql` — coluna `family_members.linked_user_id` **APLICADA**
- ✅ `20260705000100` — tabela `circle_join_requests` (D-040) **APLICADA**
- ✅ `20260710000000_stripe_billing.sql` — colunas Stripe em `profiles` **APLICADA** (2026-07-17)
- ✅ `20260710010000_hazard_tables.sql` — tabelas de hazard **APLICADAS** (2026-07-17)
- ✅ `20260705000000_auto_create_profile.sql` — trigger `handle_new_user` **APLICADO** (2026-07-17; 0 usuários sem perfil)

Verificar via Supabase Dashboard → SQL Editor: `SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 5;`
