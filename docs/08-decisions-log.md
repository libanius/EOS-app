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
