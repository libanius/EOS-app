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
| Decision Engine: CONNECTED mode (OpenAI + RAG) | ✅ Done |
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
| Native mobile app | Blocked by G-03 |
| LOCAL_AI mode | Blocked by native mobile readiness |
| LoRa mesh communication | Blocked by G-05 |
| Automotive companion | Blocked by G-06 |

---

## MVP Exit Criteria

MVP is complete when:
1. A real user can sign up, complete onboarding, and get a CONNECTED-mode action plan
2. The action plan is persisted in Supabase
3. SURVIVAL mode works without internet
4. PWA is installable on mobile
