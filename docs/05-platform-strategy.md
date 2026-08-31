# 05 — Platform Strategy

> Last updated: 2026-08-31
> Decisões: D-084 — EOS Platform, not parallel apps; **D-228** — a casca nativa
> é Capacitor, e existe para ser a camada 4 desta página, não um segundo produto.

---

## Strategic Position

EOS is a **multi-surface platform** with one operational core. The product must
not split into separate Web, iOS, Android, Automotive, and Mesh products.

The architecture is layered:

1. **Product Core** — what EOS does: Pilot, Risk Engine, Family, Plans,
   Weather, Shelters, Routes, Simulation, Preparedness, EDU, and Comms.
2. **Domain Core** — the rules and safety logic: decision engine, risk scoring,
   consent, offline rules, source authority, freshness, and execution order.
3. **Shared UI** — the EOS design system and reusable surfaces: HUD, sheets,
   map overlays, status pills, controls, family rows, plan execution, and
   preparedness workflows.
4. **Platform Adapters** — platform-specific capabilities only: native push,
   background location, secure storage, widgets, store billing, CarPlay/Android
   Auto restrictions, BLE, and LoRa hardware bridges.

Rule: **build the core once; adapt the edge per platform.**

---

## Active Platform: Web PWA

**Status**: Active production surface. Live on Vercel and auto-deployed on push
to `main`.

The Web PWA remains the primary validation surface for product, domain, and
shared UI work. New core product capabilities should prove themselves here
before a native shell is initialized.

Current Web/PWA responsibilities:

- World v2 dashboard and map interface;
- Pilot conversation and local deterministic guidance;
- Family location and family command workflows;
- Family plans, offline plan copy, plan chart, and Google Maps handoff;
- Scenario simulator and shared drills;
- checklist/preparedness foundation;
- Web Push, service worker, IndexedDB, and degraded/offline behavior.

---

## Plataforma ativa: Casca Nativa (iOS e Android)

**Status**: Iniciada em 2026-08-31. G-03 **CLEARED**. Runtime: **Capacitor**
(D-228). Spec operacional: `docs/39-native-shell.md`.

A casca é a **camada 4** desta página, e nada além dela. Carrega o Next.js que
já está em produção e acrescenta só a borda que o navegador não alcança. Ela não
tem tela própria: toda tela nova continua nascendo no app web.

React Native foi avaliado e recusado. Com `middleware.ts`, sessão Supabase por
cookie SSR e ~50 telas renderizadas no servidor, portar não seria portar — seria
reescrever o produto num segundo runtime, criando os produtos paralelos que a
D-084 proíbe. `/mobile/` continua sendo protótipo conceitual, não produto.

O que a casca acrescenta, e por quê:

| Capacidade | Estado | Por que o navegador não serve |
|---|---|---|
| Push APNs/FCM | ✅ código pronto (MOB-T03) | Nem o WKWebView nem o WebView do Android implementam `PushManager`. Dentro do app de loja o Web Push não degrada: não existe. |
| Cofre offline | ✅ MOB-T04 | O app abre e mostra ficha e plano com zero rede, lendo armazenamento nativo. |
| Geolocalização | ✅ MOB-T05 | Permissão do sistema, com texto revisado. **Sem** segundo plano, por decisão (D-228 §6). |
| Deep links | ✅ declarados | Falta o `.well-known` na origem (MOB-T06). |
| Empacotamento e release | ⏳ MOB-T06 — dono | Contas, chaves e assinatura. Nada de código. |
| Widgets / Live Activities | BLOQUEADO | Só depois do app publicado e estável. |

**Armazenamento seguro** ficou deliberadamente de fora: a sessão é o cookie do
Supabase dentro do WebView, gerido pelo sistema. Não há credencial que a casca
precise guardar por conta própria, e inventar um cofre para ela seria criar
superfície de ataque sem comprar segurança.

A submissão às lojas depende agora **apenas** dos passos de conta e credencial
listados em `docs/39` §5.

---

## Future Platform: Automotive Companion

**Status**: Future. Blocked by **G-06 — Automotive Readiness**.

> A pré-condição "o núcleo móvel existe" foi satisfeita pela D-228. O gate
> **não** cai junto: continua bloqueado por decisão própria do dono.

CarPlay and Android Auto are **companion modes**, not full EOS clients.

Allowed direction:

- status of active risk;
- route/navigation handoff;
- family check-in and limited communication;
- plan execution state;
- simple, driver-safe actions.

Not allowed as default scope:

- long chat;
- plan editing;
- EDU video consumption;
- simulator authoring;
- dense dashboards or crisis analysis requiring reading.

Automotive work starts only after the mobile core exists and the platform
restrictions are documented.

---

## Future Platform: Mesh / LoRa / Off-Grid Comms

**Status**: Future. Blocked by **G-05 — LoRa Mesh Priority**.

Comms inside the Web/PWA product and LoRa/Mesh hardware are separate decisions:

- **Comms app-level** can begin in the Web/PWA core: circle chat, radio guides,
  frequencies, quick reference, and communication status.
- **Mesh/LoRa hardware** remains a later off-grid adapter requiring mobile,
  BLE, hardware testing, region-frequency rules, and owner priority.

The ESP32 firmware and mobile BLE files in `/mobile/` are prototypes, not an
integrated product surface.

> A D-228 **não** destrava isto. A casca não instala plugin de BLE, e o
> `LoRaBleService.ts` continua sendo código de React Native que nenhum runtime
> deste projeto executa.

---

## Platform Gaps

| Gap | Severity | Notes |
|---|---|---|
| ~~Native mobile shell not initialized~~ | RESOLVIDO | D-228 / MOB-T01: casca Capacitor iniciada nas duas plataformas em 2026-08-31 |
| Credenciais de push nativo ausentes | HIGH | `APNS_*` e `FCM_SERVICE_ACCOUNT_JSON` não configuradas: o app instala, abre e **não notifica**. `docs/39` §4 |
| Migração `push_devices` não aplicada | HIGH | Sem ela, `POST /api/push/device` responde 503 e nenhum aparelho é registrado. `docs/39` §5 passo 6 |
| Caminho de release das lojas | HIGH | Contas, App ID com capacidades, keystore, `.well-known`, ícones. MOB-T06, `docs/39` §5 |
| Guideline 4.2 da Apple | MEDIUM | Casca que carrega site é rejeitável por funcionalidade mínima. Defesa: push nativo, cofre offline e geolocalização — capacidades que um navegador em iOS não tem. `docs/39` §6.3 |
| Automotive policy not documented | MEDIUM | Requires G-06 before CarPlay/Android Auto work |
| Mesh/LoRa priority not decided | MEDIUM | Blocked by G-05; app-level Comms can proceed separately |
| Platform docs drift from current product | MEDIUM | D-084 establishes PHASE 0B as the reconciliation step |
