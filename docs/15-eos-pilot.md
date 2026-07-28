# 15 — EOS Pilot

> Status: SPEC / CONCEPT DECIDED — **IMPLEMENTADO em produção (2026-07-27)**
> Date: 2026-07-20
> Decision: D-046 · implementação: **D-062.1** (WV2-T03)
>
> **Casa definitiva:** o Pilot deixou de ser "complicação do dashboard" (PILOT-T01, ON HOLD) e deixou de ser a Pilot Capsule do HWD-05. Agora é o **orbe + console** do World v2 (`components/world-v2/Pilot.tsx`), sempre a um toque em `/dashboard`.
> **Desvio relevante desta spec:** o motor é **determinístico, local e síncrono** (`pilot-engine.ts`), não um fluxo assistido por modelo. Razão: a promessa do produto é responder quando a rede caiu. As 5 atividades da PILOT-T02 foram substituídas por **5 intenções** de decisão ("o que faço agora", "ficar ou sair", "quanto tempo aguentamos", "o que está faltando", "dá para sair"). Os estados GO/LIMITED/WAIT/AVOID/PRIORITY OVERRIDE (PILOT-T03) viraram os vereditos `ready`/`watch`/`hold`/`act`, com as regras de domicílio vindo do `RulesEngine` canônico.
> **PILOT-T04 (métricas) segue PENDING.**

---

## 1. Origin

EOS was conceived primarily as a preparation, monitoring, and emergency response system. That is strong, but commercially incomplete: major emergencies are sporadic. A user may understand the app's value and still go weeks without opening it.

The strategic question that created Pilot was:

> "I have EOS, but how can I use all these data points day to day, before a serious emergency, to make better weekend decisions with my family?"

The same data used to decide whether to prepare for a hurricane, evacuate, check route safety, or verify supplies can also help decide whether today is a good day to fish, hunt, boat, camp, travel, or return before conditions deteriorate.

The core insight:

> EOS does not need to serve only when the user must act. It can also help when the user is deciding whether they can act.

In recreation, the question is:

> Can I do this today?

In emergency, the question is:

> What should I do now?

The decision engine can be the same. Priority, context, and severity change.

---

## 2. Product Definition

### Short Definition

EOS Pilot is a contextual decision module that asks what the user intends to do, learns from the user's choices, and uses EOS data to recommend how, when, or whether that action should happen.

### Product Definition

Pilot is an integrated capability in the EOS Dashboard that:

1. Identifies user intent.
2. Crosses that intent with external and internal data.
3. Produces an objective recommendation.
4. Explains the main factors.
5. Learns from interaction.
6. Reduces effort in future interactions.
7. Automatically yields priority when a relevant threat exists.

### What Pilot Is Not

Pilot is not:

- A generic chatbot.
- A separate app inside EOS.
- A simple weather screen.
- An isolated recreational recommender.
- An AI that makes final decisions for the user.
- A Dashboard replacement.
- A separate visual system pasted onto EOS.

Pilot is an intelligence layer connected to the existing EOS environment.

---

## 3. Role Inside EOS

The functional split is:

### Dashboard Informs

The Dashboard presents current status:

- Risk index.
- Alerts.
- Readiness.
- Family status.
- Environmental conditions.
- Relevant resources.

It answers:

> How is the environment right now?

### Pilot Interprets

Pilot relates those conditions to an intention.

It answers:

> Given these conditions, what makes sense to do?

### Plan Operationalizes

Once a decision is made, EOS can generate:

- Plan.
- Checklist.
- Time window.
- Route.
- Equipment.
- Members involved.
- Contingencies.
- Return triggers.
- Re-evaluation points.

It answers:

> How do we execute this safely?

The sequence is:

```text
Monitor
Interpret
Decide
Plan
Execute
Re-evaluate
```

Pilot primarily owns interpretation and decision.

---

## 4. Primary Prompt

Pilot starts with:

> What's the plan?

Portuguese:

> Qual e o plano?

This prompt was chosen because it is short, natural, works for recreation and emergencies, invites interaction, does not presume intent, and lets EOS understand intent before interpreting data.

The difference:

```text
Dashboard informs.
Pilot asks.
```

---

## 5. Learning Model

Pilot learns through choices, not only through open-ended conversation.

The experience should not begin as a generic chat input. It should begin with structured options:

- Fishing.
- Hunting.
- Boating.
- Camping.
- Family Outdoor.
- Road Trip.
- Running.
- Other.

