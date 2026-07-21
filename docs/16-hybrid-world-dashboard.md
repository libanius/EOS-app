# 16 — Hybrid World Dashboard

> **Status:** SPEC / PRODUCT-ARCHITECTURE DECIDED — **IMPLEMENTATION AUTHORIZED 2026-07-21 (D-050)**; HWD-01→HWD-03 complete; HWD-04 blocked on privacy/data decisions
> **Decision:** D-047 (architecture) · D-050 (implementation authorization)
> **Date:** 2026-07-21
> **Owner:** Paulo Libânio Neto
> **Product:** EOS
> **Implementation gate:** ✅ cleared by owner on 2026-07-21 (D-050). First surface: isolated `/dashboard-world` route; production `/dashboard` untouched.
> **Related decisions/specs:** D-029, D-043, D-046, `docs/14-monitoring.md`, `docs/15-eos-pilot.md`

---

## 1. Executive Summary

The **Hybrid World Dashboard** is the planned next-generation situational interface for EOS.

It changes the Dashboard from a collection of isolated cards into a **world-as-interface experience**: the user opens EOS and sees the environment, family, threats, resources, routes, and recommendations composed directly over a geographic world view.

The selected architecture is hybrid:

1. **MapLibre GL JS** is the rendering engine.
2. High-quality replaceable terrain, vector, satellite, and imagery providers supply the visual base.
3. Official public data sources supply hazards and environmental intelligence.
4. EOS owns the meaningful overlays: Risk Index, family, shelters, routes, resources, scenarios, and Pilot.
5. The HUD is implemented as real application components, not baked into an image.
6. Higgsfield remains a visual-concept and cinematic-asset tool, not the runtime UI engine.

The main product principle is:

> The user should not feel that they opened a map. They should feel that they opened their environment.

The Hybrid World Dashboard does **not** authorize code changes by itself. The first implementation begins only after explicit owner approval.

---

## 2. Origin and Motivation

EOS already has a working Living Dashboard with real weather, risk calculation, alerts, readiness, family, resources, and timeline information. Its current structure is useful and technically valid, but it still presents the environment mainly as modules and cards.

The new concept emerged from a visual exploration that placed the following elements over an aerial view of Parkland, Florida:

- a cinematic geographic world;
- a Risk Index rail;
- family markers anchored to terrain;
- a recommended route toward a shelter;
- official alert tags attached to geographic areas;
- a Pilot recommendation capsule;
- a location summary centered over the territory;
- a compact environmental ticker.

The concept demonstrated that EOS can become more than a dashboard that reports data. It can become a **situational operating surface** that helps the user understand:

- where the risk is;
- how close it is;
- who may be affected;
- what resources are available;
- where to go;
- how much time remains;
- what action makes sense now.

This is aligned with the EOS North Star:

> Help the head of a family during the first 15 minutes of a crisis.

It also supports daily use through EOS Pilot.

---

## 3. Product Definition

### 3.1 Short definition

The Hybrid World Dashboard is a geographic situational interface that combines a real-time rendered world, official hazard data, EOS intelligence, family context, preparedness status, and Pilot recommendations in one interactive surface.

### 3.2 What it answers

The interface must answer five questions in a few seconds:

1. **What is happening?**
2. **Where is it happening?**
3. **Who and what may be affected?**
4. **What should I do next?**
5. **How much time or autonomy do I have?**

### 3.3 Functional split

The existing EOS product roles remain valid:

```text
Dashboard informs.
Pilot interprets.
Plan operationalizes.
World Dashboard spatializes all three.
```

The World Dashboard does not replace the Decision Engine, Pilot, monitoring, or action plans. It becomes the visual environment in which those systems are understood.

---

## 4. Non-Goals

The Hybrid World Dashboard is not:

- a generic map screen;
- a clone of Google Maps or Apple Maps;
- a GIS workstation;
- a military command interface;
- a decorative background with fake markers;
- a video with clickable hotspots;
- a static Higgsfield image used as the finished product;
- a replacement for EOS intelligence;
- a separate app;
- a separate Pilot tab;
- a reason to discard the current Dashboard before validation;
- permission to expose exact family locations without consent;
- permission to imply data accuracy that the providers do not support.

---

## 5. Core Design Philosophy

### 5.1 The world is the interface

Traditional dashboards place cards on a neutral background. The Hybrid World Dashboard uses the geographic environment as the primary information structure.

Information is not merely listed. It is anchored to the place where it matters.

Examples:

- a rip-current warning follows the coastline;
- a tropical system label sits near the storm region;
- a family member appears at the authorized location;
- a shelter route follows actual streets;
- a flood or fire overlay occupies its real geographic footprint;
- the center briefing identifies the current operating area.

