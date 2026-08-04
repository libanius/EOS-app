# 09 — Build Status

> The single most important file for resuming a session. Read this first after AGENTS.md.
> Last updated: 2026-08-03

---

## Current State

| Field | Value |
|---|---|
| **Current Phase** | Preparedness Engine (PREP/EDU/COMMS/ONB/PILOT) sobre Web/PWA |
| **Last Completed Task** | **D-099 / LA-T06 — admin de afiliados + Stripe promotion codes + tracker (2026-08-04)** |
| | **D-098 / WV2-T07 — features HWD v1 reconciliadas na World v2 (2026-08-04)** |
| | **D-097 / WV2-T05 — validação reproduzível de produção da World v2 (2026-08-04)** |
| | **D-096 / PLAN-T07 — Pilot revisa planos com confirmação elemento a elemento (2026-08-03)** |
| | **D-095 / UPP-03 — memória do Pilot com confirmação e auditoria (2026-08-03)** |
| | **D-094 / SIM-T09 — texto livre do simulador preenche painéis revisáveis (2026-08-03)** |
| | **D-093 / PILOT-T08 — Pilot educador com propostas confirmáveis de preparação (2026-08-03)** |
| | **D-092 / SIM-T11 — debrief gera preparação acionável confirmável (2026-08-03)** |
| | **D-091 / ONB-T01 — onboarding contextual por convite de simulação (2026-08-03)** |
| | **D-090 / EDU-T01 — catálogo educativo oficial com aprovação/versionamento (2026-08-03)** |
| | **D-089 / COMMS-T03 — referência de rádio editável por círculo (2026-08-03)** |
| | **D-088 / COMMS-T02 — referência de frequências familiares inserida em Comms (2026-08-03)** |
| | **D-087 / COMMS-T01 — Comms app-level: chat do círculo + guia de rádio + limite Mesh/LoRa (2026-08-03)** |
| | **D-086 / PREP-T01 — Checklist + Recursos unificados em Preparação (2026-08-03)** |
| | D-085 / PREP-T00 — spec + decisão do Preparedness Engine (2026-08-03)** |
| | D-084 / P0B-T01→T06 — EOS Platform Foundation Alignment (2026-08-03)** |
| | D-083 — RAG com tradução de consulta, limiar 0,45 e Pilot em `gpt-4.1` (2026-08-02)** |
| | **D-082 / PLAN-T10 — handoff multi-stop da rota do plano para Google Maps (2026-07-31)** |
| | D-081 / WV2-T12 — camadas flood, surge, wind impact e direção oficial de tornado (2026-07-31)** |
| | D-080 / PLAN-T09 — múltiplos planos, execução cancelável e passos editáveis (2026-07-31)** |
| | D-079 / PLAN-T08 — Executar Plano: Pilot host situacional no painel da pessoa (2026-07-31)** |
| | D-078 — tempestade no mapa: cone, trajetória, vento em grade e alerta que vira lugar (2026-07-31)** |
| | D-077 — controle do círculo (papel/renomear/excluir), acesso ao plano, gatilhos e temporizador de simulação (2026-07-31)** |
| | D-076 — escolher endereço no mapa (mira), satélite sem chave e botão de GPS que fala (2026-07-31)** |
| | PLAN-T06 — envelope do plano + carta que desenha o plano sem tile nenhum (2026-07-30)** |
| | Endereço de casa como campo explícito e primeiro do plano; fim das distâncias que sumiam caladas (2026-07-30)** |
| | SIM-T06 — o simulador cobra o plano: a decisão vira parte do debrief (2026-07-30)** |
| | PLAN-T03 — rotas desenhadas pela família, ancoradas nos lugares do plano (2026-07-30)** |
| | PLAN-T02/T04/T05 — editor do plano de voo, versionamento com reconhecimento e execução offline (2026-07-30)** |
| | D-075 — o App Router não registrava service worker nenhum; `/api/plans` vira NetworkOnly (2026-07-30)** |
| | D-074 — push funcionando: precache do SW corrigido + teste real 6/6 (2026-07-29)** |
| | D-073 — localização em tempo real e interação no marcador (2026-07-29)** |
| | PLAN-T01 — modelo de dados e API do plano de voo (2026-07-29)** |
| | WV2-T06 rótulos nos controles do mapa · FAM-T08 cache offline dos abrigos |
| | Fix: localização ao vivo travada no iOS; ponto de perfil agora parece aproximado |
| | D-072 / SIM-T10 — escolher círculos e convidar de fora por link (2026-07-28)** |
| | SIM-T08 — painel de instrumentos: cada fonte ao vivo, simulada ou fora do ar (2026-07-28)** |
| | SIM-T04 + SIM-T05 — avanço de tempo e debrief com lacunas quantificadas (2026-07-28)** |
| | D-071 — simulação compartilhada: o círculo recebe convite e treina junto (2026-07-28)** |
| | Fix: marcadores de família no mesmo ponto se escondiam |
| | D-070 — mapa para de brigar com o usuário; PilotBar vira a entrada única (2026-07-28)** |
| | `/weather` no design system da v2 + prontidão pareada ao risco no dashboard (2026-07-28)** |
| | D-069 — trajeto vira camada do EOS; app de mapas é o segundo passo |
| | D-068 — Pilot acessa posições consentidas, busca lugares reais e propõe navegação |
| | Fix: JSON cru vazava na conversa quando a resposta era truncada |
| | Pilot vira conversa com especialista: tom por índice de risco e conselho que vira tarefa (2026-07-28)** |
| | Checklist reconstruído no design system da v2; antigo em `/checklist-legacy` |
| | D-067 / SIM-T01→T02 — simulador funcionando: o app inteiro responde ao cenário (2026-07-28)** |
| | Redesign do `/scenario` no design system da v2; analisador antigo preservado em `/scenario-legacy` |
| | `scripts/browser-walkthrough.mjs` — percurso real de navegador com prints (paga parte de WV2-T05) |
| | D-067 / SIM-T00 — spec do Cenário como simulador (`docs/19-scenario-simulator.md`) (2026-07-27)** |
| | Busca de lugares no mapa + puck do usuário com foto de perfil (2026-07-27) |
| | Fix: `.w-mapmarker` não tinha estilo na v2 — pinos renderizavam como texto cru (2026-07-27) |
| | D-065 / FAM-T05→T07 — abrigos oficiais do FEMA NSS, rumo/distância on-device e deep-link de navegação (2026-07-27)** |
| | D-066 / PLAN-T00 — spec dos Planos de Emergência da Família (`docs/18-family-plans.md`) (2026-07-27) |
| | D-064 / FAM-T01→T04 — localização familiar ao vivo, consentimento próprio e remoção dos mocks do mapa (2026-07-27) |
| **Migration** | ✅ `20260730000000_family_plan_triggers.sql` aplicada pelo dono em 2026-07-30 e verificada. Gatilho gravando ponta a ponta no teste de navegador. |
| **Migration** | ⏳ `20260804000000_affiliate_codes.sql` criada para LA-T06. Precisa ser aplicada no Supabase antes de `/admin/affiliates` persistir tracker/referrals/conversões em produção. |
| **Migration** | ✅ `20260803003000_pilot_memory_events.sql` aplicada pelo dono em 2026-08-03 e verificada via service-role (`pilot_memory_events` responde 200; count=0). UPP-03 está operacional para salvar memória confirmada com auditoria. |
| **Migration** | ✅ `20260803002000_edu_content.sql` aplicada pelo dono em 2026-08-03 e verificada via service-role (`edu_content` responde 200; count=0). EDU-T01 está operacional para catálogo persistente. |
| **Migration** | ✅ `20260803001000_circle_radio_profiles.sql` aplicada pelo dono em 2026-08-03 e verificada via service-role (`circle_radio_profiles` responde 200; count=0). |
| **Migration** | ✅ `20260803000000_circle_messages.sql` aplicada pelo dono em 2026-08-03 e verificada via service-role (`circle_messages` responde 200; count=0). |
| **Migration** | ✅ `20260731000000_multiple_family_plans.sql` aplicada pelo dono em 2026-07-31. Remove o índice antigo de plano ativo único e libera múltiplos planos por círculo. Tentei verificar via REST `pg_indexes`, mas a view não está exposta no schema cache. |
| **Migration** | ✅ `20260729000000_family_plans.sql` aplicada pelo dono em 2026-07-29 e verificada (5 tabelas + índice de plano ativo único). |
| **Migration** | ✅ `20260728010000_simulation_join_token.sql` aplicada pelo dono em 2026-07-28 e verificada. |
| **Migration** | ✅ `20260728000000_shared_simulation.sql` aplicada pelo dono em 2026-07-28. Tabelas e colunas verificadas por REST service-role. |
| **Migration** | ✅ `20260727000000_live_location.sql` aplicada pelo dono em 2026-07-27. Verificado via REST service-role: as 4 colunas `last_location_*` respondem 200 em `profiles`. |
| | D-063 / WV2-T04 — World v2 promovido a `/dashboard` e lançado em produção (2026-07-27) |
| | D-062 / WV2-T01→T03 — design system Apple, `DetentSheet` com gesto real e Pilot copiloto local-first (2026-07-27) |
| | Fix: controles do mapa colidiam com `AppActions` (fixed, z-index 200) — botão de localização ficava oculto (2026-07-27) |
| | Fix: Alertas Push não usa mais bundle stale de `/settings`; páginas autenticadas em SW passam a NetworkFirst + espera robusta de ativação (2026-07-22) |
| | Fix: botão "Alertas Push" não fica mais preso em loading; timeout, permissão explícita e VAPID Uint8Array (2026-07-22) |
| | D-061 / gift codes sem Stripe + criação owner-only (`/admin/gift-codes`) (2026-07-22) |
| | Fix: banner 'migration pendente' era falso (faltava `avatar_path`); migration photo storage aplicada no banco (2026-07-22) |
| | Onboarding: 1º acesso com ficha incompleta redireciona p/ `/ficha` (1x) (2026-07-22) |
| | Conta `paulolibanionetousa@gmail.com` + círculo excluídos a pedido do dono (2026-07-22) |
| | D-060 / UPP-02 Profile photo upload via private Supabase Storage (2026-07-21) |
| | D-059 / UPP-00→01 Profile personalization + Pilot memory MVP (2026-07-21) |
| | D-058 / HWD-06 validation pass — keep `/dashboard-world` isolated (2026-07-21) |
| | D-057 / HWD-06 alert footer + Status Rail scroll fix (2026-07-21) |
| | D-056 / HWD-06 center map title removed (2026-07-21) |
| | D-055 / HWD-06 Status Rail redesign — household readiness card (2026-07-21) |
| | D-054 / HWD-06 responsive HUD pass — mobile bottom sheet + desktop collapse (2026-07-21) |
| | HWD-05: Pilot action integration prototype — deterministic states + actions (2026-07-21) |
| | D-052: World Dashboard runtime map base toggle — Híbrido/Dark (2026-07-21) |
| | HWD-04: family/routing foundation prototype — EOS family points + OpenAI-inferred candidate route/shelter (2026-07-21) |
| | HWD-03: real EOS map data — location, RainViewer radar, hazard layers/tags, textual a11y (2026-07-21) |
| | HWD-02: live MapLibre map (MapTiler satellite + 3D terrain via env) (2026-07-21) |
| | HWD-01: static World Dashboard prototype at `/dashboard-world` (2026-07-21) |
| | D-049: aba Família vira vista unificada (roster + membros do círculo) (2026-07-21) |
| | LA-T02: Stripe **Live** cutover — faturamento real ativo (2026-07-21) |
| | LA-T01: Stripe test payment → webhook → `profiles.plan=family` (2026-07-20) |
| **In Progress** | — |
| **Platform Alignment** | ✅ D-084: EOS é plataforma multi-superfície com um único core operacional. Web/PWA segue como superfície primária; iOS/Android serão adapters nativos futuros; Automotive é companion mode restrito; Mesh/LoRa segue bloqueado por G-05. `/mobile/` é template/conceitual, não app inicializado. |
| **Fases pedidas pelo dono (2026-07-31)** | ✅ 1. Camadas de clima + rastreio de ciclone (D-078). 2. Reinventar a aba Família no design system da v2, com componentes dinâmicos. 3. WV2-T05 (a11y/perf), PLAN-T07 (Pilot propõe plano). |
| **Next Task** | Operacional: aplicar migration `20260804000000_affiliate_codes.sql`, abrir `/admin/affiliates` e sincronizar/criar `EOSPARTNER` no Stripe Live. Próximas frentes de produto devem ser promovidas de DRAFT por decisão explícita. |
| **Build** | ✅ Passing — `npm run type-check`, `npm run build`, `npm test -- --runInBand` (76/76) e `git diff --check` limpos para LA-T06 (2026-08-04). |
| **Plano execução** | ✅ PLAN-T08 MVP: tocar no próprio rosto no mapa abre comando familiar; "Executar plano" carrega um plano escolhido, monta passos determinísticos do host (círculo → gatilhos → papéis → pontos → rotas → encerramento) e alerta o círculo com push preset "Execute o plano da família agora". Sem nova tabela ainda: timeline compartilhada fica para `family_plan_executions`. |
| **Plano múltiplo** | ✅ PLAN-T09: o círculo pode ter vários planos ativos; `/plan` alterna/cria planos por nome, o executor escolhe qual plano rodar, passos fixos do EOS saem da lista numerada e há cancelar/falso alarme. Migration `20260731000000_multiple_family_plans.sql` aplicada pelo dono. |
| **Rotas do plano** | ✅ PLAN-T10: cada rota desenhada no plano agora tem handoff "Google Maps" com origem, destino e paradas intermediárias na ordem da `LineString`. O EOS mantém o combinado offline; Google Maps calcula ruas/ETA quando abrir. |
| **Família** | ✅ `npm run test:family` **5/5** (2026-08-01) — posição com frescor, quem NÃO está coberto e por quê, papel do plano junto da pessoa, necessidades que mudam a decisão, e o cadastro preservado em `/family-legacy`. |
| **Planos** | ✅ `npm run test:multiplan` **4/4** (2026-08-01) — dois planos coexistem, salvar um não toca no outro, id de outro círculo é 403 e salvar sem dizer qual é 409. |
| **Mapa** | ✅ `npm run test:marker` **3/3** (2026-07-31) — o pino com foto sobrevive a duas rodadas de atualização e a URL da imagem não muda. Validado com controle negativo. |
| **RAG** | ✅ `npm run bench:rag` (2026-08-02) — com tradução da consulta e limiar 0,45, **0 de 8** perguntas em português ficam sem resposta; com o limiar antigo (0,7) eram **8 de 8**. Modelo do Pilot: `gpt-4.1`. |
| **Pilot** | ✅ `npm run test:pilot` **8/8** com o MODELO real (2026-07-31): orbe fora do dashboard sem duplicar no dashboard, clima com números sem negar acesso, ciclone citado E qualificado, análise de atividade com veredito/números/janela, orbe arrastável que fica onde foi deixado, e um guarda que percorre 7 telas conferindo que nenhuma está coberta (validado com controle negativo). |
| **Clima** | ✅ `npm run test:weather` **9/9** com dado AO VIVO (2026-07-31): ciclone com posição/rumo, geometria oficial do NHC, vento em grade, painel com camadas Flood/Surge/Vento impacto/Tornado, setas RENDERIZADAS no mapa, camada de impacto de vento conectada ao MapLibre, alerta pulsando na cor do risco, e tempestade tocável ENQUADRANDO o cone (medido contra a geometria da API, não contra as entranhas do mapa). O teste PROCURA uma região com alerta ativo no feed do NWS em vez de depender do tempo em Parkland. |
| **Círculo** | ✅ `npm run test:circle` **5/5** (2026-07-31) — promover a Editor muda o banco, quem não é Admin recebe 403, renomear funciona, excluir exige o nome exato e cascateia. Toda asserção lê o banco depois da ação. |
| **Plano** | ✅ `npm run test:plan` **14/14** em dois navegadores (2026-07-30): não salva sem ponto e papel, autor salva v1, membro reconhece, v2 **invalida** o ack anterior, gatilho grava, rota desenhada vira LineString, o debrief cobra um ponto de encontro inalcançável a pé, e com a rede derrubada o plano continua na tela rotulado como cópia local **e a carta é desenhada** (pinos, traçado, norte, escala). Inclui abrir o mapa na posição atual, escolher pela mira sem digitar nada, e GPS negado que diz o motivo sem travar a tela. |
| **Push** | ✅ `npm run test:push` 6/6 em Chrome real + `npm run test:push:prod` 3/3 contra produção (2026-07-29). Validado com controle negativo: reverter o `buildExcludes` faz o teste falhar. Ambos exigem Google Chrome instalado. **Rodar o prod-check depois de todo deploy que toque `next.config.mjs`, o next-pwa ou a versão do Next.** |
| **Vercel** | ✅ Produção em 2026-08-01 — Família reconstruída (D-082), múltiplos planos seguros (D-080), pino sem piscar (D-081), orbe arrastável. `test:push:prod` 3/3; `/family`, `/family-legacy` e `/plan` respondendo 200. | — D-079. `test:push:prod` 3/3. Anterior: `49a66e1` — cone enquadrado. `test:push:prod` 3/3. Anterior: `fa9efe0` — tempestade tocável, distância qualificada, cache de ausência corrigido. Anterior: `a89d2ab` — alerta pulsando na cor do risco. `test:push:prod` 3/3. Anterior: `9761620`. `test:push:prod` 3/3; `/api/world/cyclones` respondendo com cone em produção. Anterior: `b6c5b45` — D-077. `test:push:prod` 3/3. Anterior: `8d72d8a` — mapa abre na posição atual, ponto confirma sem digitar. `test:push:prod` 3/3. Anterior: `ef9a5f7` — GPS em dois estágios. `test:push:prod` 3/3. Anterior: `b084f99` — escolha de endereço no mapa, satélite ESRI e orbe de camadas. `test:push:prod` 3/3. Anterior: `c2e4608` — envelope + carta do plano. `test:push:prod` 3/3. Anterior: `85283c0` — endereço de casa explícito. `test:push:prod` 3/3 (113 arquivos). Anterior: `53393b4` — o simulador cobra o plano. `test:push:prod` 3/3 (112 arquivos no precache). Anterior: `02fab31` — rotas desenhadas pela família. `test:push:prod` 3/3 depois do deploy. Anterior: `023712a` — editor do plano em `/plan`, versionamento com reconhecimento, execução offline e registro do service worker em todo o app (D-075). `test:push:prod` 3/3 depois do deploy. Anterior: 2026-07-29 (`9a78935`) — correção do push (D-074). Verificado com `npm run test:push:prod` **3/3**: precache limpo (105 arquivos), service worker instala e ativa no deploy que está no ar, e o `push-sw.js` de lá exibe notificação. Deploy anterior: 2026-07-28 (`050399e`) — abrigos FEMA, busca no mapa, puck com foto, simulador, Pilot conversacional com navegação, checklist v2. Verificado: `/api/shelters` retorna 4 abrigos reais perto de Bend/OR. |
| **Supabase** | ✅ Healthy — project ref `alxurmgpyxjhvnliivbf` |
| **⚠️ Segurança** | Rotacionar segredos expostos em chat: Vercel token (`vcp_…`), Supabase PAT (`sbp_…`), Stripe test/Live keys, MapTiler. |

