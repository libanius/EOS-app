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
