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

### pilot_memory_events
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| profile_id | uuid | FK → profiles.id |
| source | text | e.g. `pilot_chat` |
| reason | text | Why the memory was useful enough to propose |
| proposal_md | text | Exact Markdown the user confirmed |
| previous_memory_md | text | Snapshot before confirmation |
| next_memory_md | text | Snapshot after confirmation |
| status | text | `confirmed` |
| confirmed_at | timestamptz | |
| created_at | timestamptz | |

UPP-03 writes this table only through RPC `confirm_pilot_memory(...)`, which
updates `profile_personalization.pilot_memory_md` and inserts the audit event in
one database transaction. Browser clients have read-only RLS for their own
events and no direct insert/update policy.

### affiliate_codes
| Column | Type | Notes |
|---|---|---|
| code | text | PK; customer-facing Stripe promotion code, e.g. `EOSPARTNER` |
| tag | text | Admin label/campaign tag |
| active | boolean | Whether checkout may use it |
| eligible_plans | text[] | `family` and/or `premium` |
| discount_percent_off | integer | Current D-099 default: 100 |
| discount_duration | text | Current D-099 value: `once` |
| commission_percent | numeric | Current `EOSPARTNER` default: 70 |
| max_redemptions | integer | Nullable = unlimited |
| stripe_coupon_id | text | Stripe coupon backing the discount |
| stripe_promotion_code_id | text | Stripe promotion code ID used by Checkout `discounts` |
| stripe_promotion_code | text | Human-facing code |
| created_by | uuid | Admin user who created/synced it |
| created_at / updated_at | timestamptz | |

### affiliate_referrals
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| affiliate_code | text | FK → `affiliate_codes.code` |
| profile_id | uuid | User attributed to the checkout |
| plan | text | `family` or `premium` |
| stripe_customer_id | text | |
| stripe_subscription_id | text | Unique when known |
| stripe_checkout_session_id | text | Unique |
| status | text | `pending`, `converted`, `canceled` |
| created_at / converted_at | timestamptz | |

### affiliate_conversions
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| affiliate_code | text | FK → `affiliate_codes.code` |
| referral_id | uuid | FK → `affiliate_referrals.id` |
| profile_id | uuid | User who paid |
| plan | text | `family` or `premium` |
| stripe_customer_id / stripe_subscription_id | text | |
| stripe_invoice_id | text | Unique; source of payment truth |
| amount_paid_cents | integer | Stripe `amount_paid`; must be > 0 |
| currency | text | |
| commission_percent | numeric | Snapshot from code at conversion time |
| commission_cents | integer | Calculated owed amount |
| status | text | `owed`, `paid`, or `void` |
| occurred_at / created_at | timestamptz | |

Affiliate tables are RLS-enabled with no browser policies. Owner/admin routes and
Stripe webhook use service-role access. No commission is recorded for zero-dollar
invoices.

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
| scenario_id | uuid | Optional FK → scenarios.id |
| canonical_key | text | Dedup key generated from item name |
| item_name | text | Display name |
| tier | checklist_tier_enum | `ESSENTIAL`, `MODERATE`, `EXCELLENT` |
| quantity | numeric | |
| unit | text | Nullable |
| acquired | boolean | |
| acquired_at | timestamptz | Nullable |
| kit_type | text | Source/grouping: `GERAL`, `BUG_OUT`, `SIMULATION_DEBRIEF`, etc. |

`SIMULATION_DEBRIEF` is the v1 persistence marker for SIM-T11. It means the
item was explicitly confirmed from a simulation debrief proposal.
`PILOT_RECOMMENDATION` is the v1 persistence marker for PILOT-T08. It means the
item was explicitly confirmed from a Pilot proposal. Neither is an automatic
write; both should be displayed as source/provenance in Preparação.

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
| family_access_status | text | `none`, `requested`, `approved`, `denied` |
| family_access_requested_at | timestamptz | when the member requested inner-family access |
| family_access_requested_by | uuid | Admin/head who invited this member into the intimate family layer |
| family_access_approved_at | timestamptz | when an Admin approved/denied inner-family access |
| family_access_approved_by | uuid | Admin who last approved/denied inner-family access |

**`shared_fields` semantics (D-064):**

| Value | Gates |
|---|---|
| `water`, `food`, `medical`, `comms` | inventory quantities in the household pool |
| `emergency_contact` | emergency contact name/phone |
| `location` | **both** the live point and the profile point on the map |

**D-107 correction**: `medical` does **not** make another circle member part of
the user's intimate family. It gates medical inventory/resource sharing only.
Pilot access to another user's master medical ficha requires
`family_access_status='approved'` on that member's `circle_members` row.

An **empty array means "share all"** for the inventory/contact fields — that legacy
default predates D-064. `location` is deliberately **excluded from that default**:
it is only shared when the string `location` is explicitly present. Members who
never touched the toggle must not start broadcasting position because of a legacy
convention.

**Family access semantics (D-107):**

| Value | Meaning |
|---|---|
| `none` | member is in the broader circle only |
| `requested` | Admin/head invited the member into the intimate family layer; member must accept |
| `approved` | data owner accepted intimate-family access; Pilot may use master ficha fields |
| `denied` | data owner denied the request; member remains in the broader circle |

Family access does not replace `location` consent. Live/profile location remains
visible only when `shared_fields` contains `location` or when viewing yourself.

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
| source_version | text | For EDU ingestion: `v<edu_content.version>` |
| scenario_type | scenario_type_enum | inferred from filename |
| chunk_index | integer | position in source document |
| created_at | timestamptz | |

EDU-T03 also writes approved educational content into `knowledge_base` using
`source='edu:<edu_content.id>'` and `source_version='v<edu_content.version>'`.
This preserves provenance without a new table or schema change.

### edu_content
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| title | text | Required educational item title |
| source_type | text | `youtube`, `manual`, `pdf`, or `external` |
| source_url | text | Optional source URL |
| scenario_tags | text[] | Scenario tags used by `/edu` filters |
| summary | text | User-facing content summary |
| transcript | text | Transcript, notes, or teaching body |
| status | text | `draft`, `approved`, or `archived` |
| version | integer | Increments on owner/admin update |
| rag_enabled | boolean | Eligible for future RAG ingestion; not proof of ingestion |
| rag_ingested_at | timestamptz | Null until a future explicit ingestion job writes embeddings |
| created_by / updated_by | uuid | FK → profiles.id |
| approved_at | timestamptz | Set when status becomes approved |
| created_at / updated_at | timestamptz | |

`edu_content` is the official EDU catalog (D-090 / EDU-T01). RLS is enabled
with no direct policies. `/api/edu` returns approved content to authenticated
users and lets only app owner/admin emails create/update content. It does not
write to `knowledge_base`; YouTube/API ingestion and embedding generation are
future explicit tasks that must preserve `edu_content.id` and `version` as
provenance.

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