### 5.2 Instrument, not entertainment

The visual language must feel premium and desirable, but the interface remains an instrument.

It should feel:

- precise;
- calm;
- trustworthy;
- spatially intelligent;
- automotive-grade;
- usable under pressure.

It must not feel:

- playful;
- game-like;
- overloaded;
- cyberpunk;
- neon-heavy;
- theatrical at the expense of truth.

### 5.3 Beauty serves comprehension

Cinematic atmosphere is allowed only when it improves orientation or emotional readiness.

Examples of acceptable atmospheric use:

- darkening the horizon when a real severe-weather state exists;
- subtle cloud or precipitation layers representing real conditions;
- state-aware color grading;
- restrained route glow;
- smooth camera movement toward relevant geography.

Atmosphere must never fabricate a storm, fire, flood, or threat.

### 5.4 Every layer must be removable

The architecture must separate rendering, data, and product overlays so that each can be replaced without rewriting the entire Dashboard.

The map engine must not own EOS product logic.

---

## 6. Decision D-047 — Hybrid Rendering Architecture

### 6.1 Decision

EOS will use a hybrid map architecture:

```text
EOS application
    ↓
MapLibre GL JS renderer
    ↓
Replaceable vector / terrain / satellite providers
    ↓
Official environmental and hazard sources
    ↓
EOS-owned geographic overlays
    ↓
EOS HUD and Pilot components
```

### 6.2 Why MapLibre is the renderer

MapLibre is selected as the rendering abstraction because it provides:

- open-source rendering;
- WebGL acceleration;
- vector and raster layers;
- 3D terrain support;
- building extrusion support;
- camera pitch, bearing, zoom, and animation;
- GeoJSON sources;
- symbol, line, fill, heatmap, and raster layers;
- provider independence;
- compatibility with a Next.js web/PWA implementation;
- a path toward lower long-term vendor lock-in.

### 6.3 Why the approach is hybrid

A single-provider implementation would be faster initially but would couple rendering, visual assets, usage pricing, and provider policy.

The hybrid model separates:

- **renderer** — MapLibre;
- **base visual data** — replaceable provider;
- **hazard data** — official or configured providers;
- **EOS intelligence** — existing risk and decision systems;
- **EOS product experience** — proprietary overlays and HUD.

### 6.4 Quality requirement

Choosing MapLibre must not be interpreted as accepting lower visual quality.

The quality target remains equivalent to a premium Mapbox-style interface through:

- high-quality imagery and terrain sources;
- custom map styling;
- state-aware color grading;
- carefully tuned camera parameters;
- controlled label density;
- custom EOS symbols and markers;
- atmospheric overlays;
- premium glass HUD components;
- smooth transitions and animation.

The renderer does not define the finished appearance. EOS does.

---

## 7. Provider Strategy

### 7.1 Initial preferred configuration

The first live-map prototype should evaluate:

```text
MapLibre GL JS
+
MapTiler or another high-quality compatible tile/terrain provider
+
optional satellite imagery layer
```

This is a starting configuration, not a permanent lock-in.

### 7.2 Provider interface

The implementation should define provider-neutral configuration for:

- style URL;
- vector tile source;
- raster/satellite source;
- terrain DEM source;
- geocoding;
- routing;
- traffic, if used;
- attribution;
- usage limits.

### 7.3 Future alternatives

Potential future providers include:

- MapTiler;
- Stadia Maps;
- Protomaps;
- OpenStreetMap-compatible providers;
- self-hosted PMTiles;
- specialized satellite or weather imagery providers;
- Mapbox sources when commercial or visual requirements justify them.

### 7.4 Provider substitution principle

EOS should be capable of changing the visual base without changing:

- Risk Index logic;
- Pilot logic;
- family status model;
- route recommendation model;
- hazard normalization;
- scenario state;
- HUD components.

---

## 8. Reference Visual Composition

The approved concept contains five major regions.

### 8.1 World background

A cinematic, tilted aerial view of Parkland and the surrounding South Florida environment:

- neighborhoods, roads, lakes, and canals visible;
- Atlantic coastline visible toward the left/east side;
- Everglades and distant weather system visible toward the right/southwest horizon;
- overcast pre-storm atmosphere;
- sufficient negative space for overlays;
- real geographic orientation when implemented live.

### 8.2 Left Status Rail

A tall, light-colored, rounded panel acting as the primary status instrument.

Content:

- connectivity and device/battery status;
- large Risk Index score;
- risk-state label;
- simplified household model or household-status visualization;
- family autonomy estimate;
- resource bars;
- state selector/legend: Clear, Watch, Warning/Critical as applicable.

