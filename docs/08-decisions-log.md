# 08 — Decisions Log

> Decisions made. Not up for re-discussion without a new entry.

---

## D-001 — Next.js App Router (not Pages Router)
**Date**: Project init  
**Decision**: Use Next.js 14 App Router with TypeScript strict mode.  
**Rationale**: Server components, streaming, built-in middleware auth support.

---

## D-002 — Supabase as Backend
**Date**: Project init  
**Decision**: Supabase for PostgreSQL + pgvector + auth + RLS.  
**Rationale**: Managed Postgres with vector search built-in. No separate vector DB needed.

---

## D-003 — SSR Cookie Auth (not localStorage)
**Date**: 2026-06-23  
**Decision**: All auth uses @supabase/ssr with SSR cookies.  
**Rationale**: localStorage tokens are empty in server components and API routes. Cookies work everywhere. This fixed the Decision Engine 401 bug.

---

## D-004 — Rules Engine is Sacred
**Date**: 2026-06-23  
**Decision**: The Rules Engine always runs before the LLM and the LLM cannot downgrade its urgency output.  
**Rationale**: Safety guarantee. In a real emergency, a false "LOW" from the LLM could cost lives. The rules are deterministic and conservative.

---

## D-005 — Three-Tier Intelligence (not two)
**Date**: Project design  
**Decision**: CONNECTED → LOCAL_AI → SURVIVAL as a fallback chain, not feature flags.  
**Rationale**: The app must work in zero-infrastructure scenarios. Degrading gracefully is a core product requirement.

---

## D-006 — text-embedding-3-small for RAG
**Date**: Project design  
**Decision**: Use OpenAI text-embedding-3-small (1536 dims) with HNSW index and 0.78 cosine threshold.  
**Rationale**: Balance of quality and cost. 1536 dims > 1024 (ada-002 small) without the cost of large.

---

## D-007 — PDF → Text → Embed (two-step ingest)
**Date**: 2026-06-23  
**Decision**: Ingest pipeline is split: Python (PyMuPDF) extracts text, then Node (native fetch) embeds and upserts.  
**Rationale**: pdf-parse + tsx caused OOM (openai SDK v6 = 13MB JS exhausts V8 heap before any code runs). PyMuPDF handles 34MB PDFs trivially. Native fetch avoids all SDK overhead.

---

## D-008 — Knowledge Base: 14 Emergency PDFs
**Date**: 2026-06-23  
**Decision**: Ingest 14 curated emergency PDFs. Exclude Bibles (docs/bibles/).  
**Rationale**: The knowledge base should be domain-specific emergency content. Religious texts are personal, not emergency protocol.

---

## D-009 — Vercel for Hosting
**Date**: Project init  
**Decision**: Deploy to Vercel, auto-deploy on push to main.  
**Rationale**: Zero-config Next.js deployment. Edge functions for middleware.

---

## D-010 — SDD / App Spine Methodology
**Date**: 2026-06-23  
**Decision**: Adopt Spec-Driven Development. /docs is the source of truth. Code follows spec.  
**Rationale**: The project has grown organically with many uncommitted or undocumented decisions. SDD provides a structured way to maintain alignment across sessions and collaborators.

---

## Pending Decisions

| ID | Question | Blocking |
|---|---|---|
| PD-001 | Language strategy: English-only vs bilingual (PT/EN)? | P1-T05 |
| PD-002 | Landing page approach: minimal orienting page vs full marketing? | P1-T04 |
| PD-003 | Monetization model: freemium, subscription, or free? | Phase 3 |
| PD-004 | Mobile timeline: when to initialize React Native? | P2 start |

---

## D-011 — Apenas OpenAI como provedor LLM
**Date**: 2026-06-28  
**Decision**: O projeto usa exclusivamente a API da OpenAI. Anthropic nunca foi intencional.  
**Rationale**: O usuário confirmou: "eu nunca quis usar a api da anthropic pois eu uso da open ai". Todo código com Anthropic SDK foi removido. `/api/analyze` e `/api/checklist/generate` usam `gpt-4o-mini`.

---

