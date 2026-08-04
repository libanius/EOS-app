# 22 — EDU

> **Status:** IMPLEMENTED — EDU-T01 / EDU-T02 / EDU-T03 / EDU-T04
> **Decision:** D-090 / D-101 / D-103 / D-104
> **Date:** 2026-08-04
> **Owner:** Paulo Libânio Neto
> **Surface:** Web/PWA core first
> **Roadmap:** EDU-T01

---

## 1. Objetivo

EDU is the approved educational content layer for EOS. It lets the owner publish
scenario-tagged preparation content that users can read/watch before a crisis.

EDU is not generic web search. It is not automatic RAG ingestion yet. It is the
catalog and approval surface that makes later RAG ingestion auditable.

---

## 2. Comportamento

EDU-T01 ships four behaviors:

1. **Approved catalog** — authenticated users can browse approved educational
   content by scenario tags.
2. **Owner publishing** — app owner/admin can create, edit, approve, draft, or
   archive content in `/admin/edu`.
3. **Source visibility** — every item keeps source type, URL, summary,
   transcript/notes, scenario tags and version.
4. **RAG boundary** — content can be marked as approved for future RAG ingestion,
   but EDU-T01 does not create embeddings or mutate `knowledge_base`.

EDU-T02 adds one consumption behavior:

5. **In-app video consumption** — approved YouTube content with a recognizable
   `source_url` renders an embedded video player inside `/edu`. The source link
   remains visible. Non-YouTube or unrecognized URLs degrade to the source link.

EDU-T03 adds one ingestion behavior:

6. **Approved RAG ingestion** — owner/admin can ingest an approved item marked
   `rag_enabled=true` into `knowledge_base`. The ingestion uses owner-provided
   title, summary, transcript/notes, tags and URL; it does not fetch YouTube
   data automatically.

EDU-T04 adds one quality guardrail:

7. **RAG readiness guard** — RAG ingestion requires enough owner-provided
   instructional text in `summary` and/or `transcript`. Title, URL and tags are
   provenance/metadata; they do not count as instructional content.

---

## 3. Data Contract

### `edu_content`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `title` | text | required, max 160 chars |
| `source_type` | text | `youtube`, `manual`, `pdf`, `external` |
| `source_url` | text | optional source link |
| `scenario_tags` | text[] | tags such as `hurricane`, `fallout`, `blackout` |
| `summary` | text | short user-facing summary |
| `transcript` | text | transcript, notes, or teaching content |
| `status` | text | `draft`, `approved`, `archived` |
| `version` | integer | increments on owner update |
| `rag_enabled` | boolean | future ingestion intent, not ingestion itself |
| `rag_ingested_at` | timestamptz | null until a future ingestion job runs |
| `created_by` | uuid | owner/admin profile id |
| `updated_by` | uuid | last editor |
| `approved_at` | timestamptz | timestamp when status becomes approved |
| `created_at` | timestamptz | server timestamp |
| `updated_at` | timestamptz | server timestamp |

RLS is enabled with no direct policies. Reads/writes go through `/api/edu`.

---

## 4. API

`GET /api/edu`

- Requires authenticated user.
- Returns approved content by default.
- Supports `?tag=...`.
- App owner/admin can pass `?admin=1` to list all statuses.

`POST /api/edu`

- Requires authenticated owner/admin email from `ADMIN_EMAILS`.
- Creates or updates an item.
- Normalizes tags and clamps text lengths.
- Increments version on update.
- Does not write to `knowledge_base`.

`POST /api/admin/edu/ingest`

- Requires authenticated owner/admin email from `ADMIN_EMAILS`.
- Body: `{ "id": "<edu_content.id>" }`.
- Requires `status='approved'` and `rag_enabled=true`.
- Deletes previous `knowledge_base` chunks for `source='edu:<id>'`.
- Inserts fresh chunks using OpenAI `text-embedding-3-small`.
- Stores provenance in `source='edu:<id>'` and `source_version='v<version>'`.
- Updates `edu_content.rag_ingested_at`.
- Rejects content with less than 160 instructional characters from
  `summary + transcript`.

---

## 5. Regras De Negócio

1. EDU content must have visible source and scenario tags.
2. YouTube owner content enters as URL/transcript/summary first; API ingestion
   from YouTube is a later task.
3. Approved EDU may be shown to users and referenced by Pilot later.
4. `rag_enabled=true` means "eligible for future ingestion", not "already in
   RAG".
5. Persistent preparedness tasks/resources still require explicit confirmation.
6. EDU does not replace official emergency alerts, plans, or Comms.
7. Archived content should not show in user catalog.
8. Embedded video is presentation only. It does not imply transcript capture,
   RAG ingestion, task creation, or completion tracking.
9. RAG ingestion is explicit owner/admin action. `rag_enabled=true` makes content
   eligible, but ingestion only happens after the admin triggers it.
10. Reingestion replaces chunks for the same EDU item source.
11. A link-only video must not be ingested into RAG. Owner/admin must provide
   enough summary or notes first.

---

## 6. Acceptance Criteria

EDU-T01 is complete when:

1. `/edu` is protected and shows approved educational content.
2. `/admin/edu` lets owner/admin create or update EDU content.
3. `edu_content` exists as the canonical catalog table.
4. Users see source type, source URL, scenario tags, summary and transcript/notes.
5. Owner/admin can mark content `draft`, `approved`, or `archived`.
6. Docs, roadmap, build status and product memory are updated.
7. RAG ingestion is explicitly out of scope for this task.
8. YouTube videos can be watched inside `/edu` when the URL can be safely
   converted to an embed URL.
9. Owner/admin can ingest approved, RAG-enabled content into `knowledge_base`
   with `edu_content.id/version` preserved as provenance.
10. Admin sees RAG text readiness and cannot ingest link-only content.

---

## 7. Fora Do Escopo

- YouTube API integration;
- automatic transcript fetching;
- automatic embeddings without explicit admin action;
- task/checklist creation from EDU;
- per-circle EDU assignments;
- video hosting outside provider embeds;
- video progress/completion tracking;
- moderation/review workflows beyond owner/admin status.