The rail is a real component. It must not be embedded into the map image.

### 8.3 Pilot Capsule

A compact frosted-glass capsule at the top center.

Example:

```text
PILOT
Storm window opens in 40 min — secure loose items,
top up generator fuel.

[Checklist] [Notify family]
```

The capsule may expand into a deeper Pilot briefing but remains integrated into the Dashboard.

### 8.4 Central Location Brief

A location heading anchored visually to the operating area.

Example:

```text
Parkland
Severe Thunderstorm Watch · until 8:40 PM
[Open scenario]
```

This is not a decorative title. It represents the selected monitored location and its highest relevant current condition.

### 8.5 Environmental Ticker

A compact dark dock at the bottom center.

Example fields:

- temperature;
- wind;
- AQI;
- UV;
- tide;
- barometric pressure;
- grid/layers control.

It should remain concise and glanceable.

---

## 9. Information Hierarchy

The default priority order is:

```text
1. Priority safety override
2. Pilot action recommendation
3. Current risk state
4. Active scenario / official alert
5. Family status and location confidence
6. Route or shelter recommendation
7. Household autonomy and resources
8. Environmental context
9. Secondary map details
```

The visual hierarchy must change dynamically when the situation changes.

Example:

- During SAFE state, Pilot and daily context can be prominent.
- During WATCH, risk, timing, and preparation become more prominent.
- During WARNING, official alert, family, and action route dominate.
- During CRITICAL, nonessential information collapses and the immediate plan takes priority.

---

## 10. Dashboard Operating States

The World Dashboard must support at least these states:

### 10.1 SAFE

Purpose: awareness and daily utility.

Characteristics:

- neutral or green semantics;
- broader world view;
- calm camera;
- Pilot may suggest activities;
- low-density hazard overlays;
- resource status remains available but secondary.

### 10.2 WATCH

Purpose: preparation and timing.

Characteristics:

- amber semantics;
- threat window visible;
- relevant geo-alerts enabled;
- Pilot issues preparation recommendation;
- family and resource readiness elevated;
- shelter route may be available but not dominant.

### 10.3 WARNING

Purpose: decisive action.

Characteristics:

- orange/red semantics according to the existing risk token system;
- official alert becomes prominent;
- family status and route are elevated;
- secondary daily-use modules reduce prominence;
- camera may frame the threat and affected area together;
- Pilot transitions to action-oriented language.

### 10.4 CRITICAL

Purpose: immediate life-safety action.

Characteristics:

- `PRIORITY OVERRIDE` behavior;
- only essential actions remain prominent;
- exact action, time, family status, destination, and route dominate;
- decorative atmospheric motion is minimized;
- accessibility and performance take priority over visual richness.

### 10.5 RESPONSE

Purpose: execution and re-evaluation.

Characteristics:

- action-plan progress;
- live route or safe-position context;
- family acknowledgments;
- checkpoints and return triggers;
- offline-aware state.

### 10.6 RECOVERY

Purpose: post-event assessment.

Characteristics:

- affected-area overlays;
- resource damage and needs;
- family status confirmation;
- safe-return guidance;
- timeline of resolved and remaining hazards.

---

## 11. Camera Language

Camera behavior is part of the information architecture.

### 11.1 Default perspective

The World Dashboard should use a pitched perspective rather than a standard top-down map.

Initial target ranges for prototype evaluation:

- pitch: approximately 45°–70°;
- bearing: selected to reveal coastline, roads, terrain, and threat direction;
- zoom: enough to recognize the monitored community without losing regional context;
- horizon: visible only when it adds meaningful spatial context.

These values are design targets, not hardcoded requirements.

### 11.2 Camera modes

```text
REGIONAL AWARENESS
Shows monitored area plus incoming regional threat.

LOCAL OPERATIONS
Shows neighborhood, family markers, routes, and nearby shelters.

FAMILY FOCUS
Frames selected family member and relevant route/context.

THREAT FOCUS
Frames the official hazard footprint and user location.

ROUTE FOCUS
Fits current position, destination, and full recommended route.

CRITICAL LOCK
Prevents unnecessary camera movement while urgent instructions are active.
```

### 11.3 Motion rules

- Camera motion must communicate a change of focus.
- Avoid movement without user or state justification.
- Avoid continuous drifting that interferes with reading.
- Respect `prefers-reduced-motion`.
- Critical mode uses faster, shorter, and clearer transitions.
- The map must remain usable during animation interruption.

---

## 12. Map and World Layers

Layers are organized into five groups.

### 12.1 Base layers

