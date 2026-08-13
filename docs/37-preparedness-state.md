# 37 — Preparedness State

> **Status:** SPEC / PRODUCT-ARCHITECTURE DECIDED
> **Decision:** D-155
> **Date:** 2026-08-12
> **Roadmap:** PREP-T03
> **Supersedes nothing.** Extends `docs/20-preparedness-engine.md` (D-085), which
> stays the high-level Preparedness Engine spec. This document is the state model.
> **No application code, migration, route or UI changed by PREP-T03.**
>
> Written for an engineer who has never seen the conversation that produced it.
> Every claim about current behaviour was verified against code, not docs.

---

## 1. Objective

Define the canonical model of **what EOS knows about a family's real preparedness**,
so that every capability — EDU, Simulation, Pilot, Alerts, Plan, Inventory —
reads from and writes to the same state instead of each keeping a private view.

This is a state and domain specification. It is not a UI reorganization, not a
migration, and not an inventory product.

---

## 2. Product principle

> EOS continuously reasons from the family's real preparedness state. Learning,
> simulation, live hazards, plans, inventory and user interactions are different
> **entry points into the same loop** — not separate features with separate memories.

Corollary, and the reason this document exists:

> The loop is only as useful as the state it reasons over. EOS today has a working
> loop and a thin state. **The gap is state, not loop.**

---

## 3. Current-state problem

Verified in code on 2026-08-12.

### 3.1 The loop already exists — three times

| Entry point | Status | Evidence |
|---|---|---|
| EDU → confirmed action | ✅ implemented | D-119; `kit_type='EDU_CONTENT'` |
| Simulation debrief → confirmed action | ✅ implemented | D-092; `kit_type='SIMULATION_DEBRIEF'` |
| Pilot → confirmed action | ✅ implemented | D-093; `kit_type='PILOT_RECOMMENDATION'` |
| **Official alert → reassessment** | ❌ **missing** | `app/api/cron/weather-notifications/route.ts` ends at a notification |

All three implemented paths already enforce confirmation before persistent
write. **PREP-T03 does not invent the loop. It adds the fourth entry point and
repairs the state the loop reasons over.**

### 3.2 The state is the bottleneck — six confirmed defects

**S1 — Inventory has no items.**
`resource_inventory` is **one row per profile** (`UNIQUE (profile_id)`,
`supabase/schema.sql:109`) with seven scalars: `water_liters`, `food_days`,
`fuel_liters`, `battery_percent`, `has_medical_kit`,
`has_communication_device`, `cash_amount`. There is no object, no quantity per
object, no place. EOS cannot represent "20 gal in the Garage" because it cannot
represent *a thing* at all.

**S2 — There is no location model.** No table, no column, no concept.
`profiles.location_lat/lng` is a person's point, not a storage place.

**S3 — `kit_type` conflates purpose and provenance, inside a unique key.**
Added by `supabase/migrations/20260701000000_checklist_kit_type.sql`, it carries
purposes (`GERAL`, `BUG_OUT`, `ACAMPAMENTO`, `PESCA`, `CACA`) *and* provenances
(`EDU_CONTENT`, `PILOT_RECOMMENDATION`, `SIMULATION_DEBRIEF`) in one column —
and that column is part of
`UNIQUE (profile_id, canonical_key, kit_type)`.
Consequence, by design and not by accident: the *same* item recommended by the
Pilot and belonging to the Bug Out bag becomes **two rows that can never merge**.

**S4 — Requirement and holding are joined by regex.**
`getInventoryDelta()` (`components/world-v2/PreparednessPage.tsx:301`) matches
`canonical_key` against regular expressions to write into the seven scalars.
`canonical_key` is already the join key between "what I need" and "what I have";
the regex is a degenerate implementation of a relationship the model never named.

**S5 — Readiness is computed four incompatible ways.**

| Where | Produces | Scope |
|---|---|---|
| `calcReadiness()` — `PreparednessPage.tsx:67` | integer 0–100 | 5 baseline resources |
| `/api/ai/readiness` | LLM prose + `risk_level` low/med/high | household snapshot |
| `autonomyDays()` — `lib/household.ts:195` | `min(water, food)` in days | household |
| `restingVerdict()` — `components/world-v2/resting-verdict.ts` | safe/watch/warning/critical | weather ∨ house |

Four answers to "how ready are we". **Any fifth is a defect, not a feature.**

**S6 — Alerts are content.** The cron already validates severity
(`SEVERITY_RANK[alert.severity] >= SEVERITY_RANK.WATCH`) and already deduplicates
via `sourceKeyFor()` → `circle_notifications.source_key`. It then writes a
notification and stops. The hard parts — validation and deduplication — exist.
The missing step is reassessment.