---

## Sessão 2026-07-27→29 — World v2, Pilot copiloto, Simulador, localização familiar

Sessão longa e de reconstrução. Começou como uma reavaliação de design do
`/dashboard-world` sob a skill `apple-design` e terminou com o EOS abrindo numa
tela nova, um copiloto conversacional e um simulador que treina a família
inteira. **13 decisões (D-062→D-074), 2 specs novas (docs 18 e 19), 4 migrations.**

### O arco

1. **World v2 (D-062, D-063)** — reconstrução completa da superfície acima do
   mapa sobre um design system Apple (`components/world-v2/`), promovida a
   `/dashboard` e lançada em produção. O `WorldMap` foi reaproveitado sem
   alteração. Dashboard anterior preservado em `/dashboard-legacy`.
2. **Localização familiar ao vivo (D-064)** — consentimento com toggle próprio,
   só o último ponto, freshness obrigatória na UI.
3. **Abrigos e navegação (D-065, D-068, D-069)** — FEMA National Shelter System
   como fonte oficial, geometria calculada no aparelho, trajeto desenhado como
   camada do EOS com o app de mapas como segundo passo.
4. **Plano de voo da família (D-066 / doc 18)** — spec escrita, implementação
   pendente (PLAN-T01→T07).
5. **Simulador (D-067, D-071, D-072 / doc 19)** — o Cenário virou simulador
   aeronáutico: o app inteiro responde ao ambiente configurado, o círculo é
   convidado por pop-up, e o debrief devolve lacunas em números.
