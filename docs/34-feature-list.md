# EOS Complete Feature List

> **What this document is.** The enumeration, without opinion. Each line is a
> capability that exists in the code, with where it lives, who can use it and
> what proves it.
>
> The critical reading — what is worth selling, what needs rewriting, what
> doesn't exist — is in [33-truth-inventory.md](33-truth-inventory.md).
> This is only the inventory.
>
> **Method.** Enumerated by cross-checking four sources from the code itself,
> not the documentation: 34 screens, 70 API routes, 37 database tables and 17
> plan gates. Surveyed on 2026-08-12.

## Legend

| Symbol | Meaning |
| --- | --- |
| **T** | Has a named automated test |
| **C** | Exists in the code, no dedicated test |
| **G** | Exists only as a plan gate — **not implemented** |
| — | Free for every user |
| **F** | Requires the Family plan |
| **P** | Requires the Premium plan |

---

## 1. Account and identity

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 1.1 | Sign-up with email and password | `/auth/signup` | — | C |
| 1.2 | Login | `/auth/login` | — | C |
| 1.3 | Email verification | `/auth/verify` | — | C |
| 1.4 | Password recovery | `/auth/forgot-password`, `/auth/update-password` | — | C |
| 1.5 | Initial onboarding (profile + family) | `/onboarding` | — | C |
| 1.6 | Account and data deletion | `/api/account/delete` | — | C |
| 1.7 | Language switch pt-BR / en | global (`lib/i18n`) | — | C |

## 2. Emergency profile

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 2.1 | Master profile: personal data, blood type, allergies, medications, medical notes, emergency contact | `/ficha` | — | C |
| 2.2 | Profile completeness percentage | `/ficha` | — | C |
| 2.3 | Country-structured address (US/Brazil), with unit field | `/ficha` → `/api/household/address` | — | **T** `address-flow-test` (9), `address` (unit) |
| 2.4 | Address geocoded to a map point | `/api/household/address` | — | **T** same |
| 2.5 | "Who else lives at this address", branching: has a phone → invitation; no phone → dependent | `/ficha` | — | **T** `one-door-test` (6) |
| 2.6 | Profile photo | `/api/profile/personalization/photo` | — | C |
| 2.7 | Pilot personalization and confirmed memory | `/api/profile/personalization` | — | C |
| 2.8 | **Public profile QR** for first responders | `/ficha/[id]` | **F** | C |
| 2.9 | Export profile as PDF | — | **P** | **G — does not exist** |

## 3. The household

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 3.1 | Dependents registry (name, age, conditions, medications, mobility, infant) | `/family/cadastro` | — | **T** `roster-page-test` (11) |
| 3.2 | AI-suggested medical tags | `/api/family-members/suggest-tags` | — | C |
| 3.3 | Link a dependent to a circle account | `/api/family-members/[id]/link` | — | **T** `duplicate-person-test` |
| 3.4 | Confirm that a circle member lives in the same household | `/api/circles/[id]/household` | **F** | **T** `household-test` (9) |
| 3.5 | Combined pantry of people living together | `/api/household` | **F** | **T** `household-test`, `household-consistency-test` (8) |
| 3.6 | Autonomy = min(water, food) divided by the real number of people | `lib/household.ts` | — | **T** `household` (unit) |
| 3.7 | Living together does **not** grant access to the medical profile (separate consent) | `/api/circles/[id]/family-access` | — | **T** `household-consent-test` |
| 3.8 | Duplicate person detection, never merged automatically | `/family`, `/api/household` | — | **T** `duplicate-person-test` (8), `same-person` (unit, 11) |
| 3.9 | A pending invitation closes itself when the person joins | `lib/household.ts` | — | **T** `duplicate-person-test` |
| 3.10 | Single "who lives here" list: accounts, dependents and invitees together | `/family/cadastro` | — | **T** `one-door-test` |
| 3.11 | Circle profile reading with controlled scope | `/api/circles/[id]/members/[userId]` | — | **T** `circle-admin-test` |

## 4. Inventory and preparedness

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 4.1 | Inventory: water, food, fuel, battery, medical kit, communication | `/inventory`, `/api/inventory` | — | C |
| 4.2 | Share inventory with the household | `circle_members.share_inventory` | **F** | **T** `household-test` |
| 4.3 | Preparedness checklist | `/checklist`, `/api/checklist` | — | C |
| 4.4 | Checklist generation by scenario | `/api/checklist/generate` | — | C |
| 4.5 | Mark item as acquired | `/api/checklist/toggle` | — | C |
| 4.6 | Save items suggested by Pilot | `/api/checklist/save-items` | — | **T** `pilot-abilities-test` |
| 4.7 | Preparedness screen: autonomy, gaps, readiness | `/preparedness` | — | C |
| 4.8 | AI readiness score | `/api/ai/readiness` | — | C |
| 4.9 | Water/food (lasts) separated from battery/fuel (enables) | `/dashboard` | — | C |