- terrain;
- water;
- roads;
- land use;
- buildings;
- satellite imagery;
- labels;
- administrative boundaries.

### 12.2 Environmental layers

- radar or precipitation;
- cloud cover;
- wind field;
- temperature;
- air quality;
- visibility;
- tides and marine context;
- daylight/sunset context.

### 12.3 Hazard layers

- official NWS alerts;
- tropical systems;
- earthquakes;
- wildfire/FIRMS;
- flood zones and flood warnings;
- rip-current/coastal hazards;
- lightning where a valid provider is configured;
- FEMA/IPAWS when configured;
- road closures or unsafe-route inputs when available.

### 12.4 EOS operational layers

- family members;
- home/base location;
- shelters;
- recommended routes;
- alternate routes;
- resource caches or approved locations;
- circle members and monitored locations;
- action-plan checkpoints;
- scenario-specific regions;
- EOS-calculated risk zones.

### 12.5 Interface layers

- geo-anchored labels;
- floating alert tags;
- selected-object callouts;
- camera-focus indicators;
- route destination badge;
- map layer controls;
- location confidence indicators.

---

## 13. EOS Risk Index Integration

The existing `RiskProvider` remains the initial source of current Risk Index state.

The World Dashboard consumes:

- score;
- state;
- factors;
- escalation projection;
- weather snapshot;
- loading/error/location status.

The map must not independently invent a second Risk Index.

### 13.1 Spatial representation

Risk may be represented through:

- Status Rail score;
- state-aware color semantics;
- geographic hazard footprints;
- threat-direction labels;
- projected timing;
- affected-route highlighting;
- relevant-area shading.

### 13.2 Honesty requirement

The global Risk Index may be based on the monitored location while individual overlays have different spatial resolution.

The UI must distinguish:

- official geographic alert;
- observed condition;
- forecast condition;
- EOS-derived risk;
- user-reported status.

These must not be visually conflated.

---

## 14. Pilot Integration

The Hybrid World Dashboard implements the role defined in `docs/15-eos-pilot.md`.

### 14.1 Pilot modes on the Dashboard

```text
DISCOVERY
What's the plan?

OPPORTUNITY
Good conditions for the selected activity.

ADVISORY
Activity is possible within limits.

WAIT
A better time window is approaching.

AVOID
Current conditions do not support the plan.

PRIORITY OVERRIDE
Safety condition supersedes recreation or routine.
```

### 14.2 Spatial Pilot behavior

Pilot may:

- identify the best time window;
- highlight a destination or area;
- show a route;
- identify the primary threat direction;
- suggest a shelter or return route;
- open a checklist;
- notify family;
- open the full Scenario screen;
- create a plan after user confirmation.

### 14.3 Pilot must not

- behave as a generic floating chat box;
- cover critical geographic context;
- imply certainty not supported by data;
- override official alerts or deterministic safety rules;
- silently share family location;
- autonomously initiate irreversible actions.

---

## 15. Family Layer

### 15.1 Marker content

A family marker may include:

- authorized profile photo or initials;
- first name;
- semantic location label, such as `COLLEGE` or `SITE`;
- status dot;
- age of last update;
- battery when available and authorized;
- location-confidence indicator.

### 15.2 Status semantics

```text
GREEN
Reported/observed normal.

AMBER
Needs attention, stale update, or contextual concern.

RED
Possible danger or explicit distress state.

GRAY
Location unavailable, permission missing, offline, or stale beyond threshold.
```

A green dot must never mean absolute safety. It means the currently defined normal/connected state.

### 15.3 Privacy principles

- Location sharing is opt-in.
- Precision is configurable.
- The map must show permission and freshness honestly.
- Semantic locations may be shown instead of exact coordinates.
- Children and sensitive members require conservative defaults.
- Exact coordinates must not appear in screenshots, notifications, or public surfaces by default.
- Location history retention must be separately specified before implementation.

### 15.4 Interaction

Selecting a family marker can open:

- current status;
- last update;
- contact action;
- route estimate;
- relevant alert exposure;
- acknowledgment state;
- safe-location or home route.

---

## 16. Shelter and Route Layer

### 16.1 Route role

A recommended route is not merely navigation. It is a risk-aware operational recommendation.

The future route decision may consider:

- official closures;
- flooding;
- fire;
- hazard polygons;
- travel time;
- shelter status and capacity when available;
- family starting locations;
- user mobility constraints;
- fuel and vehicle context;
- route confidence.

### 16.2 Prototype route

The first visual prototype may use controlled GeoJSON mock data.

The first functional map prototype must clearly label mocked routes and must not present them as live evacuation guidance.

