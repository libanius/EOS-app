# EOS Truth Inventory

> **What this document is for.** It is the factual basis for any campaign,
> landing page, store listing or sales material about EOS. There is one rule:
>
> **Nothing is claimed to a customer without pointing here to the file and the
> test that prove it.** A plan table written from intent — rather than from
> code — is exactly what produced, in August 2026, four advertised Premium
> features that did not exist.
>
> Audited on 2026-08-11 by reading the code, not the documentation.
> Evidence base: 28 browser tests against the production Supabase and
> 23 unit suites (202 tests).

---

## How to read the levels

| Level | What it means | Can it go into a campaign? |
| --- | --- | --- |
| **PROVEN** | Exists and is exercised by a named automated test listed below | Yes, without caveats |
| **EXISTS** | Exists in the code and works, with no dedicated test | Yes, with care about specifics |
| **PARTIAL** | Part of the promise exists, part does not | Only after rewriting the promise |
| **DOES NOT EXIST** | Advertised but not built | **No.** Remove from all material |
| **ROADMAP** | Planned, blocked or not started | Only as "coming soon", never in the present tense |

---

## 1. PROVEN — the defensible core

These are the strongest claims EOS can make today. Each one has a test that
runs against real data.

### The household and who lives in it
- **One combined household, not an isolated account.** When two people confirm
  they live together, EOS adds up both pantries and divides by the real number
  of people. `household-test` (9), `household-consistency-test` (8).
- **Two-layer consent.** Living together does NOT grant access to medical
  profiles — they are two separate permissions. `household-consent-test`.
- **The same person registered twice is detected and flagged**, never merged
  automatically. `duplicate-person-test` (8).
- **Country-structured address** that becomes a point on the map and triggers
  "who else lives here". `address-flow-test` (9), `address` (unit).

> **Marketing angle:** this is the real technical differentiator and nobody is
> communicating it. "Your preparedness app counts your pantry. EOS counts your
> household's." is a true sentence and hard to copy.

### Pilot (the assistant)
- **Local deterministic engine** that answers with no network, with a verdict
  (`ready/watch/hold/act`). `pilot-abilities-test` (8), `rules-engine` (unit).
- **The critical rule overrides the AI.** The verdict is computed by rule, not
  by the model — the model cannot say "you can go" when the rule says no.
  `pilot-guard` (unit), `guardrails-test`.
- **An unknown household becomes WAIT, never GO.** A failed read never produces
  invented reassurance. `pilot-guard` (unit).
- **The same numbers on every screen**, and the conversation survives
  navigation. `pilot-one-truth-test` (7), `pilot-orb-test` (6).

> **Marketing angle:** "Pilot won't reassure you without a reason" is a safety
> promise, not a technology promise. It is worth more than "with AI".

### The family plan
- **Plan with meeting points, hand-drawn routes, roles and triggers**, with an
  offline plan card. `plan-editor-test` (14), `multi-plan-test`.
- **Routes are authored, never computed by a routing engine** — the value is in
  the family's agreement and local knowledge.
- **"Who picks up whom" reaches dependents without accounts** (the child, the
  grandmother). `plan-gaps-dependents` (unit, 9).
- **Nobody is left behind:** anyone who can't leave alone and has no one
  assigned becomes a warning. It warns without blocking the save.

### Circles
- **Roles (Admin/Editor/Viewer), invitation by link and by QR**, join requests
  with approval. `circles-page-test`, `circle-admin-test`, `invite-link-test`.
- **An invitation never grants access to a medical profile on its own** — it
  only marks it as "requested".
- **Shared circle location** with a stable marker. `circle-location-test`,
  `marker-stability-test`.

### Weather and map
- **Severe alerts (NWS), earthquakes (USGS), hurricanes (NHC), rain
  (Open-Meteo)** — all free and keyless. `weather-layers-test` (8),
  `hazards` (unit).
- **The provider says when it doesn't know** instead of inventing (with no
  active cyclone, it states there is none).
- **Map layers: dark, satellite, rain, alerts, wind, cyclone, flood, surge,
  wind impact, tornado**, and the choice survives a reload.

### Simulation / training
- **Shared scenarios with invitation**, and a debrief that checks the real plan.
  `simulation-share-test`.

### Notifications
- **Working push** with service worker registration. `push-test`,
  `notification-surface` (unit).

### Offline
- **Service worker, local copy of the plan, plan card drawn without network.**
  Proven inside `plan-editor-test`.

### Animated wind (Premium)
- **Animated particle layer using `requestAnimationFrame`**, its own scalar
  field, and controls for density, trail, opacity and tone.
  `lib/world/WindParticleLayer.ts`, mounted by
  `components/world-dashboard/WorldMap.tsx`, which is the map the current
  dashboard uses. Gated by `canAccess('animated_wind')`.
- Decided in D-141..D-144: users without Premium trigger no wide fetch, canvas
  or frame loop.