---

## 4. Closed-loop lifecycle

```text
        ┌──────────────── entry points (any of them) ─────────────────┐
        │  EDU   SIMULATION   OFFICIAL ALERT   PILOT   USER   STATE Δ │
        └──────────────────────────┬──────────────────────────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  1. DETERMINISTIC RELEVANCE  │   cheap, no LLM
                    │  authority · freshness ·     │
                    │  severity · geography · dedup│
                    └──────────────┬───────────────┘
                    meaningful? ───┴─── NO ──▶ update state, do not interrupt
                                   │ YES
                                   ▼
                    ┌──────────────────────────────┐
                    │  2. CONTEXT ASSEMBLY         │   §7
                    │  structured state + live +   │
                    │  knowledge (+ memory)        │
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  3. RULES ENGINE             │   deterministic verdict
                    │  establishes safety truth    │   — binding, not advisory
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  4. PILOT CONTEXTUALIZATION  │   only when it adds meaning
                    │  "what does this mean for    │   never overrides step 3
                    │   THIS family, right now?"   │
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  5. PROPOSED ACTIONS         │   with provenance
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  6. USER CONFIRMATION        │   mandatory. no exception
                    └──────────────┬───────────────┘
                                   ▼
              Requirement · Plan review · Learning · Acquisition
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  7. HOLDING CHANGES          │   the family actually acts
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  8. READINESS RECOMPUTED     │   derived, never stored as truth
                    └──────────────┬───────────────┘
                                   │
                                   └──▶ becomes a STATE Δ entry point ↺
```

Step 8 feeding step 1 is the closure. It is also the loop's main hazard —
see §26.

---

## 5. Trigger model

### 5.1 Trigger types

```text
OFFICIAL_ALERT        SIMULATION_GAP      INVENTORY_CHANGE     PLAN_REVIEW_DUE
EDU_COMPLETED         PILOT_RECOMMENDATION FAMILY_STATE_CHANGE READINESS_THRESHOLD
MANUAL_USER_INTENT    PLAN_STATE_CHANGE
```

### 5.2 A trigger is an EVENT, not an entity — decision

**`PreparednessTrigger` must NOT become a table in v2.**

Rationale (§35 test: *does every proposed entity justify its existence?*):

1. A trigger has no lifecycle, no ownership, no user-visible identity, and
   nothing queries "list my triggers".
2. What actually needs persistence is the **result** — so that repeated
   evaluation does not repeat the interruption.
3. The dedup mechanism already exists and is proven in production:
   `circle_notifications.source_key` with an existence check before insert
   (`lib/comms-notifications.ts:78`).

Therefore the persisted artifact is **`ReadinessAssessment`**, carrying
`trigger_type` + `trigger_key`. One concept instead of two.

### 5.3 Orchestration order — non-negotiable

```text
Trigger → cheap deterministic evaluation → (materially changed?) → assemble → Rules → Pilot only if useful
```

**No LLM call before deterministic evaluation.** An LLM must never be the thing
that decides whether an interruption is warranted; that path produces both cost
and noise, and puts a model in the safety path.

---

## 6. Alert-driven reassessment

```text
NWS / NHC / USGS
      ▼
official event detected            ── already implemented
      ▼
source authority · freshness · severity ≥ WATCH · geographic relevance
      ▼                             ── already implemented
deduplication by trigger_key       ── already implemented (source_key)
      ▼
notification                       ── already implemented  ⟵ TODAY STOPS HERE
      ▼
PREPAREDNESS TRIGGER (OFFICIAL_ALERT)          ⟵ new
      ▼
context assembly  §7                            ⟵ new
      ▼
Rules Engine verdict                            ── exists, not wired to alerts
      ▼
Pilot contextualization                         ── exists, not wired to alerts
      ▼
proposed actions, provenance = OFFICIAL_ALERT   ⟵ new
      ▼
user confirmation                               ── exists
```

### Safety boundary — binding

| The LLM MUST NOT | The deterministic layer OWNS |
|---|---|
| decide whether an official warning exists | event truth |
| override or soften an official warning | source authority |
| soften a critical Rules Engine result | severity |
| decide geographic relevance | relevance |
| convert `unknown` into reassurance | critical rule state |

This is not new policy: `lib/pilot-guard.ts` already implements it
(`PRIORITY_OVERRIDE`, tested by `pilot-guard` unit + `guardrails-test`). §6
extends the same authority to the alert path.

---

## 7. Context assembly

The **Context Package** is the single input contract to Rules + Pilot. Assembled
server-side. Never assembled by the model.