### 16.3 Route visual language

- primary recommended route: soft green unless risk semantics require another treatment;
- alternate route: restrained neutral or dashed line;
- blocked/unsafe segment: red/orange with explicit reason;
- route direction should be legible without excessive animation;
- destination badge includes distance and type;
- route glow must remain restrained.

---

## 17. Household Status Rail

The left rail translates the current home and family posture into one glanceable instrument.

### 17.1 Required content

- current Risk Index;
- risk-state label;
- family autonomy estimate;
- water status;
- food status;
- energy/fuel status;
- medical status;
- optional communications status;
- connectivity and device status;
- current state marker.

### 17.2 Autonomy calculation

The first version should reuse the existing readiness/inventory logic where possible.

A future autonomy model must specify:

- household size;
- water consumption assumption;
- food coverage;
- energy/fuel dependencies;
- medication constraints;
- special-needs factors;
- confidence and missing-data behavior.

The interface must avoid presenting a single autonomy number as exact when required inputs are missing.

### 17.3 Household visualization

The concept includes a minimal 3D house.

Implementation options:

1. lightweight static 3D render with state dots;
2. SVG/isometric home model;
3. small WebGL model;
4. contextual home silhouette generated from profile characteristics.

The first implementation should prefer SVG or optimized static assets for performance and clarity.

---

## 18. Alert Representation

### 18.1 Geo-anchored tags

Examples:

```text
RIP CURRENT · UNTIL 8 PM
TROPICAL SYSTEM · GULF · SAT
FLOOD WARNING · EAST DISTRICT
```

Tags must be attached to relevant geography and remain readable during camera changes.

### 18.2 Alert provenance

Every expanded alert must identify:

- source/provider;
- official vs EOS-derived status;
- issue time;
- expiration time;
- affected area;
- severity;
- recommended action;
- last refresh.

### 18.3 Aggregation

The top-right counter displays the number of relevant active alerts, not the total number of all provider events.

Relevance must use the existing hazard normalization and location-aware monitoring model.

---

## 19. Visual Language

### 19.1 Desired references

The design may draw principles from:

- Tesla and Polestar navigation surfaces;
- Garmin MARQ instrument precision;
- Rivian outdoor/automotive interfaces;
- premium aviation and marine instruments;
- Apple-level hierarchy and restraint.

These are references for principles, not assets to copy literally.

### 19.2 Materials

- frosted glass;
- soft dark glass;
- bone-white text;
- restrained metal details;
- clean white status rail;
- subtle shadow and depth;
- state-aware amber, green, orange, and red.

### 19.3 Color semantics

Initial semantic direction:

```text
SAFE       soft green
WATCH      amber
WARNING    orange/red according to existing EOS tokens
CRITICAL   red with high-contrast action treatment
NEUTRAL    bone white / graphite / transparent glass
FAMILY OK  soft green
UNKNOWN    gray
ROUTE      soft green when recommended and safe
```

The implementation must reuse or formally extend `components/v2/tokens` rather than creating conflicting risk colors.

### 19.4 Typography

- large location name may use an elegant display face only if readability is preserved;
- operational values use DM Mono or the canonical EOS numeric type;
- body and actions use DM Sans or canonical EOS text face;
- alerts use concise, high-contrast typography;
- avoid excessive uppercase text.

### 19.5 Negative space

The map must remain visible.

The interface must not cover the world with cards. Information appears only where it improves the current decision.

---

## 20. Motion and Animation Language

### 20.1 Functional motion

Implemented in code:

- route drawing;
- marker pulse;
- alert-tag appearance;
- state transitions;
- number transitions;
- Pilot expansion;
- camera focus;
- layer fades;
- selected-marker elevation;
- timeline progression.

### 20.2 Cinematic motion

Optional supportive assets:

- subtle cloud movement;
- light changes;
- atmospheric horizon;
- controlled intro transition.

Higgsfield may generate references or optimized atmospheric assets, but runtime state remains controlled by real data and code.

### 20.3 Restrictions

- no constant particle field over the full map by default;
- no neon cyberpunk glow;
- no motion that suggests a hazard is moving when it is not;
- no animation that blocks interaction;
- no high-motion intro during urgent states;
- reduced-motion support is mandatory.

---

## 21. Responsive Strategy

The approved concept is widescreen-first, but EOS remains a web PWA and must support smaller devices.

### 21.1 Desktop / landscape tablet

- full world view;
- left Status Rail;
- top Pilot capsule;
- central location brief;
- map markers and routes;
- bottom environmental ticker.

### 21.2 Portrait tablet

