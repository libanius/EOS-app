# 17 — HWD-06 Validation Report

> Last updated: 2026-07-21  
> Surface: `/dashboard-world`  
> Production domain: `https://eos-app-fawn.vercel.app`  
> Current commit at validation: `e61dfb1`

---

## Summary

HWD-06 is partially validated but **not ready to replace `/dashboard`**.

The isolated World Dashboard is deployable and the core app regression suite is healthy. The remaining blockers are approval and validation gates, not basic build/runtime failures.

---

## Automated Validation Run

| Check | Result | Notes |
|---|---:|---|
| TypeScript | ✅ PASS | `npm run type-check` |
| Jest | ✅ PASS | `45/45` tests |
| Production build | ✅ PASS | `/dashboard-world` first-load JS ~120 kB |
| ESLint | ✅ PASS | `npm run lint` — no warnings/errors |
| Full production journey | ✅ PASS | `scripts/full-journey.mjs --url https://eos-app-fawn.vercel.app` → `31/31` |
| Members/circles E2E | ✅ PASS | `scripts/e2e-members.mjs https://eos-app-fawn.vercel.app` → `19/19` |
| Route protection | ✅ PASS | `/dashboard-world` returns `307` to login when unauthenticated |
| RainViewer endpoint | ✅ PASS | `/api/world/radar` returns `ok:true`, provider `rainviewer` |
| Hazard endpoint | ✅ PASS | `/api/hazards?lat=26.31&lng=-80.24` returns normalized real events |

---

## Production Exit Criteria Status

| Criterion from doc 16 §33 | Status | Notes |
|---|---|---|
| Owner visual approval | PENDING | Needs live review on desktop and mobile after D-054→D-057 UI changes. |
| Provider and cost approval | PENDING | MapTiler, RainViewer, OpenAI guidance usage and hazard provider costs need explicit review. |
| Accessibility validation | PARTIAL | Textual map equivalent exists; no automated axe/screen-reader pass has been run. |
| Performance validation | PARTIAL | Build size is acceptable; no mid-range phone/slow 4G/GPU session test yet. |
| Privacy and permissions approval | PARTIAL | No new family-location persistence; exact family point/privacy policy still needs release review. |
| Real-data provenance validation | PARTIAL | RainViewer/hazards are real; route/shelter remains OpenAI-inferred prototype per D-051. |
| Offline/failure fallback validation | PARTIAL | Code has fallbacks; failure-mode test matrix not fully executed. |
| Mobile usability validation | PARTIAL | Bottom sheet and rail fixes implemented; needs owner/device review. |
| Critical-state safety review | PARTIAL | Pilot priority override implemented; no full critical-state manual review yet. |
| E2E coverage | PARTIAL | Core E2E passes; no browser UI E2E for `/dashboard-world` because Playwright is not installed. |
| Rollback plan | PASS | `/dashboard-world` is isolated; production `/dashboard` remains untouched. |
| App Spine updates | PASS | D-054 through D-057 logged. |
| Explicit release decision | PENDING | No replacement of `/dashboard` authorized. |

---

## Decision

Keep `/dashboard-world` isolated. Do **not** replace `/dashboard` until the pending HWD-06 gates are cleared and an explicit release decision is logged.

---

## Next Recommended HWD-06 Work

1. Owner visual/device review on Mac desktop and mobile.
2. Add browser-level UI verification for `/dashboard-world` (Playwright or equivalent).
3. Run accessibility pass: keyboard, focus states, reduced motion, screen reader text, contrast.
4. Review provider costs and quota exposure: MapTiler, OpenAI guidance, RainViewer, hazards.
5. Review route/shelter provenance and replace OpenAI-inferred guidance before default-dashboard rollout.
6. Define rollback/release checklist for eventual `/dashboard` replacement.