6. **Pilot conversacional (D-068, D-070)** — deixou de ser um cartão com veredito
   e virou o especialista com quem se conversa; virou também a entrada única do
   app, absorvendo a barra de busca.

### Bugs de produção encontrados e corrigidos

Vale registrar porque **cinco deles eram o mesmo erro**: estender uma ponta e
esquecer a outra.

| Bug | Causa |
|---|---|
| Marcadores mock ("Paulo/Isadora/Ana", `SHELTER · mock`) na tela principal | `WorldMap` inventava overlays quando não recebia dados |
| Coordenadas de todo membro vazando sem consentimento | `/api/circles` não gateava `location_lat/lng` |
| **Ninguém num círculo via ninguém** | `VALID_FIELDS` do PATCH descartava `location` no salvamento |
| Família no mesmo ponto invisível | Dois perfis com o mesmo centroide de cidade, marcadores empilhados |
| Pilot "sem acesso a dados em tempo real" | O clima não era enviado no `context` |
| JSON cru na conversa | Resposta truncada + fallback que imprimia a fonte |
| Impossível digitar no Pilot no celular | Campo sob o BottomNav (`fixed`, z-index 100) |
| Mapa recentralizando e travando o scroll | `flyTo` programático disparava os eventos que recolhiam o HUD |
| `.w-mapmarker` sem estilo na v2 | CSS vivia só em `world-dashboard.css`, que a v2 não importa |
| Convidado esperando 20s pelo pop-up | `router.replace` não remonta o layout onde vive o poller |
| Push nunca chegava em produção | Metadado de build 404 no precache → install do SW rejeitado → worker `redundant` (D-074) |
| Senders de push falhando em silêncio | Liam `profile_id`; a coluna é `user_id` (3 endpoints) |

### Push: o bug que nenhuma leitura de código ia achar (D-074)

`/api/family/ping`, o convite de simulação e o aviso de mudança de plano nunca
entregaram nada. O sintoma era um botão em Ajustes que não mudava de estado.

A causa não estava em nada relacionado a push: o `next-pwa` colocava
`/_next/app-build-manifest.json` no manifesto de precache do Workbox, o Next não
serve esse arquivo, e **precache é atômico** — um 404 rejeita o `waitUntil` do
`install`, o worker vira `redundant` e nunca ativa. Sem worker ativo não existe
push, em nenhum lugar do produto.

Só apareceu com `ServiceWorker.workerErrorReported` do CDP num Chrome real. Três
hipóteses minhas antes disso estavam erradas — inclusive uma em que eu "corrigi"
o nome hasheado do worker, o que era um problema real mas não *o* problema.

Detalhe que vale guardar: o helper que esperava o worker **rejeitava ao ver
`redundant`**, e `redundant` é estado normal (significa substituído). Havia um
segundo bug reportando falha por cima de um worker saudável. A correção é não
escrever essa espera à mão: `navigator.serviceWorker.ready` é a espera canônica.

### Validação

Sessão em que a verificação em navegador real passou a existir:
`scripts/browser-walkthrough.mjs`, `scripts/circle-location-test.mjs`,
`scripts/simulation-share-test.mjs`, `scripts/family-plan-test.mjs` e
`scripts/push-test.mjs` (Playwright). **Todos criam e apagam contas no Supabase
de produção** — é o único projeto configurado no `.env.local`.

