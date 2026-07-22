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

### profile_personalization
| Column | Type | Notes |
|---|---|---|
| profile_id | uuid | PK/FK → profiles.id; one row per authenticated profile |
| avatar_url | text | Optional authenticated profile image URL used by EOS UI components |
| user_context_md | text | User-authored Markdown preferences/context for Pilot |
| pilot_memory_md | text | Pilot-maintained memory document; explicit user-controlled writes in MVP |
| decision_style | text | `concise`, `balanced`, `detailed`, or `checklist` |
| risk_tolerance | text | `conservative`, `balanced`, or `flexible` |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| pilot_memory_updated_at | timestamptz | Last explicit update to Pilot memory |

This table is part of the authenticated Ficha Master experience but is not part
of the public emergency QR contract.

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