```text
ContextPackage
├── structured state      §9   people · household · holdings · requirements ·
│                              locations · kits · plans · readiness · known gaps
├── live context          §12  alerts · weather · cyclones · quakes · AQI ·
│                              shelters · consented member locations · timing
├── knowledge             §11  RAG chunks relevant to the question/scenario
└── pilot memory          §10  preferences · constraints · decision style
```

**Invariant:** structured state is read server-side from the database on every
assembly. Client-supplied context may enrich (current map view, risk snapshot)
but may never *be* the factual state. `app/api/pilot/chat/route.ts` already
re-reads the household server-side via `getHousehold()` even though the client
sends a `context` object — that precedent is now the rule.

---

## 8. Pilot responsibilities

**Pilot is the contextual interpretation layer. It is not the database and not
the safety authority.**

| Pilot does | Pilot does not |
|---|---|
| query structured state | remember structured facts conversationally |
| interpret what a verified event means for this family | decide whether the event is real |
| rank gaps by meaning | invent inventory |
| propose actions with provenance | write persistent state without confirmation |
| explain a deterministic verdict | soften or contradict it |
| say "I don't know" | convert unknown into reassuring |

---

## 9. Structured state boundary

Deterministic facts. Queried, never inferred:

```text
people · family/circle membership and roles · medical information
consented locations · storage locations · holdings · kits · requirements
plans · vehicles · readiness · known gaps
```

**Rule:** Pilot conversational memory must never become a second store for any
of the above. If the Pilot "knows" the family owns a generator, that must be a
row it can query — not a sentence it remembers.

---

## 10. Pilot memory boundary

Durable *contextual* information about the person, not facts about the world:

```text
preferences · routines · decision style · risk tolerance
personal constraints · recurring habits
```

Existing confirmation and audit rules (D-095 / UPP-03, `pilot_memory_events`)
remain unchanged and continue to apply.

---

## 11. RAG / knowledge boundary

`knowledge_base` + `edu_content` answer **what is recommended and why**:

```text
recommended quantities · procedures · standards · methods
approved educational material
```

**Rule:** RAG is never the factual source for what the family owns. A retrieved
chunk saying "store 1 gal per person per day" is a *requirement input*; it is
never evidence that water exists.

---

## 12. Live context boundary

External present reality, authoritative and time-bounded:

```text
official alerts · weather · cyclones · earthquakes · air quality
shelters · route conditions · current and member locations · forecast timing
```

**Rule:** live context has an expiry. Stale live context degrades to `unknown`,
and `unknown` never reads as safe (§25).

---

## 13. Domain entities

Verdict per candidate. **Bold = new persisted concept proposed for v2.**

| Candidate | Verdict | Reason |
|---|---|---|
| **Holding** | **ENTITY (new)** | The physical thing that exists, in a place, in a quantity. Evolution of `resource_inventory` + acquired checklist rows |
| **Requirement** | **ENTITY (new)** | The thing that *should* exist, for a kit/scenario/baseline. Evolution of un-acquired checklist rows |
| **Location** | **ENTITY (new)** | Self-referencing tree. User data |
| StorageLocation / SubLocation | ATTRIBUTE (`parent_id`) | A sub-location is a Location with a parent. A second table buys nothing |
| **Kit** | **ENTITY (new)** | A named *set of Requirements*. Not a container of items |
| KitRequirement | RELATIONSHIP | `Requirement.kit_id`. Not a join table — a requirement belongs to at most one kit |
| Category | ATTRIBUTE | `resource_key` prefix / `category` column. Not a table |
| **Provenance** | **ATTRIBUTE (new column)** | Split out of `kit_type`. Never a table |
| Recommendation | WORKFLOW STATE | A Requirement in state `proposed`. Not a separate entity |
| PreparednessAction | WORKFLOW STATE | Covered by Requirement status + Plan review. A separate table would duplicate both |
| Acquisition | WORKFLOW STATE | `Requirement.status` (§19). Not procurement |
| Trigger | EVENT | §5.2 — not persisted as an entity |
| **ReadinessAssessment** | **ENTITY (new)** | The persisted output that makes deduplication and "what changed since" possible |
| Scenario | ENTITY (exists) | `scenarios` table already exists |
| Capability | DERIVED VIEW | "Can we shelter 7 days?" = requirement coverage query. Never stored |
| ReadinessRequirement | NOT NEEDED | Duplicate of Requirement |
| PreparednessItem | NOT NEEDED | Ambiguous by construction — it is either a Holding or a Requirement, and the ambiguity is exactly defect S4 |
| InventoryItem | RENAMED → Holding | "Inventory item" invites warehouse semantics EOS must not adopt |
| Vehicle | FUTURE ONLY | A Location of type `vehicle` covers stress test B and C today |

**Five new entities. Not one more.**

### 13.1 The core object — answer to the domain question