## D-012 — Checklist integrado na tela de Recursos
**Date**: 2026-06-28  
**Decision**: Os itens do checklist são exibidos e interativos na tela de Recursos (inventory), não apenas na tela dedicada `/checklist`.  
**Rationale**: O usuário quer ver os recursos e o checklist juntos — "devem estar integrados tudo que é gerado o checklist com a tela de Recursos". Marcar um item como adquirido atualiza automaticamente o inventário.

---

## D-013 — Sync unidirecional: checklist → inventory (nunca decresce)
**Date**: 2026-06-28  
**Decision**: Marcar um item do checklist como adquirido ATUALIZA o inventário (via `Math.max`). Desmarcar NÃO diminui o inventário.  
**Rationale**: Preservar dados inseridos manualmente. Se o usuário já tem 100L de água no inventário e marca um item de 45L, o inventário continua 100L. A sincronização é aditiva, não substitutiva.
---

## D-014 — Círculo como espaço compartilhado (não lista de contatos)
**Date**: 2026-06-28
**Decision**: Entrar num círculo dá acesso imediato a todos os dados do grupo — membros, inventário, checklist, fichas.
**Rationale**: O usuário não deve re-cadastrar o que o líder já configurou. O círculo é o "sistema nervoso" da família preparada.

---

## D-015 — Household inventory = soma calculada (não entidade separada)
**Date**: 2026-06-28
**Decision**: Não existe tabela "household_inventory". O Household é uma vista calculada: soma dos itens pessoais de cada membro onde `shared = true`.
**Rationale**: Evita duplicação de dados e conflitos de sync. Cada pessoa é dona dos seus itens. O sharing é granular por campo, não por perfil inteiro.

---

## D-016 — Roles no círculo: Admin / Editor / Viewer
**Date**: 2026-06-28
**Decision**: Três roles com permissões distintas. Admin = full control + nomear roles. Editor = editar dados, não gerenciar membros. Viewer = leitura + comentários.
**Rationale**: Família tem hierarquia natural. Pai e mãe têm controle total, filha mais velha pode editar, filha mais nova só visualiza. O líder (criador) é sempre Admin e não pode ser rebaixado.

---

## D-017 — Merge de membro manual ao entrar como vinculado: badge + decisão do usuário
**Date**: 2026-06-28
**Decision**: Quando um membro vinculado (conta real) entra no círculo e já existe um cadastro manual para a mesma pessoa, mostra badge "possível duplicata". O Admin decide vincular ou manter separado. Nenhum merge automático no MVP.
**Rationale**: Merge automático por nome/idade é propenso a erro. Melhor deixar o humano decidir.

---

## D-018 — UX: nunca bloquear com erro por falta de círculo
**Date**: 2026-06-28
**Decision**: Se o usuário tenta convidar alguém ou compartilhar ficha sem ter um círculo, o app guia para criar o círculo primeiro — nunca exibe erro cru.
**Rationale**: O usuário não pensa em "criar círculo" e "convidar" como passos separados. Ele pensa em "trazer minha filha para o app". A sequência técnica não pode vazar para a UX.

---

## D-019 — Ficha Master como identidade central do usuário logado
**Date**: 2026-06-28
**Decision**: Não existe "perfil" separado de "ficha". Existe uma única **Ficha Master** que é a identidade central do usuário — coletada progressivamente desde o onboarding e presente em todas as partes do app.
**Rationale**: Atualmente os dados do usuário estão fragmentados: nome em `profiles`, localização em `profiles`, tipo sanguíneo em `/ficha`, role do círculo em outra tela. O usuário não sabe quem ele é no sistema. A Ficha Master é o ponto único de identidade de onde tudo deriva: análise de cenário, checklist personalizado, QR de emergência, e o que os membros do círculo enxergam sobre ele.
**Impacto**: A tela `/ficha` atual é um rascunho. Precisa ser redesenhada como Ficha Master com coleta progressiva desde o onboarding.

---