After an activity selection, Pilot asks progressive contextual questions:

```text
Fishing
Boat or shore?
Freshwater or saltwater?
Alone or with family?
```

Pilot must not ask everything at once. Personalization happens through small decisions.

Product principle:

> Every interaction must reduce the next interaction.

Portuguese:

> Toda interacao deve tornar a proxima mais simples.

---

## 6. Three Levels Of Learning

### Level 1 — Understand The Environment

Pilot uses:

- Weather.
- Radar / precipitation.
- Wind.
- Temperature.
- Humidity.
- Tides.
- Pressure.
- Lightning.
- Air quality.
- Visibility.
- Solar window.
- Marine conditions.
- Official alerts.

### Level 2 — Understand The User

Pilot learns:

- Favorite activities.
- Preferred times.
- Frequent locations.
- Available equipment.
- Experience level.
- Rain tolerance.
- Wind tolerance.
- Individual vs family preference.
- Logistical limits.

### Level 3 — Understand How The User Decides

Pilot eventually learns the user's decision process:

- Accepts light rain for fishing.
- Avoids wind above a certain threshold.
- Never goes out with lightning risk.
- Prefers returning before sunset.
- Takes family only under conservative conditions.
- Accepts more risk alone than with family.
- Cancels when the decision window is too short.

This is the differentiator: Pilot does not just learn preferences. It learns how the user makes decisions.

### Profile Personalization Source

The long-lived personalization source is the authenticated Ficha Master extension
`profile_personalization` (D-059):

- `user_context_md`: user-authored Markdown preferences, constraints, routines,
  equipment notes, family norms, and decision context.
- `pilot_memory_md`: Pilot-maintained memory document for learned preferences.
- `decision_style`: how the user wants recommendations framed.
- `risk_tolerance`: conservative/balanced/flexible bias for non-critical decisions.
- `avatar_url`: reusable authenticated profile image for EOS components.

Critical alerts and Rules Engine outputs still override this layer. Pilot can
read personalization for context, but automatic writes to `pilot_memory_md`
require a future explicit confirmation/audit flow; the MVP does not let the
agent silently mutate long-term memory.

---

## 7. Response Structure

After intent is known, Pilot answers four questions:

### 1. Can I?

Allowed recommendation states:

- `GO`
- `LIMITED`
- `WAIT`
- `AVOID`

### 2. Is It Worth It?

Examples:

- `Confidence 91%`
- `Strong recommendation`

Confidence must be defined carefully so it does not imply false precision.

### 3. Until When?

Example:

```text
Best window
7:30 AM-1:40 PM
```

### 4. Why?

Example:

```text
Primary driver
Wind increasing after 2 PM

Weather     Favorable
Lightning   Low risk
Tides       Excellent
Family      Available
Equipment   Ready
```

These four elements form the core experience.

---

## 8. Decision Hierarchy

Pilot must not conflict with the core EOS safety mission.

### State 1 — Opportunity

Pilot identifies a positive opportunity.

Example:

```text
GOOD CONDITIONS
Recommended for shore fishing
```

### State 2 — Advisory

The activity is possible but limited.

Example:

```text
LIMITED WINDOW
Fishing is viable until 1:00 PM
Winds increase afterward
```

### State 3 — Priority Override

A relevant threat takes priority.

Example:

```text
PRIORITY OVERRIDE
Recreational guidance suspended
Hurricane preparation requires attention
```

This is mandatory. EOS cannot keep suggesting recreation while a serious threat requires action.

---

## 9. Deterministic Safety Principle

Pilot may use AI to:

- Summarize.
- Explain.
- Personalize.
- Prioritize.
- Generate language.
- Adapt questions.
- Interpret preferences.

Critical decisions must be backed by deterministic rules.

Rules must override AI when there is:

- Hurricane Warning.
- Tornado Warning.
- Severe Thunderstorm Warning.
- Official evacuation order.
- Lightning risk above threshold.
- Marine condition above safe threshold.
- Route blockage.
- Critical official alert.

Conceptual formula:

```text
Critical rules
+ Official data
+ User context
+ Learned preferences
+ AI interpretation
= Pilot recommendation
```

Critical rules always win.

---

## 10. UX Decision

Pilot is not a new permanent tab for the first test.

Decision:

> Pilot appears as a complication or integrated module inside the main Dashboard instrument.

Reasons:

- Avoid reorganizing navigation.
- Keep Pilot connected to EOS.
- Test interest before heavier infrastructure.
- Preserve the current Dashboard.
- Measure whether users tap the prompt.
- Reduce risk of a disconnected experience.

