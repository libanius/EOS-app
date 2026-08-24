# 27 — Pilot Memory Confirmed Writes

> **Status:** IMPLEMENTED — UPP-03
> **Decision:** D-095
> **Date:** 2026-08-03
> **Surface:** Web/PWA core first
> **Roadmap:** UPP-03

---

## 1. Objetivo

Pilot can learn durable user context only through explicit confirmation and an
audit trail. No long-term memory mutation can happen silently.

---

## 2. Behavior

`/api/pilot/chat` may return `memory[]` proposals when the user states a durable
preference, constraint, recurring equipment, family need, or decision rule.

The Pilot UI shows:

- title;
- reason;
- exact Markdown proposed for memory;
- explicit save button.

Only after confirmation does the client call:

```txt
POST /api/profile/personalization/memory
```

---

## 3. Persistence

UPP-03 adds:

- `pilot_memory_events`;
- RPC `confirm_pilot_memory(...)`.

The RPC updates `profile_personalization.pilot_memory_md` and inserts the audit
event in one database transaction.

Migration:

```txt
supabase/migrations/20260803003000_pilot_memory_events.sql
```

---

## 4. Rules

1. The model proposes memory; it does not write memory.
2. The server appends the confirmed Markdown block.
3. Memory update and audit event are atomic via RPC.
4. The public emergency QR still does not expose Pilot memory.
5. OpenAI remains the AI provider for Pilot.

---

## 5. Fora Do Escopo

- automatic memory writes;
- memory deletion UI;
- event diff viewer;
- plan edits from memory;
- cross-device push for memory proposals.
