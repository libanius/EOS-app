# 05 — Platform Strategy

> Last updated: 2026-08-03
> Decision: D-084 — EOS Platform, not parallel apps.

---

## Strategic Position

EOS is a **multi-surface platform** with one operational core. The product must
not split into separate Web, iOS, Android, Automotive, and Mesh products.

The architecture is layered:

1. **Product Core** — what EOS does: Pilot, Risk Engine, Family, Plans,
   Weather, Shelters, Routes, Simulation, Preparedness, EDU, and Comms.
2. **Domain Core** — the rules and safety logic: decision engine, risk scoring,
   consent, offline rules, source authority, freshness, and execution order.
3. **Shared UI** — the EOS design system and reusable surfaces: HUD, sheets,
   map overlays, status pills, controls, family rows, plan execution, and
   preparedness workflows.
4. **Platform Adapters** — platform-specific capabilities only: native push,
   background location, secure storage, widgets, store billing, CarPlay/Android
   Auto restrictions, BLE, and LoRa hardware bridges.

Rule: **build the core once; adapt the edge per platform.**

---

## Active Platform: Web PWA

**Status**: Active production surface. Live on Vercel and auto-deployed on push
to `main`.

The Web PWA remains the primary validation surface for product, domain, and
shared UI work. New core product capabilities should prove themselves here
before a native shell is initialized.

Current Web/PWA responsibilities:

- World v2 dashboard and map interface;
- Pilot conversation and local deterministic guidance;
- Family location and family command workflows;
- Family plans, offline plan copy, plan chart, and Google Maps handoff;
- Scenario simulator and shared drills;
- checklist/preparedness foundation;
- Web Push, service worker, IndexedDB, and degraded/offline behavior.

---

## Planned Platform: Native Mobile

**Status**: Planned. Blocked by **G-03 — Mobile Readiness**.

`/mobile/` contains template/conceptual React Native files and LoRa-related
experiments. It is **not** a runnable initialized mobile app. `npx react-native
init`, Expo, and Capacitor have not been adopted.

Native mobile should start only after the owner clears G-03 and after the core
work it will wrap is stable enough to justify a maintained second runtime.

Native mobile exists to add capabilities the PWA cannot reliably own:

- APNs/FCM native push;
- background location under platform permission rules;
- secure credential storage;
- camera/QR integrations;
- native share/contact affordances where approved;
- app-store packaging, review, and release flow;
- optional native widgets/Live Activities/Dynamic Island after core launch.

App Store and Google Play submission remain blocked until the native shell is
initialized, reviewed against platform policy, and validated with the shared EOS
core.

---

## Future Platform: Automotive Companion

**Status**: Future. Blocked by **G-06 — Automotive Readiness**.

CarPlay and Android Auto are **companion modes**, not full EOS clients.

Allowed direction:

- status of active risk;
- route/navigation handoff;
- family check-in and limited communication;
- plan execution state;
- simple, driver-safe actions.

Not allowed as default scope:

- long chat;
- plan editing;
- EDU video consumption;
- simulator authoring;
- dense dashboards or crisis analysis requiring reading.

Automotive work starts only after the mobile core exists and the platform
restrictions are documented.

---

## Future Platform: Mesh / LoRa / Off-Grid Comms

**Status**: Future. Blocked by **G-05 — LoRa Mesh Priority**.

Comms inside the Web/PWA product and LoRa/Mesh hardware are separate decisions:

- **Comms app-level** can begin in the Web/PWA core: circle chat, radio guides,
  frequencies, quick reference, and communication status.
- **Mesh/LoRa hardware** remains a later off-grid adapter requiring mobile,
  BLE, hardware testing, region-frequency rules, and owner priority.

The ESP32 firmware and mobile BLE files in `/mobile/` are prototypes, not an
integrated product surface.

---

## Platform Gaps

| Gap | Severity | Notes |
|---|---|---|
| Native mobile shell not initialized | HIGH | Blocked by G-03; `/mobile/` is template/conceptual code only |
| App Store / Google Play release path not defined | HIGH | Requires native shell, privacy review, store policy review, and release process |
| Automotive policy not documented | MEDIUM | Requires G-06 before CarPlay/Android Auto work |
| Mesh/LoRa priority not decided | MEDIUM | Blocked by G-05; app-level Comms can proceed separately |
| Platform docs drift from current product | MEDIUM | D-084 establishes PHASE 0B as the reconciliation step |