- narrower Status Rail or collapsible rail;
- Pilot remains top;
- ticker becomes horizontally scrollable or segmented;
- map remains primary.

### 21.3 Mobile portrait

The widescreen composition must not be squeezed into a phone.

Proposed mobile transformation:

```text
Full-screen world map
+
compact top risk/Pilot island
+
expandable bottom sheet
+
family and alert markers
+
contextual action bar
```

The left Status Rail becomes an expandable bottom sheet or compact risk complication.

### 21.4 Existing navigation

The first prototype must coexist with the current bottom navigation and safe-area requirements.

No permanent navigation redesign is authorized by this spec alone.

---

## 22. Accessibility

Required:

- semantic labels for all map controls;
- keyboard access where supported;
- sufficient contrast;
- screen-reader alternative to visual map meaning;
- textual list for alerts, family, and routes;
- reduced-motion support;
- no meaning conveyed by color alone;
- scalable type;
- large critical-action targets;
- clear offline and stale-data states.

A map-only representation is not accessible. Every critical map fact must have a textual equivalent.

---

## 23. Data Architecture

### 23.1 Existing reusable systems

The prototype should reuse:

- `RiskProvider`;
- `/api/weather-intelligence`;
- `/api/monitor`;
- `/api/hazards` where relevant;
- `/api/inventory`;
- `/api/family-members`;
- `/api/checklist`;
- feature gates;
- i18n;
- risk tokens;
- existing Supabase auth and profile location.

### 23.2 New likely data requirements

Not yet authorized or fully specified:

- live family-location model;
- location permissions and freshness;
- shelter registry and source;
- routing provider;
- route-hazard evaluation;
- map preferences;
- selected monitored location;
- layer visibility state;
- map camera persistence;
- location history policy;
- Pilot recommendation payload for the Dashboard.

### 23.3 Data contract principle

UI components should consume normalized EOS contracts rather than raw provider payloads.

Example conceptual contracts:

```ts
type WorldLocation = {
  id: string
  label: string
  coordinates: [number, number]
  confidence: 'exact' | 'approximate' | 'semantic' | 'unknown'
  updatedAt: string | null
}

type WorldAlert = {
  id: string
  source: string
  official: boolean
  severity: string
  headline: string
  geometry?: GeoJSON.Geometry
  startsAt: string
  endsAt?: string
  action?: string
}

type WorldRoute = {
  id: string
  status: 'mock' | 'recommended' | 'alternate' | 'blocked'
  geometry: GeoJSON.LineString
  destination: WorldLocation
  distanceMi?: number
  durationMin?: number
  reasons: string[]
}
```

These are architectural examples, not finalized code contracts.

---

## 24. Technical Component Architecture

Proposed future structure:

```text
app/(app)/dashboard-world/page.tsx

components/world-dashboard/
├── WorldDashboard.tsx
├── WorldMap.tsx
├── WorldMapProvider.tsx
├── WorldCameraController.tsx
├── HouseholdStatusRail.tsx
├── PilotCapsule.tsx
├── LocationBrief.tsx
├── EnvironmentTicker.tsx
├── AlertCounter.tsx
├── GeoAlertTag.tsx
├── FamilyMarker.tsx
├── FamilyMarkerLayer.tsx
├── ShelterMarker.tsx
├── ShelterRouteLayer.tsx
├── HazardLayer.tsx
├── MapLayerControl.tsx
├── WorldDashboardMobileSheet.tsx
├── WorldDashboardFallback.tsx
└── world-dashboard.css

lib/world/
├── types.ts
├── providers.ts
├── camera.ts
├── layers.ts
├── route-normalizer.ts
├── shelter-normalizer.ts
└── privacy.ts
```

This structure is provisional and must be confirmed before implementation.

---

## 25. Implementation Strategy

### Phase HWD-00 — Documentation and decision

Status after this document:

- architecture selected;
- visual direction documented;
- code not authorized;
- provider account/key not selected;
- no production Dashboard replacement approved.

### Phase HWD-01 — Static visual prototype

Goal: prove the HUD composition inside the EOS codebase.

- isolated preview route;
- approved Higgsfield image as temporary background;
- real React components for all HUD elements;
- mock family markers and route clearly labeled as mock;
- real RiskProvider and current EOS data where safe;
- responsive first pass;
- no map SDK required.

### Phase HWD-02 — Live hybrid map prototype

Goal: compare visual quality with the reference.

- install MapLibre;
- connect selected tile/terrain provider;
- reproduce Parkland camera composition;
- add terrain/buildings/satellite options;
- add GeoJSON mock overlays;
- preserve same HUD components;
- run visual comparison against the Higgsfield reference.