## D-020 — Modelo de assinatura: Gratuito / Família / Premium
**Date**: 2026-06-28
**Decision**: Três tiers de assinatura. A Ficha Master é o ponto de entrada e apresenta o que está disponível e o que requer upgrade. Tiers: `free`, `family`, `premium`.
**Rationale**: O produto tem valor diferenciado por nível de preparação e tamanho do círculo. Features futuras serão atribuídas a tiers sem refatoração de banco.
**Campo no banco**: `profiles.plan` enum `('free', 'family', 'premium')` com default `'free'`.

---

## D-021 — Feature gates em código, não em banco

**Date**: 2026-06-28
**Decision**: O mapeamento de features → tiers vive num único arquivo de configuração no código (ex: `lib/feature-gates.ts`). O banco guarda apenas `profiles.plan`. Adicionar uma nova feature a um tier = modificar só esse arquivo, sem migration.
**Rationale**: Flexibilidade total para evoluir o modelo de negócio. Hoje são 3 tiers e X features; amanhã podem ser 4 tiers e 3X features. A regra de acesso não pode estar espalhada pelo código.
**Estrutura**:
```
FEATURE_GATES = {
  qr_emergencia:      'family',
  circulos_multiplos: 'premium',
  analise_ia:         'family',
  exportar_ficha:     'premium',
  ...
}
```

---

## D-022 — Monitoramento como camada proativa (não reativa)
**Date**: 2026-06-28
**Decision**: O EOS passa de reativo (usuário descreve → recebe plano) para proativo (app detecta ameaças → alerta usuário → plano com contexto real). O monitoramento não substitui o campo livre de descrição — enriquece o contexto da análise AI com dados oficiais antes de o usuário digitar.
**Rationale**: A maior dor de um pai de família em emergência é não saber o que está acontecendo nem se deve agir. Dados em tempo real de NWS, USGS, FEMA eliminam esse vazio. Spec completa em `docs/14-monitoring.md`.

---

## D-023 — Tela Cenário redesenhada como hub de monitoramento
**Date**: 2026-06-28
**Decision**: A tela Cenário é redesenhada para mostrar um painel de status de ameaças (clima, terremoto, incêndio, qualidade do ar, desastres FEMA) ANTES do campo de descrição livre. Tocar num alerta pré-preenche o campo e dispara análise com contexto real.
**Rationale**: O campo de texto vazio é intimidador sem contexto. Com o painel de monitoramento, o usuário vê imediatamente o que é relevante para sua localização e pode agir com um toque. O campo livre continua disponível para situações não monitoradas.

---

## D-024 — Localização deve ser lat/lng, não texto livre
**Date**: 2026-06-28
**Decision**: `profiles.location` (texto) continua como label legível na UI, mas adiciona-se `profiles.location_lat float8` e `profiles.location_lng float8`. Geocodificação via Nominatim (OpenStreetMap, gratuito) ao salvar a localização.
**Rationale**: Todas as APIs de monitoramento (NWS, USGS, AirNow, NASA FIRMS, FEMA) são geo-baseadas e requerem coordenadas. Sem lat/lng, nenhuma delas funciona. Este campo é pré-requisito (P2-T08) para toda a feature de monitoramento.

---

## D-025 — Fontes de monitoramento por tier
**Date**: 2026-06-28
**Decision**: Gratuito = NWS + USGS (universalmente úteis, sem chave). Família = + AirNow + FEMA + NASA FIRMS + monitoramento de múltiplas localizações do círculo. Premium = + CDC + FDA + notificações push + histórico 30 dias.
**Rationale**: As fontes gratuitas cobrem as ameaças mais imediatas (clima severo e terremotos) e são suficientes para o valor básico do produto. Fontes especializadas (qualidade do ar, recalls, surtos) justificam upgrade.

---

## D-026 — Idioma bilíngue PT/EN selecionado em Settings
**Date**: 2026-06-28
**Decision**: EOS terá interface bilíngue Português/Inglês. O usuário escolhe o idioma no menu Settings; a preferência é persistida no dispositivo e aplicada sem exigir uma mudança de conta ou plano.
**Rationale**: A base atual mistura os dois idiomas e o produto atende famílias em contextos internacionais. Uma preferência explícita evita inferências incorretas pelo navegador e mantém o controle com o usuário.