Dashboard entry:

```text
PILOT
What's the plan?
Tap to choose your activity
```

The module may expand after tap.

It must not look like a marketing banner or generic chatbot card. It should feel embedded in the instrument.

---

## 11. Relation To Risk Index

Risk Index answers:

> What is the general risk level right now?

Pilot answers:

> What does that risk mean for what I want to do?

Example:

```text
Risk Index
19 — Safe

Pilot
What's the plan?

After selection:
Fishing
GO
Best window: 7:40 AM-12:30 PM
```

The index is general. The Pilot recommendation is contextual.

---

## 12. Data Sources

### External Data

- NOAA.
- NWS.
- NHC.
- Radar.
- Precipitation.
- Lightning.
- Wind.
- Pressure.
- Tides.
- Currents.
- Waves.
- Temperature.
- Humidity.
- Visibility.
- Air quality.
- UV.
- Sunrise / sunset.
- Moon phase.
- Traffic.
- Routes.
- Government alerts.

### User Data

- Location.
- Favorite activities.
- History.
- Experience.
- Preferences.
- Equipment.
- Vehicle.
- Fuel.
- Range / autonomy.
- Calendar.
- Personal restrictions.
- Risk tolerance.

### Family Data

- Participating members.
- Shared location.
- Availability.
- Special needs.
- Medications.
- Age.
- Physical capacity.
- Vehicles.
- Contacts.
- Responsibilities.

### Operational Data

- Existing plan.
- Available resources.
- Checklist.
- Routes.
- Meeting points.
- Shelters.
- Contacts.
- Inventory.

Pilot's value comes from crossing these matrices.

---

## 13. Example — Recreation

Input:

```text
PILOT
What's the plan?

User: Fishing
Pilot: Boat or shore?
User: Shore
```

Output:

```text
SHORE FISHING
GO

Confidence
91%

Best window
7:40 AM-12:30 PM

Primary limitation
Winds increase after 1:30 PM

Weather     Favorable
Tides       Excellent
Lightning   Low
UV          High after 11 AM
Family      No conflicts
Equipment   Ready
```

Actions:

- Build plan.
- Add to calendar.
- Share with family.
- Review gear.

---

## 14. Example — Emergency

If a Hurricane Warning exists, the normal recreational flow is interrupted.

```text
PRIORITY OVERRIDE
Hurricane Warning detected

Recommended action
Begin preparation

Decision window
4h 20m

Storm track       High impact
Wind arrival      5:40 PM
Fuel              42%
Family status     1 member away
Evacuation route  Open
Supplies          68%
```

Actions:

- Create emergency plan.
- Contact family.
- Review evacuation route.
- Complete checklist.

The module is the same. Priority changes.

---

## 15. Voice And Tone

Pilot must sound:

- Direct.
- Calm.
- Technical.
- Clear.
- Trustworthy.
- Brief.
- Non-alarmist.
- Not childish.
- Not theatrical.

Good examples:

- "Conditions are favorable until 1:40 PM."
- "Winds are increasing earlier than expected."
- "Family readiness is high. Weather is the limiting factor."
- "Recreational recommendations are paused due to an active warning."

Avoid:

- "Hey! It looks like an awesome day for fishing!"
- "Oh no! A hurricane may be coming!"
- "I think you should probably consider leaving."

Pilot should speak like a trained copilot, not a character.

---

## 16. Product Principles

1. Ask before interpreting.
2. Show recommendation before data.
3. Explain the recommendation.
4. Learn without adding friction.
5. Do not repeat answered questions.
6. Critical rules always win.
7. The human remains in control.
8. Complexity stays behind the interface.
9. Each interaction reduces the next.
10. Pilot remains visually part of EOS.

---

## 17. Prototype Hypotheses

The first prototype should validate:

1. Users understand "What's the plan?" immediately.
2. Users see daily value beyond emergencies.
3. The Dashboard-integrated module invites interaction without competing with Risk Index.
4. Users trust recommendations more when factors are visible.
5. The same visual system works for recreation and emergency.
6. Progressive personalization reduces friction.
7. Priority Override is understood and does not feel inconsistent.
8. Pilot increases EOS open frequency.

---

## 18. First MVP

The MVP should test the experience before full infrastructure.

### Initial Activities

- Fishing.
- Boating.
- Camping.
- Family Outdoor.
- Road Trip.

### Initial Data