### Phase HWD-03 — Existing real EOS data

- real current location;
- weather and hazard layers;
- real alert tags;
- Risk Index integration;
- monitored locations;
- current inventory/readiness;
- textual accessibility equivalents.

Implementation status as of 2026-07-21: complete for the isolated `/dashboard-world` prototype. Current location comes from `RiskProvider.coords`; radar uses a keyless RainViewer server-normalized endpoint; hazards come from `/api/hazards` and render as MapLibre GeoJSON polygons/points plus geo-anchored DOM tags. Provider failures degrade additively and preserve the static/MapLibre base and textual equivalent.

### Phase HWD-04 — Family and routing foundation

Privacy/data baseline decided in D-051 for prototype scope.

- family location consent;
- freshness and precision;
- shelter sources;
- routing provider;
- route safety model;
- route confidence and fallback behavior.

Implementation status as of 2026-07-21: complete for prototype scope. Exact family points from existing EOS circle/profile data replace mock family markers when available; current user freshness is live/now and co-member profile coordinates are labeled as profile/stored freshness. `/api/world/guidance` produces a candidate shelter/route through OpenAI with fallback and explicit non-official labeling. Route/shelter provider review remains required before production rollout.

### Phase HWD-05 — Pilot action integration

- Pilot capsule states;
- action buttons;
- scenario opening;
- checklist;
- notify-family flow;
- route focus;
- priority override.

### Phase HWD-06 — Production validation

- performance;
- accessibility;
- responsive behavior;
- provider costs;
- data accuracy;
- error/fallback states;
- privacy review;
- E2E tests;
- staged rollout decision.

---

## 26. Prototype Isolation and Migration

The first implementation must not immediately replace `/dashboard`.

Preferred initial approaches, in order:

1. isolated route such as `/dashboard-world`;
2. authenticated feature-flag preview;
3. owner/admin-only preview;
4. query-controlled internal preview.

The existing Dashboard remains the production fallback until exit criteria are met.

### 26.1 Migration principle

The HUD should be reusable so that the final migration changes composition, not core data logic.

### 26.2 Rollback

Disabling the World Dashboard must restore the current Dashboard without database rollback.

---

## 27. Performance Budget

Initial targets for prototype evaluation:

- avoid blocking initial critical content on map initialization;
- render textual risk state before rich map when possible;
- lazy-load map engine;
- use optimized marker assets;
- limit simultaneous animated layers;
- avoid large uncompressed video backgrounds;
- suspend costly atmospheric effects on low-power devices;
- preserve usable fallback under poor network conditions;
- do not allow map failure to hide alerts or action instructions.

Formal numeric budgets should be defined after the first prototype measurement.

---

## 28. Offline and Failure Behavior

The map is not allowed to become a single point of failure.

### 28.1 Required degradation

If rich map data is unavailable:

```text
Rich 3D map
    ↓
Cached/simple map
    ↓
Static local-area snapshot
    ↓
Text-first operational dashboard
```

### 28.2 Critical information that must survive

- Risk Index and state;
- official alerts already cached;
- Pilot or Rules Engine priority instruction;
- family last-known status with timestamp;
- resource/autonomy status;
- action plan;
- textual destination and route instructions when cached.

### 28.3 Honesty

The UI must state:

- offline status;
- last refresh;
- stale family location;
- unavailable route recalculation;
- unavailable provider layer.

---

## 29. Security and Privacy

The World Dashboard introduces higher-sensitivity data.

Requirements before production family mapping:

- explicit consent model;
- row-level security review;
- server-side authorization for location access;
- no location secrets in public URLs;
- no raw provider keys exposed beyond allowed public map tokens;
- sensitive logging disabled;
- screenshot/privacy mode consideration;
- retention policy;
- deletion behavior;
- circle role permissions;
- audit trail for location-sharing changes where appropriate.

---

## 30. Cost Control

The hybrid architecture is selected partly to control cost and lock-in.

The implementation must track:

- map loads;
- tile requests;
- terrain requests;
- satellite usage;
- geocoding requests;
- routing requests;
- provider monthly active users where applicable;
- cache hit rate;
- bandwidth;
- optional paid hazard providers.

Before production rollout, EOS must define:

- expected free-tier capacity;
- per-user map cost;
- plan-tier access if needed;
- provider overage alerts;
- fallback provider strategy;
- kill switch for expensive layers.

No cost figures are frozen in this document because provider pricing is time-sensitive and must be verified at implementation time.

---

## 31. Testing Strategy

### 31.1 Visual tests

- reference comparison at desktop target resolution;
- SAFE/WATCH/WARNING/CRITICAL screenshots;
- dark/light atmospheric cases if supported;
- marker overlap;
- long labels;
- tablet and mobile layouts.

