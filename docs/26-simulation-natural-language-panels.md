# 26 — Simulation Natural Language Panels

> **Status:** IMPLEMENTED — SIM-T09
> **Decision:** D-094
> **Date:** 2026-08-03
> **Surface:** Web/PWA core first
> **Roadmap:** SIM-T09

---

## 1. Objetivo

The simulator can start from natural language, but the user must still review
the cockpit panels before running the drill.

---

## 2. Behavior

The scenario textarea now has an explicit action:

```txt
Apply to panels
```

That action calls `/api/simulation/parse`, which uses OpenAI to infer a validated
patch for `SimulationConfig`:

- threat;
- severity;
- arrival time;
- infrastructure failures;
- household constraints;
- reserve level;
- source modes;
- simulated weather/air-quality values.

The patch updates the existing panels. The simulation does not start until the
user taps the normal start button.

---

## 3. Safety Rules

1. Free text inference is reviewable, not authoritative.
2. The server validates allowed enum values and numeric ranges.
3. Missing or weak inferences leave the existing panel values unchanged.
4. No database write is performed.
5. OpenAI is the AI provider for this inference.

---

## 4. Fora Do Escopo

- auto-starting a simulation from text;
- writing plans/checklists from the parsed scenario;
- accepting unreviewed model output;
- adding a new persistence table;
- parsing into mobile/native adapters.
