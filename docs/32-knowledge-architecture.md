# 32 — EOS Knowledge Architecture (On-Grid / Off-Grid)

> Status: **PROPOSED — Spine intake**
> Date: 2026-08-08
> Origin: owner architecture review of the knowledge available to an EOS user.
> Candidate decision: **D-132** (must be logged in `docs/08-decisions-log.md` before implementation).

---

## 1. Purpose

EOS must make explicit **what it knows, where that knowledge comes from, whether it is live or cached, and what survives loss of connectivity**.

The product already has multiple intelligence sources, but they are not yet documented as one knowledge architecture. This spec defines that architecture so future work does not confuse:

- deterministic rules;
- curated emergency knowledge;
- approved educational content;
- general LLM knowledge;
- live official/observational feeds;
- maps/shelters/geospatial context;
- household/user context;
- cached/offline state;
- future local AI.

The architectural goal is not merely "AI offline". It is **continuity of useful, source-aware emergency intelligence across CONNECTED, LOCAL_AI, and SURVIVAL modes**.

---

## 2. Current knowledge sources

### 2.1 EOS Domain / Rules Engine

**Type:** deterministic operational knowledge.

Examples:
- water and food thresholds;
- urgency escalation;
- household vulnerability overrides;
- scenario-specific deterministic instructions;
- execution ordering and safety guardrails.

**Current mode availability:**
- CONNECTED: yes;
- LOCAL_AI: future companion;
- SURVIVAL/off-grid: yes.

This layer is authoritative for deterministic EOS rules. An LLM may explain or enrich them but must not silently downgrade their urgency.

---

### 2.2 EOS Knowledge Base / RAG

**Type:** curated documentary emergency knowledge.

Current production corpus measured on 2026-08-08: approximately **3,920 rows/chunks** in `public.knowledge_base`.

Sources include, among others:
- FEMA;
- American Red Cross;
- CDC;
- Military Survival FM 21-76;
- SAS Survival Handbook;
- Navy SEAL Bug-In Guide;
- WHO;
- SAMHSA;
- NCTSN;
- IASC;
- John Seymour Self-Sufficiency;
- approved EDU content explicitly ingested into RAG.

Current retrieval path:
1. user query;
2. query translated to English when needed;
3. OpenAI embedding;
4. Supabase vector search;
5. up to 8 relevant chunks returned as context to the Pilot/LLM.

**Current mode availability:**
- CONNECTED: yes;
- LOCAL_AI: not yet;
- SURVIVAL/off-grid: no, because retrieval currently depends on cloud services.

Important: the corpus itself is proprietary EOS product knowledge even when the underlying source documents are public. The curation, provenance, chunking, ranking, and future conflict-resolution policy are part of EOS intelligence.

---

### 2.3 EDU

**Type:** owner-curated educational knowledge and a controlled growth path for the knowledge base.

Flow:

`external content → transcript/notes → scenario classification → owner approval/versioning → EDU → optional explicit RAG ingestion`

Rules already established:
- YouTube does not automatically become RAG truth;
- content must be approved and versioned;
- link-only content cannot be ingested as knowledge;
- provenance must remain visible;
- approved EDU may generate confirmable preparedness actions.

**Current mode availability:**
- CONNECTED: yes;
- off-grid: only whatever is explicitly cached/static; not yet a guaranteed offline library.

---

### 2.4 General LLM knowledge

**Type:** broad pre-trained model knowledge and reasoning capacity.

Current provider: OpenAI for Pilot/RAG-related model flows.

The LLM is not itself an EOS source of authority. It is a reasoning layer that may combine:
- model-native general knowledge;
- EOS RAG context;
- deterministic EOS outputs;
- household context;
- live situational data.

Critical distinction: a fluent answer from the LLM must not be mistaken for a fact retrieved from the EOS corpus.

**Current mode availability:**
- CONNECTED: yes;
- LOCAL_AI: planned, not implemented;
- SURVIVAL/off-grid: no cloud LLM.

---

### 2.5 Live Intelligence Network

**Type:** situational, time-sensitive external knowledge.

Current/implemented providers include:
- NWS — official warnings, watches, advisories;
- USGS — observational earthquake data;
- NHC — hurricane/cyclone forecast and track data;
- Open-Meteo — forecast/nowcast fallback/current weather.

Architecture also contains adapters for providers such as WeatherKit, AccuWeather, Xweather, ShakeAlert, and FEMA IPAWS; an adapter must report `NOT_CONFIGURED` when credentials are absent rather than simulate availability.

Authority classes already used by EOS include:
- `official`;
- `observational`;
- `forecast`;
- `eos_analysis`.

**Current mode availability:**
- CONNECTED: yes;
- off-grid: only last known/cached snapshot, never falsely labeled live.

