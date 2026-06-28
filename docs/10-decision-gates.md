# 10 — Decision Gates

> Gates block entire phases or major features. They require explicit decisions before work can proceed.

---

## G-01 — Language Strategy

**Question**: Should EOS be English-only, Portuguese-only, or bilingual (PT/EN)?

**Why it matters**: UI copy, knowledge base language, Claude prompt language, and marketing all depend on this.

**Current state**: Mixed. Some UI is English, some Portuguese. No consistent decision.

**Blocks**: P1-T05 (language alignment), any marketing work.

**Status**: CLEARED — bilingual PT/EN selected in Settings (D-026, 2026-06-28)

---

## G-02 — Landing Page

**Question**: What should `/` show to unauthenticated users?

**Current state**: Placeholder text ("Foundation ready. Auth and database next.") — not suitable for real users.

**Options**:
- Minimal: just a tagline + "Get Started" button
- Marketing: full landing page with features, screenshots, CTA
- Redirect: just redirect to /login

**Blocks**: P1-T04.

**Status**: OPEN

---

## G-03 — Mobile Readiness

**Question**: When should we initialize the React Native project?

**Why it matters**: Once initialized, the mobile app needs active maintenance. Starting too early creates dead weight.

**Blocks**: Phase 2.

**Status**: OPEN — waiting for Phase 1 completion.

---

## G-04 — Monetization

**Question**: How does EOS make money (if at all)?

**Options**: Free forever, freemium (SURVIVAL free / CONNECTED paid), subscription, one-time purchase.

**Blocks**: Phase 3 planning.

**Status**: OPEN

---

## G-05 — LoRa Mesh Priority

**Question**: Is the LoRa mesh a real product priority or a passion project?

**Why it matters**: ESP32 firmware exists but LoRa integration requires significant mobile + hardware work.

**Blocks**: Phase 4.

**Status**: OPEN