`npm run test:push` — **6/6**. Prova os 6 elos do push num Chrome real: precache
100% buscável → SW instala e ativa → `/api/push/subscribe` grava as chaves →
`/api/family/ping` emite Web Push assinado em VAPID → o payload **descriptografa**
(RFC 8291) para o texto exato → o handler real do `push-sw.js` **exibe** a
notificação, lida de `getNotifications()`. Sobe o próprio `next start` na 3010,
porque precisa confiar no CA do serviço de push falso (o `web-push` só fala
HTTPS; a verificação de certificado fica ligada, via `NODE_EXTRA_CA_CERTS`).

O teste foi validado com **controle negativo**: removendo o `buildExcludes` e
reconstruindo, ele falha apontando `404 /_next/app-build-manifest.json`. Um teste
que passa mas não falharia com o bug de volta não vale nada.

Os três primeiros bugs da tabela acima foram encontrados **lendo código**; os
sete seguintes, **rodando o app**; e o do push, só **instrumentando o navegador**.
A diferença é o argumento para WV2-T05.

---

## Sessão 2026-07-22 — Gift codes, fixes de personalização/onboarding, higiene

- **Fix Alertas Push em Settings**: o botão podia ficar indefinidamente em "Aguarde..." quando `navigator.serviceWorker.ready` não resolvia ou quando o fluxo de permissão/VAPID falhava sem feedback. Corrigido com registro explícito de `/sw.js` quando necessário, espera robusta de ativação do worker, timeout, `Notification.requestPermission()`, conversão da `NEXT_PUBLIC_VAPID_PUBLIC_KEY` para `Uint8Array`, validação de resposta de `/api/push/subscribe` e mensagem visível de sucesso/erro. Follow-up: `/settings` e demais telas autenticadas saíram de `CacheFirst` para `NetworkFirst` no SW, porque o cache podia manter um bundle antigo do botão após deploy; validação direta de `/api/push/subscribe` em produção retornou `POST 201` e `DELETE 200` com usuário autenticado de teste.
- **Gift codes sem Stripe (D-061)**: `gift_codes` (RLS deny-all), `POST /api/billing/redeem` (1 uso, claim atômico, seta `plan_status='gift'` + `plan_current_period_end`), expiração lazy em `lib/plan.ts:reconcileGiftPlan` (via `/api/profile/plan`). **Criação owner-only**: `ADMIN_EMAILS` (default `eosoffgrid@gmail.com`), `/api/admin/gift-codes` + tela `/admin/gift-codes` (403 p/ não-dono); `/admin` protegido no middleware. UI de resgate em Settings. **Código A (afiliado Stripe) pendente** de params do dono + Live key.
- **Fix banner falso "migration pendente"**: `profile_personalization` existia mas faltava `avatar_path` → aplicada `20260721021000_profile_photo_storage.sql` (coluna + bucket `profile-photos` + policies). `tableMissing()` endurecido p/ só considerar `42P01` (erro de coluna não vira banner).
- **Onboarding**: `FichaFirstRun` — 1º acesso com ficha incompleta redireciona p/ `/ficha` (flag localStorage, 1x, não prende).
- **Logout** mais visível em Settings (botão centralizado + ícone SVG).
- **Conta `paulolibanionetousa@gmail.com` + círculo "Família Libanio" excluídos** a pedido do dono (cascata na ordem do `/api/account/delete`).
- **Higiene**: `.agents/` + `skills-lock.json` no `.gitignore` (eram ~77 pending no VS Code). Colisão D-060 resolvida (photo storage = D-060; gift codes → **D-061**).

---

## Sessão 2026-07-21 — Stripe Live, Família unificada, World Dashboard (HWD 01→03)

- **Stripe Live (LA-T02, D-048)**: conta Live `acct_1TuL40IaCSStSVaq` (EOS, US). Produtos/preços Live ($9.90/$19.90), webhook Live, 4 env vars da Vercel Production trocadas test→live, deploy fresco. IDs sandbox limpos dos profiles. Faturamento real **ativo**. (Test mode validado ponta-a-ponta em LA-T01.)
- **Aba Família = vista unificada (D-049)**: co-membros do círculo aparecem automaticamente como cards read-only (vista calculada, sem duplicar dado). Corrigiu o relato "família não preencheu ao entrar no círculo". Ficha médica no círculo = follow-up privacy-gated.
- **Hybrid World Dashboard (D-047 arquitetura, D-050 autorização)** — rota isolada `/dashboard-world`, produção `/dashboard` intocada:
  - **HWD-01**: HUD real (Status Rail, Pilot Capsule com PRIORITY OVERRIDE determinístico, Location Brief, Alert Counter, Environmental Ticker) sobre placas aéreas de Parkland **geradas via Higgsfield MCP** (safe/watch/storm), que trocam por estado de risco. Mock rotulado, responsivo, reduced-motion.
  - **HWD-02**: MapLibre GL 5.24 (lazy-load). Config provider-neutra `lib/world/providers.ts`: keyless CARTO dark por padrão; **MapTiler hybrid (satélite) + terreno 3D** quando `NEXT_PUBLIC_MAPTILER_KEY` está setado. Câmera Parkland pitch 56°. Degrada para a placa estática se WebGL/tiles falharem.
  - **HWD-03**: mapa centraliza na **localização real** (RiskProvider expõe `coords`; flyTo; fallback Parkland); overlays mock relativos ao centro; **equivalente textual** do mapa (§22); camada server-normalized de radar RainViewer keyless em `/api/world/radar`; hazards reais de `/api/hazards` renderizados como polígonos/pontos e tags geo-ancoradas. Radar/hazards degradam sem derrubar o mapa.
  - **HWD-03 polish**: adicionada faixa visível de "Camadas ao vivo" (Radar RainViewer + contagem de hazards + frame UTC + preview de alertas) para evitar que o radar pareça ausente quando não há precipitação local; ticker inferior e badge mock reposicionados acima da bottom nav.
  - **HWD-04**: pontos exatos de família vindos de dados EOS/círculo substituem os mocks quando disponíveis; freshness visível (`agora` para usuário atual, `perfil` para co-membros); `/api/world/guidance` usa OpenAI para shelter/rota candidata e rotula como inferência não oficial. Fallback mantém mock/rota direta sem quebrar o mapa.
  - **HWD map interaction fix**: `.world-hud` não captura mais drag global; o MapLibre volta a aceitar clicar/arrastar como Google Maps, mantendo botões/painéis com pointer events próprios.
  - **D-052 map base toggle**: painel "Camadas ao vivo" ganhou seletor **Híbrido/Dark**. Híbrido mantém MapTiler hybrid + terreno quando a key existe; Dark força CARTO dark keyless para restaurar o visual operacional anterior. Preferência persiste localmente no browser.
  - **HWD-05**: Pilot Capsule agora calcula estados determinísticos `GO/LIMITED/WAIT/AVOID/PRIORITY OVERRIDE` após seleção de atividade; critical override vence sempre. Ações reais: abrir cenário, abrir checklist, notificar família via push de círculo admin quando permitido, e focar rota/shelter candidata no MapLibre.
  - **D-054 / HWD-06 responsive pass**: HUD mobile reorganizado em bottom sheet com snap states `peek`/`half`/`full`, alça visível, scroll interno, ações rápidas e controles de base Híbrido/Dark. Interação no mapa recolhe o sheet. Desktop ganhou colapso dos painéis auxiliares por scroll/gesto de mapa, com reabertura por hover/foco.
  - **D-055 / HWD-06 Status Rail redesign**: card esquerdo virou household readiness card conforme mock aprovado: topo conexão/estado, Risk Index central grande, diagrama SVG de casa com callouts, autonomia familiar, barras água/comida/energia/combustível, família e comunicações.
  - **D-056 / HWD-06 center cleanup**: removido o título visual central "Your Area/Sua área"; centro do mapa fica limpo, mantendo equivalente textual para acessibilidade.
  - **D-057 / HWD-06 HUD placement fix**: contador de alertas movido do topo direito para o rodapé direito acima da bottom nav; Status Rail agora reserva espaço acima da nav e mantém scroll interno até o C/W/R.
  - **D-058 / HWD-06 validation pass**: `type-check`, Jest 45/45, build, lint, full production journey 31/31, members/circles E2E 19/19, route protection, RainViewer e hazards passaram. Resultado: saudável para teste controlado, mas **não substituir `/dashboard` ainda**. Relatório: `docs/17-hwd-06-validation.md`.
