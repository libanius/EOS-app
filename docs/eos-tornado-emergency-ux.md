# EOS tornado emergency experience — approved UX, implementation gate

The approved flow has four deterministic states: Watch, Warning, In shelter, and Officially expired. **In shelter is a personal check-in, never an official all-clear.** The first implementation adds a reusable detail component and deterministic guidance, without replacing existing hazard ingestion or push infrastructure.

## Integration checklist (not yet verified)
- Mount `TornadoEmergency` in the existing `AlertsPage` for authoritative NWS tornado alerts; never derive a warning from forecasts or AI text.
- Pass the original official event type, source and expiration. Handle NWS update/cancel/expiry separately; use CAP IDs for deduplication.
- Use the **actual** NWS geometry in the existing map layers. Do not render a fictional county polygon or assert that a user is safe outside an unavailable polygon. Validate Polygon and MultiPolygon, then use robust point-in-polygon with boundary handling.
- Localize copy through EOS i18n (English and Portuguese), respect accessibility and text scaling.
- Cache approved deterministic instructions and map assets in the offline bundle. Show last-sync time; offline must not imply live monitoring.
- Persist check-in locally with consent, and implement optional contact sharing separately. Never claim a message was delivered without provider acknowledgment.
- Keep the existing Web Push 403 diagnostic PR independent. Verify NWS ingestion, scan, dedup, delivery and native/web push using mocks before any real-world testing.
- Apple Critical Alerts entitlement is not assumed. Standard notifications are not equivalent to WEA.

## Acceptance gates
1. Tornado Watch never says shelter immediately; Warning clearly does.
2. Expired/canceled alerts never continue displaying as active; a check-in never clears them.
3. Missing geometry shows unknown geographic eligibility.
4. Device airplane-mode test verifies cached instructions, with stale-data warning.
5. Type-check, lint, unit tests, build and visual iOS review pass.
6. Explicit owner approval before merge, production deployment or any real push.

This document describes a **partial implementation**, not a completed end-to-end alert system.
