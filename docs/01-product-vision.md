# 01 — Product Vision

---

## Why EOS Exists

When a hurricane, earthquake, or civil emergency hits, most families freeze.
They have 15 minutes to make decisions that will affect the next 72 hours.
They need a system, not a checklist.

EOS is that system. It combines real emergency management protocols (FEMA, Red Cross, Military FM)
with AI reasoning to give a family head a prioritized, actionable plan in under 60 seconds.

---

## Who It's For

Primary user: the family head — the person responsible for the family's survival decisions.
- Age 25–55, parent or caretaker
- Has dependents: children, elderly, people with mobility or medical needs
- Owns or rents a home in a disaster-prone area
- Not a prepper — just a responsible adult who wants to be ready

---

## North Star

**"The next 15 minutes."**

Every feature must answer: does this help the family head in the next 15 minutes of a crisis?
If not, it is a Phase 3+ feature.

---

## Three-Tier Intelligence

EOS works at three levels, in order of preference:

| Mode | When | What |
|---|---|---|
| CONNECTED | Internet + auth available | Claude API + RAG from 3850 knowledge chunks |
| LOCAL_AI | No internet, device has model | llama.rn on-device model (planned) |
| SURVIVAL | Always | Rules Engine only — deterministic, instant |

These are a **fallback chain**, not feature toggles.
The Rules Engine always runs first. The LLM cannot downgrade its urgency output.

---

## Knowledge Foundation

14 emergency PDFs are pre-ingested into the knowledge base (3850 chunks):
CDC, FEMA, IASC, John Seymour Self-Sufficiency, Military FM 21-76, Navy SEAL Bug-In Guide,
NCTSN PFA, Red Cross Disaster Handbook, SAMHSA (3 guides), SAS Survival Handbook, WHO PFA.

---

## Design Philosophy

- Offline-first: SURVIVAL mode always works, no network required
- Speed over completeness: a fast imperfect answer beats a slow perfect one
- Family-aware: decisions account for infants, mobility-impaired, medical conditions
- No friction: auth once, then zero-click emergency mode