## 5. Pilot (the assistant)

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 5.1 | Open conversation with Pilot | orb, every screen | — | **T** `pilot-abilities-test` (8) |
| 5.2 | Five quick intents (now / stay or leave / how long / what's missing / can I leave) | orb | — | **T** same |
| 5.3 | Local deterministic engine, answers without network | `components/world-v2/pilot-engine.ts` | — | **T** `rules-engine` (unit) |
| 5.4 | Deterministic verdict overrides the AI | `lib/pilot-guard.ts` | — | **T** `pilot-guard` (unit), `guardrails-test` |
| 5.5 | Unknown household becomes "wait", never "go" | `lib/pilot-guard.ts` | — | **T** `pilot-guard` |
| 5.6 | Streaming answer, word by word | `/api/pilot/chat?stream=1` | — | C |
| 5.7 | Pilot turns into a checklist task with one tap | Pilot | — | **T** `pilot-abilities-test` |
| 5.8 | Pilot proposes a memory/preference for confirmation | Pilot | — | C |
| 5.9 | Pilot delivers a real destination with verified coordinates | `/api/pilot/chat` | — | **T** `pilot-abilities-test` |
| 5.10 | "See on map" draws the route | `/dashboard` | — | C |
| 5.11 | Same numbers on every screen; conversation survives navigation | global | — | **T** `pilot-one-truth-test` (7) |
| 5.12 | Identical orb on every screen, draggable outside the dashboard | global | — | **T** `pilot-orb-test` (6) |
| 5.13 | Plan review by Pilot | `/plan` | — | **T** `plan-pilot-review` (unit) |
| 5.14 | Pilot telemetry without conversation content | `/api/pilot/metrics` | — | **T** `pilot-metrics-test` (9), `pilot-metrics` (unit, 17) |
| 5.15 | Usage limit (12/min, 200/day) with a human message | `lib/rate-limit.ts` | — | **T** `guardrails-test` |

## 6. Family plan

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 6.1 | Meeting points (front door, neighborhood, out of town) | `/plan` | — | **T** `plan-editor-test` (14) |
| 6.2 | Hand-drawn routes (on foot / by car) | `/plan` | — | **T** same |
| 6.3 | Roles: who does what | `/plan` | — | **T** same |
| 6.4 | "Who picks up whom" reaches dependents without accounts | `/plan` | — | **T** `plan-gaps-dependents` (unit, 9) |
| 6.5 | "Nobody is in charge of X" warning without blocking the save | `/plan` | — | **T** same |
| 6.6 | Triggers: condition → action | `/plan` | — | **T** `plan-editor-test` |
| 6.7 | Gaps that block saving (meeting point, roles) | `/plan` | — | **T** `plan-envelope`, `plan-execution` (unit) |
| 6.8 | Per-member read confirmation, with version | `/api/plans/[id]/ack` | — | **T** `plan-editor-test` |
| 6.9 | Plan card drawn offline | `/plan` | — | **T** same |
| 6.10 | Plan per circle, multiple plans | `/api/circles/[id]/plans` | — | **T** `multi-plan-test` |
| 6.11 | Map point confirmed without typing | `/plan` | — | **T** `plan-editor-test` |
| 6.12 | Plan drill | `lib/plan-drill.ts` | — | **T** `plan-drill` (unit) |

## 7. Circles

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 7.1 | **Create** a circle | `/circles` | **F** | **T** `circles-page-test` |
| 7.2 | Join by invitation code | `/circles`, `/convite/[code]` | — | **T** `invite-link-test` |
| 7.3 | Join by QR | `/circles` | — | C |
| 7.4 | Search a circle by name | `/api/circles/search` | — | C |
| 7.5 | Join request with approval | `/api/circles/[id]/requests` | — | **T** `circles-page-test` |
| 7.6 | Admin / Editor / Viewer roles | `/circles` | — | **T** `circle-admin-test` |
| 7.7 | Invitation never grants a profile on its own (only "requested") | `/api/circles/join` | — | **T** `invite-link-test` |
| 7.8 | Leave a circle | `/api/circles/[id]/leave` | — | C |
| 7.9 | Share a circle | `/api/circles/[id]/share` | — | C |
| 7.10 | Monitor members' location | `/api/circles/[id]/monitoring` | **F** | **T** `circle-location-test` |
| 7.11 | Stable map marker (doesn't jump) | `/dashboard` | — | **T** `marker-stability-test` |
| 7.12 | Circle notifications | `/api/circles/[id]/push` | — | C |
| 7.13 | Circle action plans | `circle_action_plans` | — | C |
| 7.14 | Belong to multiple circles | — | **P** | **G — no limit in the code: everyone already can** |

## 8. World / map / weather

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 8.1 | Risk index with state (safe/watch/warning/critical) | `/dashboard` | — | C |
| 8.2 | Severe weather alerts (NWS) | `/api/hazards` | — | **T** `hazards` (unit) |
| 8.3 | Earthquakes (USGS) | `/api/hazards` | — | **T** same |
| 8.4 | Hurricanes / cyclones (NHC) with cone | `/api/world/cyclones` | — | **T** `weather-layers-test` (8) |
| 8.5 | Rain / nowcast (Open-Meteo) | `/api/world/radar` | — | **T** same |
| 8.6 | Gridded wind, with arrows on the map | `/api/world/wind` | — | **T** same |
| 8.7 | **Animated wind layer** (particles + scalar field) | `/dashboard` | **P** | C — `lib/world/WindParticleLayer.ts` |
| 8.8 | Layers: dark, satellite, rain, alerts, wind, cyclone, flood, surge, wind impact, tornado | `/dashboard` | — | **T** `weather-layers-test` |
| 8.9 | Layer choice survives a reload | `/dashboard` | — | **T** same |
| 8.10 | Open shelters (FEMA National Shelter System) | `/api/shelters` | **F** | C |
| 8.11 | Air quality (AQI, via Open-Meteo) | `/dashboard`, `/weather` | — | C — **not gated today** |
| 8.12 | Place search / geocoding | `/api/geocode/search` | — | C |
| 8.13 | Dedicated weather screen | `/weather` | — | C |
| 8.14 | Resting verdict strip (worst of weather and household) | `/dashboard` | — | **T** `resting-verdict` (unit, 20) |
| 8.15 | Provider health | `provider_health`, `/api/health` | — | C |
| 8.16 | Satellite wildfires (NASA FIRMS) | — | **F** | **G — does not exist** |
| 8.17 | Disaster declarations (FEMA) | — | **F** | **G — does not exist** |
| 8.18 | Outbreak surveillance (CDC) | — | **P** | **G — does not exist** |
| 8.19 | Drug recalls (FDA) | — | **P** | **G — does not exist** |
| 8.20 | Alert history (30 days) | — | **P** | **G — does not exist** |
| 8.21 | Separate operational NHC layers (center, track, points, cone, past track, watches/warnings, wind radii, WSP, arrival time, outlook + legend) | `/dashboard`, `/api/world/cyclones` | — | **T** `weather-layers-test` 20/20 + real provider D-227 |

## 9. Scenarios and simulation

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 9.1 | Scenario library | `/scenario`, `scenarios` | — | C |
| 9.2 | Simulation session with sources taken down | `/api/simulation` | — | C |
| 9.3 | Training invitation (the family accepts; it isn't enrolled) | `/sim/[token]` | — | **T** `simulation-share-test` |
| 9.4 | Natural-language panels | `/api/simulation/parse` | — | C |
| 9.5 | Debrief that checks the plan | `components/SimulationDebrief.tsx` | — | C |
| 9.6 | Preparedness actions from the simulation | doc 24 | — | C |

## 10. Comms

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 10.1 | Circle messages | `/comms`, `/api/comms/messages` | — | C |
| 10.2 | Radio profiles (agreed frequencies) | `/api/comms/radio` | — | C |
| 10.3 | Notification inbox | `/api/comms/notifications` | — | **T** `notification-surface` (unit) |
| 10.4 | Ping the family | `/api/family/ping` | — | C |

## 11. Notifications

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 11.1 | Push subscription (Web Push / VAPID) | `/api/push/subscribe` | — | **T** `push-test` |
| 11.2 | Daily weather alert cron (11:00 UTC) | `/api/cron/weather-notifications` | **P** | C — **does not check the plan today** |
| 11.3 | Delivery log | `notification_delivery_log` | — | C |
| 11.4 | Per-user hazard preferences | `user_hazard_preferences` | — | C |

## 12. Education (EDU)

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 12.1 | Knowledge base: FEMA, Red Cross, WHO, SAS, SAMHSA, NCTSN, CDC, Military FM, Navy SEAL, Seymour | `/edu` | — | **T** `edu` (unit) |
| 12.2 | Semantic search (pgvector) | `lib/knowledge.ts` | — | **T** `edu-rag` (unit) |
| 12.3 | Content becomes a preparedness action | `/api/edu/actions` | — | **T** `edu-actions` (unit) |
| 12.4 | View counts | `/api/edu/views` | — | C |
| 12.5 | Admin curation/ingestion | `/admin/edu` | admin | C |

## 13. Billing

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 13.1 | Stripe checkout | `/api/billing/checkout` | — | C |
| 13.2 | Customer portal (cancel, change card) | `/api/billing/portal` | — | C |
| 13.3 | Reconciliation webhook | `/api/billing/webhook` | — | C |
| 13.4 | Gift codes with expiration and automatic downgrade | `/api/billing/redeem`, `lib/plan.ts` | — | C |
| 13.5 | Affiliate program: codes, referrals, conversions | `/admin/affiliates` | — | **T** `affiliate` (unit) |
| 13.6 | Three plans: free / family / premium | `lib/feature-gates.ts` | — | C |
| 13.7 | Published refund policy | `/refund` | — | C |

## 14. Operations and trust

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 14.1 | Server error logging in Postgres | `/api/errors`, `error_log` | — | **T** `error-grouping-test` |
| 14.2 | Browser error capture | `/api/client-error` | — | **T** `client-error-test` |
| 14.3 | Automatic grouping by fingerprint | `lib/error-fingerprint.ts` | — | **T** `error-fingerprint` (unit) |
| 14.4 | Push alert to the owner on a new error | cron | — | C |
| 14.5 | Atomic request limit in Postgres | `rate_limit_buckets` | — | **T** `guardrails-test` |
| 14.6 | Real health check (not `head:true`) | `/api/health` | — | C |
| 14.7 | Admin status panel | `/admin/status` | admin | C |
| 14.8 | Cross-device sync + offline queue | Realtime | — | C |

## 15. Platform

| # | Feature | Where | Plan | Proof |
| --- | --- | --- | --- | --- |
| 15.1 | Installable PWA with service worker | `public/manifest.json` | — | **T** `twa-manifest` (unit, 10) |
| 15.2 | Maskable icon inside the safe zone | `scripts/make-maskable-icon.py` | — | **T** same, measured in pixels |
| 15.3 | Long-press shortcuts (Profile, Plan, Preparedness) | manifest | — | **T** same |
| 15.4 | Digital Asset Links for TWA, by environment variable | `/.well-known/assetlinks.json` | — | **T** same |
| 15.5 | Works offline (local engine, plan copy, plan card) | global | — | **T** `plan-editor-test` |
| 15.6 | Bottom navigation with 7 destinations | `components/BottomNav.tsx` | — | **T** `bottom-nav-test` |

---

## 16. Count

Counted from the tables above, not estimated.

| Category | Count |
| --- | --- |
| Features with an automated test (**T**) | 71 |
| Features in code without a dedicated test (**C**) | 59 |
| Advertised and **not implemented** (**G**) | 7 |
| **Total features** | **137** |
| Roadmap items (section 17, separate) | 7 |

**The seven not implemented**, all present in the plan table customers see today:

| # | Advertised as | Plan |
| --- | --- | --- |
| 2.9 | Export profile as PDF | Premium |
| 7.14 | Belong to multiple circles | Premium (no limit in the code: everyone already can) |
| 8.16 | Satellite wildfires (NASA) | Family |
| 8.17 | Disaster declarations (FEMA) | Family |
| 8.18 | Outbreak surveillance (CDC) | Premium |
| 8.19 | Drug recalls (FDA) | Premium |
| 8.20 | Alert history (30 days) | Premium |

---

## 17. Roadmap — does not exist, do not advertise in the present tense

| # | Feature | State |
| --- | --- | --- |
| 17.1 | Native iOS/Android app (llama.rn, on-device AI) | BLOCKED (M-T01..T08) |
| 17.2 | LOCAL_AI mode (model running on the device) | BLOCKED |
| 17.3 | LoRa mesh between devices, without a network (ESP32) | BLOCKED (P4-T01..T04) |
| 17.4 | CarPlay / Android Auto | BLOCKED (AUTO-T00..T03) |
| 17.5 | Sentry (error logging is currently our own, in Postgres) | DEFERRED (P1-T07) |
| 17.6 | Optional paid providers (WeatherKit, Xweather lightning) | DRAFT (LA-T03) |
| 17.7 | Conversion landing page v3 | DEFERRED (P3-T07) |

> **A caution worth repeating:** "works without a network" is true today **on
> the device**. "Communicates without a network **between people**" is 17.3,
> and it does not exist.

---

## Maintenance

- Whoever creates a feature adds its line here **in the same commit**
- A feature only gets **T** when a named test exists that exercises it
- A plan gate without an implementation is born as **G** and is forbidden in
  sales material until it becomes C or T
