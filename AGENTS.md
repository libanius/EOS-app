# AGENTS.md — EOS Operating Rules

This file defines how any AI agent (Claude, Copilot, etc.) must operate inside this repository.
Read this before writing any code. No exceptions.

---

## Rule 1 — Spec-Driven Development (SDD) Protocol

This project follows Spec-Driven Development. Documentation is the source of truth.
Code exists to implement the spec. The spec does not exist to describe the code.

**Change flow (mandatory):**
Idea → Decision → Spec Update → Roadmap Update → Execution

Never skip steps. Never reverse the order.

---

## Rule 2 — /docs is the Source of Truth

The `/docs` folder is the App Spine. It defines what this product is, what is built,
what is planned, and what decisions have been made.

If the code contradicts the docs, the docs win — unless a formal decision is made to update them.

---

## Rule 3 — Pre-Coding Reading List

Before writing any code, read these files in order:

1. `AGENTS.md` (this file)
2. `docs/09-build-status.md` — current state and next task
3. `docs/07-roadmap.md` — what phase we are in
4. `docs/11-product-memory.md` — non-obvious context that must survive sessions

Read the relevant feature spec if working on a specific feature:
- `docs/03-requirements.md` — functional requirements
- `docs/06-data-model.md` — schema and field names
- `docs/18-family-plans.md` — Planos de Emergência da Família (plano de voo)
- `docs/19-scenario-simulator.md` — o Simulador do Cenário

---

## Rule 4 — One Task at a Time

Only work on the task marked PENDING or IN PROGRESS in `docs/07-roadmap.md`.
Do not start the next task until the current one is marked COMPLETE and docs are updated.

---

## Rule 5 — No Skipping Tasks

Do not skip tasks in the roadmap. If a task seems unnecessary, document the reasoning
in `docs/08-decisions-log.md` and get confirmation before skipping.

---

## Rule 6 — No Inventing Direction

Do not add features, refactor code, or change architecture unless:
- It is in the roadmap, OR
- A decision is logged in `docs/08-decisions-log.md`

When in doubt, ask. Do not assume.

---

## Rule 7 — Spine-First for Strategic Changes

Any change that affects: auth, data model, API contracts, intelligence modes, or platform strategy
must update the relevant /docs file BEFORE changing any code.

---

## Rule 8 — Post-Implementation Updates

After completing any task:
1. Mark the task ✅ COMPLETE in `docs/07-roadmap.md`
2. Update `docs/09-build-status.md` with what changed and what is next
3. Update `docs/11-product-memory.md` with any non-obvious facts learned
4. Commit and push all changes (code + docs together)

---

## Rule 9 — progress/index.html is Visualization Only

`progress/index.html` is a static stakeholder dashboard. It is updated manually after sessions.
It does not drive decisions. It reflects them.

---

## Rule 10 — Git Discipline

- Commit code and docs together in the same commit
- Commit message format: `type(scope): description`
- Always push after committing — do not leave commits only local
- The agent commits and pushes; do not wait for the user to do it

---

## Rule 11 — Design with Intent / Wren

Design with Intent (`intent@intent`) is available in Claude Code for UX planning.
Use Wren before structural UX changes involving information architecture,
navigation architecture, user journeys, feature ownership, screen hierarchy, or
wireframing.

Wren is an experience architect for planning and critique. It must not modify
code, refactor the app, or implement UI unless the user explicitly asks for
implementation after the planning/specification step.

Expected flow:

```text
PLANNING: Wren / Design with Intent
SPECIFICATION: App Spine / roadmap / decision log
IMPLEMENTATION: Claude Code / Codex
```