- Colisão de numeração resolvida: D-047 = World Dashboard; a vista unificada de Família passou a **D-049**.

## Sessão 2026-07-21 — Profile personalization / Pilot memory (UPP)

- **D-059 / UPP-00→01 implementado**: o dono pediu que a Ficha Master vire também a fonte autenticada de personalização do usuário: foto de perfil, preferências livres em Markdown, memória do Pilot, estilo de decisão e tolerância a risco.
- Direção aprovada: manter `profiles` como identidade/emergência; criar `profile_personalization` 1:1 para textos longos e contexto privado do Pilot; **não expor** esses dados no QR público.
- Entregue: migration + RLS (`20260721020000_profile_personalization.sql`), `GET/PATCH /api/profile/personalization`, editor na `/ficha`, foto reutilizada no readiness card do World Dashboard, e Pilot Capsule lendo estilo/tolerância como fatores de contexto sem escrita automática silenciosa.
- Operacional concluído: migration `20260721020000_profile_personalization.sql` aplicada no Supabase Production pelo dono e verificada via service-role REST (`profile_personalization` retorna 200). A rota pública `/api/profile/personalization` segue protegida com 401 sem sessão.
- **D-060 / UPP-02 implementado**: foto de perfil suporta upload real via `POST /api/profile/personalization/photo`. Direção: bucket privado `profile-photos`, path em `profile_personalization.avatar_path`, signed URL temporária para UI autenticada, QR público sem exposição.
- Pendência operacional: aplicar `supabase/migrations/20260721021000_profile_photo_storage.sql` no Supabase Production para criar `avatar_path`, bucket e policies de Storage.

---

## Phase 0 Progress

| Task | Status | Completed |
|---|---|---|
| P0-T01: Install SDD/App Spine structure | ✅ COMPLETE | 2026-06-23 |
| P0-T02: Review existing product baseline | ✅ COMPLETE | 2026-06-23 |
| P0-T03: Confirm MVP scope | ✅ COMPLETE | 2026-06-23 |
| P0-T04: Sequence first real implementation task | ✅ COMPLETE | 2026-06-23 |

---

## Phase 1 Progress

| Task | Status | Completed |
|---|---|---|
| P1-T01: Fix Decision Engine (auth, field names, schema, persist) | ✅ COMPLETE | 2026-06-23 |
| P1-T02: Ingest knowledge base (14 PDFs → 3887 chunks) | ✅ COMPLETE | 2026-06-23 |
| P1-T06: End-to-end test — CONNECTED mode verified in production | ✅ COMPLETE | 2026-06-24 |
| P1-T03: Add PWA icons | ✅ COMPLETE | 2026-06-28 |
| P1-T04: Landing page | ✅ COMPLETE | 2026-06-28 |
| P1-T09: Bottom navigation (5 tabs) | ✅ COMPLETE | 2026-06-28 |
| P1-T10: E2E test agent | ✅ COMPLETE | 2026-06-28 |
| P1-T11: Recursos screen — checklist integration + inventory sync | ✅ COMPLETE | 2026-06-28 |
| P1-T05: Bilingual PT/EN settings | ✅ COMPLETE | 2026-06-29 |
| P1-T07: Sentry error monitoring | DEFERRED | D-028 |
| P1-T08: Rate limit validation (Upstash) | DRAFT | — |

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-23

**P1-T01 — Decision Engine fixed:**
- `app/api/analyze/route.ts`: replaced Bearer token auth with SSR cookie client (`@/lib/supabase/server`)
- Fixed all DB field names: `profiles.id`, `family_members.profile_id`, `resource_inventory.profile_id`, `fuel_liters`, `battery_percent`, `has_medical_kit`
- Fixed `action_plans` persist: creates `scenarios` row first (required FK), maps priority string → smallint (CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1)
- `app/(app)/scenario/page.tsx`: removed manual Authorization header — cookies are automatic for same-origin fetch

**P1-T02 — Knowledge base ingested:**
- Two-step pipeline: `python3 scripts/pdf_to_text.py` → `node scripts/ingest.mjs`
- 3850 chunks ingested from 14 PDFs (3887 total including 37 pre-existing rows)
- Root cause of all past OOM: `chunkText()` infinite loop when at end of file — fixed with `if (breakAt >= clean.length) break`

**App Spine installed:**
- `AGENTS.md` + all 11 `/docs/` files created and committed
- `progress/index.html` stakeholder dashboard created

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-24

**Build errors fixed (3 issues):**
1. `app/api/analyze/route.ts` line 1: `import { NextRequest }` → `import type { NextRequest }` (TypeScript strict type-only import rule)
2. `tsconfig.json`: added `"scripts"` to `exclude` array — scripts/ contains Node CLI tools, not app code; was causing type errors
3. Removed empty `node_modules/@types/` directories with spaces in names (`eslint 2`, `estree 2`, `glob 2`, `json-schema 2`) — created by npm's `typesVersions` resolution, caused TS2688 phantom type errors. Also added `"typeRoots": ["./node_modules/@types"]` to prevent recurrence.

**Supabase schema migration applied:**
- Created and applied `supabase/migrations/20260624000000_missing_tables.sql`
- Creates: `resource_inventory`, `scenarios`, `action_plans` tables with RLS policies
- Creates: `match_documents` pgvector RPC — this was missing; without it RAG silently failed and app always fell back to SURVIVAL mode

**End-to-end test (P1-T06) — verified via automated test against production Supabase:**
- `match_documents` RPC: ✅ returns FEMA/Red Cross chunks with real similarity scores (0.5–0.53 for flood query)
- Profile + family: ✅ Paulo Libanio Neto with 3 family members exist in DB
- `scenarios` insert: ✅ working
- `action_plans` insert: ✅ working
- Knowledge base count: ✅ 3887 chunks


---

## Phase 2 Progress — Círculos & Fichas

| Task | Status | Completed |
|---|---|---|
| P2-T00: Circle model spec + decisions documented | ✅ COMPLETE | 2026-06-28 |
| P2-T01: Ficha Pessoal + QR público | ✅ COMPLETE | 2026-06-28 |
| P2-T06: Ficha Master — identidade central unificada + onboarding | ✅ COMPLETE | 2026-06-29 |
| P2-T07: Subscription tiers — feature gates + UI upgrade | ✅ COMPLETE | 2026-07-10 |
| P2-T02: Circle invitations + approval + roles | ✅ COMPLETE | 2026-07-05 |
| P2-T03: Inventory sharing toggle per field | ✅ COMPLETE | 2026-06-30 |
| P2-T04: Household view in Círculos screen | ✅ COMPLETE | 2026-06-30 |

**Spec**: ver `docs/12-circle-model.md` antes de implementar qualquer tarefa P2.

---

## What Is Next

**HWD-06: Production validation**

Retomar HWD-06 production validation:

Validar `/dashboard-world` antes de qualquer rollout para substituir `/dashboard`: performance, a11y, responsive, custos/providers, privacidade, E2E e critérios de saída do doc 16 §33.

---

## Known Issues