There is no single core object. **The core is the pair `Requirement ↔ Holding`,
joined by `resource_key`.** Everything else is a lens on that pair:

```text
Kit       = a named set of Requirements
Location  = where Holdings are
Scenario  = a set of Requirements activated by a situation
Readiness = the derived coverage of Requirements by Holdings
Plan      = what the family does; it CONSUMES coverage, it does not define it
```

Choosing `PreparednessItem` as a single core object would re-create defect S4 in
the schema: the whole current problem is that one table
(`checklists`) is being used as both sides of the pair, with a regex bridging
them.

---

## 14. Entity relationships

```text
profile ──┬── location (tree, parent_id → location)
          │        │
          │        └── holding ──┐
          │                      │  resource_key
          ├── kit ── requirement ┘  (+ optional location scope)
          │                      │
          ├── plan ──────────────┤  reads coverage; never owns items
          │                      │
          └── readiness_assessment  (derived snapshot + trigger_key)

scenario ── requirement (scenario-scoped set)
edu_content / knowledge_base ── requirement.provenance
```

Cardinality that matters:

```text
location  1 ── N  holding
kit       1 ── N  requirement
holding   N ── N  requirement    ← by resource_key MATCH, never by stored link
```

The last line is the whole model. Coverage is **computed**, not assigned. There
is no allocation table, no reservation, no stock ledger.

---

## 15. Inventory model (Holdings)

```text
Holding
  resource_key     text     canonical resource identity — the join key
  label            text     what the user calls it
  kind             enum     CONSUMABLE | DURABLE          ← the key attribute
  quantity         numeric  CONSUMABLE only; DURABLE is presence
  unit             text
  location_id      fk       where it physically is
  owner_scope      enum     personal | household
```

`resource_key` is the same concept as today's `checklists.canonical_key`. It is
reused deliberately: it is the existing join key, and reusing it is what makes
the migration additive.

### 15.1 CONSUMABLE vs DURABLE — how double-counting is prevented

This single attribute replaces a warehouse reservation system.

| | CONSUMABLE | DURABLE |
|---|---|---|
| Examples | water, food, fuel, batteries, medication | tourniquet, radio, generator, knife, tent |
| Coverage semantics | **quantity math within a location** | **presence at a location** |
| Shared across kits at the same location? | **NO** — using it consumes it | **YES** — grabbing the bag takes the item |
| Shared across locations? | never | never |

**The rule, stated once:**

> A Holding satisfies a Requirement only when `resource_key` matches **and** the
> Holding's location is compatible with the Requirement's scope. A CONSUMABLE
> Holding's quantity is counted **once** across all Requirements competing for
> it. A DURABLE Holding satisfies **any number** of Requirements scoped to a
> location it can be reached from.

This is not a compromise — it is physically correct. One tourniquet in the
first-aid bag at home genuinely *is* available for First Aid, Bug Out and
Hurricane, because all three are executed from home. It is genuinely *not*
available for the Vehicle kit, because it is not in the vehicle. Location does
the work that a reservation system would otherwise have to do.

### 15.2 Household autonomy reads what is AT HOME — D-156

Decided by the product owner on 2026-08-12, answering the open question D-155
left behind.

> **Household autonomy = CONSUMABLE Holdings whose Location is under HOME.**

1. A checklist item **never overwrites** household stock. Ticking an item records
   that it was acquired; *where it now exists* is a Location question.
2. Water inside the evacuation bag, with the bag stored at home, **counts**
   toward household autonomy. It is physically there and would be drunk in an
   emergency; excluding it would understate real autonomy.
3. The same consumable is **counted once**. Opening the Bug Out kit shows that
   those litres are already counted by the house — the contention is made
   visible, never hidden and never duplicated (§15.1).
4. Moving a Holding out from under HOME (bag moved to the car) removes it from
   household autonomy automatically. **Location is the discriminator**; there is
   no manual "reserved" flag.

Consequence for the model: the seven `resource_inventory` scalars and the
checklist items are **not the same object**. They are the same reality at two
granularities, reconciled by Location — not by a regular expression over item
names. This retires the rationale for `getInventoryDelta()` in its current form
(§34 F1) and gives PREP-T11 its acceptance rule.

---

## 16. Location / storage model

```text
Location
  id · profile_id · parent_id (self, nullable) · name
  type   enum   HOME | FARM | WAREHOUSE | OFFICE | VEHICLE | RV | BOAT |
                STORAGE_UNIT | SECOND_RESIDENCE | CUSTOM
  point  optional lat/lng
```

Arbitrary nesting: `Home → Garage → Cabinet 1`.

Three rules:

1. **Every profile gets exactly one default Location on first write** (`HOME`,
   named "Casa"). An ordinary family never learns the concept exists.
