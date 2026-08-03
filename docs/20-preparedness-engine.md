# 20 — Preparedness Engine

> **Status:** SPEC / PRODUCT-ARCHITECTURE DECIDED
> **Decision:** D-085
> **Date:** 2026-08-03
> **Owner:** Paulo Libânio Neto
> **Surface:** Web/PWA core first, per D-084
> **Roadmap:** PREP-T00

---

## 1. Objetivo

The Preparedness Engine turns EOS from a system that only monitors and responds
into a system that helps families **prepare before the event**.

The product principle is:

> Monitoring tells the family what may happen. Preparedness turns that knowledge
> into tasks, materials, training, roles, and communication readiness.

Preparedness is not a mobile-only feature. It belongs to the EOS core and must
ship first in the Web/PWA surface.

---

## 2. Comportamento

The Preparedness Engine connects four user-facing capabilities:

1. **Preparação** — a unified readiness surface that absorbs Checklist and
   Recursos into one operational tab.
2. **EDU** — approved educational content, including owner-published YouTube
   videos, guides, transcripts, summaries, and scenario tags.
3. **Comms** — app-level circle communication: chat, radio-amateur reference,
   frequency guides, quick-use instructions, and mesh/off-grid status placeholders.
4. **Onboarding by simulation** — a new member enters EOS through the scenario
   that invited them, not through a generic app tutorial.

Every preparedness flow should end in at least one concrete action:

- add or complete a task;
- add or review a material/resource;
- assign responsibility to a family/circle member;
- update or review a family plan;
- run or join a simulation;
- mark educational content as understood;
- improve a communication channel.

---

## 3. Data Contract

PREP-T00 does not authorize a database migration. The first implementation tasks
must propose exact schemas before writing data.

Minimum concepts that later tasks must model:

| Concept | Purpose |
|---|---|
| Scenario | The threat/context: hurricane, blackout, fallout, active shooter, flood, event crowd, no cell service, etc. |
| Preparedness item | A task, material, skill, document, communication setup, or family decision needed for a scenario. |
| Ownership status | Needed, planned, acquired, completed, skipped, or not applicable. |
| Source | Where the recommendation came from: Pilot, EDU content, simulation debrief, plan gap, or manual entry. |
| Assignment | Optional circle/family member responsible for an item. |
| Evidence | Optional link to content, transcript, plan section, or simulation result. |
| Confirmation | Explicit user action before any Pilot/EDU/simulation recommendation mutates persistent readiness state. |

Relationship to existing surfaces:

- Checklist becomes part of Preparação.
- Recursos/Inventory remains the factual store of what the family has.
- Preparação may reference inventory, but must not silently invent inventory.
- EDU may suggest resources/tasks, but user confirmation is required.
- Simulations may generate gaps, but writing them remains explicit.
- Family Plans remain the operational plan, not a long checklist.
- Comms app-level can start without LoRa hardware.

---

## 4. Regras De Negócio

1. **Preparation is actionable or it does not belong here.** Content that does
   not produce understanding, a task, a material, a role, a plan review, or a
   communication improvement stays outside the first implementation.
2. **No silent writes.** Pilot, EDU, and Simulation may propose tasks/resources,
   but the user must confirm before persistent state changes.
3. **Source visibility is mandatory.** If a task comes from a video, guide,
   simulation, or Pilot answer, the UI must retain that provenance.
4. **Comms and Mesh are separate.** Chat, radio guides, frequencies, and quick
   references are Web/PWA core. BLE/LoRa hardware remains blocked by G-05.
5. **YouTube is an owner-controlled source, not generic web search.** Owner
   content can feed EDU/RAG only after ingestion, transcript capture,
   classification, and approval/versioning are specified.
6. **Pilot is an educator and host, not an unchecked writer.** It may instruct,
   ask, validate, and summarize, but it must not bypass Rules Engine, source
   authority, or user confirmation.
7. **Preparedness does not replace Plans.** A plan defines what the family will
   do. Preparedness defines what the family must learn, acquire, configure, and
   practice so the plan can work.
8. **Preparedness is circle-aware.** Items can be personal or circle/family
   scoped. Circle-scoped visibility must follow existing circle permissions.

---

## 5. Critérios De Aceitação

PREP-T00 is complete when:

1. The Preparedness Engine is defined in the App Spine.
2. A decision records why Checklist + Recursos should converge into Preparação.
3. EDU, Comms, onboarding by simulation, and Pilot educator behavior are sequenced
   as core Web/PWA work.
4. The spec states that YouTube owner content can become EDU/RAG input only via
   approved ingestion/versioning.