| Issue | Severity | File | Status |
|---|---|---|---|
| PWA icons missing (icon-192.png, icon-512.png) | ✅ FIXED | `public/` | P1-T03 — completed 2026-06-28 |
| Landing page | ✅ DONE | `app/page.tsx` | Pitch + CTAs deployed |
| Offline write sync not implemented | MEDIUM | `lib/offline-storage.ts` | Writes to IndexedDB not synced back to Supabase on reconnect |
| LOCAL_AI mode not implemented | MEDIUM | mobile/native AI | Blocked by G-03 / native mobile readiness |
| Native mobile shell not initialized | HIGH | `mobile/` | Blocked by G-03 / D-084; `/mobile/` has template/conceptual files but no initialized app |
| Sentry DSN not confirmed in Vercel | LOW | Vercel env vars | P1-T07 — confirm `SENTRY_DSN` is set |
| Upstash Redis not confirmed in Vercel | LOW | Vercel env vars | P1-T08 — rate limit falls back to in-memory without it |
| SAMHSA_Tips 20 chunks skipped (null bytes) | LOW | knowledge_base | 49/69 chunks stored — non-critical |
| `SUPABASE_SERVICE_ROLE_KEY` ausente no Vercel → `/ficha/[id]` e RAG quebrados | ✅ FIXED | Vercel env / `app/ficha/[id]`, `app/api/profile/ficha` | 2026-07-05 — D-035: env var adicionada + guardas defensivas |
| Tela Círculos: conteúdo final escondido atrás da nav fixa + home indicator (iPhone); layout apertado | ✅ FIXED | `app/(app)/circles/page.tsx` | 2026-07-10 — `<main>` ganhou folga inferior `calc(96px + env(safe-area-inset-bottom))`; grade Criar/Entrar responsiva (`auto-fit`); mais respiro (padding/gaps). Padrão a replicar nas outras telas do app se necessário. |

---

## What Was Done — Session 2026-07-05 (E2E jornada completa + fix crítico)

**Teste E2E de usuário real** (`scripts/full-journey.mjs`): simula onboarding → ficha master (9 PATCHs progressivos) → família → inventário → checklist/tabelas → círculos → weather → ai/readiness → analyze → monitor. Roda contra produção criando/deletando usuário de teste via Supabase Admin API.

**Bug crítico encontrado e corrigido (D-035):**
- `SUPABASE_SERVICE_ROLE_KEY` **não estava no Vercel** → `/ficha/[id]` (QR de emergência) e `POST /api/profile/ficha` davam **500 vazio**; RAG retornava `[]` silenciosamente (Motor de Decisão nunca usou os 3887 chunks).
- Fix: `vercel env add SUPABASE_SERVICE_ROLE_KEY` (Production + Preview) + guardas defensivas nas duas rotas de service-client.

**Falsos negativos identificados no e2e-agent antigo** (não são bugs do app, são contratos desatualizados no teste):
- `checklist/generate` agora retorna `{ok,count}` (não `{items}`)
- `checklist/toggle` usa `{canonicalKey, acquired}` (não `{id}`)
- `weather-intelligence`, `ai/readiness` são **GET** (não POST); `monitor` exige `?lat&lng`
- `full-journey.mjs` usa os contratos corretos.

**Resultado da ficha master**: PATCH `/api/profile/ficha` funciona 100% (nome, localização c/ geocode, tipo sanguíneo, alergias, contato, notas médicas, medicamentos, multi-campo, validação de nome vazio → 400). O problema relatado de "vários erros" era a **leitura pública** da ficha (500), agora corrigida.

**Verificação final**: `scripts/full-journey.mjs` → **31/31 ✅** contra produção (`eos-app-fawn.vercel.app`) após deploy com a env var corrigida. Página `/ficha/[id]` e `POST /api/profile/ficha` retornam 200 com dados reais. (Nota: a chave foi gravada com aspas na 1ª tentativa → 404; corrigida removendo aspas — ver D-035.)

**Gestão de conta em Settings (D-037)**: adicionados logout, link para editar ficha e **excluir conta** (`POST /api/account/delete`). O `signOut()` já existia mas não tinha UI. Verificado E2E: exclusão remove usuário + todos os dados.

**Limpeza de contas (2026-07-05)**: a pedido do dono, excluídas 4 contas reais (brightscalegroup, paulolibanionetousa, daniletteriello1001, elgorlanes.23) com todos os dados. Restou apenas `testeos.paulo@yopmail.com`.

**Perfil ausente quebrava Ficha/Recursos (D-038)**: usuário sem linha `profiles` (cadastro sem onboarding / login direto p/ `/scenario`) via `Cannot coerce...` (ficha/plan) e FK constraint (inventory/family). Corrigido com `lib/ensure-profile.ts` (self-heal on-demand em ficha, inventory, family-members, plan, analyze, checklist/generate) + backfill + migration de trigger `handle_new_user`. Reproduzido e verificado com `scripts/_noprofile.mjs`. **Testes antigos não pegaram** porque sempre criavam o perfil no passo 1.

**Fluxo completo de membros (D-040)**: as 6 formas do doc 12 implementadas e testadas 19/19 E2E. Aprovação de círculo (`circle_join_requests`, migration `20260705000100` aplicada via SQL Editor), busca por nome, scanner QR (`html5-qrcode` + `lib/qr-parse` 8/8). Corrigidos 2 bugs de RLS/embed de círculo (join member-only → 404; lista de membros vinha vazia por embed `profiles` inválido). Entrar num círculo agora **exige aprovação do Admin** (antes era instantâneo). Migration de trigger `handle_new_user` (D-038) permanece pendente de aplicação no Supabase (a self-heal do app cobre). Câmera do scanner: testar no dispositivo.

---

## Ingest Pipeline Reference

| Command | Purpose |
|---|---|
| `python3 scripts/pdf_to_text.py` | Convert PDFs in `docs/` → text files in `docs/text/` |
| `npm run ingest` | Chunk + embed + upsert all `.txt` files from `docs/text/` to `knowledge_base` |

Requires: PyMuPDF (`pip install pymupdf`), `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

To add a new knowledge source: drop PDF in `docs/`, re-run both commands.

---

## Environment Variables Status

| Variable | Purpose | Status |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ Set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access (ficha pública + RAG) | ✅ Set no Vercel em 2026-07-05 (D-035 — estava AUSENTE, quebrava `/ficha/[id]` e RAG) |
| `NEXT_PUBLIC_SITE_URL` | Auth redirect base URL | ✅ Set |
| `OPENAI_API_KEY` | Embeddings for RAG | ✅ Set |
| `OPENAI_MODEL` | Modelo OpenAI (fonte única via `getOpenAIModel()`) | ✅ Corrigido 2026-07-05 (D-036 — estava `"gpt-5\n"` corrompido → `gpt-4o-mini`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push — chave pública (inlined build-time) | ✅ Set (par novo 2026-07-05, D-036) |
| `VAPID_PRIVATE_KEY` | Push — chave privada (server) | ✅ Set no Vercel 2026-07-05 (D-036 — estava AUSENTE) |
| `VAPID_SUBJECT` | Push — mailto do remetente | ✅ Set |
| `ANTHROPIC_API_KEY` | (removido — todo LLM migrado para OpenAI) | ❌ Não usado |
| `UPSTASH_REDIS_REST_URL` | Rate limiting (production) | ⚠️ Not confirmed in Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (production) | ⚠️ Not confirmed — falls back to in-memory |
| `SENTRY_DSN` | Error monitoring | ⚠️ Not confirmed — errors silently dropped without it |
| `STRIPE_SECRET_KEY` | Stripe billing (checkout/portal/webhook) | ✅ Set em Production/Live mode (2026-07-21) |
| `STRIPE_WEBHOOK_SECRET` | Verificação de assinatura do webhook | ✅ Set em Production/Live mode (2026-07-21) |
| `STRIPE_PRICE_FAMILY` | Price ID do plano Família | ✅ Set em Production/Live mode (`price_...`, $9.90) |
| `STRIPE_PRICE_PREMIUM` | Price ID do plano Premium | ✅ Set em Production/Live mode (`price_...`, $19.90) |

---

## Deployment

- **Hosting**: Vercel — project linked via `.vercel/project.json`
- **Branch**: `main` → production (no staging environment)
- **Build**: production deploy ready as of 2026-07-21, latest `main`
- **Deploy**: automatic on push to `main`; production alias canônico `https://eos-app-fawn.vercel.app`

---

*Update this file after every session. Mark tasks complete. Document what changed and what's next.*

## What Was Done — Session 2026-06-24 (cont.)

**Landing page (P1-T04):**
- `app/page.tsx` rewritten: brand, headline, 4 feature bullets, CTAs (signup + login)
- Server component: redirects authenticated users to `/scenario`
- Auth redirect URLs fixed: `getSiteUrl()` now uses `VERCEL_PROJECT_PRODUCTION_URL` (auto-set by Vercel)
- Supabase URL Config corrected: Site URL = `https://eos-app-fawn.vercel.app`, added redirect wildcard