2. **Locations are user data. They are never product navigation.** "Farm" and
   "Warehouse" are rows; they may become filters and views; they must never
   become tabs. (§26, and see §29.)
3. **A Location is not a Kit** (§17).

---

## 17. Kit / requirement model

```text
Kit                          Requirement
  id                           id
  profile_id                   profile_id
  name                         resource_key      ← joins to Holding
  purpose enum | custom        label
                               quantity · unit
                               kit_id      nullable
                               scenario_id nullable
                               location_scope fk  nullable
                               tier        ESSENTIAL | MODERATE | EXCELLENT
                               status      §19
                               provenance  §18
```

**Location answers:** where is the thing physically?
**Kit answers:** for what capability is this thing required?
**Category answers:** what kind of resource is this? *(attribute of `resource_key`)*
**Provenance answers:** why did this enter EOS? *(§18)*

These four dimensions are independent. Collapsing any two of them reproduces
defect S3.

A `Requirement` with no `kit_id` and no `scenario_id` is a **baseline household
requirement** — which is exactly what today's seven `resource_inventory` scalars
implicitly are.

---

## 18. Provenance model

```text
provenance enum:  MANUAL | PILOT | EDU | SIMULATION | OFFICIAL_ALERT | PLAN_GAP
provenance_ref:   fk/id of the originating artifact (edu_content.id, simulation id, alert trigger_key)
```

**Provenance is an attribute of Requirement. It is never a Kit and never part of
a unique key.** This is the direct repair of S3.

Today's `EDU_CONTENT`, `PILOT_RECOMMENDATION` and `SIMULATION_DEBRIEF` values of
`kit_type` map to `provenance` with `kit_id = NULL` (§27). No data is lost and
none is migrated in PREP-T03.

---

## 19. Acquisition lifecycle

The proposed eight-state lifecycle (Recommendation → Confirmed Need → Planned →
Acquire → Acquired → Organize/Store → Available → Recalculated) **is rejected as
procurement software.** Six of the eight states are either UI affordances or
derivable.

**Minimum useful lifecycle — three states:**

```text
proposed ──confirm──▶ needed ──holding created──▶ met
    │                    │
    └──dismiss──▶ ✕      └──user marks N/A──▶ not_applicable
```

| State | Meaning | Who moves it |
|---|---|---|
| `proposed` | Pilot/EDU/Simulation/Alert suggested it; nothing is persisted as truth yet | system proposes |
| `needed` | The user confirmed this is genuinely required | **user only** |
| `met` | A matching Holding covers it | **derived**, never set by hand |
| `not_applicable` | Explicitly ruled out for this family | user only |

Today's `checklists.acquired` boolean is a two-state version of exactly this.
Going to three states is one increment. `met` being derived is what keeps
readiness honest: you cannot mark yourself prepared, you can only own things.

**Not modelled, deliberately:** suppliers, prices, orders, shipments, expiry
scheduling, reorder points. If any of these are ever needed they arrive as
attributes, not as a procurement subsystem.

---

## 20. Plan relationship

Unchanged from D-085 §4.7, restated with the new vocabulary:

> A Plan defines what the family **does**. Preparedness defines what must be
> **available, learned, acquired, practised and configured** for the plan to work.

```text
Plan ──reads──▶ Requirement coverage      "the plan needs a vehicle with fuel"
Plan ──emits──▶ Requirement (provenance = PLAN_GAP)
Plan ──never──▶ owns Holdings or item lists
```

A plan gap becomes a Requirement. A Requirement never becomes a plan step.
Plans do not turn into shopping lists.

---

## 21. EDU relationship

```text
approved edu_content ──RAG──▶ recommended quantities/procedures
                                    ▼
                    compare against Holdings + household size
                                    ▼
                    Requirement (provenance = EDU, ref = edu_content.id)
                                    ▼
                             user confirms
```

Already implemented at v1 (D-119) writing `kit_type='EDU_CONTENT'`. The change is
where the value lands: `provenance=EDU` instead of a fake kit, and a real
comparison against Holdings instead of against seven scalars.

---

## 22. Simulation relationship

**No separate simulation architecture.** A simulation reads the same structured
state and writes the same Requirements.

```text
simulated scenario ──▶ activates the scenario's Requirement set
                  ──▶ evaluates coverage against real Holdings
                  ──▶ debrief gaps = uncovered Requirements
                  ──▶ confirmed ⇒ Requirement (provenance = SIMULATION)
```

This is what makes stress test H pass: the second run reads Holdings, and
Holdings changed because the family actually acquired things. Nothing needs to
"remember" the previous simulation.

---

## 23. Alert relationship

