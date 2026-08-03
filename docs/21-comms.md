# 21 — Comms

> **Status:** IMPLEMENTED — COMMS-T01
> **Decision:** D-087
> **Date:** 2026-08-03
> **Owner:** Paulo Libânio Neto
> **Surface:** Web/PWA core first
> **Roadmap:** COMMS-T01

---

## 1. Objetivo

Comms gives the family/circle one place to coordinate when preparing or
responding. It starts as app-level communication in the Web/PWA core.

Comms is not Mesh/LoRa hardware. Hardware remains blocked by G-05.

---

## 2. Comportamento

COMMS-T01 ships three behaviors:

1. **Circle chat** — authenticated members of a circle can send and read short
   text messages in that circle.
2. **Radio quick guide** — the Comms page shows a concise radio-amateur/off-grid
   guide and common operating reminders.
3. **Mesh boundary** — the UI states clearly that BLE/LoRa/Mesh hardware is not
   connected and remains a future adapter.

The first version does not claim guaranteed delivery, SMS delivery, emergency
dispatch, or radio transmission.

---

## 3. Data Contract

### `circle_messages`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `circle_id` | uuid | references `circles(id)` on delete cascade |
| `sender_id` | uuid | references `profiles(id)` on delete cascade |
| `body` | text | trimmed message, max 1000 chars |
| `kind` | text | `text`, `system`, or `alert`; v1 writes only `text` |
| `created_at` | timestamptz | server timestamp |
| `deleted_at` | timestamptz | nullable soft delete marker |

RLS is enabled with no direct policies. Reads and writes go through
`/api/comms/messages`, which checks circle membership before using service-role
queries.

### API

`GET /api/comms/messages?circleId=...`

- Requires authenticated user.
- Requires caller membership in the circle.
- Returns the latest 80 non-deleted messages ascending by `created_at`.

`POST /api/comms/messages`

- Requires authenticated user.
- Requires caller membership in the circle.
- Body: `{ circleId: string, body: string }`.
- Trims body and rejects empty or >1000 characters.
- Inserts a `text` message.

---

## 4. Regras De Negócio

1. Only circle members can read or write circle messages.
2. Message writes are explicit user actions only.
3. Comms messages are not emergency alerts by default.
4. No message may claim delivery outside EOS.
5. Mesh/LoRa status remains informational until G-05 is cleared.
6. The UI must show when no circle exists.
7. The UI must degrade cleanly when the migration is not applied.

---

## 5. Critérios De Aceitação

COMMS-T01 is complete when:

1. `/comms` is reachable from BottomNav.
2. A circle member can select a circle, read recent messages, and send a message.
3. A non-member cannot read or write messages for another circle.
4. Empty and overlong messages are rejected.
5. Radio guide and Mesh boundary are visible on the Comms page.
6. `/comms` is protected by middleware.
7. Docs, roadmap, build status, and product memory are updated.

---

## 6. Fora Do Escopo

- SMS;
- email;
- WhatsApp integration;
- guaranteed delivery;
- push notification on every chat message;
- message delete/edit UI;
- end-to-end encryption;
- moderation tools;
- file/image/audio messages;
- BLE/LoRa hardware;
- CarPlay/Android Auto Comms.

---

## 7. Notas

Retention is intentionally simple in v1: messages persist until a future
retention policy is defined. This is acceptable for app-level prep coordination
but must be revisited before using Comms for high-sensitivity crisis timelines.

Implementation shipped on 2026-08-03:

- `/comms` lists the user's circles, shows recent circle messages and submits
  new text messages with Enter/form submit.
- `/api/comms/messages` enforces authenticated circle membership before
  service-role reads/writes.
- Migration: `supabase/migrations/20260803000000_circle_messages.sql`, applied
  by the owner on 2026-08-03 and verified via service-role.
- Radio and Mesh sections remain informational; Mesh/LoRa hardware remains
  blocked by G-05.
