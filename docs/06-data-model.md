# 06 — Data Model

---

## Core Tables

### profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, references auth.users |
| name | text | |
| location | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

`profiles` is also the storage source for the Ficha Master. Emergency-card fields
added by migration `20260628000400_profile_emergency_card.sql` are:
`blood_type`, `allergies`, `emergency_contact_name`,
`emergency_contact_phone`, `medical_notes`, and `medications`.
There is no separate Master Profile table.

**Location — two distinct concepts (D-064). Do not conflate them:**

| Column | Type | Notes |
|---|---|---|
| location_lat / location_lng | double precision | **Profile point.** Geocoded home/base address. Static. Pre-existing. |
| last_location_lat / last_location_lng | double precision | **Live point.** Last GPS position reported by the client. Added by `20260727000000_live_location.sql`. |
| last_location_at | timestamptz | When the live point was recorded. Drives the freshness label. |
| last_location_accuracy_m | double precision | GPS accuracy in metres, as reported by the browser. |

Retention is **the latest point only** (D-051 §2, reaffirmed by D-064). There is no
trail, no replay and no history table — a new report overwrites the previous one.
A live point is only readable by others when the member has consented (see
`circle_members.shared_fields` below); otherwise the profile point is used and must
be labelled `perfil`, never as a current position.

### profile_personalization
| Column | Type | Notes |
|---|---|---|
| profile_id | uuid | PK/FK → profiles.id; one row per authenticated profile |
| avatar_url | text | Optional authenticated profile image URL used by EOS UI components |
| avatar_path | text | Optional private Supabase Storage path in bucket `profile-photos` |
| user_context_md | text | User-authored Markdown preferences/context for Pilot |
| pilot_memory_md | text | Pilot-maintained memory document; explicit user-controlled writes in MVP |
| decision_style | text | `concise`, `balanced`, `detailed`, or `checklist` |
| risk_tolerance | text | `conservative`, `balanced`, or `flexible` |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| pilot_memory_updated_at | timestamptz | Last explicit update to Pilot memory |

This table is part of the authenticated Ficha Master experience but is not part
of the public emergency QR contract.

### Storage buckets

| Bucket | Public | Contents | Access |
|---|---|---|---|
| profile-photos | false | User profile photos under `{profile_id}/avatar.{ext}` | Owner-only RLS; authenticated API returns temporary signed URLs |

### family_members
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| profile_id | uuid | FK → profiles.id |
| name | text | |
| age | integer | |
| medical_conditions | text[] | array of conditions |
| mobility_impaired | boolean | |
| is_infant | boolean | |
| created_at | timestamptz | |

### resource_inventory
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| profile_id | uuid | FK → profiles.id |
| fuel_liters | numeric | |
| water_liters | numeric | |
| food_days | numeric | |
| battery_percent | numeric | |
| cash | numeric | |
| has_medical_kit | boolean | |
| has_communication_device | boolean | |
| updated_at | timestamptz | |

### scenarios
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| profile_id | uuid | FK → profiles.id |
| description | text | user's emergency description |
| type | scenario_type_enum | inferred from description |
| created_at | timestamptz | |

### action_plans
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| scenario_id | uuid | FK → scenarios.id |
| mode | text | CONNECTED, LOCAL_AI, SURVIVAL |
| priority | smallint | 4=CRITICAL, 3=HIGH, 2=MEDIUM, 1=LOW |
| risks | text[] | |
| immediate_actions | text[] | next 15 minutes |
| short_term_actions | text[] | next 1 hour |
| mid_term_actions | text[] | next 3–24 hours |
| rules_applied | text[] | which rules fired |
| created_at | timestamptz | |

### checklists
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| profile_id | uuid | FK → profiles.id |
| title | text | |
| items | jsonb | array of {text, checked} |
| created_at | timestamptz | |

### circles
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| owner_id | uuid | FK → profiles.id |
| invite_code | text | unique |
| created_at | timestamptz | |

### circle_members
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| circle_id | uuid | FK → circles.id |
| profile_id | uuid | FK → profiles.id |
| joined_at | timestamptz | |
| share_inventory | boolean | member shares resources with the circle |
| shared_fields | text[] | which fields are shared |

**`shared_fields` semantics (D-064):**

| Value | Gates |
|---|---|
| `water`, `food`, `medical`, `comms` | inventory quantities in the household pool |
| `emergency_contact` | emergency contact name/phone |
| `location` | **both** the live point and the profile point on the map |

An **empty array means "share all"** for the inventory/contact fields — that legacy
default predates D-064. `location` is deliberately **excluded from that default**:
it is only shared when the string `location` is explicitly present. Members who
never touched the toggle must not start broadcasting position because of a legacy
convention.

### circle_messages
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| circle_id | uuid | FK → circles.id, cascade delete |
| sender_id | uuid | FK → profiles.id, cascade delete |
| body | text | User-authored message, 1–1000 characters after trim |
| kind | text | `text`, `system`, or `alert`; COMMS-T01 writes only `text` |
| created_at | timestamptz | Server timestamp |
| deleted_at | timestamptz | Nullable soft delete marker |

`circle_messages` is the v1 data contract for app-level Comms (D-087 /
COMMS-T01). RLS is enabled with no direct policies: clients must not read or
write this table directly. `/api/comms/messages` checks authenticated membership
in `circle_members` before service-role reads/writes. Chat messages are not
emergency alerts by default and do not imply SMS, dispatch, radio transmission,
or Mesh/LoRa delivery.

### circle_radio_profiles
| Column | Type | Notes |
|---|---|---|
| circle_id | uuid | PK/FK → circles.id, cascade delete |
| config | jsonb | Normalized `RadioConfig` for PT/EN radio reference content |
| updated_by | uuid | FK → profiles.id, nullable on delete |
| updated_at | timestamptz | Last saved timestamp |

`circle_radio_profiles` is the editable radio reference for Comms (D-089 /
COMMS-T03). It is separate from `circle_messages`: chat messages are events,
radio profile is configuration. RLS is enabled with no direct policies. Reads
and writes go through `/api/comms/radio`; all circle members can read, but only
`Admin` and `Editor` roles can write. The JSON stores operational reference
content only; it is not a legal validation engine or proof of transmission
rights.

### knowledge_base
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| content | text | chunk text |
| embedding | vector(1536) | text-embedding-3-small |
| source | text | filename without extension |
| scenario_type | scenario_type_enum | inferred from filename |
| chunk_index | integer | position in source document |
| created_at | timestamptz | |

---

## Enums

```sql
CREATE TYPE scenario_type_enum AS ENUM (
  'HURRICANE', 'EARTHQUAKE', 'FALLOUT', 'PANDEMIC', 'FIRE', 'FLOOD', 'GENERAL'
);
```

---

## IndexedDB Stores (offline cache)

| Store | Contents |
|---|---|
| profile | Current user profile |
| inventory | Current resource inventory |
| plans | Last 5 action plans |
| checklist | Current checklist |

---

## Critical Field Name Notes

These have caused bugs. Never use the wrong names:
- `profiles.id` (not `profiles.user_id`)
- `family_members.profile_id` (not `family_members.user_id`)
- `resource_inventory.profile_id` (not `resource_inventory.user_id`)
- `resource_inventory.fuel_liters` (not `fuel`)
- `resource_inventory.battery_percent` (not `battery`)
- `resource_inventory.has_medical_kit` (not `medical_kit`)
- `action_plans.priority` is `smallint` — must map string → int (CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1)