See §6. Summarised: an alert activates a scenario's Requirement set, coverage is
evaluated against real Holdings, and the uncovered ones — ranked by the Rules
Engine, explained by the Pilot — become proposals.

---

## 24. Readiness model

### 24.1 What readiness IS

A **derived** view of Requirement coverage. Never stored as truth; the persisted
`ReadinessAssessment` is a snapshot for deduplication and change detection, not
the source.

Per Requirement:

```text
covered · partial · missing · unknown · not_applicable
```

Rolled up per Kit / Scenario / Location / household by the **worst-wins** rule,
with one exception that is the whole point:

```text
unknown NEVER rolls up to covered.
An unknown inside an otherwise-covered set makes the set `unknown`, not `ready`.
```

Measured values only where a real measurement exists:

- `autonomyDays = min(water, food)` — already implemented and tested
  (`lib/household.ts:195`, `household` unit test). Keep as-is.

### 24.2 What readiness is NOT

- **Not a new score.** Four calculations already exist (S5). PREP-T03 authorises
  **zero** new numeric scores.
- The existing `calcReadiness()` 0–100 is **kept and demoted**: it is honestly a
  *baseline household score over five resources*, and must be labelled as that
  rather than as "your preparedness".
- **Not precision theatre.** "68% prepared for a hurricane" is a number EOS
  cannot defend. "3 of 11 essential items missing; water covers 1.8 of 7 days"
  is defensible.

### 24.3 Dimensions

| Dimension | Representation | Numeric? |
|---|---|---|
| Household baseline | existing 0–100, relabelled | yes (existing) |
| Autonomy | days | yes (existing) |
| Kit readiness | covered/partial/missing/unknown + counts | no |
| Scenario readiness | worst-wins rollup | no |
| Location readiness | worst-wins rollup | no |
| Capability | derived query | no |

---

## 25. Consent and security constraints

Unchanged and binding:

1. Circle/household inventory visibility follows `circle_members.share_inventory`.
2. Medical information requires the separate `family_access_status='approved'`
   consent. Living together does not grant it (D-123, `household-consent-test`).
3. Member location requires explicit monitoring consent (`circle-location-test`).
4. **Holdings and Locations inherit these rules.** A Location named "Farm" and
   its Holdings are personal unless explicitly shared — a place is at least as
   sensitive as a quantity, and arguably more.
5. RLS on every new table: `profile_id = auth.uid()`, matching
   `resource_inventory` and `checklists`.

---

## 26. Deduplication and idempotency

Conceptual requirements. Not implemented in PREP-T03.

1. **Trigger identity.** Every trigger computes a stable `trigger_key`
   (source + event id + geography + severity band). Re-evaluating the same
   trigger is a no-op. The pattern exists: `sourceKeyFor()` +
   `circle_notifications.source_key`.
2. **Requirement identity.** `(profile_id, resource_key, kit_id, scenario_id)`
   is the natural key. The same gap found by two sources updates provenance;
   it does not create a second row. **`provenance` must not be part of this
   key** — that mistake is precisely S3.
3. **Assessment idempotency.** An assessment whose inputs are unchanged produces
   no new proposal and no notification.
4. **Loop damping.** Step 8 feeding step 1 is a cycle. A state change caused by
   applying a proposal must not re-trigger assessment of the same
   `trigger_key`. Without this the loop oscillates.
5. **Interruption budget.** Reassessment may run often; *interrupting the user*
   is rate-limited and severity-gated. The system may think continuously; it may
   not talk continuously.
6. **Dismissal is durable.** A dismissed proposal does not return on the next
   identical evaluation.

---

## 27. Compatibility with legacy data

Both current tables remain valid and keep working.

| Today | Becomes | How |
|---|---|---|
| `resource_inventory` (7 scalars, 1 row) | 7 baseline **Requirements** + up to 7 **Holdings** at the default Location | derived view; table untouched |
| `checklists` row, `acquired=false` | **Requirement** (`status=needed`) | field mapping |
| `checklists` row, `acquired=true` | **Requirement** (`status=met`) + **Holding** at default Location | field mapping |
| `kit_type ∈ {GERAL, BUG_OUT, ACAMPAMENTO, PESCA, CACA}` | `Kit` | lookup |
| `kit_type ∈ {EDU_CONTENT, PILOT_RECOMMENDATION, SIMULATION_DEBRIEF}` | `provenance`, `kit_id = NULL` | lookup |
| `canonical_key` | `resource_key` | same value, same semantics |
| `getInventoryDelta()` regex | explicit `resource_key` join | the regex becomes unnecessary, not rewritten |

**Nothing above requires a migration to be true.** It is a reading of existing
data, which is what makes the strategy in §28 additive.

---