Freshness is part of truth. Cached data must preserve timestamp/source and visibly degrade when stale.

---

### 2.6 Official shelters and operational places

**Type:** real-world operational entities.

EOS already has a FEMA/NSS shelter path and offline shelter cache work.

The intended distinction is:
- online: fetch/refresh official/current shelter data;
- offline: retain last known shelter set with provenance and freshness;
- never let an LLM invent an "official shelter" from general knowledge.

The same pattern should guide future evacuation centers, aid points, hospitals, fuel, pharmacies, and other operational-place adapters.

---

### 2.7 Geospatial and navigation context

**Type:** maps, coordinates, routes, terrain/base layers, user position and navigation handoff.

Current elements include:
- device location;
- CARTO keyless basemap;
- ESRI satellite layer;
- EOS-stored family plan routes/waypoints;
- Google Maps handoff for street routing when network is available.

EOS owns the **operational intent and sequence** of the family route. External map software may calculate street-level navigation when connected.

Offline mode must preserve the approved EOS plan/route even if street navigation is unavailable.

---

### 2.8 Household / personal operational context

**Type:** user-specific knowledge.

Examples:
- household members and dependents;
- medical/accessibility data where authorized;
- resource inventory;
- food/water availability;
- preparedness tasks;
- emergency plans;
- roles and triggers;
- meeting points/routes;
- consented location;
- Pilot memory explicitly confirmed by the user;
- simulation/debrief outcomes saved as preparation.

This is not generic emergency knowledge, but it is essential to transform generic guidance into useful decisions.

Example:

`General rule: store X water per person` + `Household: 5 people, 18 L stored` → `EOS: quantified gap for this family`.

Access, consent, freshness and local availability are part of this knowledge layer.

---

## 3. Current architecture by connectivity mode

### CONNECTED

```text
LIVE WORLD
NWS + NHC + USGS + Open-Meteo + shelters + other configured providers
        ↓
EOS CURATED KNOWLEDGE
RAG knowledge_base + approved EDU
        ↓
GENERAL REASONING
Cloud LLM (currently OpenAI)
        ↓
PERSONAL CONTEXT
Household + inventory + plans + location + memory + preparedness
        ↓
EOS DOMAIN CORE
Rules + risk + authority + freshness + consent + execution order
        ↓
PILOT / PREPAREDNESS / PLAN EXECUTION / WORLD UI
```

### SURVIVAL / OFF-GRID TODAY

```text
EOS deterministic Rules Engine
+ locally available household state
+ approved plans/routes stored offline
+ cached shelters / last known operational data where implemented
+ static operational reference content
= degraded but useful survival mode
```

The principal current gap is that the curated RAG corpus does **not** travel with the user offline.

---

## 4. Target architecture

The target is a continuity chain rather than three unrelated products.

### 4.1 CONNECTED

Use the richest available stack:
- live authoritative feeds;
- cloud RAG;
- cloud LLM;
- household context;
- EOS deterministic rules.

### 4.2 LOCAL_AI

Future native/on-device mode should combine:
- on-device model;
- local emergency knowledge library;
- local deterministic rules;
- locally persisted household/plan context;
- last known source-aware external snapshots.

### 4.3 SURVIVAL

When no model or network is available:
- deterministic EOS rules still run;
- the emergency knowledge library should remain searchable/browsable through deterministic/local retrieval;
- plans, routes, household facts, shelters and essential references remain accessible;
- stale live data is explicitly labeled stale rather than presented as current.

---

## 5. Proposed new capability: Offline Emergency Knowledge Library

EOS should create a **compact, curated, versioned local knowledge package** derived from the cloud knowledge base.

This is not simply "download all 3,920 embeddings".

The offline package should prioritize:
- high-authority emergency guidance;
- high-frequency household preparedness questions;
- hazard-specific immediate actions;
- water, food, sanitation, first aid, medication continuity, shelter, evacuation, communications and post-disaster safety;
- conflict-resolved canonical EOS guidance where sources differ;
- citations/provenance retained with every answer unit;
- small enough footprint for reliable mobile distribution and updates.

Possible retrieval strategies to evaluate later:
- compact lexical/full-text index;
- SQLite FTS;
- small local vector index;
- hybrid keyword + vector retrieval;
- pre-computed canonical Q&A/action cards for the most critical topics.

Technology choice is **not decided by this spec**. The product requirement is continuity, provenance and deterministic fallback.

---

## 6. Source hierarchy and conflict policy

A future implementation must not determine truth by raw chunk frequency.

Example found during corpus audit:
- `3 days / 72 hours` appears more often than `14 days / 2 weeks`;
- Red Cross content distinguishes a **minimum personal/go-kit** from a **larger home/family resilience target**.

