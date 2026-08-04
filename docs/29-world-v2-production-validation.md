# 29 — World v2 Production Validation

> Status: IMPLEMENTED
> Date: 2026-08-04
> Decision: **D-097**
> Roadmap: **WV2-T05**

---

## Scope

WV2-T05 closes the production validation gate inherited from HWD-06 for the
current `/dashboard` World v2 surface:

- browser execution;
- basic accessibility checks;
- performance and transferred resource measurement;
- provider cost posture;
- privacy and provenance review.

The validation is now reproducible through:

```bash
npm run build
npm run start
npm run test:world-v2
```

The script creates one temporary confirmed Supabase user, seeds the minimum
profile/inventory context, audits `/dashboard` on mobile and desktop, writes a
JSON artifact under `artifacts/`, and deletes the test user.

## Latest Run

Artifact generated locally: `artifacts/world-v2-validation-1785804351063.json`

| Viewport | Load | Resources | Transferred | Console errors | Controls without accessible name | Small EOS targets |
|---|---:|---:|---:|---:|---:|---:|
| Mobile 390x844 | 494ms | 69 | 665KB | 0 | 0 | 0 |
| Desktop 1440x960 | 166ms | 69 | 708KB | 0 | 0 | 0 |

Required checks passed:

- `<main>` exists.
- textual status equivalent exists through `.wv2-sr[role="status"]`;
- provenance text exists through `.wv2-provenance`;
- visual map wrapper is hidden from screen readers with `aria-hidden="true"`;
- no visible EOS control lacks an accessible name;
- no visible EOS control is below the target-size threshold used by the audit.

## Fixes Made During Validation

- Shelter map labels now have a 44px minimum touch height.
- The Pilot bar input now has a 44px minimum height.
- The audit ignores MapLibre attribution links for target-size warnings because
  they are provider-mandated attribution controls, not EOS product controls.

## Provider Cost Posture

No dollar figures are frozen in the Spine because provider pricing changes and
must be verified against provider terms before launch decisions. The current
technical posture is:

- Map base: no `NEXT_PUBLIC_MAPTILER_KEY` is configured; default is keyless CARTO
  dark. Satellite mode uses ESRI public raster tiles with attribution.
- Weather/hazard dashboard load: Open-Meteo, NWS, USGS, NHC and RainViewer paths
  are keyless in the current code path.
- Credentialed hazard adapters remain honest: they report not configured until
  keys exist.
- OpenAI is the only AI provider. The dashboard load itself does not call OpenAI;
  Pilot, simulation parsing and other AI flows are submit-driven.

## Privacy And Provenance

- Family points remain consent-gated and labeled with freshness/source.
- Profile-only positions remain visually approximate and labeled as profile data,
  not live GPS.
- Route/shelter overlays remain off the map until the app has a source.
- The dashboard renders a visible provenance sentence explaining these limits.
- Raw provider keys are not exposed beyond intentionally public map tokens.

## Remaining Risk

This is a pragmatic gate, not a full WCAG certification or Lighthouse program.
Future validation should add axe/Lighthouse CI if we introduce that dependency or
wire these checks into CI.