---

## D-028 — Sentry: Deferido até pós-viabilidade de MVP
**Date**: 2026-06-29
**Decision**: Não configurar `SENTRY_DSN` no Vercel nem ativar o Sentry no MVP. Tarefa P1-T07 movida para DEFERRED.
**Rationale**: Os configs `sentry.*.config.ts` existem e são guardados por `if (dsn)` — sem `SENTRY_DSN` configurada, o SDK não inicializa e nenhum overhead é adicionado. Para um MVP com base de usuários pequena, os logs de funções do Vercel cobrem erros críticos sem custo ou complexidade adicionais. Configurar Sentry agora não resolve nenhum problema presente.
**Quando reavaliar**: >50 usuários ativos OU primeiro bug de produção que não aparece nos logs do Vercel. Pré-requisito: criar conta Sentry, obter DSN, adicionar `SENTRY_DSN` (server) e `NEXT_PUBLIC_SENTRY_DSN` (client) no Vercel.
**Alternatives considered**: Ativar agora (rejeitado — custo de setup > benefício no MVP), Remover configs (rejeitado — já existem, não atrapalham nada desativados).

---

## D-027 — Repriorizar Ficha Master antes de concluir alinhamento bilíngue
**Date**: 2026-06-29
**Decision**: P1-T05 retorna a PENDING com trabalho restante preservado. P2-T06 passa a IN PROGRESS por solicitação explícita do usuário. Após a Ficha Master, P1-T05 deve ser retomada; não está cancelada nem considerada concluída.
**Rationale**: A Ficha Master é a base de identidade usada pelos próximos incrementos de assinatura e Círculos. Consolidá-la agora reduz retrabalho nas telas subsequentes.

---

## D-029 — Cross-device sync: 3 camadas (cache + Realtime + fila offline)
**Date**: 2026-06-30
**Decision**: Sincronização cross-device implementada em 3 camadas: (1) TTL da cache Workbox reduzido de 24h para 2min para APIs; (2) Supabase Realtime `postgres_changes` invalida e refaz fetch em tempo real; (3) Fila de escrita offline em `localStorage` (`eos:offline_queue`) com flush automático ao reconectar.
**Rationale**: A raiz do problema era o Workbox com `NetworkFirst` e TTL de 24h — dados atualizados no servidor não chegavam ao dispositivo até a cache expirar. Realtime garante propagação imediata entre dispositivos. A fila offline garante que escritas feitas sem internet não se perdem.
**Arquivos**: `lib/sync.ts`, `hooks/useRealtimeSync.ts`, `hooks/useOfflineQueue.ts`, `components/SyncStatus.tsx`

---

## D-030 — Salvar formulários só no blur / ação explícita (não debounce)
**Date**: 2026-06-30
**Decision**: Formulários de edição (ex: Ficha) não salvam automaticamente enquanto o usuário digita. Salvamento ocorre: (a) ao sair do campo (`onBlur`), (b) ao clicar em botão "Salvar" explícito, (c) em ações discretas (selecionar tipo sanguíneo, adicionar/remover item de lista). Flag `isDirtyRef` impede o Realtime de sobrescrever o formulário com mudanças não salvas.
**Rationale**: Debounce de 700ms combinado com Realtime causava sobrescrita do campo enquanto o usuário digitava. `onBlur` é o contrato correto: o usuário terminou de editar quando saiu do campo.

---

## D-031 — Safe area insets via CSS env() no body (não por página)
**Date**: 2026-06-30
**Decision**: `viewportFit: 'cover'` + `statusBarStyle: 'black-translucent'` no manifest causavam conteúdo "sangrando" sob o notch do iPhone. Solução: variáveis CSS `--sat/--sab/--sal/--sar` em `:root` + `padding-top: var(--sat)` no `body`. Elementos `position: fixed` (AppActions, SyncStatus) requerem tratamento individual com `env(safe-area-inset-top/bottom)`.
**Rationale**: Aplicar no `body` cobre todas as páginas automaticamente sem precisar modificar cada inline style. Elementos fixed não herdam padding do body, então precisam de `env()` direto.

---