## 28. Migration strategy — conceptual only

```text
1. ADDITIVE      new tables alongside; nothing dropped, nothing altered
2. ADAPTERS      one read model serves both shapes; UI and Pilot read the adapter
3. DUAL WRITE    new writes go to the new shape; legacy tables kept in sync
4. BACKFILL      legacy rows projected per §27 — reversible, re-runnable
5. CUTOVER       explicit, decided, one task
6. RETIREMENT    legacy assumptions removed only after cutover proves out
```

Constraints: no irreversible step before stage 5; every stage independently
shippable; **no migration runs in PREP-T03**.

---

## 29. Progressive disclosure / UX implications

### 29.1 Principle

> Ordinary families see one home and a short list. Advanced users grow into
> locations and kits. **Nobody configures the model to use the product.**

| | Ordinary family | Power user |
|---|---|---|
| Locations | one, auto-created, never mentioned | Home, Farm, Warehouse, RV, Vehicle, nested |
| Kits | baseline requirements only | many, custom |
| Sees | "Minha casa · O essencial · Meu plano · O que precisa de atenção" | coverage by location and by kit |

Defaults do the work: the default Location is created on first write; baseline
Requirements are the seven resources that already exist.

### 29.2 IA implication — and a correction to `docs/36`

**`docs/36-preparacao-arquitetura-interna.md` proposed `Em casa` / `Mochilas` as
sibling subtopics. Under this domain model that is wrong, and 37 supersedes 36
on this point only.**

"Em casa" is a **Location** and "Mochilas" are **Kits** — two independent
dimensions (§17) placed on one axis. That is defect S3 reproduced in navigation.

The axis that follows from the model is **Requirement vs Holding**:

```text
Visão          readiness + what needs attention
O que eu tenho Holdings        — filterable BY LOCATION  (Casa, Fazenda, Carro…)
O que falta    Requirements    — grouped BY KIT/SCENARIO (Bug Out, Furacão…)
Plano          (future owner of /plan)
Aprender       (future owner of /edu)
```

Locations and Kits become **filters and views inside** those surfaces — which is
exactly what §26 of the PREP-T03 brief requires: user-created entities must not
become permanent product navigation.

Everything else in `docs/36` — the overview-as-decision-screen, the
"needs attention" list, chips with real routes, the phased migration — survives
unchanged. Only the subtopic axis is superseded.

**No page is reorganized by PREP-T03.**

---

## 30. Explicit non-goals

```text
warehouse / ERP inventory        stock ledgers, reservations, allocations
procurement                      suppliers, prices, orders, shipments
a fifth readiness score          §24.2
a PreparednessTrigger table      §5.2
barcode scanning, expiry jobs, reorder points
replacing resource_inventory or checklists
replacing Pilot, RAG, EDU, Simulation, Rules Engine or alert infrastructure
turning Locations or Kits into global navigation
any migration, route, component or UI change in PREP-T03
```

---

## 31. Acceptance criteria — PREP-T03

```text
[x] Closed-loop model canonical, and honest that 3 of 4 entry points already exist
[x] Trigger model defined; PreparednessTrigger explicitly rejected as an entity
[x] Alert → deterministic relevance → reassessment → Pilot contract defined
[x] Pilot / memory / RAG / live-context boundaries defined and unambiguous
[x] Inventory / Location / Kit semantics defined; the three kept independent
[x] Provenance separated from kit, and excluded from the natural key
[x] Acquisition lifecycle reduced to 3 states + not_applicable
[x] Readiness semantics defined; zero new scores authorised
[x] Compatibility with resource_inventory and checklists defined
[x] Migration strategy documented, additive, conceptual only
[x] Eight stress tests answered (§32)
[x] No application code changed
[x] No database migration created
```

---

## 32. Stress tests

| # | Scenario | Result | Mechanism |
|---|---|---|---|
| **A** | Hurricane at home; water in Garage + Pantry, generator in Shed, low fuel | ✅ | Locations nest under Home; CONSUMABLE water sums across sub-locations of the same Home; hurricane scenario Requirements vs Holdings ⇒ ranked gaps |
| **B** | Home + Farm | ✅ | Two root Locations. No global architecture change — a Farm is a row, not a tab (§16.2) |
| **C** | "Where is the extra water reserve?" | ✅ | Pilot queries Holdings by `resource_key` + Location. Answerable **only** with §15; impossible today (S1/S2) |
| **D** | Solo camping: 15 requirements, 10 already owned across Garage, Vehicle, First Aid Kit, Office | ✅ | Camping Kit = 15 Requirements. Coverage computed by `resource_key` match with location compatibility. **Zero items duplicated** — no item is copied into the kit |
| **E** | One tourniquet, relevant to First Aid + Bug Out + Vehicle + Hurricane | ✅ | DURABLE ⇒ presence, not quantity. Covers the three home-executed kits; does **not** cover Vehicle (different location). One physical object, one Holding row, honest coverage (§15.1) |
| **F** | Fallout EDU → useful actions | ✅ | RAG gives required quantities; compared against Holdings + household size; uncovered ⇒ Requirements with `provenance=EDU`; confirmation ⇒ persisted (§21) |
| **G** | Tropical cyclone alert end-to-end | ✅ | Detect/validate/dedup already implemented; trigger → assembly → Rules verdict → Pilot explanation → proposals. LLM never establishes event truth (§6) |
| **H** | Simulation → fix over a month → simulate again | ✅ | The second run reads current Holdings. Improvement is automatic because the simulation never had its own copy of state (§22) |