**Bottom navigation + UX fix (P1-T09):**
- `components/BottomNav.tsx` created: 5-tab nav (Cenário/Família/Recursos/Checklist/Círculos)
  - SVG icons, active state via `usePathname()`, 56px touch targets, safe-area inset
- `app/(app)/layout.tsx` created: shared layout for all authenticated pages
- `lib/auth/actions.ts`: post-login redirect changed from `/family` → `/scenario`
- `app/globals.css` `.nb`: improved touch targets (56px min-height, touch-action: manipulation)

**Git hygiene:**
- `public/sw.js` and `public/workbox-*.js` removed from git tracking (Vercel regenerates on each build)
- `EOS documents/` removed from git tracking (nested git repo, personal docs — not app code)
- `supabase/.temp/` added to `.gitignore`
- All three added to `.gitignore`

---

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-28 (cont.)

**Checklist LLM fixed (P1-T10 / bugfix):**
- Root cause 1: `OPENAI_MODEL=gpt-5` in Vercel env — model doesn't exist; hardcoded `gpt-4o-mini` directly in route to bypass broken env var
- Root cause 2: Unique index used `COALESCE(scenario_id,...)` expression — PostgREST `onConflict` can't match expression indexes; fixed to `UNIQUE (profile_id, canonical_key)`
- Root cause 3: LLM generated duplicate `canonical_key` items; fixed by deduping before upsert
- Migration applied: `20260628000200_fix_checklists_conflict_constraint.sql`

