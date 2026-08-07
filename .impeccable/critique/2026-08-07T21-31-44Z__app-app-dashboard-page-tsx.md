---
target: dashboard
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-07T21-31-44Z
slug: app-app-dashboard-page-tsx
---
Method: dual-agent (A: design review · B: detector + measured browser evidence)

## Design Health Score — 23/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `0 dias` indistinguishable from "not loaded"; `Atualizar` gives no confirmation or timestamp |
| 2 | Match System / Real World | 2 | `Flood`/`Surge` untranslated in the pt-BR layer list; "Índice de risco 14" has no unit or scale |
| 3 | User Control and Freedom | 1 | Layers panel is a dead end: no close button, Escape ignored, outside-tap ignored, covers 54% of its own trigger |
| 4 | Consistency and Standards | 2 | Grabber cycles on touch but not on mouse click; three floating control systems, three grammars, one corner |
| 5 | Error Prevention | 2 | The Pilot's visible ✕ navigates to /ficha and discards the conversation |
| 6 | Recognition Rather Than Recall | 3 | Map controls carry captions; the three AppActions orbs are unlabelled and are the only route to Plano/Ajustes/Ficha |
| 7 | Flexibility and Efficiency | 2 | Primary pill is "Abrir cenário" while the real gap is 0% readiness; 7 tab stops before app content |
| 8 | Aesthetic and Minimalist Design | 3 | Strong material/type discipline undercut by 16 controls at rest and 114px of dead reserve |
| 9 | Error Recovery | 2 | No route from "0 dias de água" to adding water; the number is a verdict with no handle |
| 10 | Help and Documentation | 3 | Provenance/cone/capacity notes are exemplary — and set at 13px, 3.2:1 |
| **Total** | | **23/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

Split: authored underneath, interchangeable on the surface. The token system is real (three iOS material weights, size-specific tracking, risk-driven accent, three accessibility media queries with genuine substitutions). The copy is the brand: "O cone é a incerteza da posição do centro, não a área de dano." But the composed screen at rest is a generic dark map app — no family member, no autonomy figure, no plan. The only genuinely EOS fact (0 days of water, 0% readiness) is two gestures deep and rendered in the dimmest grey, while the hero says 14 · Estável in bright green.

Deterministic scan: detector exit 0, zero findings, verified live against a synthetic control file. Everything below came from measurement, not static analysis.

## Priority Issues

**[P0] The layers panel cannot be closed.** No close button; Escape ignored (0 occurrences in WorldV2.tsx); outside tap ignored; the panel covers 54% of its own trigger. Only exit is leaving the dashboard.

**[P0] AppActions covers the Pilot's close button.** `.chat-close` is 36x36 and 33% free; elementFromPoint at its centre returns "Minha Ficha de Emergência". The intended rule exists (`body:has(.wv2-pilot-chat) .app-actions { display: none }`) and never applies because `AppActions.tsx:70` sets `display: 'flex'` inline. The author hit this trap once and added `!important` to `top` — and missed `display`.

**[P1] The hero number contradicts the family's situation.** `deriveRisk(s: WeatherSnapshot)` is weather-only by signature. It renders 14 · Estável in accent green on a household with 0 days of water, 0 days of food and 0% readiness. The Pilot, one tap away, correctly returns PREPARE — Água crítica. Two engines, two verdicts, one screen, and the reassuring one is the loud one.

**[P1] Low reserves render quieter than healthy ones.** `.wv2-bar.low > .track > i { background: var(--ink-3) }` — the more urgent the state, the more it recedes. Zero is visually identical to "no data".

**[P2] Contrast and target size on the load-bearing elements.** ABRIR 3.21:1 @11px; nav labels 3.45:1 @10px; provenance 3.21:1 @13px; map captions ink-3 @9px. AppActions 40x40, Pilot close 36x36. Measured: 26 text/colour pairs below AA, all tracing to two tokens (--ink-3 and #6b6b8a). Map attribution is 1.07:1 and fully occluded by the nav — a licence-compliance issue, not just a11y.

## Cognitive Load — 2/8 pass

16 interactive controls visible at rest, 29 with layers open. Four decision points above the working-memory limit: 7 nav tabs, 7 top-right controls in 3 unrelated clusters, 10 layer toggles, 5 Pilot chips.

## Persona Red Flags

Alex: panning the map collapses the sheet (onMapInteraction → setDetent('peek')) with no way to pin it; risk index has no breakdown or trend; Atualizar has no feedback.
Sam: 7 tab stops before app content, two of them map-vendor credits; the screen-reader summary announces the reassuring half only, never 0% readiness; Pilot dialog has role="dialog" with no aria-modal and no focus trap; the focus ring changes hue with risk state.
Casey: every control except the nav is out of thumb reach (top third of an 844px screen); the peek strip spends its one line on the weather; ABRIR is the least visible text on screen; a mis-tap on Camadas traps her.

## Minor Observations

`.wv2-capsule` is dead code — ~50 lines with a doc comment describing "the always-visible answer to where am I, how bad is it", rendered by nothing. Three of six condition tiles carry no unit. Six of eight map layers default on with no legend. The `wv2-fume` signature material, reserved for the Pilot, also fires on the layers popover. The self-puck has no label.