## D-032 — Push notifications via VAPID + Web Push API
**Date**: 2026-06-30
**Decision**: Notificações push usam VAPID (Voluntary Application Server Identification) via `web-push` npm package. Chaves geradas uma vez e armazenadas em Vercel env vars. ServiceWorker injeta handlers de `push` e `notificationclick` via `next-pwa` `customWorkerSrc`. Inscrições armazenadas em `push_subscriptions` com RLS (usuário gerencia as próprias).
**Rationale**: Web Push é o padrão W3C para PWAs. VAPID elimina a necessidade de conta em serviços de push de terceiros. Admin de círculo pode enviar alertas de emergência para todos os membros inscritos.

---

## D-033 — Weather Intelligence uses Open-Meteo as primary provider

**Date**: 2026-07-01
**Status**: DECIDED

**Context**: Weather Intelligence feature needs global weather data (temperature, wind, rain probability, UV, AQI, hourly forecast). NWS only covers US. Open-Meteo covers globally, has no API key requirement, and returns WMO-coded conditions.

**Decision**: Open-Meteo forecast + air quality as primary. NWS alerts (via existing monitor.ts) and USGS earthquakes layered on top. Provider statuses tracked in WeatherSnapshot.providers map.

**Consequence**: App works globally. Adding future providers (NOAA, ECMWF, etc.) only requires a new file in lib/weather/providers/ and one parallel fetch in the API route.

---

## D-034 — Weather Intelligence engine runs client-side, not server-side

**Date**: 2026-07-01
**Status**: DECIDED

**Context**: 29 activity toggles need instant response — 0ms latency. Running generateRecommendations() on the server would require a round-trip per toggle.

**Decision**: generateRecommendations(snapshot, activeActivities) is a pure function in lib/weather/engine.ts imported directly into the weather page. It runs in the browser with no network call when activities are toggled.

**Consequence**: Recommendations are instant. The WeatherSnapshot is fetched once from /api/weather-intelligence (server → Open-Meteo → cache 5min) and reused client-side.

---

## D-035 — `SUPABASE_SERVICE_ROLE_KEY` estava ausente no Vercel (bug crítico de produção)

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Teste E2E de jornada completa (usuário real: onboarding → ficha master → família → inventário → checklist → círculos → weather → analyze) revelou que a **página pública da ficha de emergência** `/ficha/[id]` (destino do QR code) e a rota `POST /api/profile/ficha` (leitura por socorristas) retornavam **HTTP 500 com corpo vazio** para qualquer ID. Causa raiz: `SUPABASE_SERVICE_ROLE_KEY` **não estava configurada nas env vars do Vercel** (confirmado via `vercel env ls production` — só existiam ANON_KEY, URL, OPENAI, VAPID, SITE_URL). Sem a chave, `createClient(url, undefined)` lança exceção síncrona → crash da função serverless. O mesmo faltante fazia o RAG (`lib/knowledge.ts → getRelevantChunks`) retornar `[]` silenciosamente, então o Motor de Decisão **nunca usou a base de conhecimento** (3887 chunks ingeridos) em produção — sempre degradava para modo sem-RAG.

**Decision**:
1. Adicionada `SUPABASE_SERVICE_ROLE_KEY` ao Vercel (Production + Preview) via `vercel env add`.
2. Adicionadas guardas defensivas em `app/ficha/[id]/page.tsx` (retorna `notFound()` em vez de crashar) e `app/api/profile/ficha/route.ts` (retorna 503 JSON em vez de 500 vazio) para que uma env var faltante nunca mais derrube a função serverless de forma abrupta.

**Consequence**: A ficha de emergência pública volta a funcionar; o RAG passa a usar a base de conhecimento real; falhas futuras de configuração degradam de forma limpa. A tabela de env vars em `09-build-status.md` foi atualizada.

