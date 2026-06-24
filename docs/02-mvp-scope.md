# 02 — MVP Scope

---

## What is the MVP?

The MVP is the Web PWA. A working emergency decision assistant that a family head
can use on any device with a browser.

---

## In Scope for MVP

| Feature | Status |
|---|---|
| Email/password auth (signup, login, recovery) | ✅ Done |
| Onboarding: profile + family members | ✅ Done |
| Resource inventory (fuel, water, food, battery, medical) | ✅ Done |
| Decision Engine: CONNECTED mode (Claude + RAG) | ✅ Done |
| Decision Engine: SURVIVAL mode (Rules Engine) | ✅ Done |
| Action plan generation and persistence | ✅ Done |
| Checklist generation | ✅ Done |
| Circles (create, join, share) | ✅ Done |
| PWA (installable, service worker, offline) | ✅ Done |
| IndexedDB offline cache | ✅ Done |
| Rate limiting (Upstash Redis) | ✅ Done |
| Error monitoring (Sentry) | ✅ Done (needs SENTRY_DSN env var) |

---

## Out of Scope for MVP

| Feature | Phase |
|---|---|
| React Native mobile app | Phase 2 |
| LOCAL_AI mode (llama.rn) | Phase 2 |
| LoRa mesh communication | Phase 4 |
| Landing / marketing page | Phase 1 (P1-T04, DRAFT) |
| Monetization / subscription | Phase 3 |
| Multi-language (i18n) | Phase 3 |
| Push notifications | Phase 3 |

---

## MVP Exit Criteria

MVP is complete when:
1. A real user can sign up, complete onboarding, and get a CONNECTED-mode action plan
2. The action plan is persisted in Supabase
3. SURVIVAL mode works without internet
4. PWA is installable on mobile