**DB hotfixes applied (2026-06-28):**
- `resource_inventory.updated_at` column added (API was selecting it but column didn't exist)
- Circles RLS infinite recursion fixed via `SECURITY DEFINER` helper functions
- Migration: `20260628000100_fix_inventory_updated_at_and_circles_rls.sql`

**E2E test agent created (`scripts/e2e-agent.mjs`):**
- Creates test user via Supabase Admin API, seeds profile + family, logs in, tests all 7 API endpoints, cleans up
- Final result: **14/14 ✅ PASSOU** against production `eos-app-fawn.vercel.app`
- Usage: `node scripts/e2e-agent.mjs [--url https://eos-app-fawn.vercel.app]`

**Known env var issue discovered:**
- `ANTHROPIC_API_KEY` is NOT set in the Vercel project — `/api/analyze` silently falls back to rules-based `buildSurvivalResponse` mode instead of LLM
- `OPENAI_MODEL` no Vercel está setado como `gpt-5` (inválido) — hardcoded `gpt-4o-mini` nos routes afetados

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-28 (cont. — segunda parte)

**Todo LLM migrado de Anthropic → OpenAI (`app/api/analyze/route.ts`):**
- Usuário confirmou: apenas OpenAI é usada no projeto (nunca houve intenção de usar Anthropic)
- `tryCallLLM` reescrita: `openai.chat.completions.stream()` com `gpt-4o-mini`
- Tokens transmitidos via `chunk.choices[0]?.delta?.content`
- Fallback para `buildSurvivalResponse` mantido se LLM falhar
- `ANTHROPIC_API_KEY` removida da tabela de env vars (não é usada)

**Tela de Recursos — Checklist integrado (P1-T11):**
- `app/(app)/inventory/page.tsx` expandido para mostrar itens do checklist por tier
- Barra de progresso por tier (ESSENCIAL / MODERADO / EXCELENTE)
- Toggle de itens diretamente na tela de Recursos (sincroniza via `/api/checklist/toggle`)
- Botão "Gerar Checklist" se não houver itens ainda
- Itens continuam editáveis na tela dedicada `/checklist`

**Sincronização checklist → inventory (P1-T11):**
- Ao marcar um item como adquirido no checklist, o campo correspondente do inventário atualiza automaticamente
- Mapeamento: `agua-*` → `water_liters`, `combustivel-*` → `fuel_liters`, `kit-*-auxilios` → `has_medical_kit`, `radio-*` → `has_communication_device`, `dinero-*` → `cash_amount`
- Usa `Math.max`: valores existentes nunca são reduzidos (apenas aumentam)
- Suporta canonical_keys em Português E Espanhol (o LLM gera itens no idioma do contexto)

**Investigação do bug de save do inventory:**
- Confirmado via teste E2E: o save funciona — Paulo tem linha na DB com valores corretos
- `resource_inventory`: 1 linha para Paulo (water=45, food=7, fuel=5, battery=80%, medical_kit=true, cash=200)
- `updated_at` existia e o bug anterior (coluna não existia) foi corrigido na migration 20260628000100

**Decisão: `OPENAI_MODEL` env var no Vercel está como `gpt-5` (modelo inválido):**
- Hardcoded `gpt-4o-mini` diretamente nos routes afetados para contornar o env var quebrado
- **Ação recomendada**: atualizar `OPENAI_MODEL` no Vercel para `gpt-4o-mini` e remover os hardcodes

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-28 (P1-T03)

**PWA icons completed:**
- Generated `public/icon-192.png` and `public/icon-512.png` from the canonical `public/icon.svg`
- Confirmed both files are valid PNGs at the exact dimensions declared in `public/manifest.json`
- Verified the production build with `npm run build`
- Next task is P1-T05: resolve language strategy through Gate G-01

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-28 (P1-T05, in progress)

**Bilingual settings foundation:**
- Gate G-01 cleared: Portuguese/English selected explicitly in Settings
- Added `/settings` with immediate PT/EN selection
- Preference persists in localStorage and a same-site cookie
- Document `lang`, global action labels, and bottom navigation react to the selection
- Added Settings to the PWA page cache
- Migrated Onboarding and the private Emergency Card editor to the shared PT/EN dictionary
- Migrated Checklist and Circles, including loading/error states, scenario labels, tier labels, controls, and empty states
- Migrated Scenario, including scenario types, loading sequence, fallback copy, plan headings, rules, sources, and controls
- Migrated Family, including dashboard metrics, risk feed, empty state, member form, medical fields, status toggles, and member-card actions
- Migrated Resources, including readiness, AI briefing, inventory fields, units, equipment, cash, errors, and integrated checklist
- Moved the language provider to the root layout so public and authenticated surfaces share one preference
- Migrated login, signup, password recovery, password update, email verification, landing, and public Emergency Card
- P1-T05 completed with a clean production build

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-29 (P2-T06)

**Ficha Master completed:**
- Added the complete feature specification in `docs/13-ficha-master.md`
- Unified name, location, medical data, emergency contact, and public QR in `/ficha`
- Added seven-signal profile completion progress
- Expanded `/api/profile/ficha` to read and update identity fields with required-name validation
- Kept `profiles` as the single source of truth; no duplicate Master Profile table
- Added PT/EN copy for the new identity and completion interface
- Verified with a clean production build

| P3-T05: Weather Intelligence — 29 activities, rules engine, Open-Meteo | ✅ COMPLETE | 2026-07-01 |

---

## What Was Done — Session 2026-06-30 (P2-T02..T12 + P3-T01..T06)

**Círculos complete rewrite:**
- Admin/Editor/Viewer roles replacing LEADER/MEMBER (split migration for PostgreSQL enum safety)
- Member list with inline role selector + remove; per-field sharing chips; monitoring panel
- QR code toggle for invite code; action plans CRUD; push notification broadcast
- New API routes: `circles/[id]/members/[userId]`, `circles/[id]/monitoring`, `circles/[id]/plans`, `circles/[id]/push`

**Household health:**
- `HouseholdHealthCard` showing member stats and coverage gaps (blood type, emergency contact, etc.)
- Family member ↔ circle profile merge (linked_user_id, "Vinculado" badge, "Possível match" banner)

**Cross-device sync (P3-T06):**
- `lib/sync.ts` — offline write queue (localStorage) + sessionStorage snapshot cache
- `hooks/useRealtimeSync.ts` — Supabase `postgres_changes` subscriptions per table
- `hooks/useOfflineQueue.ts` — online/offline detection + auto-flush on reconnect
- `components/SyncStatus.tsx` — fixed-position sync indicator in app layout
- Integrated into: family, ficha, inventory pages (snapshot pre-load + Realtime invalidation)
- API Workbox cache TTL: 24h → 2min

**Push notifications (P3-T02):**
- VAPID keys generated; `push_subscriptions` table + RLS
- ServiceWorker push/notificationclick handlers via next-pwa `customWorkerSrc`
- Settings page toggle for subscribe/unsubscribe
- Circle Admin → broadcast push to all member subscribers

**Feature gates (P2-T07):**
- `lib/feature-gates.ts` with `canAccess(feature, plan)`, tiers: free/family/premium
- All gated features show locked state with upgrade CTA for free users

**Monitor upgrades (P2-T09..T12):**
- `lib/monitor.ts` extracted as shared module (NWS weather + USGS earthquakes)
- `app/api/circles/[id]/monitoring` — parallel per-member geo monitoring

**Pending before ship:**
- ~~Apply 3 migrations to Supabase: circle_action_plans, push_subscriptions, family_member_link~~ ✅ CONFIRMADAS APLICADAS 2026-07-10 (auditoria)
- ~~Add VAPID keys to Vercel env vars~~ ✅ FEITO 2026-07-05 (D-036 — par novo em Prod+Preview)
- P3-T04: Monetization gate — decision needed from owner

---

## What Was Done — Session 2026-07-08 (D-040/D-041 — fluxo de membros)

**D-040** — as 6 formas de adicionar membro do doc 12 implementadas + aprovação de Admin (`circle_join_requests`): família manual, escanear ficha → cadastro, convite por código (agora vira pedido pendente), convite por QR, pedido por busca sem código, escanear ficha → convidar. Rotas `[id]/requests`, `[id]/requests/[reqId]`, `my-requests`; operações cross-user via service-role (`lib/supabase/admin.ts`) para evitar recursão de RLS. Scanner `html5-qrcode` + `lib/qr-parse.ts`. Corrigidos 2 bugs de RLS/embed (join member-only → 404; lista de membros vazia por embed `profiles` inválido). Verificado 19/19 E2E (`scripts/e2e-members.mjs`).

**D-041** — entrar em círculo por convite (código/QR/busca) passou a ser **grátis para todos**; só **criar** círculo é gate Família. Mudança só na UI de `/circles` (as rotas de join nunca checaram plano). Desbloqueia viralização (convidado free não esbarra em paywall).

---

## What Was Done — Session 2026-07-10 (regressão + auditoria de migrações)

**E2E de regressão contra produção** (`eos-app-fawn.vercel.app`): `full-journey.mjs` **31/31 ✅** e `e2e-members.mjs` **19/19 ✅**. Nada regrediu após D-040/D-041; provedores de weather (open-meteo/nws/usgs) todos `ok`, RAG/Decision Engine em streaming ok.

**Auditoria de migrações** (via existência de tabela/coluna, service-role REST): `circle_action_plans`, `push_subscriptions`, `family_members.linked_user_id`, `circle_join_requests` → **todas ✅ aplicadas**. Único pendente: trigger `handle_new_user` (`20260705000000`) — **ainda ausente** (criar auth user não gera `profiles` sozinho), mas o self-heal `lib/ensure-profile.ts` (D-038) cobre; aplicar é otimização, não correção. Precisa SQL Editor (sem credencial de DB no ambiente do agente). Detalhes em `docs/11-product-memory.md` → "Migrações — auditoria de produção".

**Próximo item de produto**: P3-T04 Monetização — decisão tomada nesta sessão (ver abaixo).

---

## What Was Done — Session 2026-07-10 (cont. — UI Weather adaptada ao hazard subsystem + pendências)

- **Tela Weather Intelligence** (`app/(app)/weather/page.tsx`) agora consome `/api/hazards` além de `/api/weather-intelligence`: mostra o componente **Live Intelligence Network** no topo, um card de **Rain Nowcast** (frase honesta: "prevista para começar em ~X min"), e **eventos classificados** (OFFICIAL WARNING / WATCH / ADVISORY / DETECTED EVENT / FORECAST) substituindo a lista de alertas otimista. O rodapé "Data Sources" deixou de mostrar `providers: ok` otimista e aponta para o estado real da rede. Terremotos antigos viram fallback (agora aparecem como DETECTED EVENT). Build/lint/tsc limpos.
- **`docs/PENDENCIAS-DONO.md`** criado — checklist consolidado, marcado **PENDENTE**, com tudo que o dono precisa fazer: Stripe (migration + 4 env vars + webhook), chaves dos providers de hazard (WeatherKit, AccuWeather, Xweather, ShakeAlert, FEMA IPAWS) e as 3 migrations a aplicar no SQL Editor.

---

## What Was Done — Session 2026-07-10 (cont. — P3-T04 Monetização / D-042)

**Stripe self-serve implementado** (código pronto; ativação depende de checklist do dono). Antes: tiers e feature-gates prontos, mas `profiles.plan` sem caminho de escrita (botão de upgrade só dava `alert`). Agora:
- **Migration** `20260710000000_stripe_billing.sql`: `profiles` ganha `stripe_customer_id`, `stripe_subscription_id`, `plan_status`, `plan_current_period_end` (+ índice). **Aplicar no SQL Editor** (sem credencial de DB no ambiente).
- **`lib/stripe.ts`**: `getStripe()` (null → 503), `priceIdForPlan()`, `planForPriceId()`, `isActiveStatus()`.
- **Rotas**: `POST /api/billing/checkout` (Checkout Session, cria/reusa customer), `POST /api/billing/portal` (Billing Portal), `POST /api/billing/webhook` (raw body + verificação de assinatura, escreve plano via service-role em `checkout.session.completed` / `customer.subscription.*`; downgrade → free ao cancelar/expirar).
- **UI Settings**: botões de upgrade abrem Checkout (Família/Premium); "Gerenciar assinatura" abre Portal p/ quem já paga; banner de retorno `?billing=success|cancelled`. i18n PT/EN.
- **Dep**: `stripe@^22`.

**Verificação**: `tsc --noEmit` limpo; `npm run build` limpo (3 rotas de billing presentes); teste local confirmou **degrade gracioso**: `/api/billing/webhook` e `/api/billing/checkout` respondem **503** sem chaves (não crasham). Fluxo E2E de pagamento real não testado (precisa das chaves Stripe do dono).

**Checklist de ativação (dono)** — em D-042: (1) aplicar migration no SQL Editor; (2) criar 2 produtos/preços recorrentes no Stripe; (3) setar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FAMILY`, `STRIPE_PRICE_PREMIUM` no Vercel; (4) registrar webhook `…/api/billing/webhook` (eventos `checkout.session.completed`, `customer.subscription.updated|deleted`); (5) redeploy.

---

## What Was Done — Session 2026-07-19 (Stripe checkout 500)

**Bug relatado:** botão de upgrade em Settings falhava com `Não foi possível iniciar o pagamento: 500`.

**Causa confirmada nos logs da Vercel:** Stripe rejeitava `success_url` com `url_invalid / Not a valid URL`. O deploy estava montando URLs de retorno a partir de env var manual com formatação inválida (classe D-035/D-036: aspas/whitespace/`\n` em env var).

**Correção:**
- `lib/site-url.ts` criado: normaliza URL canônica removendo aspas, whitespace, `\n` literal e barras finais; adiciona `https://` quando necessário; prioriza `VERCEL_PROJECT_PRODUCTION_URL`.
- Rotas `/api/billing/checkout` e `/api/billing/portal` passam a usar o helper compartilhado.
- `lib/auth/utils.ts` reexporta o mesmo helper para manter redirects de auth consistentes.
- `/dashboard` voltou a buildar: `RiskProvider` agora é montado localmente nessa página, já que o v2 shell global está propositalmente desligado por D-045.

**Verificação:** `npm test` → 45/45; `npm run type-check` limpo; `npm run build` limpo. Após deploy (`13fee78`), chamada autenticada em produção para `POST /api/billing/checkout` retornou `200` com URL `checkout.stripe.com` (sem 500). Próximo passo operacional: concluir pagamento com cartão Stripe test `4242` e validar `profiles.plan`.