**Gotcha (importante)**: o valor de `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` está **entre aspas duplas** (`="sb_secret_..."`) e no formato NOVO da Supabase (`sb_secret_...`, 41 chars — não é JWT longo). Na primeira tentativa a chave foi gravada no Vercel **com as aspas literais** → o client instanciava mas não autenticava como service_role → RLS aplicada → `404`. Ao setar via CLI, **remover aspas/whitespace**: `grep ... | cut -d= -f2- | tr -d '"' | tr -d '[:space:]'`. Vercel Sensitive vars não podem ser lidas de volta (`vercel env pull` redige), então valide pelo comportamento em produção, não pelo pull.

**Verificação (2026-07-05)**: `scripts/full-journey.mjs` → **31/31 ✅** contra produção. `POST /api/profile/ficha` e página `/ficha/[id]` retornam 200 com dados reais.

---

## D-036 — VAPID_PRIVATE_KEY + OPENAI_MODEL corrigidos no Vercel

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Duas configs pendentes/quebradas em produção:
1. **Push notifications**: `VAPID_PRIVATE_KEY` estava ausente no Vercel (só a pública `NEXT_PUBLIC_VAPID_PUBLIC_KEY` existia). Sem a privada, `webpush.setVapidDetails` falha e `/api/circles/[id]/push` retorna erro. A privada correspondente à pública existente estava **perdida** (não estava no `.env.local` nem no Vercel).
2. **OPENAI_MODEL**: o valor no Vercel estava corrompido como `"gpt-5\n"` (aspas + newline literal). Só `app/api/ai/readiness` lê essa var (`getOpenAIModel`); as demais rotas tinham `gpt-4o-mini` hardcoded como contorno.

**Decision**:
1. **VAPID**: como `push_subscriptions` tinha **0 linhas** (push nunca funcionou), gerar um **par novo** é seguro (nada a invalidar). Novo par via `web-push generate-vapid-keys`; gravadas `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (substituída) + `VAPID_PRIVATE_KEY` (nova) em Production + Preview e no `.env.local` (gitignored) para não perder a privada de novo.
2. **OPENAI_MODEL**: regravado limpo como `gpt-4o-mini` (sem aspas/newline) em Production + Preview. `getOpenAIModel()` agora faz `.trim()` defensivo. Os 4 `model: 'gpt-4o-mini'` hardcoded (`analyze`, `checklist/generate`, `suggest-tags`, `weather custom-activity`) foram trocados por `getOpenAIModel()` → **fonte única de verdade** (conforme "ação recomendada" registrada em 09-build-status).

**Consequence**: Push notifications passam a funcionar; o modelo OpenAI é configurável por uma única env var saneada. A pública VAPID é inlined em build-time (`NEXT_PUBLIC_`), então exigiu redeploy. Chaves VAPID futuras: **público e privado devem ser um par** — não setar um sem o outro.

---

## D-037 — Gestão de conta em Settings: logout + excluir conta (self-service)

**Date**: 2026-07-05
**Status**: DECIDED / IMPLEMENTADO

**Context**: A tela `/settings` tinha idioma, plano e push, mas **faltava o básico de qualquer app**: botão de logout e gestão da própria conta. O `signOut()` já existia em `lib/auth/actions.ts` mas não estava exposto em nenhuma UI.

**Decision**: Adicionados em `/settings`:
- **Card "Conta"**: e-mail logado, link "Editar meus dados" → `/ficha` (a Ficha Master concentra o CRUD dos dados pessoais), e botão **Sair** (logout via `supabase.auth.signOut()` no browser → redirect `/auth/login`).
- **Card "Zona de perigo"**: botão **Excluir minha conta** com `confirm()`, chamando a nova rota `POST /api/account/delete`.
- Nova rota `app/api/account/delete/route.ts`: autentica o usuário e apaga, em ordem de dependência, todos os dados (action_plans → scenarios → checklists → resource_inventory → family_members → círculos liderados + participações → push_subscriptions → profiles) e por fim o auth user (service role). Desvincula `linked_user_id` em fichas de terceiros. Guarda defensiva se `SUPABASE_SERVICE_ROLE_KEY` faltar (503).

**Consequence**: Usuário pode sair e excluir a própria conta sem suporte. O CRUD de dados de domínio (ficha, família, inventário, checklist) já existia nas telas próprias; Settings passa a ser o hub de conta. Bilíngue PT/EN inline.