---

## 33. Candidate next implementation tasks

Sequencing rationale: **the loop's fourth entry point is worth less than the
state it would reason over.** Alerts wired into a seven-scalar inventory would
produce "you may need water" — which is what the product already says.

| Task | Scope | Why here |
|---|---|---|
| **PREP-T04 — Holdings + default Location** | `holdings`, `locations`; default "Casa"; adapter reading `resource_inventory` + acquired checklist rows | Unblocks stress tests A/C/D/E. Smallest slice that makes any other task worth doing |
| PREP-T05 — Requirements + kit/provenance split | `requirements`, `kits`; `kit_type` adapter per §27 | Repairs S3/S4. Depends on T04's `resource_key` |
| PREP-T06 — Coverage + Readiness v2 | derived coverage; worst-wins rollup; `unknown ≠ safe`; relabel the 0–100 | Needs both sides of the pair |
| PREP-T07 — Preparedness IA (Requirement vs Holding axis) | §29.2; phased per `docs/36` | **Can start after T04–T06, not last.** See below |
| PREP-T08 — Alert → reassessment | Wire the existing cron into trigger → assembly → Rules → Pilot | Highest product value; lowest value *before* T04–T06 |
| PREP-T09 — Assessment persistence + dedup damping | `readiness_assessments`, `trigger_key`, interruption budget | Only meaningful once T08 generates assessments |
| PREP-T10 — Acquisition states + dual-write cutover | 3-state lifecycle; stages 3–5 of §28 | Cleanup, last |

**On not putting IA last** (brief §32): PREP-T07 is placed fourth, not seventh.
Once Holdings, Requirements and coverage exist, the Preparedness surface can be
reorganized honestly — the UI would promise exactly what the domain supports.
Placing it before T04 would make the UI promise "where is my water" while the
schema still holds seven scalars. Placing it after T08 would delay a fix the
owner already feels for work the user never sees.

---

## 34. Findings — defects observed, NOT fixed in PREP-T03

Per the scope rule, discovered defects are documented, not repaired.

**F1 — `getInventoryDelta()` overwrites instead of accumulating.**
`components/world-v2/PreparednessPage.tsx:301` returns
`{ water_liters: item.quantity }`, and `update()` assigns it. A household with
20 L stored that ticks a 4 L checklist item has `water_liters` **set to 4**.
Impact on this architecture: it is a live example of why Requirement and Holding
must be distinct (S4).
**Status: rule decided by D-156 (§15.2); scheduled as PREP-T11, which runs
BEFORE PREP-T04** — it is user data being lost today, and it now has a
criterion.

**F2 — Four readiness calculations coexist** (S5). Consolidation belongs to
PREP-T06, not to a silent edit.

**F3 — `components/world-v2/ChecklistPage.tsx` (323 lines) is unmounted** and
already implements kit filtering. Useful input to PREP-T05/T07; dead code today.

---

## 35. Relationship to other Spine documents

| Document | Relationship |
|---|---|
| `20-preparedness-engine.md` (D-085) | **Parent.** Stays the high-level engine spec. §3 "minimum concepts" is realised here; §4 business rules all survive |
| `15-eos-pilot.md` (D-125 etc.) | Unchanged. §8–12 here restate its deterministic-safety principle and make the state boundary explicit |
| `19-scenario-simulator.md` | Unchanged. §22 confirms simulation gets no separate architecture |
| `18-family-plans.md` | Unchanged. §20 preserves the plan/preparedness separation |
| `06-data-model.md` | Current implemented model only. Proposed tables live **here**, never there, until implemented |
| `32-knowledge-architecture.md` | Unchanged. §11 restates the RAG boundary |
| `35-arquitetura-de-navegacao.md` | Proposal, not yet decided. Compatible |
| `36-preparacao-arquitetura-interna.md` | Proposal. **Superseded on the subtopic axis only** — see §29.2 |