5. The spec states that recommendations require confirmation before persistent
   writes.
6. The roadmap marks PREP-T00 complete and makes PREP-T01 the next implementation
   task.

Implementation tasks after PREP-T00 must add their own binary acceptance
criteria before code.

---

## 6. Fora Do Escopo

The following are not authorized by PREP-T00:

- database migrations;
- UI implementation;
- moving BottomNav tabs;
- deleting Checklist or Inventory routes;
- chat infrastructure implementation;
- YouTube API integration;
- transcript ingestion jobs;
- RAG reindexing;
- React Native, Expo, Capacitor, App Store, or Google Play work;
- CarPlay/Android Auto;
- BLE/LoRa hardware integration.

---

## 7. Notas De Execução

Recommended next order:

1. **PREP-T01** — unify Checklist + Recursos into Preparação at the IA/product
   level, then implement the UI after the spec is ready.
2. **COMMS-T01** — create app-level Comms as a Web/PWA surface.
3. **EDU-T01** — define content catalog, ingestion, transcript, approval,
   scenario tagging, and RAG provenance.
4. **ONB-T01** — define onboarding by simulation invitation.
5. **SIM-T11 / PILOT-T08** — connect simulation gaps and Pilot educator behavior
   into confirmed preparedness actions.

The first implementation should be conservative: merge existing Checklist and
Inventory/Resources into a coherent Preparação flow before introducing new
schema-heavy EDU or chat systems.

---

## 8. PREP-T01 Result

**Decision:** D-086
**Date:** 2026-08-03

PREP-T01 created `/preparedness` as the unified readiness surface. `/inventory`
and `/checklist` now redirect there so the user no longer has two separate tabs
for resources and tasks.

The unified surface keeps the existing data contracts:

- `/api/inventory` for real household resources;
- `/api/checklist` and related endpoints for generated/acquired tasks;
- existing checklist-to-inventory sync when an acquired checklist item maps to a
  tracked resource.

The BottomNav now has:

- **Preparação** instead of Recursos;
- **Comms** instead of Checklist.

`/comms` is intentionally only a first navigable surface. Chat, radio/frequency
contracts, permissions, retention, alert escalation, and Mesh/LoRa boundaries
belong to COMMS-T01.

---

## 9. EDU-T01 Result

**Decision:** D-090
**Date:** 2026-08-03

EDU-T01 created the official educational content catalog:

- `edu_content` stores approved/draft/archived content with source type, URL,
  scenario tags, summary, transcript/notes, version and `rag_enabled`.
- `/edu` shows approved content to authenticated users.
- `/admin/edu` lets the owner/admin create and update content.
- `/api/edu` is the catalog/publishing contract.

RAG ingestion is deliberately not automatic. `rag_enabled=true` means eligible
for a future ingestion job, not that embeddings already exist in
`knowledge_base`.

---

## 10. ONB-T01 Result

**Decision:** D-091
**Date:** 2026-08-03

ONB-T01 made simulation invites drive contextual onboarding:

- `/sim/[token]` can load context before authentication.
- login/signup preserve `redirectTo`.
- `/onboarding` shows the invite scenario and returns the user to the invite
  after profile setup.
- joining still requires the existing simulation acceptance pop-up.

No database migration was needed. The simulation token remains context, not
authorization.

---

## 11. SIM-T11 Result

**Decision:** D-092
**Date:** 2026-08-03

SIM-T11 connected simulation debriefs to confirmed preparedness work:

- actionable debrief gaps now expose proposal type: resource, task, plan review,
  or Comms setup;
- each proposal shows source and destination before the user confirms;
- confirmation writes one item at a time to `checklists`;
- confirmed simulation proposals use `kit_type=SIMULATION_DEBRIEF`;
- Preparação shows "Fonte: Debrief da simulação" for those rows.

No database migration was needed. The checklist remains the v1 persistence
contract for confirmed preparedness actions until a dedicated Preparedness Items
table is decided.

---

## 12. PILOT-T08 Result

**Decision:** D-093
**Date:** 2026-08-03

PILOT-T08 made the Pilot follow the same confirmed-action contract:

- the Pilot prompt now frames the assistant as a situational educator;
- concrete recommendations are normalized as `resource`, `task`,
  `plan_review`, or `comms_setup`;
- the server assigns source and destination for each proposal;
- the Pilot UI shows type, source and destination before confirmation;
- confirmed Pilot proposals use `kit_type=PILOT_RECOMMENDATION`;
- Preparação shows "Fonte: Recomendação do Pilot" for those rows.

No database migration was needed. OpenAI remains the AI provider for Pilot/RAG.
