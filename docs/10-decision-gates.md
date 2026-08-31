# 10 — Decision Gates

> Last updated: 2026-08-31

> Gates block entire phases or major features. They require explicit decisions before work can proceed.

---

## G-01 — Language Strategy

**Question**: Should EOS be English-only, Portuguese-only, or bilingual (PT/EN)?

**Why it matters**: UI copy, knowledge base language, AI prompt language, and marketing all depend on this.

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

**Question**: When should we initialize the native mobile shell?

**Why it matters**: Once initialized, the mobile app needs active maintenance.
Starting too early creates dead weight and risks splitting EOS into separate
products instead of platform adapters.

**Blocks**: Native mobile shell, App Store submission, Google Play submission,
native push, native background location, and mobile-only secure storage work.

**Status**: **CLEARED** — liberado pelo dono em 2026-08-31 (D-228).

A casca escolhida é **Capacitor**, não React Native: o núcleo continua sendo o
Next.js que já está em produção, e a casca só adiciona a borda que o navegador
não alcança (push APNs/FCM, cofre offline nativo, geolocalização, deep links).
A alternativa RN foi recusada por exigir reescrever ~50 telas e a autenticação,
o que criaria os produtos paralelos que a D-084 proíbe.

O que esta liberação **não** destrava: G-05 (LoRa/BLE) e G-06 (Automotive)
seguem OPEN por decisão própria. `/mobile/` continua protótipo, não produto.

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

**Clarification from D-084**: app-level Comms and hardware Mesh are separate.
Circle chat, radio guides, frequencies, and communication status may be planned
inside the Web/PWA core. BLE/LoRa hardware integration remains blocked here.

---

## G-06 — Automotive Readiness

**Question**: When should EOS support CarPlay and Android Auto?

**Why it matters**: Automotive platforms are restricted, driver-safety governed
companion surfaces. They cannot host the full EOS product.

**Blocks**: CarPlay, Android Auto, and any automotive-specific UI or release
work.

**Status**: OPEN — a pré-condição "native mobile core" foi satisfeita pela
D-228, mas o gate **não** cai junto: continua bloqueado até que as regras de
CarPlay/Android Auto sejam revisadas e o dono aprove um escopo de companheiro
restrito.

**Allowed direction**: status, route handoff, check-in, limited communication,
and plan execution state.

**Out of scope by default**: long chat, plan editing, EDU video, simulator
authoring, and dense dashboards.
