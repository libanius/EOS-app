# 23 — Onboarding By Simulation

> **Status:** IMPLEMENTED — ONB-T01
> **Decision:** D-091
> **Date:** 2026-08-03
> **Surface:** Web/PWA core first
> **Roadmap:** ONB-T01

---

## 1. Objetivo

When a person enters EOS through a simulation invite, onboarding should start
from that situation. They should not land in a generic tutorial that forgets why
they came.

---

## 2. Comportamento

ONB-T01 ships a contextual bridge:

1. `/sim/[token]` can open before login, show the drill context, and send the
   visitor to login/signup with `redirectTo=/sim/[token]`.
2. Login preserves `redirectTo` instead of always sending the user to
   `/dashboard`.
3. Signup confirmation can carry `redirectTo` into `/onboarding`.
4. `/onboarding` reads the simulation token, shows the scenario context, saves
   the profile, then returns the user to `/sim/[token]`.
5. `/sim/[token]` still only adds the authenticated user as `invited`; the same
   acceptance pop-up decides whether they join the simulation.

---

## 3. Regras

1. A simulation link is context, not authority.
2. The invite never silently places a user into a simulation.
3. Onboarding must preserve the scenario reason across login/signup.
4. If the invite is expired, onboarding falls back to normal profile setup.
5. No new database table is required for ONB-T01.

---

## 4. Fora Do Escopo

- custom onboarding tasks from simulation debrief;
- automatic circle membership;
- auto-join simulation;
- tutorial videos;
- per-step onboarding analytics;
- task/resource writes.