> **AUDIT CORRECTION (2026-08-11).** The first version of this document
> classified animated wind as PARTIAL, claiming it lived on an "unreachable
> legacy screen". That was wrong: `WorldV2` **imports** `WorldMap` from
> `components/world-dashboard/` — it is the same map, and the layer is live on
> the production dashboard. The error came from inferring from the directory
> name instead of following the import. A truth inventory that is wrong is
> worse than none, so the correction is recorded rather than erased.

### Education (EDU)
- **Knowledge base with FEMA, Red Cross, WHO, SAS, SAMHSA and NCTSN** and
  semantic search. `edu`, `edu-rag`, `edu-actions` (unit).

---

## 2. EXISTS — works, no dedicated test

Use in campaigns with less specificity, or request a test first.

- Personal emergency profile with a public QR code (`/ficha/[id]`)
- Resource inventory (water, food, fuel, battery, kit, communication)
- Generated and scenario-based checklist
- Comms: circle messages, radio profiles
- Affiliate program and gift codes (`affiliate` unit)
- Stripe billing: checkout, portal, webhook, redemption
- Pilot telemetry without conversation content (D-132)
- Play Store preparation: TWA manifest, maskable icon, assetlinks
  (`twa-manifest` unit)

---

## 3. PARTIAL — the promise must be rewritten

| Advertised today | What is true |
| --- | --- |
| "Air quality **(AirNow)**" | AQI exists and works, but it comes from **Open-Meteo**. And it is not gated: every user already sees it. Rewrite as "Air quality" and decide whether it really is free |
| "Disasters **and shelters** (FEMA)" | **Shelters: real** (FEMA National Shelter System, and the code refuses to promise a bed or accessibility from a feed that doesn't carry that data). **Disaster declarations: do not exist.** Rewrite as "Active shelters (FEMA)" |
| "Multiple circles" (Premium) | There is no limit in the code: **everyone already can**. Not a delivery failure, but Premium gives nothing here |
| "Critical push notifications" (Premium) | Works, but the cron **does not check the plan** — it sends to every subscriber |

---

## 4. DOES NOT EXIST — remove from all material

Advertised in the plan table and/or on the landing page, without a line of code:

- **"Satellite wildfires (NASA)"** — no NASA FIRMS anywhere
- **"Outbreak surveillance (CDC)"** — nonexistent
- **"Drug recalls (FDA)"** — no openFDA
- **"Alert history (30 days)"** — no table, no screen, no route
- **"Export profile as PDF"** — the project's `pdf-parse` **reads** PDFs (the
  knowledge base); it does not generate them

**Consequence for the product, not just the copy:** of Premium's six
differentiators, **three do not exist** (CDC, FDA, history), neither does the
PDF, and two are delivered to everyone in practice (push, multiple circles).
That leaves **one real exclusive: the animated wind layer** — which is good,
technical and defensible, but it is a map feature carrying an entire plan.

**Premium must be rethought before any campaign that sells it.** This is not a
copy problem: it is a plan with a single differentiator.

---

## 5. ROADMAP — only as "coming soon"

From the roadmap: 141 tasks complete, 16 blocked. The blocked ones form a
coherent block and are vision material, never present tense:

- **Native app** (M-T01..T08): on-device AI with llama.rn, survival mode with no
  server, store submission
- **LoRa mesh** (P4-T01..T04): device-to-device communication without a
  network via ESP32
- **CarPlay / Android Auto** (AUTO-T00..T03)
- **Sentry** (P1-T07) — error logging is currently done in our own Postgres
- **Optional provider keys** (WeatherKit, Xweather/lightning)

> **Marketing caution:** "works without a network" is true today **on the
> device** (local engine, offline plan, plan card). "Communicates without a
> network between people" is the LoRa mesh, and it **does not exist**. The gap
> between those two sentences is the gap between an honest promise and a
> lawsuit.

---

## 6. What I would take to the campaign

Three strong claims, true and verifiable today:

1. **"EOS counts your household, not your account."** Adding up the pantry of
   everyone who lives together, dividing by the real number of people, and
   never inflating. Nobody in the market does this, and it can be shown on one
   screen.
2. **"It won't reassure you without a reason."** The verdict comes from a
   deterministic rule; an unknown household becomes "wait", never "go". It is
   a promise of character, and the code backs it.
3. **"It answers with the network down."** Local engine, offline copy of the
   plan, plan card drawn without network.

And one positioning question that must be answered before the copy:
**does the buyer arrive through fear (an approaching event) or through
identity (prepper, new parent, caregiver)?** Both buy, but through different
channels, moments and prices.

---

## Maintenance

This document ages with every release. The rule:

- Whoever moves a feature between levels **updates this table in the same commit**
- A feature only moves up to **PROVEN** when a named test exists
- Every approved campaign cites the line of this document that supports it