### 31.2 Functional tests

- map load success/failure;
- provider fallback;
- location missing;
- denied GPS;
- stale family data;
- multiple alerts;
- no alerts;
- route mock/live labeling;
- Pilot priority override;
- offline state;
- reduced motion.

### 31.3 Safety tests

- official alert cannot be hidden by Pilot;
- Rules Engine urgency cannot be downgraded;
- stale family location cannot display as live;
- mocked route cannot display as verified;
- missing shelter data cannot fabricate a shelter;
- map failure cannot remove critical text.

### 31.4 Performance tests

- mid-range phone;
- low-power mode;
- slow 4G;
- poor GPU;
- multiple WebGL layers;
- long-running PWA session;
- memory after repeated route/map transitions.

---

## 32. Acceptance Criteria for the First Live-Map Prototype

The first MapLibre prototype is acceptable only if:

1. It visually approaches the approved reference without pretending to be photorealistic where the data is not.
2. The world remains interactive.
3. Risk, Pilot, family, alerts, and route overlays are separate components/layers.
4. The current Dashboard remains available.
5. Map failure has a usable fallback.
6. The prototype clearly identifies mocked data.
7. It supports desktop and a credible mobile transformation.
8. It respects reduced motion.
9. It introduces no unauthorized family-location persistence.
10. It passes build, type-check, lint, and relevant tests.

---

## 33. Production Exit Criteria

The World Dashboard may replace the current default Dashboard only after:

- owner visual approval;
- provider and cost approval;
- accessibility validation;
- performance validation;
- privacy and permissions approval;
- real-data provenance validation;
- offline/failure fallback validation;
- mobile usability validation;
- critical-state safety review;
- E2E coverage;
- rollback plan;
- App Spine updates;
- explicit release decision.

---

## 34. Open Decisions Before Coding

The following must be confirmed during implementation planning:

1. Exact preview route and feature-flag method.
2. Initial tile/terrain provider.
3. Whether the first prototype starts with static reference or immediately with MapLibre.
4. Satellite imagery availability and license.
5. Geocoding provider.
6. Routing provider.
7. Shelter data source.
8. Whether family markers are mock-only in the first prototype.
9. Exact mobile transformation.
10. Whether the prototype is allowed before Stripe Live cutover.
11. Visual asset storage and optimization strategy.
12. Map token/environment-variable model.
13. Analytics events for World Dashboard and Pilot.
14. Performance thresholds.
15. Feature-gate and subscription implications.

---

## 35. Future Vision

The architecture should support future surfaces without forcing them into the first implementation.

Potential future applications:

- native React Native map experience;
- CarPlay/Android Auto companion view, subject to platform rules;
- watch complication summaries;
- Apple Vision or spatial-computing command view;
- LoRa mesh member positions when technically and legally appropriate;
- drone reconnaissance feeds;
- offline regional map packs;
- community resource layers;
- damage assessment;
- responder mode;
- multi-location circle operations;
- business/facility preparedness dashboards.

These are not authorized features. They are architectural considerations.

---

## 36. Canonical Product Principles

These principles are binding for future implementation unless replaced by a new decision:

1. **The world is the interface.**
2. **The map is a canvas, not the product.**
3. **EOS intelligence remains provider-independent.**
4. **Official alerts and critical rules outrank AI and user preferences.**
5. **Every critical visual fact requires a textual equivalent.**
6. **Family location must be consensual, fresh, and honest.**
7. **Cinematic atmosphere must never fabricate reality.**
8. **The first implementation is isolated and reversible.**
9. **Mock data must always be labeled.**
10. **Map failure must not disable emergency guidance.**
11. **Visual quality is a product requirement, not a provider guarantee.**
12. **No code begins until the owner explicitly authorizes implementation.**

---

## 37. Final Decision Record

**D-047 — Hybrid World Dashboard**

EOS will prototype a world-as-interface Dashboard using MapLibre as the rendering engine, replaceable high-quality map/terrain/imagery providers as the geographic base, official hazard sources as normalized data inputs, and proprietary EOS overlays for Risk Index, family, routes, shelters, resources, scenarios, and Pilot.

The visual target is a premium automotive-grade situational interface comparable in polish to high-end Mapbox experiences while preserving provider independence.

The first implementation must be isolated from the production Dashboard, use real application components, label mocked data, preserve fallbacks, and avoid introducing family-location persistence without a separate approved privacy/data decision.

This document records product and architecture direction only.

> **No implementation is authorized until the owner reviews this spec and explicitly approves coding.**
