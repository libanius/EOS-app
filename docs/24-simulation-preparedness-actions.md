# 24 — Simulation Preparedness Actions

> **Status:** IMPLEMENTED — SIM-T11
> **Decision:** D-092
> **Date:** 2026-08-03
> **Surface:** Web/PWA core first
> **Roadmap:** SIM-T11

---

## 1. Objetivo

Simulation debriefs must not end as advice that disappears. They should produce
concrete preparedness proposals that the user can confirm into real work.

---

## 2. Decisão

SIM-T11 turns each actionable debrief gap into a proposal with:

- type: resource, task, plan review, or comms setup;
- visible source: the simulation debrief and scenario label;
- destination: Preparação > Checklist da simulação;
- explicit confirmation button.

No proposal writes to persistent readiness state until the user taps the action.

---

## 3. Persistência

SIM-T11 does not add a new table. Confirmed actions reuse the existing
`checklists` contract and save with:

```txt
kit_type = SIMULATION_DEBRIEF
```

The Preparação surface displays that source so the item does not look like a
generic checklist row.

---

## 4. Fora Do Escopo

- automatic writes from debrief;
- batch accept-all;
- new preparedness item table;
- direct inventory mutation at proposal time;
- Pilot educator behavior beyond debrief proposals;
- EDU/RAG-generated action ingestion.

---

## 5. Próximo Passo

PILOT-T08 should apply the same contract to Pilot: instruct, propose, show
source, and write only after explicit confirmation.
