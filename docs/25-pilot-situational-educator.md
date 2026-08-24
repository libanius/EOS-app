# 25 — Pilot Situational Educator

> **Status:** IMPLEMENTED — PILOT-T08
> **Decision:** D-093
> **Date:** 2026-08-03
> **Surface:** Web/PWA core first
> **Roadmap:** PILOT-T08

---

## 1. Objetivo

Pilot should behave like a situational educator and host: instructing,
sequencing decisions, asking for missing context, and converting advice into
confirmed preparedness work.

---

## 2. Contract

PILOT-T08 applies the SIM-T11 action contract to Pilot recommendations:

- every concrete recommendation returned as a task carries a type:
  `resource`, `task`, `plan_review`, or `comms_setup`;
- the server assigns visible source and destination;
- the UI shows that provenance before confirmation;
- the user confirms one item at a time;
- confirmed Pilot recommendations persist to `checklists` with:

```txt
kit_type = PILOT_RECOMMENDATION
```

---

## 3. Rules

1. Pilot instructs; it does not silently write.
2. Pilot may ask one short question when essential context is missing.
3. Pilot must use EOS real-time context and RAG when applicable.
4. OpenAI remains the AI provider for Pilot/RAG calls.
5. Rules Engine and critical safety rules still override model output.
6. Plan, inventory, checklist, and Comms writes require explicit confirmation.

---

## 4. Fora Do Escopo

- long-term Pilot memory writes;
- a dedicated Preparedness Items table;
- automatic plan edits;
- batch accept-all;
- SMS/dispatch/radio transmission;
- Mesh/LoRa hardware behavior.