- Weather.
- Wind.
- Rain.
- Lightning.
- UV.
- Sunrise / sunset.
- Tides for coastal activities.
- Manually entered family availability.
- Manually selected equipment.

### Recommendation States

- `GO`
- `LIMITED`
- `WAIT`
- `AVOID`

### Response Elements

- Confidence.
- Best window.
- Primary driver.
- Three reasons.
- One recommendation.
- Action to create a plan.

### Required Prototype Scenario

The prototype must include `PRIORITY OVERRIDE`, even if initially simulated.

---

## 19. Metrics

### Discovery

- Percent of users who tap Pilot.
- Time to first tap.
- Most selected activities.

### Comprehension

- Do users understand `GO`, `LIMITED`, and `AVOID`?
- Do users understand the decision window?
- Do users understand Risk Index vs recommendation?

### Trust

- Do users open factors?
- Do users change activity after recommendation?
- Do users consider the recommendation trustworthy?

### Retention

- Do users return to Pilot?
- Do users repeat the same activity?
- Do users accept history-based suggestions?

### Personalization

- Do users answer progressive questions?
- Do users correct preferences?
- Do future suggestions feel more relevant?

### Safety

- Do users understand Priority Override?
- Does the system interrupt recreational flow correctly?
- Is urgency clear without confusion?

---

## 20. Risks

### Risk 1 — False Precision

Recommendations like `91%` can feel scientific even under uncertainty.

Mitigation:

- Define confidence clearly.
- Show last update.
- Show sources.
- Communicate limits.

### Risk 2 — Recommendation As Guarantee

`GO` must not mean "zero risk."

Mitigation:

- Define `GO` as favorable within analyzed criteria.
- Show factors.
- Include contextual warnings.

### Risk 3 — Preference vs Safety

The system may learn that the user accepts high risk.

Mitigation:

- Preferences never override critical limits.
- Official rules take precedence.

### Risk 4 — Invasive Personalization

Users may feel the app infers too much.

Mitigation:

- Be transparent.
- Allow preferences to be deleted or edited.
- Explain why a suggestion appeared.

### Risk 5 — Too Much Conversation

Too many questions create fatigue.

Mitigation:

- Use quick options.
- Ask only when answers affect recommendation.
- Reuse previous answers.

### Risk 6 — Dashboard Pollution

Pilot could compete with Risk Index.

Mitigation:

- Compact complication.
- One clear question.
- Expand only after tap.

---

## 21. Conceptual Architecture

```text
EOS CORE
|
+-- External Intelligence
|   +-- Weather
|   +-- Alerts
|   +-- Tides
|   +-- Lightning
|   +-- Air quality
|   +-- Routes
|
+-- Personal Context
|   +-- Preferences
|   +-- History
|   +-- Experience
|   +-- Equipment
|   +-- Schedule
|
+-- Family Context
|   +-- Members
|   +-- Availability
|   +-- Location
|   +-- Needs
|
+-- Safety Rules
|   +-- Official warnings
|   +-- Critical thresholds
|   +-- Override logic
|   +-- Emergency priorities
|
+-- PILOT
    +-- Ask intention
    +-- Select activity
    +-- Evaluate context
    +-- Recommend
    +-- Explain
    +-- Learn
    +-- Create plan
```

---

## 22. Positioning Summary

| Field | Value |
|---|---|
| Name | EOS Pilot |
| Category | Contextual guidance and decision module inside EOS |
| Problem | Environmental and personal data are hard to interpret; traditional apps show conditions but do not say what they mean for real plans |
| Solution | Pilot asks what the user intends to do and turns EOS data into an objective, personalized, explainable recommendation |
| Promise | Turn complex conditions into a clear decision |
| Primary input | What's the plan? |
| Primary output | Recommendation, confidence, decision window, primary driver |
| Differentiator | Combines environmental context, personal context, family context, resources, safety rules, and progressive learning |
| Emergency role | Suspends recreation and prioritizes protection, preparation, and response when relevant threats exist |

---

## 23. Final Concept

EOS Pilot is the decision layer of EOS. It starts by asking "What's the plan?", learns from user choices, and crosses intent, environment, family, resources, and safety rules to recommend what to do, when to do it, and which factors matter. Under normal conditions, it helps the user make better use of the day. Under critical conditions, it interrupts recreational flow and prioritizes protection, preparation, and response.

The origin sentence:

> The same system that helps you decide whether you can fish today should know when to tell you it is time to go home and prepare your family.
