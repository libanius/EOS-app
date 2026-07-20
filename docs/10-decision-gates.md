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

**Current state**: Minimal production landing is live with pricing/legal links. The more ambitious "Prévia Viva" landing v3 is deferred by D-045.

**Options**:
- Minimal: just a tagline + "Get Started" button
- Marketing: full landing page with features, screenshots, CTA
- Redirect: just redirect to /login

**Blocks**: P1-T04.

**Status**: CLEARED — minimal landing shipped in P1-T04; v3 is a deferred roadmap task (P3-T07 / D-045)

---

## G-03 — Mobile Readiness

**Question**: When should we initialize the React Native project?

**Why it matters**: Once initialized, the mobile app needs active maintenance. Starting too early creates dead weight.

**Blocks**: Mobile App phase.

**Status**: OPEN — Phase 1 and Phase 2 are complete, but mobile still needs an explicit owner decision before initialization.

---

## G-04 — Monetization

**Question**: How does EOS make money (if at all)?

**Options**: Free forever, freemium (SURVIVAL free / CONNECTED paid), subscription, one-time purchase.

**Blocks**: Phase 3 planning.

**Status**: CLEARED — subscription model selected and implemented through Stripe self-serve (D-042). Current remaining work is launch activation, not business-model decision.

---

## G-05 — LoRa Mesh Priority

**Question**: Is the LoRa mesh a real product priority or a passion project?

**Why it matters**: ESP32 firmware exists but LoRa integration requires significant mobile + hardware work.

**Blocks**: Phase 4.

**Status**: OPEN