Therefore EOS needs a conflict policy based on context and authority, not majority vote.

Proposed factors:
1. official/recognized authority level;
2. scenario specificity;
3. recommendation intent (minimum vs target vs special population);
4. recency/version where known;
5. household context;
6. mobility mode (evacuating vs sheltering in place);
7. resource category (water, food, medication, power, etc.);
8. provenance that can be shown to the user.

A future `canonical_guidance` layer may be preferable for high-stakes quantities instead of asking the LLM to reconcile contradictory chunks on every query.

---

## 7. Knowledge provenance contract

Every knowledge-bearing output should be classifiable as one or more of:

- `EOS_RULE` — deterministic EOS rule;
- `EOS_CANONICAL_GUIDANCE` — future conflict-resolved EOS guidance;
- `RAG_SOURCE` — retrieved curated document chunk;
- `EDU_SOURCE` — approved educational content;
- `LLM_GENERAL` — model-native general explanation with no EOS source;
- `OFFICIAL_LIVE` — current official alert/advisory;
- `OBSERVATIONAL_LIVE` — current observed event/data;
- `FORECAST_LIVE` — current forecast;
- `CACHED_EXTERNAL` — previously retrieved external data with freshness timestamp;
- `HOUSEHOLD_FACT` — user/family data with access scope;
- `FAMILY_PLAN` — approved family-authored plan/route/role/trigger.

The UI does not necessarily display these internal enum names, but the system should preserve the distinction so it can truthfully answer: **"How do you know this?"**

---

## 8. Implementation lane (proposal only)

No code should begin until the candidate decision is formally logged and the canonical roadmap is updated.

Suggested task family: **KNOW — Knowledge Continuity**.

| Task | Goal | Gate / dependency |
|---|---|---|
| KNOW-T00 | Formalize D-132 + reconcile this spec with Product Vision / Platform Strategy | Spine only |
| KNOW-T01 | Inventory every current knowledge/data source and assign provenance + authority + online/offline status | none |
| KNOW-T02 | Define canonical-guidance schema and conflict-resolution policy for high-stakes quantities | requires owner review |
| KNOW-T03 | Build corpus audit tooling: source distribution, contradictory numeric guidance, stale/duplicate chunks, provenance | Supabase read-only first |
| KNOW-T04 | Define Offline Emergency Knowledge Library package, update/version format and storage budget | G-03/mobile architecture alignment |
| KNOW-T05 | Implement local retrieval without local generative model | native/offline storage available |
| KNOW-T06 | Connect future LOCAL_AI to local library with deterministic guardrails | local model decision required |
| KNOW-T07 | Prove loss-of-network handoff: Connected → Local AI → Survival without false freshness or silent knowledge loss | end-to-end gate |

Suggested sequencing principle: **do not wait for LOCAL_AI to create offline knowledge**. A searchable local emergency library has standalone value even before an on-device generative model exists.

---

## 9. Acceptance criteria for the future architecture

The knowledge architecture is complete only when EOS can answer these questions programmatically and truthfully:

1. What source produced this guidance?
2. Is it an EOS rule, a document, the model's general knowledge, a live provider, cached data, or a household fact?
3. Is the source current, stale, or timeless?
4. Does this guidance work with no internet?
5. If two sources disagree, what policy selected the final recommendation?
6. Can the user still access critical preparedness knowledge after losing connectivity?
7. Can the LLM enrich guidance without silently overriding a more authoritative deterministic/official source?
8. Can the system clearly degrade from CONNECTED to LOCAL_AI to SURVIVAL without pretending unavailable capabilities still exist?

---

## 10. Non-goals

This proposal does **not**:
- initialize the native mobile app;
- choose an on-device LLM;
- add a new vector database;
- download the entire cloud corpus blindly;
- automatically treat EDU/YouTube as authoritative;
- make live data available when the device has no network;
- allow the LLM to override official warnings or deterministic urgency;
- start KNOW implementation before App Spine sequencing.

---

## 11. Spine integration required before execution

Per `AGENTS.md`, this document is the **Idea/Spec intake**, not authorization to code.

Before implementation, an agent must:
1. log candidate **D-132** in `docs/08-decisions-log.md` (or use the next free decision ID if D-132 is taken);
2. reconcile `docs/01-product-vision.md` and `docs/05-platform-strategy.md` where needed;
3. add the approved KNOW task family to canonical `docs/07-roadmap.md` in the owner-approved sequence;
4. update `docs/09-build-status.md` only when a KNOW task becomes the actual current task;
5. preserve the existing rule: one roadmap task at a time.

Until those steps happen, this file is intentionally **PROPOSED**, not implemented.
