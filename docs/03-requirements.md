# 03 — Requirements

---

## F01 — Authentication

| ID | Requirement | Status |
|---|---|---|
| F01-1 | User can sign up with email and password | ✅ IMPLEMENTED |
| F01-2 | User can log in with email and password | ✅ IMPLEMENTED |
| F01-3 | User can recover password via email | ✅ IMPLEMENTED |
| F01-4 | Auth uses SSR cookies (not localStorage tokens) | ✅ IMPLEMENTED |
| F01-5 | Protected routes redirect unauthenticated users to /login | ✅ IMPLEMENTED |

---

## F02 — Onboarding

| ID | Requirement | Status |
|---|---|---|
| F02-1 | User creates a profile (name, location) | ✅ IMPLEMENTED |
| F02-2 | User adds family members with medical/mobility flags | ✅ IMPLEMENTED |
| F02-3 | Onboarding is skippable and editable later | ✅ IMPLEMENTED |

---

## F03 — Resource Inventory

| ID | Requirement | Status |
|---|---|---|
| F03-1 | User inputs resource levels (fuel_liters, water_liters, food_days, battery_percent, cash) | ✅ IMPLEMENTED |
| F03-2 | Resource state persists to Supabase | ✅ IMPLEMENTED |
| F03-3 | Rules Engine reads inventory to evaluate urgency | ✅ IMPLEMENTED |

---

## F04 — Decision Engine

| ID | Requirement | Status |
|---|---|---|
| F04-1 | User describes a scenario in free text | ✅ IMPLEMENTED |
| F04-2 | Rules Engine evaluates urgency before LLM | ✅ IMPLEMENTED |
| F04-3 | LLM cannot downgrade Rules Engine urgency | ✅ IMPLEMENTED |
| F04-4 | CONNECTED mode uses OpenAI API + RAG | ✅ IMPLEMENTED |
| F04-5 | SURVIVAL mode uses Rules Engine only (no API) | ✅ IMPLEMENTED |
| F04-6 | LOCAL_AI mode uses on-device model | ❌ NOT IMPLEMENTED |
| F04-7 | Action plan is streamed to the client | ✅ IMPLEMENTED |
| F04-8 | Action plan is persisted to action_plans table | ✅ IMPLEMENTED |
| F04-9 | Knowledge sources are cited in the response | ✅ IMPLEMENTED |

---

## F05 — Checklist

| ID | Requirement | Status |
|---|---|---|
| F05-1 | User can generate a preparedness checklist | ✅ IMPLEMENTED |
| F05-2 | Checklist items can be checked/unchecked | ✅ IMPLEMENTED |
| F05-3 | Checklist persists across sessions | ✅ IMPLEMENTED |

---

## F06 — Circles

| ID | Requirement | Status |
|---|---|---|
| F06-1 | User can create a circle (family/community group) | ✅ IMPLEMENTED |
| F06-2 | User can join a circle via invite code | ✅ IMPLEMENTED |
| F06-3 | Circle members list is visible | ✅ IMPLEMENTED |

---

## F07 — PWA / Offline

| ID | Requirement | Status |
|---|---|---|
| F07-1 | App is installable as a PWA | ✅ IMPLEMENTED |
| F07-2 | SURVIVAL mode works without internet | ✅ IMPLEMENTED |
| F07-3 | Profile and inventory are cached in IndexedDB | ✅ IMPLEMENTED |
| F07-4 | Last 5 action plans are cached offline | ✅ IMPLEMENTED |
| F07-5 | Offline writes sync to Supabase on reconnect | ❌ NOT IMPLEMENTED |

---

## F08 — Language Settings

| ID | Requirement | Status |
|---|---|---|
| F08-1 | User can choose Portuguese or English in `/settings` | ✅ IMPLEMENTED |
| F08-2 | Language preference persists on the device | ✅ IMPLEMENTED |
| F08-3 | The app applies the selected language to navigation and interface copy | ✅ IMPLEMENTED |
| F08-4 | The document language metadata reflects the selected language | ✅ IMPLEMENTED |

---

## F09 — Master Profile

| ID | Requirement | Status |
|---|---|---|
| F09-1 | `/ficha` unifies identity and emergency information from `profiles` | ✅ IMPLEMENTED |
| F09-2 | User can edit name and location alongside emergency fields | ✅ IMPLEMENTED |
| F09-3 | User sees progressive profile completion | ✅ IMPLEMENTED |
| F09-4 | Existing public emergency QR remains available | ✅ IMPLEMENTED |
| F09-5 | Master Profile UI supports PT/EN | ✅ IMPLEMENTED |

---

## F10 — Profile Personalization & Pilot Memory

| ID | Requirement | Status |
|---|---|---|
| F10-1 | User can upload or store an authenticated profile photo for use in EOS components | ✅ IMPLEMENTED |
| F10-2 | User can maintain a Markdown personalization document with preferences, constraints, routines, and decision context | ✅ IMPLEMENTED |
| F10-3 | Pilot can read the personalization layer when producing contextual recommendations | ✅ IMPLEMENTED |
| F10-4 | Pilot memory is stored separately from user-authored preferences and can be updated only through explicit user-controlled flows in the MVP | ✅ IMPLEMENTED |
| F10-5 | Public emergency QR does not expose personalization, avatar, Pilot memory, or private preference context | ✅ IMPLEMENTED |

---

## F11 — Preparedness Engine

| ID | Requirement | Status |
|---|---|---|
| F11-1 | Checklist and Resources converge into one Preparação surface | ✅ IMPLEMENTED — PREP-T01 |
| F11-2 | EDU content can be cataloged by scenario and converted into actionable preparation only after approval/versioning | ✅ IMPLEMENTED — EDU-T01 |
| F11-3 | Circle-level Comms supports chat/reference workflows separately from Mesh/LoRa hardware | ✅ IMPLEMENTED — COMMS-T01 |
| F11-6 | Circle radio reference can be edited by Admin/Editor and read by all circle members | ✅ IMPLEMENTED — COMMS-T03 |
| F11-4 | Simulation invitations can drive contextual onboarding | ✅ IMPLEMENTED — ONB-T01 |
| F11-7 | Simulation debrief gaps can become confirmed preparedness tasks/resources with visible source | ✅ IMPLEMENTED — SIM-T11 |
| F11-5 | Pilot may propose preparedness tasks/resources but persistent writes require explicit confirmation and visible source | ✅ IMPLEMENTED — PILOT-T08 |
| F11-8 | Simulator free text can fill reviewable scenario panels before the drill starts | ✅ IMPLEMENTED — SIM-T09 |

---

## Non-Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| NF-1 | API response time < 2s for SURVIVAL mode | ✅ MET |
| NF-2 | Rate limiting: 10 req/60s per user | ✅ IMPLEMENTED |
| NF-3 | All user data isolated by RLS policies | ✅ IMPLEMENTED |
| NF-4 | Error monitoring with Sentry | ✅ WIRED (needs SENTRY_DSN) |
| NF-5 | PWA icons present (192px, 512px) | ❌ MISSING |
