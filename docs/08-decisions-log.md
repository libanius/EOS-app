# 08 — Decisions Log

> Decisions made. Not up for re-discussion without a new entry.

---

## D-221 — O vento sempre começa desligado, e seu controle não some sozinho

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: MAP follow-up (relatos do dono em uso)
**Spec**: `docs/16-hybrid-world-dashboard.md`

**Context**: dois relatos do dono depois da D-219. O vento voltava ligado ao
reabrir o app, e o menu de controles do vento *"às vezes aparece, na maioria das
vezes não"*.

**Decision (1) — o vento não é herdado.** A restauração a partir de
`eos-map-layers` foi **revogada**. O vento é a camada mais cara do app — grade
remota, campo escalar e 1.400 partículas — e abrir o app já pagando esse preço,
sem ter pedido, é o oposto do que a primeira tela deve fazer. Ligar custa um
toque; herdar ligado é uma conta que ninguém escolheu. As demais camadas
continuam persistindo: só o vento tem esse custo.

Isto **não** toca `profiles.map_base_mode` (D-h) nem reacopla vento e base
(D-199): é o estado inicial de uma camada, não a escolha de como o mundo é
desenhado.

**Decision (2) — o controle aparece com a camada, não com o dado.** A D-206
tirou `readings.length` da condição de render, mas ele continuou governando
quando `windControlsVisible` virava `true`. O defeito que a D-206 declarou
corrigido sobreviveu: o controle só nascia quando a grade chegava, e a grade
global levava até 20 segundos.

**Decision (3) — quem esconde no arrasto devolve no fim do gesto.** Sair da
frente durante o arrasto é intencional e fica. O que faltava era a volta:
`move` e `zoom` escondiam, e **nada** reexibia. Como o mapa emite `move`
sozinho — carga inicial, `easeTo`, terreno assentando, `resize` —, bastava abrir
a tela para o controle sumir e não voltar. `moveend` e `zoomend` agora
restauram.

**Consequence**: fechar a decisão (1) obriga a pessoa a tocar no Vento toda
sessão, o que transformou uma corrida rara em rotina: `windAllowed` lê
`plan ?? 'free'`, e `plan` começa `null`, então tocar antes de
`/api/profile/plan` responder mandava um **assinante** para o muro de pagamento.
Corrigido junto: plano desconhecido não é plano grátis — enquanto não se sabe, o
toque não faz nada em vez de fazer a coisa errada.

**Não autorizado por D-221**: restaurar o vento ligado na abertura; condicionar
a visibilidade do controle à chegada de leituras; esconder o controle sem um
caminho de volta; tratar `plan === null` como `free` em decisão de acesso.

---

## D-220 — O EOS avisa com o app fechado; e avisa sobre MUDANÇA, não sobre estado

**Date**: 2026-08-24
**Status**: DECIDED / IMPLEMENTADO — depende da migration `20260824000000_hazard_alerting.sql` e da env `CRON_SECRET`
**Spec**: `docs/hazard-alerting-setup.md`

**Context**: O dono comparou o EOS com o MyRadar no celular. O concorrente entregou 5 notificações (tempestade formada, tempestade elevada, furacão rebaixado, ar insalubre, chuva em 15 min). O EOS não entregou nenhuma. A auditoria mostrou que **não era falta de fonte** — NHC, NWS, USGS, AQI e nowcast já estavam integrados e vivos desde D-043.

**Correção de premissa (importante para quem ler depois)**: a primeira versão desta análise foi feita sobre uma base de 2026-07-29 e concluiu "não existe nenhum job agendado". **Isso estava errado para o `main` atual.** O D-113 já entregou `/api/cron/weather-notifications` + workflow do GitHub Actions a cada 15 min — inclusive resolvendo o problema do plano Hobby de um jeito melhor do que o proposto aqui (Actions de graça, com o cron diário da Vercel como rede de segurança). O que o D-113 **não** faz, e é o que sobra para esta decisão:

1. **Não chega no telefone.** `createCommsNotifications` insere em `circle_notifications` — é caixa de entrada dentro do app. O sininho enche; a tela de bloqueio nunca acende. O print do dono é de notificação na tela de bloqueio.
2. **Não tem memória de estado.** A varredura do D-113 deduplica por `source_key` (o mesmo alerta não repete), mas não compara com a passada anterior. "Foi rebaixado para Categoria 1" exige saber que ontem era Categoria 2 — e a migration que guardaria isso (`20260710010000`) nunca foi aplicada.
3. **Cobre só NWS.** O cron do D-113 chama `fetchWeather` e mais nada. NHC (furacões), AQI, nowcast de chuva e terremotos ficam de fora — 4 dos 5 alertas do print.
4. **O dashboard nem consome o subsistema.** `RiskProvider` lê `/api/weather-intelligence`; NHC e nowcast só existem em `/api/hazards`.

**Decision**:
1. **Varredura agendada, agnóstica de agendador.** `/api/cron/hazard-scan` é uma requisição autenticada por `CRON_SECRET`, igual à do D-113 — e por isso **é dirigida pelo mesmo workflow do GitHub Actions**, que já resolve o problema do plano Hobby de graça. O `vercel.json` do D-113 (cron diário, rede de segurança) fica intacto.
   **Corrigido em campo**: a primeira versão desta implementação sobrescreveu o `vercel.json` com `*/10 * * * *` e **derrubou o deploy** — uma conta Hobby não reduz um cron sub-diário, ela rejeita a publicação inteira. Lição que vale além deste caso: configuração de plataforma que só funciona em plano pago não entra no repositório, porque quebra quem está no plano gratuito. O D-113 já tinha acertado isso; foi o merge tardio que expôs o erro.
2. **O alerta é sobre a MUDANÇA.** `lib/hazards/transitions.ts` compara a varredura atual com a anterior e emite `formed | issued | detected | upgraded | downgraded | cleared`. Evento sem mudança não produz nada — esse silêncio é a feature: varrer a cada 10 min sobre uma tempestade parada não pode notificar 144 vezes por dia.
3. **Números estruturados, nunca texto re-parseado.** `HazardEvent.metrics` carrega vento, categoria Saffir-Simpson, magnitude, AQI. Extrair isso de volta de uma string de resumo é como um alerta fica errado em silêncio — foi exatamente o que já acontecia (ver Consequência).
4. **Categoria acima de severidade para ciclones.** Cat 4 e Cat 2 são ambos `severe`; colapsar os dois deixaria o EOS mudo justamente na mudança que importa.
5. **AQI e chuva viram `HazardEvent` sintéticos.** Não são "eventos" em nenhum feed — um é número, o outro é curva de previsão. Sintetizá-los faz os cinco tipos passarem pelo mesmo pipeline de dedup e entrega. Um pipeline, um lugar para estar errado.
6. **Só notifica o que pode te alcançar.** Ciclone tropical a mais de **750 mi** não gera push. O concorrente manda "Iselle se formou no Pacífico Leste" para um telefone na Flórida: é escolha de ser *interessante*, não *útil*. Quem quiser esse comportamento liga `basin_wide_tropical` — existe, mas é opt-in explícito.
7. **Toda supressão é registrada com motivo.** `deduped`, `not_relevant`, `suppressed_quiet_hours`, `suppressed_cooldown`, `plan_gated`, `no_subscription`, `failed`. "Por que eu não fui avisado?" precisa ter resposta.
8. **Dedup por chave estável de transição**, com índice único `(user_id, dedup_key)`. No print do concorrente, "Lala rebaixada para Categoria 1" aparece **duas vezes**, em dias diferentes. Aqui isso é impossível por construção, não por sorte.
9. **Quiet hours por longitude** (15°/hora), porque o perfil não guarda timezone. Precisão de ~1 hora, documentada em vez de escondida. Crítico fura a janela quando `allow_critical_override` está ligado.

**Consequence**: o EOS passa a ter voz própria — deixa de depender de alguém abrir o app para descobrir que um furacão mudou de categoria. O custo é a primeira persistência de estado de hazard e um job recorrente; mitigado por agrupamento por grade (~1,1 km), teto de 60 localizações por passada e feeds todos gratuitos.

Achado de passagem, corrigido aqui: o filtro de relevância do USGS re-extraía a magnitude do título com `/M(\d+\.\d+)/`, mas o título do USGS vem como `"M 4.3 - …"` — **com espaço**. A regex nunca casava, toda magnitude virava `0`, e **todo terremoto era descartado como irrelevante**. É o exemplo exato do item 3: o dado estava lá, chegava certo, e morria num re-parse de texto.

10. **Dois varredores convivem por enquanto** (`hazard-scan` e `weather-notifications`). Não unifiquei no mesmo commit de propósito: o do D-113 está em produção e funcionando, e trocar o motor de alerta e a fonte de agendamento na mesma leva é como se perde a capacidade de saber qual metade quebrou. `ALERT-T05` é a unificação, com o `hazard-scan` absorvendo o outro — ele é superconjunto em fontes e o único com memória de estado.
11. **`monitoring_push` passa a ser `free`** (decisão do dono, 2026-08-24). Um aviso de furacão que só chega para quem pagou não é produto de segurança, é upsell com roupa de alerta. O código continua consultando o gate, então reverter é uma linha.
12. **Idioma do push segue a escolha do usuário, com inglês como base** (decisão do dono, 2026-08-24; alinhado ao D-206). `localStorage` e cookie bastam para tudo que é renderizado a partir de uma requisição — mas a varredura não tem navegador. Por isso `profiles.language`, gravado em fire-and-forget por `setLanguage`. Quem nunca escolheu recebe em inglês; quem escolheu português recebe em português.

---

## D-219 — O campo escalar do vento amostra em rede, não por pixel

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: MAP follow-up (defeito visto em uso)
**Spec**: `docs/16-hybrid-world-dashboard.md`

**Context**: ligar o Vento congelava a página. O dono reproduziu em Chrome e
Safari, inclusive em aba anônima, e o navegador oferecia "aguardar ou sair" —
sintoma de thread principal bloqueada, não de rede.

`WindParticleLayer.renderScalarField` percorria **cada pixel** do canvas —
~705.000 num laptop com `scalarMaxDpr: 0.72` — e para cada um chamava
`map.unproject()` mais uma interpolação com busca binária. Tudo síncrono.

O dono notou que piorava no HÍBRIDO, e a observação era a chave: híbrido é a
**única** base que liga o terreno 3D (`providers.ts`: `hasTerrain: !isDark &&
!isSatellite && Boolean(key)`). Com terreno, `unproject` deixa de ser inversão
de matriz e vira raycast contra a malha de elevação. Setecentos mil raycasts não
terminam.

O absurdo de fundo: a grade de vento tem **625 pontos** (25×25, `WorldMap.tsx`).
O render gerava 705 mil amostras a partir deles — mil vezes mais fino que o
dado, produzindo zero informação nova.

**Decision**: o campo escalar é calculado num canvas de baixa resolução, uma
amostra a cada `scalarSampleStep` pixels (padrão 8), e ampliado com suavização
bilinear. A conta cai 64x — ~11.000 amostras no lugar de ~705.000.

**Cada amostra continua sendo um `unproject` REAL.** A alternativa óbvia —
desprojetar os quatro cantos e interpolar lng/lat entre eles — foi **recusada**:
o mapa abre com `pitch: 56°`, a projeção não é afim, e o campo pararia no lugar
geográfico errado perto do horizonte. Num app de emergência, vento desenhado no
lugar errado é falha pior que lentidão.

**Consequence**: o vento volta a funcionar nas três bases, sem regra nova. A
proposta de restringir o Vento ao Satélite foi descartada: ela reverteria a
D-199 (vento é camada, não base), tiraria os rótulos de rua do híbrido e
sobrescreveria a preferência persistida em `profiles.map_base_mode` (D-h). Se o
terreno ainda pesar depois desta correção, o próximo passo é suspender o relevo
3D com o vento ligado, declarando na tela — nunca trocar a base escolhida pela
pessoa em silêncio.

Visualmente o campo é indistinguível: a fonte já era suave, e a ampliação
bilinear devolve a mesma mancha.

**Não autorizado por D-219**: voltar a amostrar por pixel; interpolar lng/lat
entre cantos da tela; acoplar o Vento a uma base específica.

---

## D-218 — Mapa e rota offline saem de OSM, não do Google

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: OFFMAP-T01..T04
**Spec**: `docs/18-family-plans.md` §5 e §10, `specs/PLAN-EXEC-001-execucao-de-plano.md` §8

**Context**: o dono pediu navegação offline "tipo Google Maps" para a execução.
Duas coisas bloqueavam isso, e as duas são registradas aqui em vez de ficarem no
verbal.

A primeira é licença. Os termos do Google Maps proíbem cache e armazenamento
local de tiles e de rotas; é a mesma barreira que a `docs/18` §10 já registra
para ArcGIS Online e CARTO. Um mapa que não pode ser guardado não é um mapa
offline — e a execução acontece exatamente quando a rede não está lá.

A segunda é arquitetura. O `PLAN-EXEC-001` §8 põe "motor de roteamento em tempo
de execução" fora de escopo **por escolha**, e a `docs/18` §5 dá a razão: a rota
que a família desenha carrega conhecimento local que motor nenhum tem — o
atalho pelo condomínio, a rua que alaga, o portão que fecha às 22h.

**Decision**: EOS ganha mapa e rota offline, com stack aberta e sem trocar o que
já funciona.

- **Base cartográfica**: dados **OpenStreetMap** (ODbL) empacotados como
  **PMTiles/Protomaps** — arquivo único, auto-hospedado, cacheável sem violar
  termos — renderizados pelo **MapLibre**, que o EOS já usa. Atribuição
  `© OpenStreetMap` visível em toda superfície de mapa.
- **Roteamento**: **Valhalla** (MIT) rodando sobre tiles locais. GraphHopper
  fica como alternativa; a API hospedada dele é comercial e não entra.
- **Google Maps é recusado** como fonte de tiles ou de rotas, por licença. Segue
  válido apenas como *handoff* — abrir o app externo por link, que é o que a
  tela de rota já faz hoje.

**A rota desenhada pela família continua sendo a verdade do plano.** O motor não
a substitui e não a reescreve: ele só produz rota quando **não existe** rota
desenhada para aquele par de pontos, e o resultado é marcado na tela como
`rota calculada` em oposição a `rota da família`. A distinção é do mesmo tipo que
a de `precision` nos pontos — procedência visível, nunca inferida em silêncio.
Isto preserva a razão da `docs/18` §5 em vez de revogá-la.

**Consequence**: `PLAN-EXEC-001` §8 deixa de listar roteamento como fora de
escopo e passa a apontar para esta decisão; a pendência de provedor de tiles da
`docs/18` §10 é **fechada** por PMTiles. Custo de armazenamento no aparelho e
recorte geográfico do pacote de tiles viram critério de aceitação, não detalhe
de implementação: um pacote que não cabe no celular da família não serve.

**Não autorizado por D-218**: usar tiles ou rotas do Google, ArcGIS ou CARTO em
cache; deixar rota calculada passar por rota da família; publicar mapa sem a
atribuição OSM.

---

## D-217 — A autoria tem princípios próprios, e a EXEC-T01 não é reaberta

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: PLAN-AUTHOR-001, EXEC-T07
**Spec**: `specs/PLAN-EXEC-001-execucao-de-plano.md` v1.1, `specs/PLAN-AUTHOR-001-autoria-do-plano.md`

**Context**: a crítica de 2026-08-19 (Design Health 22/40) mostrou que o
PLAN-EXEC-001 v1.0 declarava princípios só para a execução e deixava a autoria
sem nenhum, sem dizer por quê — duas metades da mesma feature desenhadas por
filosofias diferentes. O patch proposto corrigia isso, mas trazia três defeitos.

**Decision**: v1.1 acrescenta §4.0 (as duas cenas) e §4.0.1 (princípios da
autoria), estende a proibição de `--mu`/`--ink-3` às duas superfícies, e cria a
§5.7 (`destination_place_id`). As três correções sobre o patch original:

1. **A premissa estava invertida.** O patch tratava o beco sem saída da precisão
   como risco futuro a sequenciar antes da EXEC-T01. A EXEC-T01 fechou em
   2026-08-19 com a migração aplicada pelo dono, e T02 a T06 foram construídas
   sobre ela: todo waypoint legado **já está** `precision: 'unknown'`, e o picker
   já desabilita `Confirmar` nesse estado. Não é prevenção, é defeito vivo. Por
   isso AUTHOR-T02 é a primeira fase de autoria, à frente do rascunho
   persistente.
2. **`onPick` grava `'address'`, não `'gps'`.** `precisionLabel` renderiza
   `'gps'` como "marcado no local". Quem solta um pino no mapa do sofá não
   estava no local; gravar `'gps'` faria a carta afirmar presença física que não
   houve, que é a procedência falsa que a §5.2 existe para impedir.
3. **A EXEC-T01 não é reaberta.** Acrescentar critério a uma fase encerrada
   tornaria retroativamente ilegítimo tudo que veio depois, pela regra da §9. O
   trabalho de destino por identidade entra como **EXEC-T07**.

**Consequence**: ordem de execução é AUTHOR-T02 → AUTHOR-T01 → AUTHOR-T03 →
AUTHOR-T04 → EXEC-T07. A numeração das fases é a de origem e não muda.

**Não autorizado por D-217**: reabrir a EXEC-T01, gravar `'gps'` para ponto
marcado no mapa, ou resolver destino ambíguo por ordem de lista.

---

## D-216 — Excluir um plano arquiva; a memória da execução não é destruída

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: PLAN follow-up (pedido do dono)
**Spec**: `docs/18-family-plans.md`, `specs/PLAN-EXEC-001-execucao-de-plano.md`

**Context**: o dono pediu o que faltava desde PLAN-T01: não havia como excluir um
plano. `app/api/plans/route.ts` tinha só GET e PUT. Dava para criar e nunca
desfazer, então plano de teste e plano duplicado ficavam para sempre no seletor
disputando espaço com o plano de verdade — e escolher entre "Furacão" e
"Furacão (teste)" na hora da execução é exatamente a hesitação que o EOS existe
para remover.

**Decision**: `DELETE /api/plans/:id` **arquiva** (`status = 'archived'`), não
remove a linha. `family_plan_executions.plan_id` é `ON DELETE CASCADE`: um
DELETE de verdade levaria junto o registro de que a família executou aquele
plano, que é histórico de emergência real. `status = 'archived'` já é estado de
primeira classe no schema e toda listagem filtra `.neq('status', 'archived')`,
então para quem usa o app o plano some. Ficar com zero planos é estado legítimo:
a tela volta ao rascunho em branco em vez de exigir que sempre exista um plano.

Duas travas: só Admin ou Editor exclui — Viewer lê o plano, não decide o que a
família perde; e plano com execução `running` é recusado com motivo na tela, pela
mesma razão que EXEC-T01 recusa apagar um lugar em uso. Some para todos, então
avisa todos por push, como salvar já avisa (doc 18 §6.3).

**Consequence**: a UI usa dois toques — o primeiro abre a confirmação que declara
o que se perde, o segundo executa. Nunca um `×`: a crítica de 2026-08-19 registrou
que esta página já tem dois `×` idênticos, um reversível e outro não, e a ação que
apaga o plano inteiro não pode parecer a que tira uma linha de uma lista.

**Não autorizado por D-216**: apagar a linha de `family_plans`, remover execuções
passadas, ou expor exclusão a Viewer.

---

## D-215 — Escalonamento é configurado por protocolo no planejamento

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: EXEC-T05
**Spec**: `specs/PLAN-EXEC-001-execucao-de-plano.md`

**Context**: EXEC-T05 exigia escalonamento por tempo, mas o spec não definia o
intervalo. Um valor fixo global seria errado: incêndio em casa, criança perdida
num evento e evacuação regional têm tempos de resposta diferentes.

**Decision**: o intervalo de escalonamento pertence ao protocolo/gatilho do
plano. O planejamento grava `family_plan_triggers.escalation_minutes`; a UI
oferece valor editável por protocolo. Quando vazio, o padrão explícito é 15
minutos. Valores válidos ficam entre 5 e 120 minutos para evitar tanto ruído
quanto atraso operacional.

**Consequence**: a execução usa esse valor para sugerir o próximo passo local e
determinístico. `Fiz isso` e `Ainda não` só registram evento e reiniciam/adiam o
relógio; nenhum botão executa ligação, aviso externo ou acionamento de
autoridade.

---

## D-214 — Brilho máximo é responsabilidade Native, não PWA

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: EXEC-T04
**Spec**: `specs/PLAN-EXEC-001-execucao-de-plano.md`

**Context**: EXEC-T04 pedia que entrar em execução aplicasse brilho máximo. Na
Web/PWA o EOS não controla o brilho do sistema; o máximo disponível é manter a
tela acordada quando a plataforma suporta, e melhorar a legibilidade dentro do
próprio DOM. Dizer que a PWA ajustou brilho seria uma promessa falsa.

**Decision**: brilho máximo fica para adaptadores Native futuros. Na Web/PWA,
EXEC-T04 aplica apenas o modo de legibilidade de execução: contraste próprio e
números ampliados. Wake Lock pode ser usado como reforço quando suportado, mas
não é critério de aceite da PWA.

**Consequence**: o critério de EXEC-T04 deixa de exigir brilho máximo no Web/PWA.
Quando iOS/Android nativos existirem, eles podem implementar brilho real como
capacidade de plataforma.

---

## D-213 — Uma sessão armada por círculo

**Date**: 2026-08-19
**Status**: DECIDED
**Roadmap**: EXEC-T02
**Spec**: `specs/PLAN-EXEC-001-execucao-de-plano.md`

**Context**: EXEC-T02 cria `plan_sessions` e um banner global permanente. A spec
definia o que é uma sessão armada, mas não o conflito de duas sessões `armed` no
mesmo círculo.

**Decision**: um círculo pode ter no máximo uma sessão `armed`. Se alguém tentar
armar outra, a API recusa com motivo. O EOS não substitui nem desarma a sessão
anterior em silêncio.

**Consequence**: a migration usa índice parcial por `circle_id WHERE status =
'armed'`, e a UI trata conflito como estado explícito para a família resolver.

---

## D-212 — Executar plano é um MODO, não uma tela

**Date**: 2026-08-18
**Status**: DECIDED
**Roadmap**: EXEC-T00 … EXEC-T06
**Spec**: `specs/PLAN-EXEC-001-execucao-de-plano.md` (Ready)
**Pedido do dono**: *"o produto está complexo para o usuário e não funcional (…)
eu aperto um botão para executar o plano escolhido e na tela dos familiares que
estão no nosso círculo um playbook começa a rodar."*

**Context**: `/preparedness/plano` acumula autoria e execução na mesma rolagem de
1409 linhas. Os critérios do `docs/18` §13 descrevem uma família **lendo** o plano
com o avião no chão; o que existe são vinte campos editáveis. O caso de teste do
dono — filha se separa numa Parade, multidão, sinal congestionado — quebra o
desenho atual em quatro pontos: o cache é por círculo e não por plano, a execução
mora dentro do `MemberSheet` e morre ao fechar a folha, o aviso ao círculo é um
botão manual separado do disparo, e o protocolo é um portão antes da ação.

`docs/35` §7 já previa esta decisão e a deixou pendente: *"Modo emergência (…) não
é para agora — fica registrado como evolução possível depois que Model C estiver
de pé."* Model C fechou em 2026-08-14.

**Decision**:

1. **Execução é o segundo MODO do EOS**, com a mecânica do Modo Simulação
   (D-184): banner global permanente, superfície própria, saída explícita.
   `MemberSheet` mantém só a entrada.

2. **A entrega da mensagem não é o que faz o plano funcionar.** Cada aparelho já
   tem o plano em IndexedDB; executar acende localmente um roteiro que aquele
   aparelho já podia rodar sozinho. Push é reforço. Consequência dura: nenhuma
   tela do playbook espera resposta de servidor para renderizar.

3. **Três ciclos de vida separados.** Lugar (`circle_places`, do círculo) · Plano
   (o compromisso, versionado) · Sessão (`plan_sessions`, o dia). O ack não existe
   porque um lugar mudou — existe porque um compromisso mudou.

4. **Waypoint aponta para o lugar**, não copia. Mover um lugar mais de 50 m
   versiona todos os planos que o usam e dispara ack; mudar nome ou nota, não.
   Apagar lugar em uso é bloqueado.

5. **Ponto do dia é efêmero e promovível em dois estágios.** Marcado durante a
   sessão não versiona nem notifica; no encerramento o EOS oferece guardá-lo no
   catálogo; adotá-lo num plano, em tempo de calma, aí sim versiona.

6. **Disparar é um ato só**: segurar 1,5 s cria a execução, envia o aviso e abre o
   playbook, com janela de desfazer de 30 s em faixa — nunca modal. O aviso sai
   imediatamente; o cancelamento emite um segundo aviso.

7. **O protocolo passa a ser o primeiro passo do playbook**, não um portão antes
   do disparo. Corrige D-207 no ponto de execução sem revogá-lo: plano continua
   sendo envelope e protocolo continua sendo a execução — muda **quando** se
   escolhe.

8. **O dependente entra por carta, não por tela.** `family_plan_dependent_briefs`
   guarda por plano o que foi combinado com ele; aparece na tela de quem procura
   como citação, fora da numeração, e nunca em superfície pública (`docs/18` §8).

9. **MVP é só o arquétipo `meet`.** `action_type` passa a determinar a forma da
   tela; `evacuate`, `shelter`, `communicate` e `wait` continuam salvando e caem
   em `meet` na execução até terem spec própria.

10. **Satélite vira preferência persistente do app** (`profiles.map_base_mode`,
    padrão `satellite`), válida em todas as superfícies de mapa em vez de estado
    local por componente. Halo e scrim viram token obrigatório: sobre imagem, o
    marcador que lê bem na mata some no estacionamento.

11. **Legibilidade ao sol sem variante de tema**: o modo execução força brilho
    máximo e amplia o corpo dos números. Nenhum texto essencial usa `--mu`.

**Consequence**: sete fases (EXEC-T00…T06), uma por vez, cada uma com critérios
binários na seção 7 do spec. **EXEC-T00 é bloqueante**: enquanto o cache offline
for chaveado por círculo e não por `(circleId, planId)`, "executar o plano certo
sem rede" é promessa que o app não cumpre — e é justamente o caso da multidão.

Fica de fora, registrado: o arquétipo **Evacuar**. O incêndio doméstico provou que
ele não cabe aqui — começa depois do evento, na calçada, e sua primeira tela é uma
conferência de presença, não uma lista de passos. Spec própria.

Download de tiles continua fora, e agora por motivo corrigido: não é falta de
chave — o satélite já é keyless via ESRI (D-199) — são os termos do provedor, que
não autorizam cache em massa, como os da CARTO.

---

## D-207 — Plano não executa documento; executa protocolo

**Date**: 2026-08-17
**Status**: DECIDED
**Roadmap**: PLAN-T11
**Pedido do dono**: *"eu deveria escolher em uma lista de protocolos/planos qual
executar, seja o Pilot sugerir ou eu acionar."*

**Context**: PLAN-T08 e PLAN-T09 permitiram executar um plano e escolher entre
vários planos do círculo. Mas depois da escolha o host local ainda despejava o
documento inteiro em ordem fixa: todos os gatilhos, todos os papéis, todos os
pontos e todas as rotas. Isso não é execução operacional; é leitura assistida.

**Decision**:

1. **Plano é envelope; protocolo é execução.** O usuário primeiro escolhe o
   plano salvo e depois escolhe qual gatilho/protocolo está ativo.

2. **Gatilhos atuais viram protocolos MVP.** Sem migration nova, cada
   `family_plan_triggers` define uma opção acionável: condição observável +
   ação combinada. O Pilot pode sugerir esses gatilhos, mas eles só entram como
   protocolo depois de aplicados ao rascunho e salvos pelo usuário.

3. **Executar mostra o caminho selecionado, não o documento inteiro.** O host
   local sempre alerta o círculo, mostra o protocolo ativo, aplica papéis, tenta
   destacar o ponto de encontro compatível com a ação e inclui rotas/notas
   existentes. Quando não houver gatilho salvo, cai para execução geral.

4. **Sem fingir automação que não existe.** A inferência de ponto é heurística
   textual simples sobre ações já aprovadas; ela não cria rota, não decide risco
   e não substitui autoridade oficial.

**Consequence**: a execução passa a começar por "o que está acontecendo?" em vez
de "ler todos os itens do plano". A timeline compartilhada continua futura em
`family_plan_executions`.

---

## D-208 — Protocolo não é uma frase; é uma decisão estruturada

**Date**: 2026-08-17
**Status**: DECIDED
**Roadmap**: PLAN-T12
**Pedido do dono**: *"os gatilhos estão engessados. Eu deveria poder decidir o
tipo de ação e etc."*

**Context**: D-207 transformou gatilhos em protocolos executáveis, mas o editor
continuava limitado a `Se acontecer` → `Então`. Isso força destino, intenção,
rota e comunicação a morarem dentro de uma frase. O host de execução fica
obrigado a adivinhar por texto aquilo que a família já deveria ter escolhido.

**Decision**:

1. **Protocolo tem tipo de ação.** Ação deixa de ser só texto livre e passa a
   aceitar uma intenção operacional: encontrar, evacuar, abrigar, comunicar,
   esperar ou personalizado.

2. **Destino e rota são escolhas explícitas quando existirem.** O protocolo pode
   apontar um ponto do plano e uma rota desenhada. Texto livre continua como
   instrução curta, não como lugar para esconder estrutura.

3. **Migração aditiva, legado preservado.** `family_plan_triggers` ganha colunas
   opcionais. Registros antigos seguem válidos. Enquanto a migration não estiver
   aplicada, a API salva o formato antigo e registra a degradação.

4. **Pilot sugere, família decide.** Sugestões do Pilot podem vir com tipo e
   destino padrão, mas a família pode trocar antes de salvar. Nenhum protocolo é
   executável sem confirmação/versionamento do plano.

**Consequence**: a execução passa a ler escolhas estruturadas, não inferir tudo
por frase. Inferência textual vira fallback para planos antigos, não motor
principal.

---

## D-206 — De longe o vento mentia duas vezes

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: MAP-T09
**Achado do dono**: *"de perto o movimento coincide com o radar de chuva e me
parece certo; de longe tudo parece mais fake, não condiz com o que de perto é."*

**Context**: A observação é precisa e aponta para dois números diferentes.

**Mentira 1 — o amortecedor.** `globalScale = 0.58`: quando a grade cobre o
mundo, as partículas andavam **42% mais devagar** que a mesma velocidade vista
de perto. Ele existia para compensar o passo em graus não normalizado — afastado
tudo disparava, e alguém freou no braço. **D-204 normalizou o passo pela
projeção**, e com isso o amortecedor deixou de compensar coisa alguma: virou
distorção pura, fazendo o mesmo vento contar velocidades diferentes conforme a
distância do olho. Removido.

**Mentira 2 — a resolução, e essa NÃO foi corrigida.**

```
global : 25×25 sobre 170°×360°  →  uma leitura a cada 1.598 km
local  : 25×25 sobre ~0,4°      →  uma leitura a cada 1,8 km
                                   razão: 900×
```

Tudo entre os pontos globais é **interpolação bilinear** — invenção suave entre
amostras separadas por 1.600 km. É por isso que de perto o campo coincide com o
radar de chuva (a estrutura real está resolvida) e de longe parece liso demais.

**Decision**:

1. **O amortecedor global sai.** Velocidade é velocidade, em qualquer zoom.

2. **A resolução global fica como está, e a limitação fica ESCRITA.** Subir a
   grade multiplica o tempo da busca — e "demora para carregar" foi queixa do
   mesmo dono, no mesmo dia. Trocar uma queixa por outra sem ele decidir seria
   escolher por ele. **Registrado como MAP-T10, com os números na mão.**

3. **O controle não espera o dado.** Ele exigia `readings.length` e sumia
   durante a busca da grade global — exatamente quando a pessoa está olhando e
   querendo mexer.

4. **Três estados nos valores**, como pedido: `OFF → FRACO → ON`. Transparente é
   útil de verdade: deixa ler o número sem tapar o padrão embaixo, que era a
   queixa original de D-205.

**Não autorizado por D-206**: subir a resolução global sem decisão sobre o custo
de latência, reintroduzir amortecimento por zoom.

---

## D-205 — O mapa não pode perder o primeiro gesto para uma zona invisível

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: WV2 map touch follow-up
**Pedido do dono**: *"houve uma piora significante em sensibilidade ao toque na
tela. no mapa do world eu preciso tocar varias vezes para conseguir arrastar e
mover."*

**Context**: D-193 escondeu o sheet quando a pessoa mexe no mapa e deixou uma
zona inferior para trazê-lo de volta. A intenção estava certa, mas a zona
invisível era grande demais: `height: min(148px, 24dvh)` atravessava a parte
baixa do mapa. Em telefone, arrastar perto do rodapé podia cair no botão
transparente de reveal, não no canvas do MapLibre.

**Decision**: a área que reabre o sheet escondido vira uma alça pequena,
centralizada e limitada ao fundo. Todo o resto da área baixa volta a pertencer
ao mapa. Em desktop, hover ainda revela; em mobile, o toque precisa mirar a
alça, não uma faixa invisível de 148px.

**Consequence**: o primeiro gesto de pan volta a chegar no mapa. Reabrir o sheet
continua possível, mas deixa de competir com a operação principal da tela:
mover o mundo.

---

## D-205 — O número tapa o padrão; e ligar o vento afasta o mapa

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: MAP-T08
**Achados do dono**: *"esse monte de bolinhas amarelas com a velocidade está
extremamente poluído"* e *"talvez o zoom devesse ser amplo enquadrando os
continentes ao clicar em vento"*.

**Decision**:

1. **As bolinhas de velocidade nascem DESLIGADAS.** No zoom continental são
   **625 rótulos sobrepostos**, e eles escondem exatamente o que o campo de
   partículas veio mostrar: o **padrão**. Número em cima de número não informa —
   ele tapa. O campo mostra a forma; o valor exato passa a ser sob demanda.

2. **Liga/desliga, não régua.** O controle era um slider de opacidade, o que
   pedia à pessoa que escolhesse *quão transparentes* os números deveriam ser —
   uma pergunta que ninguém tem resposta. A pergunta real é binária: **quero ver
   os valores ou não**.

3. **Ligar o vento afasta para escala continental** (zoom 3.4, câmera deitada).
   O dono propôs isso como estética e ele está certo por dois motivos que se
   somam:
   - no zoom de rua o campo cabe em 3,5 km e **não conta padrão nenhum**;
   - a grade global — a que demora — só é pedida **abaixo de zoom 4.5**.

   Um gesto resolve a poluição visual e a latência de uma vez. É a parte útil da
   antiga base de vento (D-144) recuperada **sem** trazer de volta o que ela
   tinha de errado: ela também apagava o satélite e trocava o estilo.

4. **Só ao LIGAR.** Desligar não mexe na câmera: quem desliga quer voltar a
   olhar o que estava olhando.

**Consequence**: `test:weather` 18/18 (era 16). As checagens novas medem que os
valores **nascem desligados** e que o liga/desliga os traz de volta — e a antiga
deixou de exigir uma quarta régua que não existe mais.

**Não autorizado por D-205**: remover os valores de vez, voltar a base de vento,
afastar a câmera ao desligar.

---

## D-204 — Leitura ajustável não pode depender de toque repetido

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: SIM-T08 follow-up
**Pedido do dono**: *"todos esses controles que existem no app, habilite para
poder incrementar os numeros usando slide tb"*

**Context**: o painel de Instrumentos do simulador tinha leituras numéricas com
`-` e `+`: temperatura, vento, rajada, chuva, umidade, UV, visibilidade e AQI.
Isso funciona para ajuste fino, mas é ruim para varrer cenário. Levar vento de
45 para 220 km/h exige dezenas de toques exatamente no painel que deveria
parecer cockpit.

**Decision**: toda leitura simulada com stepper também tem slider. O stepper
fica para ajuste discreto; o slider é o gesto principal para mudar grandezas
rapidamente em qualquer device. Os dois escrevem no mesmo valor e respeitam o
mesmo `min`, `max` e `step`.

**Consequence**: configurar o ambiente deixa de ser uma sequência de taps e
vira um controle contínuo. O usuário consegue montar "categoria 3 piorando" ou
"visibilidade caindo" com um gesto, sem perder a precisão dos botões.

---

## D-204 — O piso das partículas empatava o vento

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: MAP-T07
**Achado do dono**: *"há uma demora significativa em ele aparecer no mapa todo.
Os elementos estão todos na mesma velocidade — onde é mais forte deveria ser
mais rápido."*

**Context — por que tudo andava igual**:

O passo era calculado em **graus**, com escala fixa (`speedScale 0.00024`).
Movimento em pixels, portanto, colapsava ao afastar o mapa:

```
10 m/s no zoom 4  →  0,016 px por quadro
```

Aí o piso assumia: `min(minStepPx = 1.45, 0.22 + mph × 0.055)`. Ele **satura em
1,45 para qualquer vento acima de ~22 mph** — então toda partícula rápida
passava a andar exatamente igual. O campo virava ruído uniforme, que é o oposto
do que ele existe para mostrar.

**Decision**:

1. **O passo é normalizado pela projeção real**: `625 / pixelsPorGrau`. O
   deslocamento em pixels volta a ser proporcional à velocidade **em qualquer
   zoom** — 3 m/s anda 0,45 px, 25 m/s anda 3,75 px, e a razão de 8× sobrevive.

2. **O piso volta a ser resgate, não nivelador**: `min(0.3, …)`. Ele existe para
   partícula parada, e nunca mais para empatar as rápidas.

3. **Cruzar o limiar global não espera o arrasto.** O debounce de 350 ms existe
   para não pedir grade a cada quadro de um arrasto; passar de local para global
   é outra pergunta, e a grade na mão não cobre nada do que apareceu na tela.
   Antes de D-199 isso não doía porque a base de vento saltava a câmera junto.

**Consequence**:

- **A primeira versão da correção de latência estava errada, e o teste pegou.**
  Disparar no primeiro evento de `zoom` lia os limites **no meio do gesto**, e a
  grade vinha LOCAL mesmo com o zoom já global (`wrapsWorld: false`). Ganhei
  latência e perdi a resposta certa. 60 ms de espera resolvem, e ainda são ~6x
  mais rápidos que o arrasto comum.
- `test:weather` **16/16** — incluindo o enquadramento da tempestade, que estava
  vermelho desde antes de D-199 (`MAP-T06` pode ser fechada).

**Não autorizado por D-204**: mexer nos sliders de densidade, mudar o limiar de
4.5, voltar a calcular passo em graus fixos.

---

## D-203 — O mapa desistia em silêncio, e o cone conta a outra metade

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: SIM-T12d
**Achado do dono**: *"escolhi no mapa, mas ao iniciar a simulação nada
aconteceu. Preciso que ele tenha o cone também."*

**Context — o defeito**: `renderStaged` começava com

```ts
if (!map || !map.isStyleLoaded()) return
```

`isStyleLoaded()` responde `false` por um tempo **depois** do evento `load`, e o
código simplesmente **desistia**. Como nada re-disparava, o treino iniciava e o
mapa ficava limpo.

É a mesma forma de todos os defeitos caros desta sessão: **um retorno
antecipado silencioso**. Sem erro, sem log, sem tela vermelha — só ausência.
D-185 (o guarda do estoque), D-193 (a lista vazia por coluna inexistente),
D-199 (o `filter` que não protegia) e este são o mesmo animal.

**Decision**:

1. **Esperar em vez de desistir.** `map.once('idle', …)` e tenta de novo. Um
   guarda que sai calado é indistinguível de um bug.

2. **O cone entra como camada própria**, e o desenho conta **duas coisas
   diferentes**:
   - **cone** = para onde o CENTRO vai;
   - **pegada** = quanto ele cobre.

   Essa distinção é a razão de o cone do NOAA matar gente todo ano: quem mora
   "fora do cone" conclui que está a salvo, e **o campo de vento é muito maior
   que o cone**. Desenhar um sem o outro ensinaria exatamente o erro que o
   treino existe para desfazer.

3. **Ele ALARGA ao longo da rota** — é o que define um cone. Largura constante
   seria um corredor, e diria que se sabe o mesmo sobre daqui a 1h e daqui a 3
   dias. A ponta é arredondada: um corte reto pareceria que a tempestade para
   ali.

4. **O enquadramento passa a incluir o cone**, senão a metade que conta o rumo
   ficaria fora da tela — o defeito de D-202 outra vez, num pedaço novo.

**Consequence**: 35 testes (era 30). O que mais importa não mede desenho: mede
que o cone é **mais estreito que a pegada** perto da origem, que é a afirmação
de segurança que o desenho inteiro existe para fazer.

**Não autorizado por D-203**: usar o cone como área de impacto, ou desenhá-lo
sem a pegada junto.

---

## D-202 — Encenar sem enquadrar é entrega nenhuma

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: SIM-T12c
**Achado do dono**: *"onde está o furacão que eu criei, e como eu posiciono ele
onde eu quero?"*

**Context**: D-201 desenhou o evento e eu declarei a tarefa entregue. Ela não
estava.

Um furacão a 12h de distância nasce a **264 km** da casa (12h × 22 km/h). O mapa
vive em zoom 13.1, que mostra **3,5 km** de largura. O evento estava desenhado,
correto, e **76 telas fora do campo de visão** — o equivalente prático a não
existir.

Contei em vez de supor: `12 * 22 = 264 km` contra `360 / 2^13.1 × (390/512) ×
111 = 3,5 km`.

**Decision**:

1. **Iniciar o treino ENQUADRA o evento.** A caixa inclui a casa **e** a pegada
   — o treino é sobre a distância entre os dois, e mostrar só a tempestade
   perderia a metade que importa. A câmera deita pelo mesmo motivo de D-199:
   alcance se lê de cima.

2. **A posição pode ser apontada no mapa.** `eventLat`/`eventLng` na config,
   pelo `MapPointPicker` que já existia. Quando há posição, **ela manda**: rumo
   e tempo deixam de decidir onde ele está e passam a ser **medidos** a partir
   dali.

3. **O ETA também vira medido.** Repetir o `arrivalHours` do formulário faria a
   tela dizer *"12h"* para uma tempestade que a pessoa acabou de colocar a 5 km.

4. **Rumo e posição se excluem.** Escolher um limpa o outro: os dois respondem à
   mesma pergunta, e deixar ambos acesos faria a tela mentir sobre qual vale.

**Consequence**:

- **A lição é sobre o que conta como pronto.** O código estava correto, testado
  e completo — e a funcionalidade não existia para quem usa. "Desenhei o
  polígono" não é "a pessoa vê o furacão", do mesmo jeito que "o servidor abre a
  conversa" não era "dá para mandar mensagem" (D-193). Terceira vez nesta
  sessão que construí o mecanismo inteiro e nenhuma tela o alcançava.
- 30 testes (era 24). Os novos medem que a posição escolhida **vence** o rumo,
  e que a distância e o ETA passam a ser medidos.

**Não autorizado por D-202**: mover o evento durante o treino em andamento,
arrastar o polígono, posição fora do círculo de alcance do mapa.

---

## D-201 — Ajuste de vento mora perto do botão, não no meio do mapa

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: WV2-T31
**Pedido do dono**: *"observe como esta poluido e sem jeito de mexer nos
controles. onde eu clico no mapa aparece essas informações. Esse controle de
wind speed e etc eu preciso ser capaz de expandir e contrair ao clicar."*

**Context**: D-199 tirou o botão `Vento` do meio do mapa e levou para a coluna,
mas deixou a régua/sliders de vento sempre abertos no centro/rodapé. Além disso,
clicar no mapa criava um popup `WIND` com velocidade/rajada/direção naquele
ponto, competindo com a própria régua e com a sheet inferior.

**Decision**: o mapa não abre mais popup de vento por clique. A régua/sliders
viram um controle colapsável perto do botão `Vento`: fechado mostra só um toggle
compacto; aberto mostra `WIND SPEED`, escala, timeline e sliders. Se o controle
estiver fechado e o usuário mover/zoomar o mapa, o toggle desaparece.

**Consequence**: a leitura do mapa volta a ser o objeto principal. Ajustes de
vento ficam no mesmo canto operacional do botão que liga a camada, e não como
painéis soltos sobre família, mapa e sheet.

---

## D-201 — O furacão de mentira aparece, e não dá para confundir

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: SIM-T12 (fase 2 de 2)

**Context**: D-200 construiu o núcleo puro e deixou explícito que nada desenhava
ainda. Esta fase liga as duas pontas: o painel do Simulador e o mapa.

**Decision**:

1. **`stagedEvents` chega ao mapa por prop PRÓPRIA**, nunca misturado em
   `cyclones` ou nos hazards. É a fronteira de D-200 chegando ao pixel: o mapa
   **nunca precisa perguntar** se um evento é real — recebe duas listas
   separadas e desenha cada uma do seu jeito.

2. **`simulation.active &&` é a fronteira inteira.** Fora do treino a lista é
   vazia, e o efeito de redesenho manda a coleção vazia para o mapa. O furacão
   some **sem ninguém lembrar de apagá-lo**.

3. **Tracejado e roxo não são gosto.** Todo evento real deste mapa usa linha
   cheia e a paleta de risco — âmbar, laranja, vermelho. O encenado usa traço
   interrompido e uma cor (`#a78bfa`) que **não pertence a nenhuma severidade**,
   para que a diferença sobreviva a uma olhada de dois segundos numa tela
   pequena. A faixa global do treino já grita (doc 19 §5.2); isto é a segunda
   camada da mesma promessa, no lugar onde a decisão é tomada.

4. **Dar nome não é enfeite.** Uma família não conversa sobre "o cenário de
   furacão categoria 3" — ela conversa sobre a **Isadora**. O nome é o que faz
   o treino virar assunto, e o que faz a lembrança durar depois que ele acaba.

5. **Rumo em oito chips, não em graus.** Sob estresse ninguém digita "137°", e a
   diferença entre 135 e 137 não muda decisão nenhuma.

6. **Nome e rumo só aparecem para ameaça COM geografia.** Pedi-los para um
   apagão seria coletar dado que não vai a lugar nenhum — e sugerir que existe
   um "ponto do apagão", que é exatamente o que D-200 recusou. Quando não há,
   a tela **diz por quê** em vez de esconder os campos em silêncio.

**Consequence**: o Simulador passa a poder ensaiar o que D-168 só conseguia com
alerta real na região. A faixa de reavaliação continua exigindo evento real —
ligá-la ao encenado é decisão própria, e não foi tomada aqui.

**Não autorizado por D-201**: fazer o evento encenado disparar push real,
alimentar a faixa de reavaliação ou entrar no `error_log`/snapshot.

---

## D-200 — Surge usa o Peak Storm Surge Forecast do NHC/CPHC

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: WV2-T30
**Pedido do dono**: *"eu pedi para instalar a camada Surge, mas parece que ela
nao esta funcionando como um layer."*

**Context**: `Surge` existia na UI, mas era só uma separação de polígonos de
alerta vindos de `/api/hazards` quando o texto continha `storm surge`. Durante
Hurricane Lala, o NHC/CPHC publicou o mapa oficial **Peak Storm Surge Forecast**
para o Havaí, com KML próprio (`CP012026_PeakStormSurge_*adv.kml`), e o EOS não
desenhava nada.

**Decision**: a camada `Surge` passa a consumir o produto oficial **Peak Storm
Surge Forecast** do NHC/CPHC quando houver ciclone ativo. O servidor baixa o KML
mais recente por tempestade ativa, converte polígonos para GeoJSON e entrega uma
FeatureCollection própria para o mapa. O botão `Surge` controla essa camada real
e mantém a separação antiga de alertas apenas como fallback.

**Consequence**: quando a NOAA publicar áreas de pico de maré de tempestade,
como `Hawaii...1-3 ft`, o mapa EOS deve mostrar o contorno/preenchimento oficial
em vez de depender de um alerta genérico conter a palavra certa.

---

## D-197 — Camadas rola dentro do próprio painel

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: WV2-T29
**Pedido do dono**: *"preciso ser capaz de scroll para cima em para baixo em
qualquer device."*

**Context**: depois de deixar os controles sempre expandidos, o painel de
Camadas continuou absoluto sobre o mapa. Em telas menores, a lista de bases,
camadas, notas e ciclones ultrapassava a área visível e ficava presa atrás da
sheet inferior, sem rolagem própria.

**Decision**: `Camadas` passa a ter altura máxima por viewport e `overflow-y:
auto`, com rolagem touch nativa e `overscroll-behavior: contain`.

**Consequence**: o usuário consegue percorrer o painel para cima e para baixo em
telefone, tablet e desktop sem mover a página nem perder o contexto do mapa.

---

## D-200 — O evento falso não entra no verdadeiro; ele fica ao lado

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: SIM-T12 (fase 1 de 2)
**Ideia do dono**, 2026-08-13, retomada hoje: *"quero ser capaz de colocar
ícones de furacão, dar nome a ele, terremoto, Fallout, Wildfire..."*

**Context**: O Simulador derruba **fontes** (`isSourceDown`) mas não **fabrica
evento**. A faixa de reavaliação de D-168 só aparece com alerta real na região,
então o treino não consegue ensaiar a coisa que mais importa: *o que a família
faz quando algo está vindo*.

**A pergunta que travava a tarefa desde 13/08**: como o evento falso entra sem
contaminar o snapshot verdadeiro?

**Decision**:

1. **Ele não entra.** `lib/staged-events.ts` produz um fluxo **separado**, que
   existe só enquanto a simulação está ativa e que o mapa compõe por cima. Nada
   é escrito no snapshot, no cache de hazards ou no banco.

   Isso não é economia de esforço. Se o falso fosse injetado no real, encerrar
   o treino viraria uma operação de **desfazer** — e toda operação de desfazer
   falha algum dia. Aqui encerrar apaga o evento **por construção**: sem
   simulação a lista vem vazia, e não há nada para reverter.

2. **`simulated: true` é do TIPO, não do valor.** O campo é o literal `true`,
   não `boolean`: um evento real não consegue satisfazer `StagedEvent` sem se
   declarar simulado, e o compilador recusa. É `unknown ≠ safe` levado ao
   sistema de tipos — o perigoso não pode ser o silêncio.

3. **Determinístico. Zero `Math.random()`.** O mesmo cenário produz o mesmo
   furacão, na mesma rota, com o mesmo nome. *"Vamos fazer de novo, agora sem
   errar"* é metade do valor de treinar, e um evento que muda a cada execução
   torna isso impossível.

4. **Sem casa, não há encenação** — devolve vazio em vez de inventar posição.
   Um treino que mente sobre ONDE a coisa está ensina a rota errada.

5. **Nem toda ameaça vira objeto no mapa.** Furacão, terremoto, incêndio e
   fallout têm posição e rumo. Enchente, inverno, apagão e geral não: apagão não
   tem geografia, e desenhar um círculo para ele ensinaria que existe um "ponto
   do apagão".

6. **`fallout` entra no vocabulário do Simulador.** Ele já existia no checklist
   (`checklist.fallout`) desde o começo. Um cenário que o checklist sabe
   preparar e o simulador não sabe encenar é meia ferramenta.

7. **Os raios são de TREINO, e está escrito no código.** Eles ordenam a
   severidade de forma plausível e nada mais. Categoria 5 desenha maior que 1
   porque a pessoa precisa **sentir** a diferença — não porque isto preveja
   coisa alguma.

**Consequence**:

- A geometria é grande-círculo de verdade (destino e haversine), não "graus por
  km": a aproximação já distorce leste-oeste na Flórida, e um cone torto ensina
  a coisa errada sobre de onde a tempestade vem.
- 24 testes. Os que importam não são de desenho: são a **fronteira** (encenado
  nunca passa por real, e vice-versa) e a **repetibilidade**.
- **Fase 2 pendente**: ligar ao mapa e ao painel do Simulador (campo de nome,
  rumo, e o desenho com tratamento visual próprio).

**Não autorizado por D-200**: escrever evento encenado em `hazard_events`, no
snapshot de risco ou em qualquer cache; usar o evento falso para disparar push
real; encenar sem simulação ativa.

---

## D-199 — Vento é fenômeno sobre o mundo, não uma forma de desenhar o mundo

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: MAP-T05
**Pedido do dono**: *"o mapa tb pode ser em Satélite, ou preto... não precisa
ficar somente em preto como é agora. E o botão Vento deve subir perto do ✕, logo
abaixo de Camadas."*

**Context**: D-144 fez do Vento uma **BASE de mapa**, exclusiva com Escuro e
Satélite. A consequência era literal: `getMapConfig('wind')` devolve o
`CARTO_DARK`. **Ligar o vento apagava o satélite.** Quem quisesse ver a rajada
sobre a imagem real da própria rua não tinha como.

E a base fazia mais do que trocar o estilo — ela mudava a câmera para
`[0, 18]`, zoom `1.55`, `pitch 0`, `bearing 0`. Ligar o vento **teleportava a
pessoa para o meio do Atlântico**.

**Decision**:

1. **`'wind'` sai do tipo `MapBaseMode`.** Não é depreciado: é removido, para
   não voltar por distração. A base tem duas opções, Escuro e Satélite, e o
   vento compõe sobre qualquer uma.

2. **Quem tinha `'wind'` salvo volta para Escuro COM o vento ligado** — que é
   exatamente o que aquela base fazia. Ninguém perde o vento na virada.

3. **O botão sobe para a coluna de controles**, logo abaixo de Camadas. Ele
   morava numa pílula flutuante no meio do mapa, longe do resto e num lugar que
   o dedo só encontra por acidente.

4. **A pílula "Vento" da legenda morre.** Ela era o liga/desliga; mantê-la seria
   ter duas coisas escritas "Vento" fazendo coisas diferentes. A legenda passa a
   ser uma coisa só: a régua de velocidade, visível enquanto o vento estiver
   ligado.

5. **Enquadrar tempestade deita a câmera de propósito.** O mapa vive inclinado
   56° e girado -18°; num cone de furacão isso mente — a inclinação estica o
   horizonte e a rotação faz o "para onde ele vai" apontar torto. Isso
   **funcionava por acidente** até aqui: a base de vento zerava os dois, e quem
   olhava tempestade normalmente estava com ela ligada.

   E o `pitch` tem que ser zerado **antes** do `fitBounds`, não dentro dele: o
   `fitBounds` calcula o zoom para a câmera atual e só depois aplica a nova.

**Consequence**:

- **Uma checagem do `test:weather` já estava vermelha antes desta mudança**, e
  eu confirmei guardando o trabalho e rodando o código anterior: números
  idênticos (`zoom 4.4`, cone `22.0°×6.8°`, vista `14.0°×28.8°`). O
  enquadramento do cone não cabe, e o defeito é anterior. **Fica registrado como
  pendência própria** em vez de virar suspeita permanente sobre esta mudança.
- Ligar camada **não fecha mais** a folha de camadas — quem liga chuva costuma
  querer ligar vento em seguida. Trocar de BASE continua fechando, porque ali a
  escolha termina.

**Não autorizado por D-199**: reintroduzir base de vento, mexer nos sliders de
partículas, mudar o comportamento de zoom global do campo.

---

## D-198 — O padrão é inglês, e o aparelho tem voz

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: I18N-T01
**Decisão do dono**: *"todo o app tem que ser majoritariamente em inglês.
Português só quando for preciso traduzir."*

**Context**: `LanguageProvider` nascia em `'pt'` e o documento declarava
`lang="pt-BR"`. O pedido do dono era sobre `AlertsPage` ficar em inglês, mas a
frase que ele usou é sobre o app inteiro — e o padrão contradizia.

**Por que inglês é o padrão certo aqui**: o EOS opera nos Estados Unidos e lê
NWS, USGS, NHC e FEMA. **O alerta que chega no telefone chega em inglês.** Um
app que abre em português para um alerta em inglês obriga a pessoa a traduzir no
pior momento possível.

**Decision**:

1. **`'en'` é o padrão** e `<html lang="en">` é o documento.
2. **A preferência salva vence sempre**, e é a primeira coisa que o provedor lê.
   Ninguém que já escolheu é afetado.
3. **Sem escolha salva, o idioma do APARELHO decide** entre os dois que existem:
   telefone em `pt-*` abre em português, qualquer outro em inglês. Isto não
   contradiz o padrão — padrão é o que vale quando **não há informação**, e o
   aparelho é informação.
4. **`AlertsPage` fica em inglês**, encerrando a dívida registrada em D-182. Ela
   deixa de ser dívida e passa a ser a norma.

**Consequence**: português continua inteiro e a um toque, em Mais. Ele deixa de
ser a suposição e passa a ser a escolha.

**Não autorizado por D-198**: remover o português, traduzir automaticamente
conteúdo de fonte oficial (o texto do NWS é citação, não interface).

---

## D-197 — O realtime assina a conversa, e a lista para de mentir

**Date**: 2026-08-16
**Status**: DECIDED
**Roadmap**: COMMS-T16
**Pedido do dono**: item 2 da fila — *"repare"*

**Context**: Duas falhas na mesma máquina.

1. **O filtro do thread era `circle_id=eq.…`**, escrito quando havia uma
   conversa por círculo. Com conversa direta ele acordava a tela para mensagens
   de OUTRO thread do mesmo círculo — e, numa conversa direta, o `circleId` do
   estado é o primeiro círculo da lista, que pode nem ser o da conversa.
   Funcionava por coincidência: o recarregamento usa `conversationId` e traz o
   thread certo de qualquer jeito.

2. **A lista não tinha realtime nenhum.** Chegava mensagem e a prévia só mudava
   se a pessoa recarregasse. Numa emergência, uma lista que mente sobre o que é
   recente é pior que uma lista sem prévia.

**Decision**:

1. **O thread assina `conversation_id`** quando há um, e cai para `circle_id`
   apenas no caminho legado.
2. **A lista assina sem filtro, de propósito.** Depois de D-196 a RLS já entrega
   só as mensagens de conversas de que a pessoa participa; filtrar por círculo
   deixaria de fora justamente as diretas. **A autorização mora no banco, não no
   `filter`** — e foi confiar no filtro como se fosse permissão que produziu o
   vazamento de D-196.

**Consequence**: foi ao ligar este realtime que o furo de D-196 apareceu. Ligar
uma tabela ao cliente é o momento em que a RLS deixa de ser teoria.

---

## D-196 — Controles do mapa ficam sempre expandidos

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: WV2-T28
**Pedido do dono**: *"preciso que vc deixe constantemente expandido."*

**Context**: D-131 recolheu a coluna lateral do mapa para reduzir ruído visual:
`Você` ficava visível e `Atualizar`/`Camadas` entravam atrás de `...`. Na prática
isso cobrou um gesto para ações comuns e deixou a tela alternando entre dois
formatos.

**Decision**: a coluna lateral do World V2 fica sempre expandida. `Você`,
`Atualizar` e `Camadas` aparecem em repouso; no desktop, o controle do painel
também segue visível. O botão `.../x` deixa de existir.

**Consequence**: menos um estado local na superfície do mapa e menos um gesto
antes de ações frequentes. O painel de camadas continua abrindo e fechando pelo
próprio botão `Camadas`.

---

## D-196 — A API dizia 403 e o banco dizia sim

**Date**: 2026-08-16
**Status**: DECIDED — **migração pendente de aplicação**
**Roadmap**: COMMS-T15
**Achado**: ao ligar o Realtime na lista de conversas

**Context**: D-188 criou a conversa direta e a API a protege. `requireParticipant`
responde **403** para quem não participa, e há teste provando.

**O Realtime não passa pela API.** O cliente Supabase assina `circle_messages`
direto, e quem decide o que ele recebe é a política RLS de SELECT criada em
COMMS-T05:

```sql
USING (deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM circle_members cm
   WHERE cm.circle_id = circle_messages.circle_id
     AND cm.user_id = auth.uid()))
```

Ela é **por círculo** — correta enquanto existia uma conversa por círculo. Uma
mensagem direta guarda o `circle_id` do círculo compartilhado. Com esta
política, **qualquer membro do círculo lia a conversa direta de duas outras
pessoas**, em tempo real, direto do cliente.

Medido, não deduzido: um terceiro membro recebeu `status 200` e as três
mensagens, incluindo *"vou buscar a Isadora"*.

**A API dizia não. O banco dizia sim. Quando os dois discordam, vale o banco.**

**Decision**:

1. **A política passa a ser por CONVERSA**, via
   `is_conversation_member(uuid)` — função `SECURITY DEFINER` com
   `search_path` fixo.

2. **Função, e não subconsulta direta.** `conversation_members` nega tudo por
   RLS; uma política que a consultasse nunca acharia linha. Criar política de
   leitura ali reintroduziria a recursão com `circle_members` que D-087 evitou.

3. **`conversation_id IS NOT NULL` é exigido**, não tolerado. O backfill de
   D-188 terminou com zero órfãs e falhava alto se sobrasse alguma. Aceitar
   `NULL` deixaria a porta aberta para a próxima linha que esquecesse de
   preencher.

**Consequence**:

- **O teste passou pelo motivo errado na primeira versão.** Ele lia o token do
  `localStorage`, pegava a chave errada, mandava `Bearer` vazio e recebia
  **401** — e passava. Um 401 mede **autenticação ausente**, não **autorização
  negada**, e confundir os dois é o erro exato que esta checagem existe para não
  cometer. Agora o token vem do endpoint de senha.
- **A checagem tem duas metades.** Sem provar que o participante **enxerga**, a
  outra passaria com a tabela invisível para todo mundo.
- A lição estrutural: **proteger na API não protege no Realtime.** Toda tabela
  publicada para o cliente precisa que a RLS diga a mesma coisa que a rota.

**Não autorizado por D-196**: dar política de leitura a `conversation_members`,
voltar a política por círculo.

---

## D-194 — A barra volta ao neutro; o ouro ganha um trabalho

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: COMMS-T14
**Correção do dono**: *"foi alterado as cores para amarelo no bottom nav mas eu
me equivoquei. Volta a cor antiga. A fonte que era pra mudar para amarelo é no
chat círculo. Amarelo é uma sugestão não regra."*

**Context**: D-192 pintou os itens comuns da BottomNav de amarelo do Treino
(`#ffd60a`). O dono corrigiu: o alvo era o chat, não a barra.

E ao olhar a tela do chat apareceu um defeito separado: os nomes das conversas
saíam **azuis e roxos**.

**Causa do azul/roxo**: o `<Link>` da linha não definia `color`, então herdava o
padrão do navegador — azul para não visitado, **roxo para visitado**. A lista
parecia ter três estados que ninguém programou, e "visitado" muda sozinho com o
histórico: o mesmo app ficava diferente em cada aparelho.

**Decision**:

1. **A BottomNav volta ao neutro.** Num app de emergência a cor **carrega
   significado**: âmbar é o `--warn` do EOS, o degrau entre estável e crítico.
   Navegação inteira em âmbar diz "atenção" o tempo todo — e aviso permanente
   deixa de ser aviso. O ativo se marca por **fundo e peso**, como os chips de
   domínio já fazem (D-131).

2. **Todo nome recebe `color` explícito.** Cor de link do navegador nunca é uma
   escolha de design; é a ausência de uma.

3. **O ouro tem UM trabalho: a conversa do círculo.** É a única de grupo, o
   canal da casa, e numa emergência é a primeira que se procura. Ela se separa
   das diretas sem depender de ler o nome.

4. **É `#f4c75b`, o ouro que JÁ existe no chat** — o mesmo da bolha da própria
   mensagem. Reusar fecha a paleta em vez de abrir cor nova. E **não** é o âmbar
   `--warn`: aquele tom já significa "cuidado", e emprestá-lo para decoração
   gastaria o único sinal que o app tem para dizer que algo piorou.

5. **Não lida engrossa, não muda de matiz.** Peso e fundo, nunca só cor — quem
   não distingue os dois tons continua vendo qual linha está em negrito.

**Consequence**:

- O teste passou a ler a **cor computada** dos nomes e recusar o azul/roxo
  padrão. Um teste de existência não pegaria isto: os nomes estavam lá, legíveis
  e clicáveis — só na cor errada.
- Sobre a sugestão do dono: o amarelo entrou, mas **não onde ele apontou**. Ele
  pediu nos nomes; recebeu na conversa do grupo. A diferença é que ali ele
  **informa** em vez de decorar, e não disputa com o vocabulário de risco.

**Não autorizado por D-194**: usar `--warn` como cor decorativa, pintar a
BottomNav de novo, marcar estado só por matiz.

---

## D-193 — A mensagem predefinida é uma mensagem

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: COMMS-T13
**Perguntas do dono**: *"como faço para mandar uma mensagem privada para a
Daniela?"* e *"se eu clicar no avatar dela no mapa, as msgs preconfiguradas
devem direcionar para onde?"*

> **Nota de numeração**: esta decisão nasceu como D-189 e foi renumerada. A
> frente paralela da BottomNav ocupou D-189 a D-192 no mesmo dia. Duas decisões
> com o mesmo número é exatamente a ambiguidade que este arquivo existe para
> impedir, então as referências no código foram corrigidas junto.

**Context**: D-188 construiu a conversa individual inteira no servidor — e
**nenhuma tela a chamava**. A funcionalidade existia, testada, e era
inalcançável. A primeira pergunta não tinha resposta.

A segunda pergunta expôs algo maior. Os presets do ping (D-073) eram um canal
**paralelo**: chegavam como notificação e **acabavam ali**. Não havia onde
responder. "Onde você está?" sem caixa de resposta é meia pergunta — a
informação que importa é a volta.

**Decision**:

1. **O preset vira mensagem na conversa direta.** `/api/family/ping` deixa de
   ser um canal e passa a ser o que sempre foi: um **atalho para escrever**. O
   texto entra no thread, onde tem endereço, histórico e resposta.

2. **Pela mesma chave simétrica.** Mandar um ping, abrir pela lista e abrir pela
   folha do mapa caem no **mesmo** thread. Se fossem caminhos diferentes, cada
   um criaria o seu — e as duas pessoas conversariam sozinhas.

3. **O badge do ping muda de Família para Comms, revendo D-186.** Aquela decisão
   dizia *"é sobre gente, não sobre conversa"*, e era verdade **enquanto não
   havia conversa**. Agora há, e o badge tem que apontar para onde a **ação**
   acontece: responder. Badge em Família levaria a uma tela onde não dá para
   responder nada.

4. **Duas portas para abrir a conversa**: a folha da pessoa no mapa (onde você
   já está olhando para ela) e "Falar com alguém" na lista (onde você foi
   justamente para procurar). A lista **não repete** quem já tem conversa
   acima — a mesma pessoa em dois lugares faria a de baixo parecer outro destino.

5. **`circleId` some do pedido.** Quem chama tem a PESSOA na mão e não sabe (nem
   deveria) por qual círculo os dois se conhecem. O servidor descobre, e a
   resposta a *"existe círculo em comum?"* **é** a autorização — a regra única
   de D-073. Exigir o círculo do cliente empurraria permissão para a tela.

**Consequence**:

- **Achado no caminho, e da mesma família dos anteriores**: a consulta de
  perfis pedia `avatar_url`, **coluna que não existe em `profiles`**. O
  PostgREST devolvia 400, o `data` vinha nulo, e a API respondia **200 com lista
  vazia** — a seção "Falar com alguém" simplesmente não aparecia, sem erro em
  lugar nenhum. Quarto desta forma nesta semana (D-183, D-185, D-187). O erro
  passou a ser registrado em vez de virar lista vazia.
- `test:conversations` 23/23 contra o banco real; `test:family` 10/10.

**Não autorizado por D-193**: apagar mensagem do lado do outro, anexo, áudio,
chamada, conversa com quem não divide círculo.

---

## D-193 — O mapa ganha prioridade total sobre o sheet do Mundo

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: WV2-T27
**Pedido do dono**: ao clicar no mapa ou movimentá-lo, o menu inferior do Mundo
(`22 Estável · 1 alerta ativo · Abrir`) deve se recolher completamente. Ele só
volta se a pessoa passar o mouse naquela região ou, no mobile, tocar naquela
região.

**Context**: A interação do mapa já recolhia o sheet para `peek`, mas `peek`
ainda deixava a faixa-resumo cobrindo uma área relevante do mapa. Isso era
especialmente visível sobre o BottomNav: o mapa parecia disponível, mas o
resumo continuava em cima.

**Decision**:

1. `DetentSheet` ganha o detent `hidden`, abaixo de `peek`, que desloca a folha
   inteira para fora da área visível.
2. Interação real do usuário no mapa (`drag`, `zoom`, `rotate`, `pitch` e
   `click`) envia o sheet para `hidden`.
3. Quando escondido, uma zona invisível no rodapé reabre para `peek`: por
   `hover` no mouse, por foco de teclado, ou por toque/clique no mobile.
4. Ações programáticas que precisam mostrar contexto continuam usando `peek`
   explicitamente, como "ver alerta no mapa" ou rota até membro da família.

**Consequence**: `npm run type-check`, `git diff --check`, `npm run build` e
`npm run test:nav` passam. Playwright confirmou `peek → hidden → peek` por toque
mobile e `hidden → peek` por hover de mouse.


## D-192 — Treino puxa a navegação para amarelo, e a faixa superior some

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: NAV-T09 follow-up
**Pedido do dono**: as cores da navegação ainda não pareciam EOS; trocar o
roxo/azul por amarelo do Simulador/Treino e remover a faixa de fundo do top nav,
como nos outros top navs.

**Context**: D-191 devolveu escala e largura à BottomNav, mas manteve restos da
paleta antiga: itens comuns usavam o `--mu` arroxeado e ativo comum branco sobre
fundo neutro. Em `/mais/treino`, a faixa de domínio ainda tinha fundo próprio
(`var(--bg)`) e o chip ativo continuava verde, mesmo o contexto sendo Treino.

**Decision**:

1. BottomNav comum passa para amarelo/âmbar do treino (`#ffd60a`), em repouso,
   ativo e borda superior. O MUNDO permanece verde, por D-189.
2. `DomainNav` deixa de pintar uma faixa de fundo; a barra sticky fica
   transparente e deixa o fundo da página aparecer.
3. `MaisNav` usa tom `drill`: chip ativo preenchido em amarelo, inativo com
   amarelo suave. As demais faixas de domínio continuam no tom padrão.

**Consequence**: `npm run type-check`, `git diff --check`, `npm run build` e
`npm run test:nav` passam. Captura Playwright de `/mais/treino` mede top nav
transparente e navegação em amarelo.


## D-191 — A BottomNav expansível volta a ocupar a largura inteira

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: NAV-T09 follow-up
**Pedido do dono**: a BottomNav precisava ficar maior, ocupando o espaço das
margens como era antes; não precisava manter a cápsula arredondada nas pontas.

**Context**: D-189 acertou o comportamento expansível, mas deixou a barra como
uma pílula central de 300px em telas pequenas. Visualmente ela ficou menor que a
barra original e o MUNDO chegou a truncar como `M...` em 320px.

**Decision**:

1. A superfície da BottomNav volta a ser **full-width** no rodapé (`left: 0`,
   `right: 0`, `bottom: 0`), com fundo e borda de ponta a ponta.
2. A linha interna respeita margens laterais de 8px e largura máxima de 720px,
   sem cápsula externa arredondada.
3. Os itens continuam usando o comportamento de D-189: toque comprimido,
   rótulo ativo expansível, ativo derivado da rota e MUNDO verde sempre.
4. O item ativo ganha mais peso flexível para o rótulo caber em 320px.

**Consequence**: `npm run type-check`, `git diff --check`, `npm run build` e
`npm run test:nav` passam. Captura Playwright em 320px mede `nav` com 320px,
`nav-tabs` com 304px e MUNDO ativo com ~107px, texto visível.


## D-190 — O componente shadcn da BottomNav entra como exemplo, não como navegação real

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: NAV-T10
**Pedido do dono**: integrar o componente React `bottom-nav-bar.tsx` em
`/components/ui`, com `lucide-react`, `framer-motion` e helper `cn`.

**Context**: O projeto EOS não é hoje uma instalação shadcn/Tailwind completa:
não há `components.json`, `tailwind.config.*`, `postcss.config.*` nem tokens
Tailwind ativos. A estrutura real usa `components/` e `app/globals.css`.

Mesmo assim, o componente pode existir como exemplo compilável em
`components/ui/`, desde que não substitua `components/BottomNav.tsx`. A barra
real carrega rotas, badges, i18n, propriedades de notificação e a regra do
MUNDO verde de D-189.

**Decision**:

1. Criar `components/ui/bottom-nav-bar.tsx` e
   `components/ui/bottom-nav-bar-demo.tsx` como componente standalone de
   referência.
2. Adicionar `lib/utils.ts` com o helper `cn` padrão (`clsx` +
   `tailwind-merge`).
3. Instalar `lucide-react`; `framer-motion` já existia. `clsx` e
   `tailwind-merge` entram porque o componente importa `cn`.
4. Não conectar esse componente ao app shell enquanto Tailwind/shadcn não forem
   uma decisão formal de design system.

**Consequence**: `npm run type-check`, `git diff --check` e `npm run build`
passam. O componente compila, mas suas classes Tailwind só terão aparência
correta depois de configurar Tailwind/shadcn.


## D-189 — A BottomNav vira pílula expansível sem trocar de mapa mental

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: NAV-T09
**Pedido do dono**: mudar o comportamento da BottomNav usando como referência
um componente React com rótulo ativo expansível, **mantendo os ícones atuais** e
o MUNDO verde como está.

**Context**: Depois de D-180, a barra global ficou correta em arquitetura:
cinco destinos, sempre iguais. O componente visual, porém, ainda carregava a
forma anterior: rótulos sempre visíveis e o MUNDO elevado como orbe fora do
ritmo dos outros destinos.

Copiar literalmente o componente externo criaria dois problemas:

1. trocaria os ícones e nomes genéricos (`Portfolio`, `Transactions` etc.),
   perdendo o mapa mental já decidido para EOS;
2. criaria uma barra isolada em `/components/ui`, sem os badges, i18n,
   deep-links e regras de rota da barra real.

**Decision**:

1. **O comportamento é copiado, não o inventário.** A BottomNav existente ganha
   entrada com spring, toque com `whileTap` e rótulo ativo que expande; os cinco
   destinos, os ícones SVG atuais, `aria-current`, i18n e badges ficam.
2. **Ativo vem da rota, não de `useState`.** Navegar por link direto,
   redirecionamento ou sub-rota continua acendendo o destino correto.
3. **MUNDO permanece verde sempre.** Ele participa da pílula expansível, mas
   mantém tratamento visual próprio (`var(--ac)`) porque é a home operacional do
   produto, não só mais um item ativo.
4. **Sem dependência nova.** `framer-motion` já existe no projeto; `lucide-react`
   não entra porque os ícones atuais foram preservados.

**Consequence**: `npm run type-check`, `npm run build` e `npm run test:nav`
passam. Checagem visual em 320px confirma a pílula dentro do viewport
(`nav-tabs` 300px; item MUNDO ativo 104px).


## D-188 — A conversa vira uma coisa

**Date**: 2026-08-15
**Status**: DECIDED
**Roadmap**: COMMS-T11
**Pedido do dono**: *"melhore o chat do círculo, e quero chat individual também com
pessoas do círculo — conversar individualmente, excluir conversas, ou falar em grupo"*

**Context**: Hoje o thread é **implícito**. `circle_messages` tem `circle_id` e
nada mais: existe exatamente uma conversa por círculo, e ela não tem nome, nem
identidade, nem endereço próprio. A tela usa `?view=chat` em memória — COMMS é
o último domínio sem rota de verdade (`docs/35` §ROUTE HIERARCHY).

Para ter conversa individual havia dois caminhos:

| | Custo | Consequência |
| --- | --- | --- |
| `to_user_id` em `circle_messages` | baratíssimo | grupo e 1:1 viram **dois caminhos de código** para a mesma coisa |
| `conversations` de primeira classe | uma migração | **um** caminho: a conversa do círculo é a conversa cujos membros são o círculo inteiro |

Esta sessão passou inteira fechando defeitos da primeira forma — D-129 e D-179
(duas definições de "casa"), D-181 e D-182 (duas telas de alerta), D-187 (uma
classe em dois contextos). Escolher de novo o caminho barato aqui seria não ter
aprendido nada.

**Decision**:

1. **A conversa é a entidade.** `conversations` + `conversation_members`, e
   `circle_messages.conversation_id` aditivo. A conversa do círculo passa a ser
   um registro real, não uma ausência de registro.

2. **Toda conversa nasce DENTRO de um círculo.** A regra de permissão continua
   sendo **uma só** — *você fala com quem divide círculo com você*, a mesma que
   D-073 estabeleceu para o ping. Conversa individual não é relação nova; é
   recorte de uma que já existe. Não há como falar com estranho, e não há
   convite de conversa.

3. **Chave natural para a direta**: `direct_key` = os dois `user_id` ordenados
   e unidos, único por círculo. Abrir a mesma conversa duas vezes não pode
   criar dois threads — a lição de PREP-T05, aplicada antes de doer.

4. **"Excluir conversa" é ESCONDER PARA MIM, nunca destruir para todos.**
   `conversation_members.hidden_at`. Duas razões:
   - é o que o app de referência faz (apagar conversa é local);
   - num app de emergência o histórico compartilhado é **registro**: quem
     avisou o quê e quando. Apagar do lado do outro destrói a prova de que o
     aviso existiu, e é irreversível.

   Uma mensagem nova reabre a conversa escondida — esconder é arrumar a lista,
   não bloquear alguém.

5. **Lista e thread viram ROTAS.** `/comms` é a lista, `/comms/[id]` é o thread,
   `/comms/radio` e `/comms/linha-do-tempo` saem de `?view=`. COMMS ganha a
   faixa de domínio que os outros quatro já têm — era o último sem.

**Backfill**: uma conversa `kind='circle'` por círculo existente, e toda
mensagem recebe o `conversation_id` dela. Nenhuma mensagem se move, nenhum
thread muda de endereço.

**Não autorizado por D-188**: conversa com quem não divide círculo, apagar
mensagem do lado do outro, anexos, áudio, chamada, entrega garantida, conversa
de grupo com subconjunto arbitrário do círculo (o modelo suporta; o produto
ainda não decidiu se quer).


## D-187 — Uma classe, dois contextos de empilhamento, e a folha sumiu embaixo do próprio scrim

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: FAM-T10
**Achado**: dono do produto — *"por que está tudo embaçado? não consigo mais clicar"*

**Context**: Tocar no rosto de alguém no mapa abre a `MemberSheet` — rota,
distância e os pings. A tela inteira ficava **embaçada** e **nenhum botão
respondia**: o toque parava antes de chegar na folha.

**Causa**:

```
.wv2               position: fixed        → CRIA contexto de empilhamento
├── .wv2-map                    z-index: 0
├── .wv2-sheet / .wv2-panel     z-index: 3
├── .wv2-search / .wv2-pilotbar z-index: 4
├── .wv2-pilot-scrim            z-index: 899   ← reusado pela MemberSheet
└── .wv2-member                 z-index: 7
```

A folha usava `.wv2-pilot-scrim`, e funcionou de 29/07 a 09/08. Nessa data,
`fix(pilot): close chat when tapping outside` subiu aquele scrim para **899**
para ele passar por cima da barra de navegação (100) e do AppActions (200).

**Correto para o Pilot** — ele é montado no `layout`, no contexto de
empilhamento da raiz, onde 899 de fato o coloca acima da barra.

**Errado para esta folha**, que vive dentro de `.wv2`. Como `.wv2` é
`position: fixed`, ele **cria contexto próprio**: ali dentro, 899 nunca é
comparado com a barra — é comparado com a folha, que é 7. O scrim passou a
cobrir exatamente o que existia para destacar, e a virar um `<button>` de tela
cheia engolindo todo toque.

**A armadilha não foi o número.** Foi **uma classe servindo dois pontos de
montagem em contextos diferentes**. Ajustar um deles não tem como avisar o
outro — e o commit que subiu para 899 estava certo sobre o problema que ele
resolvia.

**Decision**:

1. **Cada folha tem o próprio scrim.** `.wv2-member-scrim` em `z-index: 6` —
   acima dos painéis (3) e abaixo da folha (7), na régua do contexto onde ela
   realmente vive. O scrim do Pilot fica intocado em 899, onde está certo.

2. **A régua de `.wv2` fica escrita no CSS**, ao lado da regra: mapa 0 ·
   painéis e folha 3 · busca/PilotBar 4 · orbe 6 · folha da pessoa 7.

3. **`family-page-test` passa a TOCAR o botão.** `page.click()` do Playwright
   recusa clicar em elemento interceptado e diz qual — é o teste exato para
   esta classe de defeito. Um teste de visibilidade passaria: a folha **estava
   visível**, só embaçada e inerte.

4. **Verificado ao contrário**: com o scrim de volta em 899, o teste falha em
   `locator.click: Timeout`.

**Consequence**:

- **Cinco dias no ar.** Não apareceu no `error_log` porque não houve exceção
  nenhuma: CSS não lança. É a segunda classe de defeito desta sessão que
  nenhum log pegaria — a primeira foi `/mais` fora da allow-list (D-183).
- **Nenhum teste tinha jamais tocado nesta folha.** Quarto caso seguido em que
  a cobertura media abertura e leitura, e o defeito morava na interação.
- Reusar classe de outra superfície é barato até o dia em que as duas deixam de
  compartilhar o contexto. `z-index` só é comparável **dentro** do mesmo
  contexto de empilhamento, e `position: fixed` cria um.

**Não autorizado por D-187**: mexer no scrim ou no z-index do Pilot, mudar a
régua de camadas de `.wv2`.


## D-186 — O ping era só push, e push é o canal mais frágil da pilha

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: FAM-T09
**Achado**: dono do produto — tocou "Onde você está?" e leu **"Não entregou"**

**Context**: O ping da família (D-073) mandava uma mensagem predefinida para
uma pessoa do círculo. Ele era **exclusivamente push**:

```
POST /api/family/ping → webpush.sendNotification → fim
```

Se o push não saía, a mensagem **não existia em lugar nenhum** — nem na caixa
de entrada, nem na linha do tempo, nem quando a pessoa abrisse o app. Sumia.

Isso inverte a promessa da tela. "Onde você está?" numa emergência é
justamente a mensagem que não pode depender do canal mais frágil da pilha:
permissão revogada, assinatura expirada, iPhone fora da PWA instalada, chave
VAPID trocada — qualquer um desses apaga a mensagem.

**Diagnóstico do caso concreto**: Daniela **tem** assinatura (Apple, 04/08) e o
`/api/health` autenticado em produção diz `push: ok`. Ou seja, nem `no_device`
nem `push_unconfigured` — era `push_failed`, e **a rota não registrava qual**.
Cinco causas diferentes chegavam à tela como a mesma frase.

**Decision**:

1. **Grava primeiro, empurra depois.** O ping vira `circle_notifications` com
   `kind = 'family_ping'` na superfície **Família**, e só então tenta o push. O
   push passa a ser **reforço** — o que faz o telefone vibrar —, não o meio de
   transporte.

2. **`ok` passa a significar "a mensagem existe".** Um campo novo, `push`, diz
   se ela também vibrou. A tela tem três frases em vez de uma, e **todas as de
   sucesso começam com "Enviado"**.

3. **"Ela ainda não ativou os alertas" era verdade e mentia por omissão.** Quem
   lia entendia que ninguém foi avisado. Virou *"Enviado · sem alertas no
   aparelho dela, verá ao abrir o EOS"* — a informação continua lá, depois do
   fato principal.

4. **Assinatura morta é apagada.** `404`/`410` significam que o navegador
   desfez a assinatura; guardá-la só garante que a próxima tentativa também
   falhe. E o status HTTP de cada falha vai para o `error_log`.

**Consequence**:

- **A pior consequência do defeito não era o diagnóstico difícil — era o
  remetente achar que não avisou ninguém.** Numa emergência isso faz a pessoa
  parar de tentar, ou sair procurando alguém que já tinha respondido.
- `family-page-test` ganhou o caso: o navegador de teste **não tem assinatura de
  push**, então ele roda exatamente no caminho em que a mensagem sumia.
- **Achado de lado**: a checagem nº 5 daquele teste exigia um link para
  `/family-legacy` que **D-122 removeu de propósito há dez dias**. Ela estava
  vermelha esse tempo todo medindo uma promessa revogada. Agora mede o que
  importa — que o cadastro não fique inalcançável.
- Terceiro defeito seguido (D-185, D-183, este) cuja causa raiz é a mesma:
  **a falha não tinha como ser vista**. As três correções incluem tornar a
  falha visível, não só corrigi-la.

**Não autorizado por D-186**: mandar push para quem não pediu, criar canal novo
de entrega (SMS, e-mail), mexer nos presets de D-073.


## D-185 — O estoque não salvava havia um dia, e o erro não tinha como ser visto

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: PREP-T16
**Achado**: dono do produto, com a barra vermelha na tela

**Context**: `/preparedness/o-que-tenho` mostrava **"Erro ao salvar."** a cada
mudança. Nada disso aparecia no `error_log`.

**Causa**: `/api/inventory` exporta **GET e POST**, e o POST já é upsert
(`ON CONFLICT (profile_id) DO UPDATE`). O cliente mandava **PUT**. Sem handler
PUT, o Next devolve **405**.

O método era `POST` até `5d3ca51` — o commit que extraiu os editores de
`PreparednessPage` para `HoldingsPage` (PREP-T07 fase 2 / D-165). **A extração
trocou o verbo.** O estoque parou de gravar em 2026-08-13 e ninguém viu por um
dia.

**Por que nada pegou**:

1. **Nenhum teste jamais ESCREVEU nesta tela.** `test:prep-nav` provava que ela
   abre, que o chip acende e que a Visão não tem editor — tudo sobre navegação.
   Gravar, nunca.
2. **O cliente engolia o erro.** `if (!res.ok) setSaveError(...)` descartava
   `status` e corpo, e não reportava a `/api/client-error`. A única evidência no
   mundo era uma barra vermelha sem número. Um 405 ficava indistinguível de um
   500, de um 422 ou de uma queda de rede.

**Decision**:

1. **O cliente passa a falar POST**, a língua que a rota já fala. Criar um
   handler PUT resolveria o sintoma e deixaria **duas portas para a mesma
   escrita** — a classe de defeito que esta frente inteira veio fechar.

2. **A falha de gravação vira registro.** Status e corpo vão para
   `/api/client-error`, e portanto para o `error_log`. O 405 não foi o defeito
   caro; o silêncio foi.

3. **`test:prep-nav` passa a ESCREVER**: toca o "+" da água, espera o debounce,
   **recarrega** e confere que o número voltou diferente. Recarregar é o ponto —
   sem isso o teste mediria estado em memória, que muda mesmo quando a gravação
   falha.

4. **Verificado ao contrário**: com `PUT` de volta, o teste falha nos dois
   critérios (`0 → 0`). Um teste de regressão que não fica vermelho no defeito
   não é guarda, é decoração.

**Consequence**:

- **Auditei todos os 60 pares (rota, método) do app** contra os handlers
  exportados. `PUT /api/inventory` era o único sem par. Os outros sete
  apontados eram falso positivo do resolvedor com segmento dinâmico, conferidos
  um a um.
- **Quinta vez nesta sessão que um teste passava com o comportamento errado**, e
  a quinta com a mesma forma: o teste mede o caminho de LEITURA, e o defeito
  mora na ESCRITA. As anteriores foram D-179, D-181, D-183 e a régua de água.
- Extração de componente merece a mesma desconfiança que refatoração de lógica.
  Aqui ela mudou um verbo HTTP e nenhum sinal de tipo, lint ou build acusou —
  `fetch` aceita qualquer string como método.

**Não autorizado por D-185**: criar handler PUT em `/api/inventory`, mexer no
contrato da rota, alterar o debounce.


## D-184 — Cenário vira modo: o endereço estava errado, a forma não

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: NAV-T08 (fase 5 de 5 do Modelo C)

**Context**: Último achado estrutural do `docs/35` (**A6**). Cenário ocupava
slot de destino de primeiro nível, e destino é LUGAR. O Simulador não é lugar:
`SimulationProvider` é global e faz o app inteiro se comportar como se a
situação fosse verdade — índice de risco, Pilot, autonomia, mapa. Isso é MODO.

D-180 já tinha tirado o ícone da barra. Faltava o endereço e as portas.

**Decision**:

1. **`/scenario` vira `/mais/treino`.** O endereço para de reivindicar status
   de domínio. Redireciona — convites chegam por `/sim/[token]` e o dashboard
   legado ainda aponta para lá.

2. **MAIS ganha faixa de domínio** (`Mais · Treino`). Ela não existia em D-180
   porque não havia sub-rota, e faixa de um chip só é enfeite.

3. **A Preparação ganha a porta que o documento sempre listou e que nunca
   existiu.** Treinar é preparação: o debrief do treino já grava requisitos com
   procedência `SIMULATION_DEBRIEF` (D-092) — o Simulador **já alimentava** a
   tela de Preparação, e só a navegação não admitia.

**A divergência deliberada**:

`docs/35` propôs que a configuração virasse **overlay**. Não virou. São 568
linhas de briefing com campo de texto livre, interpretação por IA e cinco
painéis de revisão — isso é uma página, e espremer num overlay pioraria o
celular sem tornar nada mais "modo".

**O que faz o Simulador ser modo já existe e é outra coisa**: a faixa global,
deliberadamente barulhenta (doc 19 §5.2), que aparece em qualquer tela e
carrega a saída. *"Um simulador de voo não sussurra que é um simulador."* O
erro nunca foi a forma da cabine — era o endereço dela.

**Consequence**:

- **Modelo C está completo**: as cinco fases entregues em três dias
  (D-177, D-178, D-180, D-182, D-184), mais três correções nascidas delas
  (D-179, D-181, D-183).
- A barra global tem cinco destinos fixos e **quatro dos cinco domínios têm
  faixa própria** — falta só COMMS, que já usava chips com `?view=` antes de
  tudo isso e continua sendo o único lugar com estado de navegação em memória.
- `test:nav` 30/30 (era 24).

**Não autorizado por D-184**: transformar a cabine em overlay, mexer no
`SimulationProvider` ou na faixa de simulação, encenar eventos falsos no mapa
(isso é SIM-T12, ideia do dono, ainda sem decisão sobre como o evento falso
entra sem contaminar o snapshot verdadeiro).


## D-183 — A lista de rotas protegidas é allow-list, e eu esqueci de entrar nela

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: NAV-T06 (correção)
**Achado**: verificação em produção depois de o dono perguntar por logs

**Context**: `/settings` virou `/mais` em D-180. Eu movi a página, o
redirecionamento, os links internos e os testes — e **não** a entrada em
`PROTECTED_ROUTES` do `middleware.ts`.

```
curl -I /settings          → 307 /auth/login?redirectTo=%2Fsettings
curl -I /mais              → 200                       ← sem login
```

`/mais` guarda conta, plano e cobrança, links de admin e a zona de perigo com
a exclusão de conta.

**Por que ninguém viu**: não havia nada para ver. A página é cliente, todo dado
vem de `fetch` com sessão, e a RLS recusa tudo sem ela. Uma pessoa deslogada via
uma tela de configurações **vazia**. O furo não era vazamento — era a pessoa
cair numa tela em vez do login, e a rota deixar de obedecer à regra do app.

**Causa estrutural**: `PROTECTED_ROUTES` é uma **allow-list**. Rota que não está
nela é pública **em silêncio** — não há erro, não há aviso, e o comportamento
errado é indistinguível do certo até alguém medir sem cookie.

**Decision**:

1. **`/mais` entra na lista.**

2. **`bottom-nav-test` passa a medir isso com um contexto SEM sessão.** A página
   logada responde 200 de qualquer jeito; só um contexto anônimo distingue
   "protegida" de "pública". A checagem cobre os cinco destinos da barra mais
   `/dashboard/alertas`.

**Consequence**:

- **Quarta vez nesta sessão que um teste passa com o comportamento errado**, e
  a causa é sempre a mesma forma: o teste roda no caminho **com** dado / **com**
  sessão / **com** alerta, e o defeito mora no caminho sem.
- Uma allow-list de segurança sem teste que a exercite é uma lista que só está
  certa enquanto ninguém mexe nas rotas — e esta frente mexeu em nove rotas em
  três dias.
- O `error_log` **não pegaria isto nunca**: não houve exceção. Foi encontrado
  medindo produção com `curl`, não lendo log.

**Não autorizado por D-183**: transformar a allow-list em deny-list (inverter o
padrão é decisão própria, com risco próprio — uma rota pública esquecida do
outro lado quebra `/ficha/[id]`, que é o QR dos socorristas).


## D-182 — Alertas desce para dentro do MUNDO

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: NAV-T07 (fase 1 de 2 · fase 4 de 5 do Modelo C)

**Context**: Achado **A3** do `docs/35`: alertas e condições viviam em **duas
telas** — o cartão "Alertas ativos" na folha do MUNDO e a tela `/weather`
inteira, 790 linhas com a própria linguagem visual. Nenhuma das duas era dona
do assunto, e nenhuma podia ser corrigida sem a outra divergir.

D-181 acabou de mostrar o preço disso na prática: a porta entre as duas era
condicional, e ninguém tinha percebido em meses.

**Decision**:

1. **`/dashboard/alertas` é o dono.** O conteúdo de `/weather` virou
   `components/world-v2/AlertsPage.tsx` e passou a ser sub-rota do MUNDO —
   mesmo movimento que Plano e Ficha fizeram em NAV-T04 e T05.

2. **`/weather` redireciona.** Está em histórico, em links internos e é o
   caminho de quem quer saber se pode sair de casa.

3. **O MUNDO ganha faixa de domínio**, como Preparação e Família já têm:
   `Mapa · Alertas`. O chip **Mapa** dá nome à volta — antes ela dependia do
   botão do sistema operacional.

4. **Só DOIS chips, e não os quatro do documento.** `Abrigos` é cartão dentro
   da folha e `Camadas` é folha sobre o mapa; dar endereço aos dois é a fase 2.
   Uma faixa de dois é honesta — uma faixa com dois chips mortos não seria.

5. **A faixa entra nos DOIS ramos de retorno de `AlertsPage`.** Quem não deu
   permissão de localização cai no retorno antecipado, e é justamente quem mais
   precisa de saída com nome. Este é o mesmo descuido que em NAV-T04 deixou
   `PlanPage` sem navegação para quem não tinha círculo — o teste agora roda
   nesse ramo, porque o navegador de teste não concede GPS.

**Consequence**:

- **O cartão da folha e a tela viram resumo → detalhe**, que é a relação certa
  entre duas superfícies do mesmo assunto. Antes eram duas telas irmãs.
- **Dívida assumida e registrada**: o corpo de `AlertsPage` é inteiramente em
  inglês, escrito antes do i18n existir ("Weather Intelligence", "Allow location
  access"). Traduzir 790 linhas não cabia aqui, e traduzir só o cabeçalho
  produziria uma tela meio portuguesa — pior que a de agora, porque prometeria o
  que não cumpre. A faixa é bilíngue; o resto é pendência própria.
- `test:nav` 18/18 (era 13).

**Não autorizado por D-182**: traduzir `AlertsPage`, transformar Abrigos e
Camadas em rotas (fase 2), mexer no cartão de alertas da folha além do link,
antecipar NAV-T08.


## D-181 — A porta do Clima era condicional, e a condição era "estar em perigo"

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: NAV-T06 (correção)
**Achado**: dono do produto — *"eu não vejo em lugar nenhum o weather"*

**Context**: D-180 tirou o ícone de Clima da barra global afirmando que
*"Clima e Cenário perdem o ícone, não o endereço: os dois continuam a um toque
no MUNDO"*. Para Cenário isso era verdade. Para Clima, **não**.

`WorldV2.tsx` tinha o `PillLink href="/weather"` dentro de **dois dos três**
ramos do card de Alertas:

```
locatedAlerts.length  → lista + Ver alertas      ✅ porta
headlines.length      → manchetes + Ver alertas  ✅ porta
senão                 → "Nenhum alerta na área"  ❌ NADA
```

A porta aparecia quando havia alerta e sumia quando não havia — ou seja, ela
existia exatamente para quem **já sabia** que havia algo, e faltava para quem
queria conferir. Enquanto Clima tinha ícone próprio na barra isso passava
despercebido; ao remover o ícone, `/weather` virou órfão no estado normal.

**Causa da falha de verificação**: eu confirmei que os links existiam no arquivo
e não que eles **renderizavam sempre**. `grep` acha a linha; ele não acha a
condição que a envolve.

**Decision**:

1. **A porta sai dos ramos e vira incondicional.** Um card chamado "Alertas
   ativos" oferece o caminho para os alertas independentemente de haver algum.

2. **O rótulo muda com o estado**: "Ver alertas" com alerta, **"Ver condições e
   previsão"** sem. "Ver alertas" quando não há nenhum mentiria sobre o que há
   do outro lado — e o que há sempre são condições, qualidade do ar e
   recomendação de atividade.

3. **`bottom-nav-test` ganha a checagem que faltou**: o MUNDO tem porta para o
   Clima **sem alerta ativo**. O usuário temporário não tem localização e
   portanto não tem alerta — o teste roda no ramo que estava quebrado.

**Consequence**:

- **Terceira vez nesta sessão que um teste passa com a tela errada.** D-179 foi
  `one-door-test` sem o caso da conta; aqui foi `test:nav` sem o caso do estado
  vazio. O padrão: os testes cobrem o caminho **cheio** e o defeito mora no
  **vazio**.
- Reforça que remover um ponto de entrada exige verificar o substituto **no
  estado mais comum**, não no estado que ilustra a feature.
- **Não fecha o problema de fundo**: o Clima continua no fim da rolagem da folha
  do MUNDO, abaixo de Autonomia, Alertas e Abrigos. Uma porta que existe e está
  enterrada ainda é ruim. Quem resolve é NAV-T07, dando ao MUNDO a faixa de
  domínio que Preparação e Família já têm.

**Não autorizado por D-181**: reintroduzir o ícone de Clima na barra global,
antecipar NAV-T07.


## D-180 — A barra encolhe para cinco, e o menu invisível morre

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: NAV-T06 (fase 3 de 5 do Modelo C)

**Context**: A barra global tinha **sete** destinos e, ao lado deles, um ☰ sem
rótulo no canto superior direito com uma oitava porta dentro. Duas navegações
concorrentes — e a segunda invisível.

Três dos sete não eram domínios:

| Destino | O que ele é de verdade |
| --- | --- |
| Círculos | assunto de **Família** — já absorvido em D-178 |
| Clima | detalhe do **MUNDO** — alertas em duas telas e duas linguagens visuais |
| Cenário | **MODO**, não lugar: `SimulationProvider` é global e reconfigura o app inteiro |

NAV-T04 e T05 tiraram Plano, Aprender, Ficha e Círculos dos lugares errados.
Foi isso que liberou os slots — a barra só pôde encolher porque o conteúdo já
tinha ido para onde pertencia.

**Decision**:

1. **Cinco slots, sempre os mesmos**:
   `[ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ MAIS ]`.
   A barra é a única coisa da tela que a pessoa pode aprender **uma vez**.

2. **`/settings` vira `/mais`**, e o ☰ deixa de existir. O conteúdo não mudou
   de lugar dentro da página; mudou de **endereço e de nome**, e ganhou rótulo
   escrito na barra. `/settings` **redireciona** — é o caminho do pagamento, e
   um 404 ali custa caro.

3. **O título da tela repete o rótulo da barra.** "Mais", não "Configurações":
   quando os dois discordam, a pessoa duvida que chegou onde queria.

4. **O Treino ganha porta em `/mais`**, como `docs/35` já previa. É a ponte até
   NAV-T08 transformá-lo em modo de verdade.

5. **Clima e Cenário perdem o ícone, não o endereço.** Os dois continuam a um
   toque no MUNDO (`PillLink` "Ver alertas" e "Abrir cenário"), que é onde a
   pessoa já está quando pergunta por eles.

6. **Os badges órfãos são reancorados, não descartados.** `weather` vai para o
   orbe do MUNDO e `scenario` para MAIS — exatamente a tabela de propriedade do
   `docs/35`. Uma notificação sem ícone onde pousar é uma notificação que
   ninguém vê, e essa era a falha silenciosa mais provável desta mudança.

**Consequence**:

- **O canto superior direito ficou vazio pela primeira vez.** D-127 achou três
  círculos sem rótulo ali; D-131 destilou os três num ☰; agora sobrou zero. A
  PilotBar recuperou a largura que reservava para ele — **~98px num telefone de
  390px**, porque a reserva era de 88px e estava errada desde D-131, que
  encolheu o chrome para 40px e só atualizou a barra de busca logo acima.
- **`selo()` virou função única.** Com o orbe do MUNDO passando a exibir badge, a
  alternativa era copiar o selo para a forma elevada — a sexta duplicação desta
  frente (a régua da água chegou a existir em cinco lugares antes de D-174).
- **É a fase que o usuário SENTE.** Memória espacial é a primeira coisa que
  estranha: quem ia em Clima pelo terceiro ícone vai errar. É o custo aceito de
  trocar sete slots memorizados por cinco slots aprendíveis.
- `test:nav` 11/11 (era 7), `test:prep-nav` 30/30 (era 27).

**Não autorizado por D-180**: mover `/weather` para dentro de `/dashboard`
(NAV-T07), transformar Cenário em modo (NAV-T08), dividir `/mais` em sub-rotas
(`/mais/conta`, `/mais/plano`…) — a faixa de domínio de MAIS ainda não existe.


## D-179 — Duas telas, a mesma palavra, conjuntos diferentes

**Date**: 2026-08-14
**Status**: DECIDED
**Roadmap**: NAV-T05 (correção)
**Achado**: dono do produto, comparando as duas telas lado a lado

**Context**: Com Círculos e Ficha dentro de Família (D-178), ficou visível o que
antes estava em telas distantes:

```
/family/circulos  →  "SUA CASA (3)"   Paulo, Daniela, paola
/family/cadastro  →  "Ninguém cadastrado ainda"
```

Uma diz que três pessoas moram aqui; a outra, que ninguém mora.

**Causa**: as duas usam a palavra "casa" para conjuntos diferentes.

- **Círculos** lista as **contas** com `household_status = 'confirmed'` — a
  definição do motor, que D-129 já tinha unificado.
- **Cadastro** listava só `/api/family-members`, ou seja **dependentes** —
  gente sem conta.

Numa casa de três contas e zero dependentes, as duas estavam "certas" nos
próprios termos e diziam coisas opostas para a mesma pessoa.

`docs/34` §3.10 já prometia a correção — *"lista única 'quem mora aqui':
contas, dependentes e convidados juntos"*, provada por `one-door-test`. **Ela
existia no teste e não na tela**: o teste cobria dependente e convidada, e nunca
uma conta confirmada. Foi por isso que a falha sobreviveu a ele.

**Decision**:

1. **"Quem mora aqui" lista contas, dependentes e convidados.** As contas vêm
   de `/api/household` — a **mesma** fonte do motor e de Círculos. Ler outra
   coisa aqui recriaria a divergência que a correção veio fechar.

2. **Conta não tem botão de editar.** Não se edita a ficha de outra conta a
   partir do próprio cadastro: aquilo é dado da pessoa, protegido por
   consentimento próprio (D-123). A linha existe para mostrar que ela **conta na
   casa** — que era a informação que faltava — e leva a Círculos.

3. **O estado vazio só aparece quando TUDO está vazio.** Antes ele disparava com
   `members.length === 0`, escondendo a lista inteira mesmo com três contas.

4. **`one-door-test` ganha o caso da conta.** Sem isso a correção não teria
   guarda, e o teste continuaria passando com a tela errada.

**Consequence**:

- É a segunda vez nesta sessão que **juntar telas revelou uma contradição que a
  distância escondia**. A primeira foi o Pilot dizendo zero enquanto o painel
  dizia 2,7 dias. Aproximar coisas relacionadas é, por si, um método de achar
  defeito.
- Reforça a lição de D-129: *"duas definições da mesma palavra na mesma versão
  do app"* é uma classe de defeito recorrente aqui, não um acidente isolado.

**Não autorizado por D-179**: editar ficha de outra conta pelo cadastro, mudar
a definição de casa do motor.

---

## D-178 — Círculos e Ficha eram Família o tempo todo

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: NAV-T05 (fase 2 de 5 do Model C)
**Spec**: `docs/35-arquitetura-de-navegacao.md` §5

**Context**: Círculos ocupava um **slot da barra global**; a Ficha vivia atrás
do ☰ sem rótulo. Os dois são o mesmo assunto que Família para quem usa:

```
Status    quem está onde, agora
A casa    quem mora aqui — pessoas, dependentes, endereço
Ficha     a ficha médica e o QR para socorristas
Círculos  com quem eu compartilho, e o quê
```

O código já sabia disso antes da navegação: `useCircleFamily.ts` funde círculo
e família para desenhar as pessoas no mapa.

**Decision**:

1. **`/ficha` → `/family/ficha`** e **`/circles` → `/family/circulos`**, com
   redirecionamento nos endereços antigos.

2. **`/ficha/[id]` — o QR PÚBLICO — não muda.** Está impresso, colado em
   geladeira e compartilhado; mexer nele quebraria o papel de quem já imprimiu.
   Tem checagem de navegador própria.

3. **A faixa de seções virou componente compartilhado** (`DomainNav`). Ao criar
   a segunda faixa a escolha era copiar ou generalizar — e copiar já custou caro
   cinco vezes nesta frente. A régua da água chegou a existir em cinco lugares,
   e a divergência entre duas cópias produziu o defeito em que o Pilot afirmava
   autonomia zero.

4. **O ☰ ficou só com Configurações.** Perdeu o Plano em NAV-T04 e a Ficha
   agora. Em NAV-T06 ele deixa de existir.

5. **Links internos apontam para o endereço novo** — 6 arquivos, 8 links. O
   redirecionamento funcionaria, mas um salto a menos é um salto a menos.

**Consequence**:

- **Dois slots da barra liberados.** É o que permite NAV-T06 encolhê-la para
  cinco. A ordem "absorções primeiro" existe por isso.
- `test:prep-nav` vai de 20 para **27** checagens.
- **Um teste meu estava errado e o código certo**: assertei que
  `/ficha/[id]` não podia dar 404, usando um uuid inventado. `notFound()` para
  id inexistente é o comportamento correto da página. Corrigido para usar o id
  real do usuário temporário — testar com dado falso mede a coisa errada.

**Não autorizado por D-178**: mexer na BottomNav (é NAV-T06), mudar
`/ficha/[id]`, alterar o manifesto.

---

## D-177 — Model C adotado: a navegação do EOS ganha dono

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: NAV-T04 .. NAV-T08
**Spec**: `docs/35-arquitetura-de-navegacao.md` (proposta de 2026-08-12)

**Context**: `docs/35` auditou a navegação e recomendou o **Model C**. Ficou
como proposta e **nunca virou tarefa** — zero referências no roadmap. Nesta
sessão, ao levantar o que faltava de tudo que planejamos, isso apareceu como o
maior buraco.

O dono escolheu executá-lo, depois de eu recomendar a navegação em vez de
terminar a metade Holding do Preparedness State. O argumento que pesou:
**a navegação é onde o usuário perde acesso ao que já existe e já funciona.**

Os números da auditoria seguem válidos:

- `/plan` — **1409 linhas de funcionalidade** atrás de um hambúrguer sem rótulo
- `/edu` — RAG, curadoria e conteúdo aprovado com **uma única porta** no app
- barra com **7 destinos**, onde iOS HIG e Material convergem em 3–5
- `/weather` duplicando o MUNDO em duas linguagens visuais

**Decision**:

1. **Model C é canônico.** `docs/35` deixa de ser proposta.

2. **INV-NAV-01 vira invariante do produto**: MUNDO ocupa a mesma posição, tem
   a mesma função e está disponível em qualquer tela e qualquer modo. Nenhuma
   tela, modo ou overlay pode removê-lo, movê-lo ou reatribuí-lo.

3. **A barra global tem cinco slots e NUNCA muda** — em nenhuma tela, em nenhum
   modo. A subdivisão acontece dentro do domínio, como navegação local, que
   PREP-T07 já provou funcionar.

4. **Execução em cinco fases, na ordem das absorções primeiro**, porque são
   elas que liberam os slots:

   | Fase | O quê |
   |---|---|
   | NAV-T04 | Plano e Aprender entram na Preparação; ☰ perde o Plano |
   | NAV-T05 | Círculos entra em Família; Ficha entra em Família |
   | NAV-T06 | Barra encolhe para 5; `/mais` absorve o que resta do ☰ |
   | NAV-T07 | `/weather` desce para dentro do MUNDO |
   | NAV-T08 | Cenário deixa de ser destino e vira MODO |

5. **Endereço antigo nunca vira 404.** Redireciona — o padrão já escrito em
   `family-legacy`, `/inventory` e `/checklist`.

6. **Os três atalhos do `manifest.json`** (`/ficha`, `/plan`, `/preparedness`)
   continuam válidos por redirecionamento. Atualizar o manifesto exigiria
   reinstalação para parte dos usuários já instalados; o redirecionamento não
   custa nada a ninguém.

**Consequence**:

- A frente Preparedness State fica **pausada, não abandonada**. `holdings`,
  `lib/coverage.ts` e `lib/holdings-store.ts` estão corretos, testados e sem
  consumidor — e permanecem assim de propósito. Registrado em NAV-T00 abaixo o
  raciocínio: a pergunta "onde está minha água de reserva?" só tem sentido para
  quem tem **dois lugares**, e enquanto todos tiverem um, `holdings` é
  redundante com os sete escalares. **Não é dívida; é obra parada esperando a
  demanda certa.** É o mesmo teste do `docs/37` §35 que recusou
  `ReadinessAssessment` — aplicado tarde, e por isso registrado.
- `docs/36` continua valendo para dentro da Preparação; suas fases 5 e 6 são
  exatamente NAV-T04.

**Não autorizado por D-177**: mexer na barra antes das absorções, mudar o
manifesto, tocar em `holdings`/`coverage`.

---

## D-176 — Cutover: `requirements` é a verdade; `checklists` vira retrato

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T10d — **último estágio da frente Preparedness State**
**Spec**: `docs/37-preparedness-state.md` §28 (estágio 5)

**Context**: Quatro estágios prontos — aditivo, adaptadores, escrita dupla,
backfill. O portão (`npm run test:cutover-gate`) confirmou que os 3 perfis com
dado batem entre as duas formas.

**Decision**:

1. **`requirements` passa a ser a verdade.** `GET /api/checklist` serve de lá;
   `toggle`, `PATCH`, `DELETE`, `save-items` e `generate` escrevem lá.

2. **`checklists` é CONGELADA**, não sincronizada. Vira retrato do momento do
   cutover, para rollback.

   O motivo é estrutural e foi medido antes: `kit_type` guarda **uma** dimensão,
   e um requisito com kit **e** procedência não cabe nele. Sincronizar exigiria
   **escolher qual informação destruir a cada escrita** — que é exatamente o
   defeito que D-161 desfez. Está provado em teste:
   `legacyKitType('BUG_OUT', 'PILOT')` devolve `BUG_OUT`, e a volta perde o
   `PILOT`.

3. **A forma da resposta não muda.** Nenhuma tela precisou mudar junto com o
   banco. Ela **ganha** dois campos autoritativos — `kit_slug` e `provenance` —
   e mantém `kit_type` sintetizado para as telas legadas, assumido como projeção
   lossy.

4. **`splitKitType` fica como retaguarda na tela**, para resposta antiga servida
   do cache do service worker nos minutos seguintes ao deploy.

**Consequence**:

- A frente inteira está fechada: **T03 → T04 → T05 → T06 → T07 → T08 → T09 →
  T10 → T10b → T10c → T10d**, mais T11..T15 e PILOT-T12.
- **Reverter**: trocar `readRequirements` pela leitura de `checklists` e
  devolver as escritas. O retrato é do momento do cutover — o que mudar depois
  dele não volta. É o custo normal de um cutover, e é por isso que ele foi o
  último passo e não o primeiro.
- **Estágio 6 (aposentadoria) NÃO foi feito**: `acquired`, `acquired_at` e a
  própria `checklists` continuam existindo. Removê-los só depois do cutover
  provar-se em uso — que é o que a spec manda e o que o retrato exige.

**Verificação**: 399 testes unitários, `test:dual-write` 8/8 contra o banco,
`test:cutover-gate` verde, `test:prep-nav` 15/15, lint, typecheck e build
limpos.

**Não autorizado por D-176**: remover `acquired`, apagar `checklists`, mexer nas
telas legadas que ainda leem o retrato.

---

## D-175 — Um perfil sem conta não tem significado

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T15

**Context**: `profiles.id` era `uuid PRIMARY KEY DEFAULT auth.uid()` — **sem
chave estrangeira**. Apagar a conta em `auth.users` deixava o perfil e tudo
pendurado nele: checklists, inventário, família, requisitos, holdings.

Em 2026-08-13 o banco tinha **19 perfis para 9 contas**. Descoberto de lado,
quando o backfill de PREP-T10c contou 16 requisitos para 15 itens de checklist.

Não era só lixo: depois do cutover, um perfil órfão vira **linha fantasma numa
tabela que passou a ser a verdade**.

**Investigação**:

Os 9 órfãos restantes estão **completamente vazios** — 0 checklists,
0 inventário, 0 família, 0 círculos, 0 requisitos — e foram criados entre 8 e 10
de agosto, a janela dos testes. Chamam-se "Clima", "Nav Test" e "Ana", que são
os nomes que `weather-layers-test`, `bottom-nav-test` e `pilot-orb-test`
escrevem. Nenhum é pessoa real.

**Descoberta desconfortável**: o helper `scripts/lib/test-cleanup.mjs` **já
apagava o perfil desde 2026-08-04** (commit `8654bd3`), com um comentário
descrevendo exatamente este problema. E mesmo assim sobraram 9 órfãos nos seis
dias seguintes — porque a chamada terminava em `.catch(() => {})`. **Limpeza que
não reclama é limpeza que não se sabe se aconteceu.**

**Decision**:

1. **Chave estrangeira `profiles.id → auth.users.id` com `ON DELETE CASCADE`.**
   Fecha o laço: apagar a conta passa a apagar o perfil, que já cascateia para as
   sete tabelas. Vale inclusive para scripts que não usem o helper.

2. **A limpeza dos órfãos vai DENTRO da migração**, não num script meu. O dono
   revê o SQL antes de rodar e vê exatamente o que será apagado — melhor que eu
   apagar por REST e contar depois.

3. **A limpeza é conservadora por construção**: só apaga perfil sem conta **e**
   sem nenhum dado em nenhuma das sete tabelas. Se sobrar órfão **com** dado, a
   migração **para com erro** e não cria a FK. Apagar dado de alguém porque a
   conta sumiu é decisão de produto, não de migração.

4. **O `.catch(() => {})` do helper sai.** Falha de limpeza passa a ser
   impressa, com o id. É a terceira vez hoje que um `catch` mudo escondeu um
   problema — as outras duas foram no meu `dual-write-test` e no
   `usePilotFacts`.

**Consequence**:

- Verificado depois da mudança: uma execução completa de `test:prep-nav` não
  deixou órfão novo e a limpeza não reportou falha. **A causa histórica não está
  provada** — o que está provado é que não falha hoje, que uma falha futura será
  visível, e que a FK remove a possibilidade.
- Migração **pendente de aplicação pelo dono**. Reversível: `DROP CONSTRAINT`
  devolve o estado anterior. Os perfis vazios apagados não voltam — mas eles não
  continham nada.

**Não autorizado por D-175**: apagar perfil órfão que tenha qualquer dado.

---

## D-174 — "Não sabemos" e "você não tem nada" são afirmações opostas

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PILOT-T12
**Achado**: dono do produto
**Spec**: `docs/37-preparedness-state.md` §7

**Context**: O Pilot escreveu, para o dono:

> *"Também notei que sua autonomia de água, comida, energia e combustível está
> em zero, o que significa que sua família não tem reservas para emergências."*

No mesmo minuto, o painel mostrava **2,7 dias**. E a Preparação mostrava
"3 membros" — a casa era conhecida.

**Causa, localizada em `app/api/pilot/chat/route.ts:764`**: a linha das reservas
imprimia `context.autonomyDays` — um número vindo do **cliente** — e mandava ao
modelo `Autonomia 0.0 dias (água 0.0d, comida 0.0d…)`. O modelo obedeceu: ele
disse exatamente o que lhe foi dito.

Duas causas cabiam no mesmo sintoma:

1. **Corrida.** `PilotDock` chama `usePilotFacts(open)` — os fatos só começam a
   carregar quando o orbe ABRE. Quem digita rápido envia contexto vazio.
2. **Casa desconhecida** virava `FATOS_VAZIOS`, que tem todos os dias em ZERO.

O comentário do próprio `usePilotFacts` dizia que a intenção era *"o honesto é
dizer que não sabe"*. A intenção estava certa; a expressão, não.

**Decision**:

1. **As reservas são lidas NO SERVIDOR.** É a invariante que `docs/37` §7 já
   exigia e que ninguém tinha aplicado a este caminho: *"structured state is
   read server-side on every assembly; client-supplied context may enrich but
   may never BE the factual state."* Isso mata a corrida por construção.

2. **`null` para desconhecido, nunca `0`.** `householdDays()` devolve `null`
   quando a casa não é conhecida, e o prompt passa a dizer:
   *"Reservas: NÃO SABEMOS — não afirme autonomia, nem em dias nem como zero."*

3. **Regra explícita no prompt**: *"NUNCA expresse dado faltante como número,
   muito menos como zero: NÃO SABEMOS e NÃO TEM NADA são afirmações opostas."*

4. **As fórmulas passam a existir num lugar só.** Era a **quinta** duplicação
   desta frente — e a que produziu o defeito mais grave.

**Consequence**:

- **Uma fronteira apareceu e foi respeitada.** Pôr `householdDays` em
  `lib/household.ts` quebrou o build: aquele arquivo importa `createAdminClient`
  e `error-log`, que puxam `node:crypto`, e `usePilotFacts` roda no CLIENTE. A
  função foi para `lib/household-days.ts`, puro. **Cálculo puro não mora ao lado
  de acesso a banco** — o build disse isso antes de qualquer usuário dizer.
- O teste que fica: *"zero legítimo e desconhecido nunca são a mesma coisa"*.
  Uma casa que de fato não tem nada devolve **0** e deve alarmar; uma casa que
  não conhecemos devolve **null** e não deve virar frase nenhuma sobre reservas.

**Não autorizado por D-174**: mudar o comportamento do orbe, segurar o envio da
mensagem, mexer no `pilot-guard`.

---

## D-173 — Backfill aplicado; e o cutover não pode manter o legado em sincronia

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T10c ✅ · PREP-T10d define a forma
**Spec**: `docs/37-preparedness-state.md` §28 (estágios 4 e 5)

**Context**: Estágio 4 — projetar o legado no modelo novo.

**Decision e resultado**:

1. **Simulação a seco é o padrão, não uma opção.** `npm run backfill:prep` não
   escreve; só `--apply` escreve. Um backfill cujo modo perigoso é o padrão é um
   acidente esperando o dedo errado, e este roda contra produção com Stripe ao
   vivo.

2. **Aplicado**: 4 perfis com dado, 15 itens de checklist, 3 inventários,
   17 holdings, 4 localizações padrão, **0 erros**.

3. **Re-executável provado**: a segunda execução criou 0 localizações e manteve
   as contagens. Requisitos reusam `syncRequirement` (D-172); holdings usam
   `upsert` no índice de colunas simples.

**Descoberta 1 — perfis órfãos, pré-existente** → **PREP-T15**

A conferência pós-backfill deu **16 requisitos para 15 itens**. A causa: o banco
tem **19 perfis para 9 contas de autenticação**. `profiles.id` é
`uuid PRIMARY KEY DEFAULT auth.uid()` e **não tem chave estrangeira para
`auth.users`** — apagar a conta deixa o perfil, e tudo pendurado nele, para
sempre. Sobraram 10 perfis de meses de teste ("Clima", "Nav Test", "Ana").

Um deles era **meu**, criado hoje: o `dual-write-test` engolia a falha da
limpeza com `.catch(() => {})`. Corrigido — a limpeza agora falha alto e apaga o
PERFIL, não só a conta. Removi apenas o meu; os outros nove são dado que eu não
criei e um deles tem nome de pessoa, então a remoção é decisão do dono.

**Descoberta 2 — a forma do cutover** → **PREP-T10d**

`npm run test:cutover-gate` compara, por perfil, o legado e o modelo novo: **os
3 perfis com dado batem**. E mede a direção inversa, que é o que decide a forma:

> `checklists.kit_type` guarda UMA dimensão. Um requisito com kit **e**
> procedência não-manual ao mesmo tempo não cabe nele. Hoje esse número é
> **zero** — mas é sorte do dado atual, não garantia do modelo. **O primeiro
> item da Bug Out sugerido pelo Pilot torna a volta lossy para sempre.**

Portanto: **o cutover não pode manter `checklists` em sincronia — ele precisa
congelá-la.** Espelho invertido é impossível por construção, e é exatamente o
defeito que D-161 desfez. Isso muda o que T10d é: não é "virar a leitura e
manter os dois", é **mover todos os 18 leitores de uma vez e parar de escrever
no legado**, com `checklists` virando retrato para rollback.

**Não autorizado por D-173**: executar o cutover, apagar perfis órfãos que não
são meus, remover `acquired`.

---

## D-172 — Escrita dupla que nunca derruba a escrita real

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T10b
**Spec**: `docs/37-preparedness-state.md` §28 (estágio 3)

**Context**: Com `requirements` e `kits` no ar e os estados de aquisição
definidos, toda escrita nova passa a existir nas duas formas. O legado continua
sendo a verdade até o cutover.

**Decision**:

1. **A escrita nova NUNCA derruba a legada.** Se espelhar falhar, o item já foi
   gravado e a pessoa vê o que esperava; a falha vira linha no `error_log` e
   nada mais. O contrário transformaria uma tabela que ninguém ainda lê num
   ponto único de falha para uma tabela de que o app inteiro depende.

2. **Ler-então-escrever, e não `upsert`.** A chave natural usa
   `COALESCE(kit_id, sentinela)` porque `NULL` é distinto de `NULL` em índice
   único (D-161) — e índice de EXPRESSÃO não pode ser alvo de `on_conflict` pelo
   PostgREST, que só aceita nomes de coluna. A corrida resolve no banco, com o
   índice único recusando a segunda inserção; nesse caso relemos em vez de
   estourar.

3. **Renomear remove o espelho antigo.** `canonical_key` é recalculada no rename
   (D-121); sem isso o requisito da chave velha viraria órfão, e órfão faz a
   prontidão contar uma falta que já não existe. A ordem importa: grava a chave
   nova **antes** de apagar a velha, senão há uma janela sem nenhuma das duas.

4. **`holdings` fica FORA da escrita dupla.** É integralmente derivável de
   `resource_inventory` pelo adaptador de PREP-T04; espelhar o que já se projeta
   adicionaria risco de divergência sem adicionar informação. Entra de uma vez
   no backfill.

**Consequence**:

- **Validado contra o banco de produção**, não só por teste unitário:
  `npm run test:dual-write`, 8 checagens com perfil temporário e limpeza. Teste
  unitário prova a tradução; só o banco prova a escrita — o kit criado sob
  demanda sem duplicar, a chave natural tratando `NULL` como valor, a segunda
  gravação atualizando, e a exclusão levando o espelho.
- A checagem que mais importa: **outra fonte atualiza a procedência em vez de
  criar segunda linha** (D-155 §26.2). É a regra que o `kit_type` violava por
  desenho, agora provada no banco novo.

**Não autorizado por D-172**: backfill, cutover, espelhar `holdings`, remover
`acquired`.

---

## D-171 — Ciclo de vida do requisito; "não se aplica" é decisão que o app lembra

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T10 (fase 1 de 4)
**Spec**: `docs/37-preparedness-state.md` §19, §28

**Context**: O roadmap juntava "estados de aquisição + cutover" numa tarefa só.
A spec diz o contrário — `docs/37` §28: *"every stage independently shippable"*
e o cutover é *"explicit, decided, one task"*. Juntar os três significaria fazer
o primeiro passo irreversível da frente junto de trabalho aditivo, sem ponto de
retorno separado.

**Decision**:

1. **T10 vira quatro tarefas**: estados (esta), escrita dupla, backfill com
   simulação a seco, e cutover. Cada uma entregável sozinha; só a última é
   irreversível.

2. **Quatro estados**, como `docs/37` §19: `proposed → needed → met`, mais
   `not_applicable`.

3. **O sistema não promove a própria sugestão.** Pilot, EDU, simulação e alerta
   criam em `proposed` e nada mais. Sem essa trava, qualquer fonte automática
   passaria a criar dívida na casa de alguém sozinha — a escrita silenciosa que
   a arquitetura proíbe.

4. **`met` continua vindo do usuário nesta fase.** O destino é derivá-lo da
   cobertura — *"não se marca prontidão, adquire-se coisas"* —, mas `holdings`
   ainda está vazia: derivar agora faria a caixinha de marcar parar de
   funcionar, porque nada cobriria nada. **A interface não pode prometer o que o
   domínio ainda não sustenta** (§33). Vira PREP-T10c, depois do backfill.

5. **`acquired` continua sendo mantida em paralelo.** Uma coluna nova que deixa
   a antiga divergir é pior que nenhuma coluna nova: todo código que ainda lê o
   booleano passaria a mentir.

6. **O descartado sai da conta.** Não conta como falta, e sai também do
   denominador do progresso. Um checklist de 10 onde 3 não se aplicam é um
   checklist de 7 — mostrar 7/10 para sempre ensinaria que a barra nunca fecha.

**Consequence — o que esta fase entrega**:

**"Não se aplica a esta casa".** Hoje, quem não precisa de um item só pode
**apagá-lo** — e a próxima geração de checklist o traz de volta. Apagar diz
"some da tela"; descartar diz "esta família não precisa disto". É uma decisão
sobre a própria casa, e o app tem obrigação de lembrar dela. Reversível a
qualquer momento: uma decisão sobre a casa pode mudar quando a casa muda.

Migração `20260813180000_checklist_status.sql` **pendente de aplicação pelo
dono**. Nada nela é irreversível — a coluna pode ser derrubada sem perda,
porque `acquired` continua sendo a fonte. E a tela deriva o estado do booleano
enquanto a coluna não existir, então o deploy pode chegar antes da migração.

**Não autorizado por D-171**: escrita dupla, backfill, cutover, derivar `met`.

---

## D-170 — Amortecimento do laço, sem tabela que ninguém leria

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T09
**Spec**: `docs/37-preparedness-state.md` §26

**Context**: Com as quatro entradas fechadas, o laço passa a fechar em si
mesmo: estado muda → gatilho → proposta → o usuário confirma → estado muda →
gatilho de novo. Sem amortecimento ele oscila — e num app de emergência isso
vira insistência sobre a mesma coisa, que é a forma mais rápida de ensinar
alguém a ignorar o app.

Dois vazamentos concretos existiam:

1. **A proposta se reoferecia depois de recarregar.** O "✓ na lista" vivia em
   estado de componente. O banco não duplicava (`ignoreDuplicates`), mas a tela
   pedia o mesmo toque duas vezes — e um app que pede duas vezes a mesma coisa
   parece quebrado mesmo quando não está.
2. **A faixa do alerta voltava sozinha**, sem como dizer "já vi".

**Decision**:

1. **"Já está na lista" é DERIVADO do checklist real**, comparando por
   `canonical_key` — a mesma chave que o servidor calcula ao gravar. Comparar
   texto exibido erraria em acento, maiúscula e pontuação, e erraria **para
   mais**, reoferecendo o que já existe.

2. **Dispensa é durável e por GATILHO.** Outro evento, outra severidade ou
   outra validade produzem chave diferente e o aviso volta. *"Já vi este aviso"*
   não pode significar *"não me avise mais"* — silenciar para sempre
   transformaria preferência de exibição em risco de segurança.

3. **Dispensa mora no aparelho.** É preferência de exibição, não fato sobre a
   casa. Sincronizá-la traria a pergunta difícil de o que fazer quando um membro
   dispensa e outro não — e o "não me mostre" de uma pessoa não pode calar o
   aviso para a família inteira.

4. **`ReadinessAssessment` NÃO foi criada**, apesar de prevista em `docs/37`
   §13. Hoje **nada a leria**: o cron manda notificação por conta própria, e o
   amortecimento que importa acontece na tela, com o usuário presente. Tabela
   sem consumidor é exatamente o que o §35 manda evitar. Ela entra quando
   existir quem consulte — provavelmente junto do orçamento de interrupção por
   push.

**Consequence**:

- O item 4 é uma decisão de **não construir** algo que a própria spec previa. A
  spec continua certa sobre o destino; errado seria chegar lá antes de haver
  motivo.
- Os itens 1 e 2 do §26 (identidade de gatilho e de requisito) já estavam
  prontos desde D-161/D-168. O item 5 (orçamento de interrupção) fica para
  quando o push consumir assessments.

**Não autorizado por D-170**: criar `readiness_assessments`, silenciar alerta
entre gatilhos diferentes, sincronizar dispensa entre membros.

---

## D-169 — Lacuna de alerta vira tarefa com número, não com adjetivo

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T08 (fase 2)

**Context**: A fase 1 (D-168) fez o alerta reordenar o que é urgente. Faltava a
saída: as lacunas apareciam como texto e paravam ali — o mesmo defeito que o
dono apontou no briefing (D-166/D-167), em outra superfície.

**Decision**:

1. **As lacunas do alerta viram propostas confirmáveis**, com `provenance =
   OFFICIAL_ALERT`, uma confirmação por vez. Quarta entrada do laço com saída
   completa.

2. **Os números são determinísticos, não gerados.** "Comprar 9 gal de água — 3
   dias para 3 pessoas" sai da régua da FEMA e do tamanho real da casa,
   descontando o que já existe. **A lição do D-167 deixa de depender de o modelo
   lembrar de ser específico**: aqui não há modelo.

3. **Nem toda lacuna vira compra.** `household-unknown` não gera tarefa —
   descobrir quem mora na casa é cadastro, e comprar nada resolve.
   `checklist-essential` também não: ela **já é** a lista.

**Consequence**:

- O laço fechado do `docs/37` está completo nas quatro entradas, **com saída
  acionável em todas**.
- O caminho é o mesmo das outras três: propõe → usuário confirma → aparece em
  "O que falta" com a origem visível. Nenhum código novo de exibição.
- **Um teste meu estava errado e o código certo**: eu esperava 3,8 gal para uma
  casa de tamanho desconhecido, quando o correto é 3,0 — três dias a um galão
  por dia. Confundi a régua diária com o piso de três dias. Corrigido no teste.

**Não autorizado por D-169**: escrever sem confirmação, chamar modelo no cron,
migração, SIM-T12.

---

## D-168 — Alerta oficial vira reavaliação; nenhuma IA decide relevância

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T08 (fase 1)
**Spec**: `docs/37-preparedness-state.md` §5, §6

**Context**: A quarta e última entrada do laço fechado. As outras três — EDU
(D-119), simulação (D-092) e Pilot (D-093) — já existiam; o alerta era o único
que terminava numa notificação e parava ali. O cron já fazia a parte difícil:
validar severidade e deduplicar por `source_key`.

**Decision**:

1. **A reavaliação é determinística e pura.** Nenhuma IA decide se existe aviso
   oficial, se ele importa, ou o que ele pressiona (`docs/37` §6). A IA pode
   explicar depois; não pode ser a trava.

2. **Nenhuma chamada de modelo no cron.** A reavaliação roda **quando o usuário
   chega**, na tela, onde ele pode confirmar. Rodar no cron significaria gerar
   proposta para milhares de casas que talvez nunca abram o app: custo, ruído, e
   escrita preparada sem ninguém presente para consentir.

3. **O alerta não cria necessidade nova — ele reordena a que existe.** Um aviso
   de furacão não inventa que falta água; torna urgente a água que já faltava.
   A reavaliação lê os **mesmos** itens de `lib/attention` que a Visão mostra em
   repouso, para que não exista uma segunda verdade sobre a casa.

4. **Alerta relevante SEM lacuna correspondente não interrompe.** A casa está
   pronta para aquele evento, e dizer "atenção" assim mesmo gasta a atenção que
   o próximo evento vai precisar.

5. **Evento que não sabemos mapear não vira "tudo é urgente".** Nesse caso só o
   que já é crítico aparece: alargar o alarme por ignorância é o oposto de
   informar.

6. **A Visão lê o snapshot global de risco**, já montado no layout. Nenhum fetch
   novo — duas telas que buscam a mesma coisa acabam divergindo.

7. **`OFFICIAL_ALERT` ganha o valor correspondente no armazenamento legado**, e
   já era procedência válida em `requirements` (D-161). Sem migração.

**Consequence**:

- **Um teste pegou um defeito real de casamento de padrão.** Sem fronteira de
  palavra, `neve` casa dentro de **nevoeiro**, e um aviso de neblina passaria a
  pressionar comida e água. Todos os padrões ganharam `\b`, e "nevoeiro não é
  neve" virou teste. Alarme por coincidência de letras é pior que alarme
  nenhum, porque parece fundamentado.
- O laço fechado do `docs/37` está **completo nas quatro entradas**.
- Fase 2 (pendente): a notificação do cron apontar direto para a reavaliação, e
  as lacunas do alerta virarem propostas confirmáveis com `provenance =
  OFFICIAL_ALERT`.

**Não autorizado por D-168**: chamar modelo no cron, escrever sem confirmação,
migração, mudar o cron.

---

## D-167 — A tarefa precisa carregar o próprio contexto

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T14 (correção)
**Achado**: dono do produto, sobre a saída real do modelo

**Context**: No primeiro briefing com propostas ativas, o modelo leu a ficha
médica corretamente e escreveu, em **prioridades**:

> "Garantir medicamentos de uso contínuo (ex: Loratadine) para estoque mínimo
> de 7 dias"

Nome do remédio, quantidade, prazo. E em **próximos passos**, sobre a mesma
coisa:

> "Separar e armazenar medicamentos essenciais para todos da casa"

A informação existia e se perdeu no caminho para a tarefa. Nas palavras do
dono: *"atrapalha ter que criar um lembrete e depois lembrar do que o lembrete
me lembrou."*

**O princípio, que vale além deste caso**: a tarefa **sobrevive ao briefing**.
O cartão some; a linha fica no checklist e será lida semanas depois, sozinha,
sem o texto que a originou. Um item que depende do contexto que já não está na
tela é pior que nenhum item, porque ocupa espaço prometendo memória que não tem.

**Decision**:

1. **O prompt passa a dizer ao modelo qual é o destino.** `next_steps` vira
   tarefa independente e precisa citar O QUÊ, QUANTO e PARA QUEM quando o dado
   já está disponível, com exemplos de ruim × bom. O modelo degradava porque
   nada dizia que aquilo viraria uma linha isolada.

2. **Filtro de auto-suficiência como rede** (`carregaProprioContexto`).
   Categoria vaga ("essenciais", "necessários", "adequados") só passa com
   âncora concreta: um número, um parêntese de exemplo, ou um nome próprio no
   meio da frase. Palavras que qualificam a condição e não o objeto —
   "críticos", "acessível" — ficam fora da lista, para não derrubar item
   executável.

3. **`looksActionable` passa a aceitar INFINITIVO.**

**Defeito que eu mesmo introduzi, e que o achado do dono revelou**: a lista de
verbos era **só imperativa** ("compre", "revise", "adquira"), e o modelo escreve
no infinitivo — que é a forma dominante de lista de tarefa em português. O
resultado: `looksActionable` devolvia `false` para **todas** as prioridades
reais, inclusive a da Loratadine. **O filtro descartava exatamente a específica
e deixava passar a genérica.** Não era o modelo; era o meu filtro.

**Consequence**:

- Com a correção, a saída real do dono produz o resultado certo: a prioridade
  que nomeia a Loratadine **entra**, o passo genérico sobre medicamentos **sai**.
  Registrado como teste com as strings reais.
- O EDU herda os infinitivos: ele usava a mesma lista e sofria o mesmo
  descarte silencioso desde D-119.
- Correção de raiz é o prompt; o filtro é a rede. Os dois juntos, porque
  depender só de instrução a modelo não é garantia, e depender só de filtro
  descarta em vez de melhorar.

---

## D-166 — O briefing termina em ação confirmável, não em prosa

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T14
**Achado**: dono do produto

**Context**: `/api/ai/readiness` produzia visão geral, prioridades, forças e
próximos passos — tudo texto, nenhuma saída. A pessoa lia *"aumente a reserva
de água"* e não tinha o que tocar.

O dono apontou: *"após a análise, ele não gera CTA"*. Isso contraria a **regra
1 do D-085**, escrita pelo próprio Spine:

> "Preparação é acionável ou não pertence aqui. Conteúdo que não produz
> entendimento, uma tarefa, um material, um papel, uma revisão de plano ou uma
> melhoria de comunicação fica fora."

O EOS escrevia a regra e não a cumpria na sua própria tela de prontidão.

**Decision**:

1. **`next_steps` vira proposta confirmável**, pelo mesmo contrato de Pilot
   (D-093), EDU (D-119) e debrief da simulação (D-092).

2. **Uma confirmação por proposta.** Nada é gravado por ter sido gerado —
   escrita silenciosa a partir de saída de modelo é o que a arquitetura proíbe
   (`docs/37` §4), e vale igual quando o modelo acerta.

3. **Prioridade só entra quando parece ação.** Uma prioridade costuma ser
   diagnóstico ("água abaixo do mínimo"); transformá-la em tarefa produziria um
   item que ninguém consegue executar nem marcar como feito, e uma lista cheia
   desses ensina a ignorar a lista. `strengths` nunca entra: é o que já está bom.

4. **Sem procedência nova.** Grava como `PILOT_RECOMMENDATION` — o briefing é
   interpretação de IA sobre o estado da família, que é a definição do Pilot
   (`docs/37` §8). Um valor novo exigiria migração para ampliar o CHECK de
   `provenance` e criaria uma sexta procedência para dois lugares onde o **mesmo
   raciocínio** acontece. Distinguir conversa de briefing é trabalho de
   `provenance_ref`, coluna que `requirements` já tem (D-161).

5. **O julgamento do que é ação é o MESMO do EDU.** `looksActionable` foi
   exportado em vez de copiado — uma segunda lista de verbos seria a quinta
   cópia de constante desta frente.

**Consequence**:

- O item confirmado aparece em "O que falta" com o selo **"via Pilot"**, que a
  fase 1 já desenhou. Fonte visível é obrigatória (D-085 regra 3), e o caminho
  inteiro — propor, confirmar, aparecer com origem — passa a existir sem código
  novo de exibição.
- Falha de gravação **volta o botão ao estado anterior**: um botão dizendo
  "salvo" sem ter salvado é pior que um botão que falhou.
- O laço fechado do `docs/37` ganha sua entrada mais barata. Continuam faltando
  os alertas (PREP-T08), que é a quarta e última.

**Não autorizado por D-166**: escrever sem confirmação, criar procedência nova,
migração, mexer no contrato de saída do modelo.

---

## D-165 — A Visão decide; o estoque muda de tela

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T07 (fase 2)
**Spec**: `docs/36-preparacao-arquitetura-interna.md` §4, `docs/37` §29.2

**Context**: A Preparação empilhava três cadências na mesma rolagem —
diagnóstico (segundos, em dúvida ou em evento), manutenção de estoque (mensal)
e sessão de compra. A tarefa mais lenta ficava entre a pessoa e a mais urgente.
E a nota dizia "crítico" no topo enquanto o que ela diagnosticava ficava 400px
abaixo, preso dentro de cada card: a tela respondia *"onde estou"* e não
respondia *"para onde eu vou"* (achado P2 do `docs/36`).

**Decision** — as duas respostas do dono viraram estas regras:

1. **A Visão fica com "precisa de atenção".** Cada problema é uma linha que
   leva ao lugar onde se conserta. **Sem dado novo**: os sinais já eram
   calculados, só viviam espalhados.

2. **A Visão não edita nada.** Os seis editores foram para
   `/preparedness/o-que-tenho`. Provado por teste de navegador — um stepper na
   Visão significa que um editor vazou de volta.

3. **A regra de atenção é função pura e testada** (`lib/attention.ts`, 20
   testes). Uma decisão de segurança dentro de JSX não teria como ser
   verificada.

4. **Casa de tamanho desconhecido é item de atenção próprio.** O resto do app
   usa `max(size, 1)` para não dividir por zero — defesa correta virando
   resposta errada: uma casa de quatro avaliada como se fosse uma parece quatro
   vezes mais preparada do que é. Agora o EOS diz que não sabe, e a severidade
   dos itens dependentes cai para `unknown` em vez de afirmar veredito sobre
   uma casa que ele não conhece.

5. **Nada pendente é dito com palavras, não sumindo.** Uma seção que desaparece
   é indistinguível de uma que falhou ao carregar.

6. **O briefing de IA sai do segundo lugar** e vira linha que abre. Ele ocupava
   o melhor espaço da tela e, na maioria das visitas, estava vazio — espaço
   nobre guardado para um placeholder.

7. **O card do EDU vira porta**, junto das outras. Ele estava entre a nota e o
   briefing, no ponto em que a pessoa está diagnosticando e não estudando.

8. **Filtro por localização não entra ainda.** Existe uma localização até os
   holdings serem preenchidos, e filtro de uma opção é ruído ocupando a
   primeira dobra — mesma regra do filtro de kits.

**Consequence**:

- A Visão caiu de 1348 para 1173 linhas e deixou de ser tela de manutenção.
- `/inventory` volta a ter destino exato, como `/checklist` na fase 1.
- `test:prep-nav` vai de 11 para **15** checagens.
- **Achado do dono virou tarefa**: depois da análise, o briefing **não gera
  CTA**. Isso contraria a regra 1 do D-085 — *"preparação é acionável ou não
  pertence aqui"* — e recolher o card resolve o espaço, não o defeito.
  É **PREP-T14**: `next_steps` deve virar requisito confirmável com
  `provenance`, pelo mesmo contrato de Pilot/EDU/simulação.

**Não autorizado por D-165**: PREP-T14, mover `/plan` ou `/edu`, filtro de
localização, backfill.

---

## D-164 — Preparação ganha navegação local; kit vira filtro, procedência vira selo

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T07 (fase 1)
**Spec**: `docs/37-preparedness-state.md` §29.2, `docs/36-preparacao-arquitetura-interna.md`

**Context**: A Preparação empilhava três tempos de uso na mesma rolagem —
diagnóstico (leitura), estoque (manutenção mensal) e checklist (sessão de
compra). A tarefa mais lenta ficava fisicamente entre a pessoa e a mais
urgente. E o kit, que sempre existiu no banco, aparecia como texto
("Fonte: Bug Out") numa lista plana por tier: dois itens com o mesmo nome, um
embaixo do outro, e nada dizia qual mochila estava sendo editada.

**Decision**:

1. **Faixa de chips com ROTA REAL**, fixa no topo, `<nav>` + `aria-current`.
   **Não `role="tab"`**: sem painéis em memória, um `tablist` anunciaria ao
   leitor de tela uma troca de aba que é, na verdade, uma navegação.

2. **O eixo é `o que eu tenho` × `o que falta`** — Holding × Requirement. **Não
   é "Em casa × Mochilas"**, como `docs/36` chegou a propor: aquilo punha
   localização e kit, dimensões independentes, no mesmo eixo — o defeito de
   `kit_type` reproduzido na navegação. Localização e kit viram **filtros**.

3. **Fase 1 extrai "O que falta"** para `/preparedness/o-que-falta`.
   `/preparedness` continua sendo a porta, sem redirecionamento, e ganha uma
   porta com estado ("N itens em aberto") dentro da rolagem — ao alcance do
   polegar, enquanto os chips do topo são o caminho de repetição.

4. **Kit vira filtro; procedência vira selo.** `splitKitType()` (D-161) separa
   as duas dimensões na interface. Os filtros mostram só os kits que a família
   **realmente usa**, não a lista teórica.

5. **Sem fusão de linhas na UI.** `projectLegacyChecklist()` sabe fundir, mas a
   API opera linha a linha e uma linha fundida não tem id para editar. Fundir é
   trabalho do backfill (estágio 4), não da interface. Uma tela que mostra menos
   linhas do que consegue editar perde toques.

6. **`/checklist` volta a ter destino exato**, em vez de largar a pessoa no topo
   de uma página longa.

**Consequence**:

- **Duas regressões foram evitadas por pouco.** Extrair a lista e deixar os
  diálogos para trás teria removido em silêncio a **edição de item** e a
  **confirmação antes de excluir** — as duas entregues em D-121. Foram movidas
  junto, para `components/world-v2/ChecklistDialogs.tsx`. Mudança de
  arquitetura não pode custar funcionalidade sem que alguém tenha decidido isso.
- A Visão caiu de ~1600 para 1348 linhas. A fase 2 (extrair os editores de
  recurso) encolhe mais.
- **Novo teste de navegador**: `npm run test:prep-nav`, 9 checagens. A que mais
  importa não é que a página abre — é que **a BottomNav não se mexeu**: 7
  destinos e PREPARAÇÃO acesa na sub-rota. A promessa de `docs/35` era que
  sub-rota de domínio não custa nada à navegação global, e promessa assim só
  vale medida. `npm run test:nav` também segue verde (7/7).

**Adendo — 2026-08-13, decisão do dono: a faixa fica ABAIXO do título.**

Primeiro você sabe em que domínio está, depois escolhe a seção; ao rolar, o
título sai e a faixa fica grudada — o comportamento de título grande do iOS.
Vale para a Visão e para "O que falta", que devem ter a mesma ordem.

Como a decisão foi tomada: o dono é orientado a visual e disse que precisava
**ver** para opinar. As duas posições foram capturadas do app rodando (390px,
2×) e comparadas lado a lado. Descrever posição de elemento em texto para quem
decide por imagem é pedir um palpite, não uma decisão — e a posição foi
resolvida com **dois** chips, mais barato que resolver com os três que a fase 2
traz.

**Não autorizado por D-164**: extrair os editores de recurso (fase 2), mover
`/plan` ou `/edu`, mexer na BottomNav, backfill.

---

## D-163 — O mínimo de água é o da FEMA: três dias por pessoa

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T13
**Spec**: `docs/37-preparedness-state.md` §15.3
**Decisor**: dono do produto

**Context**: D-159 adotou a régua da FEMA (1 galão/pessoa/dia) mas deixou os
**limiares** intactos de propósito, para não embutir duas mudanças de
severidade na mesma entrega. Os limiares eram absolutos por pessoa e não por
dia: `4 L` para adequado, `2 L` para crítico — ou seja, **"adequado" no EOS
significava cerca de UM dia de água**, contra o mínimo de três dias que a FEMA
publica.

Achado da auditoria: **o próprio app já concordava com a FEMA num lugar e não
no outro.** `TIER_DAYS.ESSENTIAL` vale `3` no checklist — a régua das tarefas
dizia três dias enquanto a régua da tela de recursos dizia um. Duas verdades
sobre água dentro do mesmo produto.

O dono decidiu: **1 galão por dia, mínimo de 3 dias.**

**Decision**:

1. **Adequado = 3 dias por pessoa** (3 galões ≈ 11,36 L). É o piso da FEMA.
2. **Crítico = menos de 1 dia por pessoa** (1 galão ≈ 3,79 L).
3. **Baixo = entre 1 e 3 dias.**
4. Os limiares moram em `lib/units.ts`, junto da régua, derivados dela —
   nenhum literal solto.
5. Vale para os três lugares que julgavam água: `rules-engine`, a nota da
   Preparação e `/api/analyze`.
6. **A orientação de racionamento NÃO muda.** "Racionar: máximo 2 L/pessoa/dia"
   é um piso de sobrevivência em emergência, não a recomendação de estoque.
   São dois números diferentes com dois propósitos diferentes, e igualá-los
   seria transformar um mínimo de guerra em meta de despensa.
7. **Um aviso só, não dois.** D-159 e D-163 chegaram com um dia de diferença e
   são a mesma ideia ("adotamos o padrão da FEMA"). O aviso da tela foi
   reescrito para cobrir as duas, com chave nova — quem já dispensou o primeiro
   vê o novo uma vez, e acabou. Honestidade repetida vira insistência.

**Consequence**:

- **A nota de água cai de novo** para quem tem entre 1 e 3 dias: o que antes
  pontuava 30 agora pontua 15. Ninguém ficou menos preparado; a régua é que
  estava curta duas vezes — na unidade e no piso.
- O EOS passa a ter **uma** verdade sobre água. `TIER_DAYS.ESSENTIAL = 3` e o
  limiar de adequado agora dizem a mesma coisa.
- **Dois testes quebraram e um fixture estava mascarando ruído.** Os testes
  fixavam 6 L e 20 L; o fixture padrão (20 L / 2 pessoas = 2,6 dias) fazia
  `WATER_LOW` disparar em *todo* teste que usasse os valores padrão, inclusive
  os que não eram sobre água. Reescritos para derivar da constante, e o padrão
  subiu para 4 dias. **Segunda vez nesta frente que um literal em teste vira
  âncora do número errado** — a regra virou memória de produto.

**Não autorizado por D-163**: mudar limiares de comida, bateria ou combustível;
mudar a orientação de racionamento.

---

## D-162 — Prontidão é cobertura derivada; `unknown` nunca é `covered`

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T06
**Spec**: `docs/37-preparedness-state.md` §15.1, §24

**Context**: Com `holdings` (D-160) e `requirements` (D-161) aplicadas, o par
existe nos dois lados. Falta a leitura: quanto o que EXISTE satisfaz o que
DEVERIA existir. E o EOS já tinha **quatro** cálculos de prontidão convivendo —
um quinto seria defeito, não feature (`docs/37` §24.2).

**Decision**:

1. **Cobertura é derivada, nunca gravada.** Guardar prontidão criaria uma
   segunda verdade que envelhece em silêncio.

2. **Cinco estados**: `covered`, `partial`, `missing`, `unknown`,
   `not_applicable`. Nenhuma nota numérica nova.

3. **Consumível faz conta; durável é presença.** Consumível soma dentro do
   escopo, com conversão de unidade, contado uma vez. Durável cobre qualquer
   requisito alcançável daquele lugar — dois duráveis não cobrem "mais" que um,
   porque contar dois como cobertura dupla é exatamente a dupla contagem física
   que o modelo existe para impedir.

4. **Pior-vence no rollup**, na ordem `missing > partial > unknown > covered`.
   `partial` acima de `unknown` porque falta MEDIDA é acionável e merece gritar
   mais alto que incerteza; `unknown` acima de `covered` porque é o que garante
   a regra abaixo.

5. **`unknown` NUNCA sobe para `covered`.** Um desconhecido dentro de um
   conjunto coberto torna o conjunto `unknown`. Dado faltando que vira
   tranquilização é o mesmo erro do Pilot dizer "pode ir" sem saber.

6. **Conjunto VAZIO é `unknown`, não `covered`.** Um kit sem requisitos não
   está pronto — ninguém disse o que ele precisa. "Nada foi olhado" e "nada
   falta" não podem ter a mesma cor. É o jeito mais fácil de quebrar a regra 5
   sem perceber, e por isso tem teste próprio.

7. **Unidade não conversível vira `unknown`, nunca zero.** Tratar o
   desconhecido como ausente inventa uma falta; tratá-lo como presente inventa
   água. As duas mentem.

8. **A nota 0–100 é rebaixada no rótulo, não removida.** Deixa de se chamar
   "Resumo de prontidão" e passa a "Linha de base da casa", com a ressalva de
   que mede cinco recursos e **não** mede plano, kits nem treino. Um número
   honesto sobre pouco vale mais que um número vago sobre tudo.

**Consequence**:

- O EOS passa a poder responder "a Bug Out está pronta?" com um veredito
  explicável — quantos requisitos cobertos, quantos faltando, quantos incertos
  — em vez de uma nota que ninguém consegue defender.
- **Assimetria registrada como acompanhamento**: `kind`
  (`CONSUMABLE`/`DURABLE`) é propriedade do RECURSO, mas hoje mora no
  `Holding`. Enquanto não houver tabela de recursos, `resourceIsConsumable()`
  infere — do holding quando existe, da unidade quando não. Está isolado numa
  função só, com teste, para ter um lugar único quando virar coluna.
- Nada foi ligado a nenhuma tela além do rótulo. Consumir a cobertura na
  interface é PREP-T07.

**Não autorizado por D-162**: gravar cobertura, criar nota nova, mexer em
autonomia, backfill, cutover.

---

## D-161 — Kit e procedência viram colunas diferentes; `GERAL` é linha de base

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T05
**Spec**: `docs/37-preparedness-state.md` §17, §18

**Context**: `checklists.kit_type` guarda duas dimensões incompatíveis na mesma
coluna — propósito (`GERAL`, `BUG_OUT`, `ACAMPAMENTO`, `PESCA`, `CACA`) e
procedência (`EDU_CONTENT`, `PILOT_RECOMMENDATION`, `SIMULATION_DEBRIEF`) — e
essa coluna faz parte da chave única `(profile_id, canonical_key, kit_type)`.

Consequência, por desenho: o **mesmo** item recomendado pelo Pilot e pertencente
à Bug Out vira duas linhas que nunca se fundem. É o defeito S3 do `docs/37`.

**Decision**:

1. **`requirements` e `kits`, aditivas.** `checklists` continua intocada e
   continua sendo a verdade em produção; um adaptador projeta as linhas antigas.

2. **`provenance` é coluna própria e fica FORA da chave natural.** A chave é
   `(profile_id, resource_key, kit_id, scenario_id)`. O mesmo item achado por
   duas fontes **atualiza** a procedência; não cria segunda linha. Incluir
   procedência na chave recriaria, numa tabela nova, exatamente a duplicação
   que viemos desfazer.

3. **`NULL` na chave natural é tratado como valor**, via `COALESCE` com
   sentinela. Sem isso o Postgres aceitaria dois requisitos de linha de base do
   mesmo recurso como linhas distintas — duplicata de novo, por um detalhe de
   índice.

4. **`GERAL` deixa de ser kit e passa a ser LINHA DE BASE** (requisito sem
   `kit_id`). `lib/checklist.ts` sempre o descreveu como *"estoque e suprimentos
   para emergências em casa"* — isso não é uma mochila que se pega, é a casa.
   Descoberto ao escrever o adaptador: com `GERAL` mapeado para um kit, um item
   vindo do Pilot (sem kit) e o mesmo item em `GERAL` teriam chaves diferentes,
   e **a deduplicação prometida jamais dispararia sobre o dado real mais
   comum**. Kits de verdade passam a ser quatro: Bug Out, Acampamento, Pesca,
   Caça.

5. **`Kit` não tem discriminador de propósito** (D-157). Slug desconhecido é kit
   do usuário, não erro a descartar.

6. **A fusão preserva o melhor de cada linha**: o kit sobrevive (procedência não
   apaga pertencimento), a procedência mais informativa vence `MANUAL`, `met`
   vence `needed`, e a maior quantidade prevalece como leitura conservadora.

7. **Nada nasce como `proposed`.** Tudo que está em `checklists` hoje já passou
   por confirmação do usuário (D-092 / D-093 / D-119); marcar como proposto
   reabriria decisões que a família já tomou.

**Consequence**:

- O EOS passa a conseguir representar o que o modelo antigo não sabia: um item
  da Bug Out **sugerido pelo Pilot** — uma linha, com kit e procedência.
- `met` herdado do legado significa "a família marcou". No modelo novo `met` é
  **derivado** da cobertura por holdings; conciliar os dois é PREP-T06.
- Migração `20260813120000_preparedness_requirements_kits.sql` escrita e
  **pendente de aplicação pelo dono** no SQL Editor.

**Não autorizado por D-161**: backfill, cutover, motor de cobertura, mudança de
tela.

---

## D-160 — Holdings e Locations nascem ao lado do legado, não no lugar dele

**Date**: 2026-08-13
**Status**: DECIDED
**Roadmap**: PREP-T04
**Spec**: `docs/37-preparedness-state.md` §15, §16, §28

**Context**: D-155 definiu que o núcleo da Preparação é o par
`Requirement ↔ Holding`. PREP-T04 é o estágio 1 do §28 — aditivo — e cria o
lado **Holding**: o que a família tem, e onde.

`resource_inventory` é uma linha por perfil com sete escalares. Não representa
objeto, quantidade por objeto nem lugar; é por isso que "onde está minha água
de reserva?" não tem resposta possível hoje.

**Decision**:

1. **Duas tabelas novas, vazias, ao lado das antigas.** `locations` (árvore por
   `parent_id`) e `holdings`. Nada é alterado, removido ou migrado.
   `resource_inventory` e `checklists` continuam sendo a verdade.

2. **Um adaptador projeta o legado**, e é ele que o app lê. Enquanto as tabelas
   novas estiverem vazias — ou nem existirem —, o estado vem dos sete escalares,
   e o número na tela não muda. `lib/holdings-store.ts` é a porta única.

3. **Itens de checklist NÃO viram Holdings.** Item marcado carrega quantidade
   **planejada**, não medida, e carrega `kit_type`, não lugar. Ele é
   `Requirement` com estado `met` — PREP-T05. Projetá-lo como Holding
   reintroduziria, numa camada mais funda, o defeito que PREP-T11 removeu.
   *(Este ponto corrige um critério de aceitação que eu mesmo havia escrito no
   roadmap antes de codificar.)*

4. **`CONSUMABLE` × `DURABLE` no banco**, não como convenção. É o que impede um
   torniquete de virar quatro torniquetes sem sistema de reserva: consumível
   conta quantidade dentro de um lugar; durável é presença e cobre qualquer
   requisito alcançável dali.

5. **Unidade é coluna.** Um galão de 5 é `5` + `gal`. A conversão para litros
   acontece num lugar só (`toLiters`), e **unidade desconhecida é ignorada,
   nunca chutada** — palpite viraria autonomia inventada.

6. **A autonomia nova tem que dar exatamente a antiga.** Provado por teste sobre
   seis cenários. Uma quinta conta de prontidão seria defeito, não feature.

7. **O código funciona com a migração não aplicada.** Só `42P01` degrada;
   qualquer outro erro estoura. Mascarar falha de leitura num app de emergência
   é o equivalente a dizer "pode ir" sem saber.

8. **RLS igual ao contrato existente**: `profile_id = auth.uid()`. Um lugar é
   pelo menos tão sensível quanto uma quantidade — "gerador e 200 galões na
   fazenda, nesta coordenada" é exatamente o que não pode vazar por padrão.

**Consequence**:

- A migração está escrita e **precisa ser aplicada pelo dono no SQL Editor** do
  Supabase: o ambiente do agente não tem credencial de banco (mesmo padrão de
  D-038 e do Stripe). Até lá, o app roda projetando o legado.
- Nenhuma tela muda. PREP-T04 é fundação; a superfície é PREP-T07.
- O outro lado do par (`requirements`, `kits`) é PREP-T05, de propósito: juntar
  os dois numa migração só repetiria a confusão que estamos desfazendo.

**Não autorizado por D-160**: backfill, cutover, mudança de tela, compartilhamento
de holdings com o círculo.

---

## D-159 — A régua da água é a da FEMA: 1 galão por pessoa por dia

**Date**: 2026-08-12
**Status**: DECIDED
**Roadmap**: PREP-T12 (esta decisão), PREP-T11 (execução), PREP-T13 (limiares)
**Spec**: `docs/37-preparedness-state.md` §15.3
**Decisor**: dono do produto

**Context**: D-158 deixou aberto qual divisor usar. O EOS usa **3 L**/pessoa/dia
(`lib/household.ts:170`, `WATER_PER_PERSON_DAY = 3`), com o literal duplicado em
`lib/simulation-debrief.ts:76` e `components/world-v2/useWorldData.ts:104`, e
travado por `household.test.ts:73`. A FEMA — cujo `FEMA_Emergency_Supply_List.pdf`
o próprio EOS distribui no EDU — publica **1 galão por pessoa por dia**.

**Decision**:

1. **A constante passa a ser 1 galão americano = 3,785 L por pessoa por dia.**
2. **Ela existe em UM lugar.** As três cópias do literal `3` são consolidadas
   numa constante só, importada pelos três consumidores.
3. **A mudança é comunicada ao usuário, uma vez, explicitamente.** Ver abaixo.

**Consequence**:

- A autonomia exibida cai **~21%** para todo usuário. Uma casa que mostra 5 dias
  passa a mostrar 4. Um veredito que estava `watch` pode virar `warning`.
- **Ninguém ficou menos preparado — a régua é que estava curta.** E é por isso
  que a queda **não pode ser silenciosa**: num app de emergência, um número de
  segurança que piora sozinho, sem explicação, é lido como perda de estoque ou
  como defeito. O usuário conclui a coisa errada exatamente sobre o número que
  mais precisa ser confiável.
  → PREP-T11 exibe, uma vez, uma nota curta: *"A régua da água passou a ser a da
  FEMA — 1 galão por pessoa por dia. Seu estoque não mudou; a conta ficou mais
  rigorosa."*
- O número passa a ser **citável na fonte**. "1 galão por pessoa por dia, FEMA"
  é verificável; "3 litros" não vinha de lugar nenhum.
- `household.test.ts:73` (`expect(WATER_PER_PERSON_DAY).toBe(3)`) deixa de valer
  e é atualizado junto, no mesmo commit. Um teste que trava um número errado é
  parte do erro.
- **Sub-questão levantada e NÃO decidida aqui** → PREP-T13: os limiares da nota
  (`PreparednessPage.tsx:751`, `threshold={4}` / `criticalThreshold={2}` litros
  por pessoa, **absolutos, não por dia**) equivalem a ~1,06 gal e ~0,53 gal — ou
  seja, "adequado" hoje significa **1 dia de água**, enquanto o mínimo da FEMA é
  **3 dias**. PREP-T11 converte 1:1 e preserva o rigor atual; se "adequado = 1
  dia" é fraco demais é decisão própria, para não embutir duas mudanças de
  severidade na mesma entrega.

**Não autorizado por D-159**: mudar limiares da nota, migração, mudança de rota.

---

## D-158 — Água é medida em GALÃO; unidade nunca contradiz o nome do campo

**Date**: 2026-08-12
**Status**: DECIDED
**Roadmap**: PREP-T11 (exibição), PREP-T04 (canônico)
**Spec**: `docs/37-preparedness-state.md` §15.3
**Decisor**: dono do produto

**Context**: O EOS exibe água em litros. Todas as fontes autoritativas do
produto são americanas — FEMA, NWS, NHC, National Shelter System — e a FEMA
publica o padrão em **1 galão por pessoa por dia**. A base de conhecimento do
próprio EOS carrega `FEMA_Emergency_Supply_List.pdf`.

O dono decidiu: **usar galão em vez de litro**.

A auditoria do código encontrou dois problemas adjacentes que essa mudança
expõe, e que não podem ser resolvidos por conversão:

1. **A constante do EOS é 3 L/pessoa/dia** — `lib/household.ts:170`
   (`WATER_PER_PERSON_DAY = 3`), duplicada literalmente em
   `lib/simulation-debrief.ts:76` e `components/world-v2/useWorldData.ts:104`,
   e travada por `household.test.ts:73`. **1 galão = 3,785 L.** O EOS opera
   ~21% abaixo do padrão que ele distribui no EDU.
2. **Os limiares da nota são absolutos por pessoa, não por dia**
   (`PreparednessPage.tsx:751`, `threshold={4}` / `criticalThreshold={2}`) e não
   conversam com a constante de 3 L/dia: 4 L/pessoa é 1,33 dia.

**Decision**:

1. **Galão é a unidade de exibição do produto para água.** Vale para a tela de
   Preparação, o Pilot, o veredito, o debrief e o EDU.

2. **Nenhum número é gravado em campo cujo nome contradiga a unidade.**
   `resource_inventory.water_liters` continua em **litros** até que a migração
   do PREP-T04 renomeie o campo. Gravar galão num campo chamado `_liters` seria
   a próxima linha da seção "Critical Field Name Notes" de `06-data-model.md`.
   → **PREP-T11 muda a exibição, não o armazenamento.**

3. **No modelo novo, unidade é dado, não convenção.** `Holding` carrega
   `quantity` + `unit` explícitos: um galão de 5 é gravado como `5 gal`. A
   conversão para a unidade-base acontece na matemática de cobertura, uma vez,
   num lugar só.

4. **A constante de água por pessoa/dia passa a existir em UM lugar.** Hoje são
   três cópias do literal `3`. Consolidação entra em PREP-T11.

**Consequence**:

- O produto fala a língua das suas fontes. "1 galão por pessoa por dia" é
  citável direto da FEMA; "3 litros" não é citável de lugar nenhum.
- **Pergunta aberta, deliberadamente não decidida aqui:** adotar 1 gal (3,785 L)
  em vez de 3 L **reduz a autonomia exibida de todo usuário em ~21%**. Uma casa
  que hoje mostra 5 dias passaria a mostrar 4. Isso é decisão de produto, não
  refatoração, e precisa de entrada própria antes de PREP-T11 executar.
- Enquanto a constante não for decidida, PREP-T11 converte a exibição sem mexer
  no divisor: mesma autonomia, unidade nova.

---

## D-157 — Todo kit é Preparação; não existe classe "lazer"

**Date**: 2026-08-12
**Status**: DECIDED
**Roadmap**: PREP-T05
**Spec**: `docs/37-preparedness-state.md` §17
**Decisor**: dono do produto

**Context**: `lib/checklist.ts` define Pesca 🎣, Caça 🦌 e Acampamento 🏕 ao lado
de Bug Out 🎒 e Geral 🏠. `docs/36` §10 perguntou se esses três são preparação ou
lazer — se fossem lazer, `Kit` precisaria de um discriminador e a Preparação
carregaria dois propósitos.

**Decision**:

1. **Todo kit é Preparação.** Pesca, Caça, Acampamento, Bug Out, Geral — e
   **qualquer kit que o usuário venha a criar**.
2. **`Kit` não recebe discriminador de propósito.** Nenhum atributo
   `is_preparedness`, nenhuma separação entre kits "sérios" e kits "de lazer".
3. Os requisitos de qualquer kit contam para a prontidão **daquele kit**. A
   autonomia da casa continua lendo consumíveis sob CASA (D-156) —
   independentemente de qual kit os reivindica.

**Consequence**:

- Uma entidade a menos e um atributo a menos. O modelo fica mais simples por uma
  decisão de produto, não por corte técnico.
- É coerente com a tese do EOS: o equipamento que sustenta um fim de semana de
  pesca é o mesmo que sustenta três dias sem energia. Chamar um de lazer criaria
  duas prontidões para o mesmo cobertor.
- Kits criados pelo usuário são dados, nunca navegação global (D-155 item 12).

---

## D-156 — A autonomia da casa lê a água que está EM CASA

**Date**: 2026-08-12
**Status**: DECIDED
**Roadmap**: PREP-T11 (correção), PREP-T04/T06 (modelo)
**Spec**: `docs/37-preparedness-state.md` §15.2
**Decisor**: dono do produto, resposta direta à pergunta aberta de D-155

**Context**: A pergunta que travava PREP-T04 era se os sete escalares de
`resource_inventory` e os itens de checklist são o mesmo objeto. Hoje eles são
ligados por `getInventoryDelta()` (`components/world-v2/PreparednessPage.tsx:301`),
que **sobrescreve** o escalar com a quantidade do item marcado. Uma casa com
20 L que marca um item de "Água 4 L" da mochila Bug Out fica com **4 L** — o
número que alimenta a autonomia, o veredito em repouso e o Pilot.

O dono respondeu: *"A água que deve ser lida é a que está estocada na CASA/HOME."*

**Decision**:

1. **A autonomia da casa lê os holdings consumíveis cuja localização está sob
   CASA.** Não lê "o último item de checklist marcado".

2. **Um item de checklist nunca sobrescreve o estoque da casa.** Marcar um item
   registra que ele foi adquirido; onde ele passa a existir é uma questão de
   localização, não de sobrescrita.

3. **Água guardada na mochila de evacuação, com a mochila em casa, CONTA na
   autonomia da casa.** Ela está fisicamente lá e numa emergência seria bebida;
   não contá-la subestimaria a autonomia real.

4. **O mesmo consumível é contado uma vez só.** Quando a Bug Out for aberta, o
   EOS mostra que aqueles litros já estão sendo contados pela casa. O conflito
   fica **visível**, nunca escondido, e nunca duplicado — é a regra de
   `CONSUMABLE` de `docs/37` §15.1.

5. **Sair de casa muda a conta.** Um holding cuja localização deixa de estar sob
   CASA (mochila movida para o carro) sai da autonomia da casa automaticamente.
   A localização é o discriminador; não existe marcação manual de "reservado".

**Consequence**:

- A pergunta aberta de D-155 está respondida: os sete escalares e os itens de
  checklist **não são o mesmo objeto**. São a mesma coisa vista em duas
  granularidades, e quem os concilia é a **localização** — não uma expressão
  regular sobre o nome do item.
- `getInventoryDelta()` deixa de ter razão de existir na forma atual. A correção
  vira **PREP-T11**, com regra já decidida, e executa **antes** de PREP-T04.
- Nada em D-155 é retirado. Esta decisão fecha a lacuna que ele deixou aberta.

> **CORREÇÃO — 2026-08-12, durante a execução de PREP-T11.**
> Este bloco afirmava que havia **perda de dado** ("20 L viram 4 L ao marcar um
> item de 4 L"). **Está errado, e a afirmação era minha, não do dono.**
> `PreparednessPage.tsx:533` aplicava `Math.max(inv.water_liters, delta.water_liters)`
> desde o commit `f75a7c4` — o estoque **nunca encolhia**.
>
> O defeito é real, mas é outro, e nenhuma das decisões acima muda por causa
> disso:
> 1. **Quantidade planejada virava quantidade medida.** Um item "Água 20 gal"
>    marcado definia o estoque da casa em 20, tivesse a família 20 ou 3.
> 2. **Água de mochila virava água de casa.** A regra ignorava o `kit_type`:
>    um garrafão listado na Bug Out subia o estoque DA CASA.
>
> Os dois são a confusão `Requirement`/`Holding` (S4), e o remédio decidido aqui
> — parar de escrever — vale igual. A urgência é que era menor: não havia perda
> de dado a estancar. Registrado como correção e não como reescrita, porque a
> decisão continua válida; só a justificativa estava exagerada.

**Não autorizado por D-156**: migração, mudança de rota, reorganização de tela.

---

## D-155 — Preparedness State: o laço fechado já existe; o que falta é o estado

**Date**: 2026-08-12
**Status**: DECIDED
**Roadmap**: PREP-T03
**Spec**: `docs/37-preparedness-state.md`

**Context**: A proposta trazida ao Spine era construir um "sistema de preparação
em laço fechado": EDU, simulação, alerta oficial, Pilot e mudanças de estado
entrando todos no mesmo laço, produzindo ações confirmadas que melhoram o estado
real da família.

A auditoria do código (2026-08-12) mostrou que **o laço já existe e roda em
produção — três das quatro entradas estão implementadas**: EDU→ação (D-119),
debrief da simulação→ação (D-092) e Pilot→ação (D-093), todas com confirmação
obrigatória antes de escrita persistente. Registrar PREP-T03 como "criar o laço"
descreveria mal o repositório.

O gargalo real é o **estado sobre o qual o laço raciocina**, e ele tem seis
defeitos verificados:

1. `resource_inventory` é **uma linha por perfil** com 7 escalares
   (`UNIQUE (profile_id)`, `supabase/schema.sql:109`). Não existe objeto, nem
   quantidade por objeto, nem lugar.
2. Não existe modelo de localização — nem tabela, nem coluna, nem conceito.
3. `checklists.kit_type` mistura propósito (`GERAL`, `BUG_OUT`, `PESCA`…) com
   procedência (`EDU_CONTENT`, `PILOT_RECOMMENDATION`, `SIMULATION_DEBRIEF`) —
   **dentro da chave única** `(profile_id, canonical_key, kit_type)`. O mesmo
   item recomendado pelo Pilot e pertencente ao Bug Out vira duas linhas que
   nunca se fundem, por desenho.
4. "O que preciso" e "o que tenho" são ligados por expressão regular
   (`getInventoryDelta()`, `PreparednessPage.tsx:301`).
5. Prontidão é calculada de **quatro** formas incompatíveis: `calcReadiness()`
   0–100, `/api/ai/readiness`, `autonomyDays()` e `restingVerdict()`.
6. Alerta oficial termina em cartão de notificação. Validação de severidade e
   deduplicação **já existem** (`sourceKeyFor()` + `circle_notifications.source_key`);
   falta a reavaliação.

**Decision**:

1. **A tese é VÁLIDA COM MUDANÇAS.** O princípio de laço fechado vira canônico,
   com a correção de que ele não é novo: PREP-T03 adiciona a quarta entrada
   (alertas) e conserta o estado, não inventa o laço.

2. **O objeto central da Preparação é o par `Requirement ↔ Holding`**, unido por
   `resource_key` (hoje `canonical_key`). Não existe um objeto único
   "PreparednessItem" — a ambiguidade entre precisar e ter é exatamente o
   defeito 4, e promovê-la a entidade a gravaria no esquema.

3. **Cinco entidades novas, nenhuma a mais**: `Holding`, `Requirement`,
   `Location`, `Kit`, `ReadinessAssessment`. Kit, Localização, Categoria e
   Procedência são **quatro dimensões independentes**; juntar quaisquer duas
   reproduz o defeito 3.

4. **`PreparednessTrigger` é REJEITADO como entidade.** Um gatilho é evento: não
   tem ciclo de vida, dono nem identidade visível, e nada consulta "meus
   gatilhos". O que precisa persistir é o **resultado** — `ReadinessAssessment`
   com `trigger_type` + `trigger_key` —, reaproveitando o padrão de dedup já
   provado em `circle_notifications.source_key`.

5. **Alertas são gatilhos, não conteúdo.** Evento oficial → relevância
   determinística → gatilho → montagem de contexto → Rules Engine → Pilot quando
   útil → propostas com procedência → confirmação.

6. **Autoridade determinística é inegociável.** A LLM não decide se existe aviso
   oficial, não sobrepõe aviso oficial, não amolece resultado crítico do Rules
   Engine e não decide relevância geográfica. Já implementado em
   `lib/pilot-guard.ts`; D-155 estende a mesma autoridade ao caminho de alerta.

7. **Nenhuma escrita silenciosa.** Pilot, EDU, simulação e alerta **propõem**;
   o usuário confirma. Sem exceção.

8. **Contagem física honesta sem sistema de almoxarifado.** Um atributo resolve:
   `CONSUMABLE` conta quantidade dentro de uma localização e é consumido;
   `DURABLE` é presença e atende qualquer número de requisitos alcançáveis
   daquela localização. Um torniquete serve Primeiros Socorros, Bug Out e
   Furacão — e **não** serve o kit do Veículo, porque não está no veículo. A
   localização faz o trabalho que uma reserva faria.

9. **Ciclo de aquisição de três estados**: `proposed → needed → met`, mais
   `not_applicable`. Os oito estados propostos são software de compras; seis
   deles são afordância de UI ou derivados. `met` é **derivado**, nunca marcado à
   mão — não se marca prontidão, adquire-se coisas.

10. **Zero notas novas.** Já existem quatro cálculos de prontidão. Prontidão
    passa a ser cobertura derivada (`covered/partial/missing/unknown/
    not_applicable`), com regra pior-vence e a invariante de que **`unknown`
    nunca sobe para `covered`**. A nota 0–100 existente é mantida e rebaixada ao
    que ela honestamente é: uma nota de linha de base sobre cinco recursos.

11. **Evolução aditiva, nunca reescrita.** `resource_inventory` e `checklists`
    continuam válidos e funcionando. Estágios: aditivo → adaptadores → escrita
    dupla → backfill → cutover explícito → aposentadoria. Nenhum passo
    irreversível antes do cutover. **Nenhuma migração roda em PREP-T03.**

12. **Localizações e kits são dados do usuário, nunca navegação global.**
    "Fazenda" e "Pesca" são linhas; podem virar filtros e visões; não viram abas.

**Consequence**:

- O Spine passa a ter um modelo de estado único que EDU, Simulação, Pilot,
  Alertas e Plano leem e escrevem, em vez de cinco visões privadas.
- `docs/37-preparedness-state.md` é a especificação canônica de estado;
  `docs/20-preparedness-engine.md` continua sendo a especificação de alto nível.
- **`docs/36` é superado apenas no eixo de subtópicos**: `Em casa` (localização)
  e `Mochilas` (kits) colocavam duas dimensões independentes no mesmo eixo. O
  eixo correto é `o que eu tenho` (Holdings, filtráveis por localização) × `o que
  falta` (Requirements, agrupados por kit/cenário). O resto de `docs/36` segue
  válido.
- A sequência recomendada **não deixa a IA por último**: PREP-T07 (reorganização
  da Preparação) entra em quarto, depois que Holdings/Requirements/cobertura
  existirem — cedo o bastante para o dono sentir o ganho, tarde o bastante para
  a interface não prometer o que o domínio não sustenta.
- Três defeitos ficam **documentados e não corrigidos** nesta tarefa
  (`docs/37` §34), sendo o mais grave `getInventoryDelta()` **sobrescrever** em
  vez de somar: uma casa com 20 L que marca um item de 4 L fica com 4 L.

**Não autorizado por D-155**: migração de banco, mudança de rota, componente,
API, BottomNav, reorganização da tela de Preparação, e o início de PREP-T04.

---

## D-154 — `Resolver` do card de risco deve navegar explicitamente para Preparação

**Date**: 2026-08-12
**Status**: DECIDED
**Roadmap**: WV2-T26

**Context**: O card de risco da World v2 mostra quando a casa está abaixo do
mínimo e oferece a ação `Resolver`, mas o clique não produzia navegação
perceptível. Em emergência, um veredito acionável não pode parecer texto
decorativo nem depender de um link silencioso dentro do painel.

**Decision**:

1. `Resolver` no veredito doméstico navega explicitamente para `/preparedness`.
2. A ação usa botão real com `router.push`, mantendo feedback tátil e destino
   único.
3. A faixa mobile mantém a mesma rota para não criar dois destinos para o mesmo
   problema.

**Consequence**: tocar em `Resolver` leva diretamente para Preparação, onde o
usuário consegue corrigir água/comida/checklist.

---

## D-142 — Vento animado precisa ser um layer engine, não um efeito dentro do React

**Date**: 2026-08-10
**Status**: DECIDED
**Roadmap**: WV2-T14

**Context**: A primeira tentativa de vento animado mostrou movimento, mas ainda
parecia fake em padrões amplos: o renderer interpolava direto no componente e
ficava fácil extrapolar demais ou piscar ao trocar dados. O dono trouxe um prompt
mais preciso baseado em Windfinder/earth.nullschool: canvas overlay, pool de
partículas, bilinear sobre grid U/V, pause em background e interface
`enable/disable/updateViewport`.

**Decision**:

1. Criar um módulo independente `WindParticleLayer`, sem estado React por frame.
2. O módulo recebe `canvas`, `map`, `readings` e expõe `enable()`, `disable()`,
   `setData()`, `updateViewport()` e `destroy()`.
3. O grid de dados continua vindo do provider público atual, mas é normalizado
   em eixos `lat/lng` e interpolado por bilinear quando possível.
4. Fora do grid, a partícula é reposicionada; o renderer não inventa vento em
   área sem dado.
5. A animação usa somente fade de rastro estável. Não haverá raster/wash
   colorido redesenhado por blocos enquanto isso causar flicker.
6. Parâmetros de densidade, fade, largura de linha e escala de cor ficam em um
   objeto de configuração para ajuste posterior.

**Consequence**: o efeito deixa de ser um adorno acoplado ao `WorldMap` e vira
um adapter visual testável. O visual pode evoluir para HRRR/GFS e mais partículas
sem misturar fetch, React e render loop.

---

## D-143 — Vento premium combina campo escalar em canvas e partículas vetoriais

**Date**: 2026-08-10
**Status**: DECIDED
**Roadmap**: WV2-T15

**Context**: O dono pediu que o vento fosse legível no WorldMap inteiro, não
apenas perto da localização do usuário, e explicitou que a camada não pode ser
um raster tile layer como satélite/radar. A leitura visual precisa nascer de
dados numéricos de grade: para cada pixel visível, o cliente interpola o valor
do grid e aplica uma escala de cor. A animação de partículas continua útil para
direção, mas não deve ser o único sinal visual.

**Decision**:

1. A camada `wind` premium passa a ter dois canvases independentes:
   - um canvas de campo escalar, renderizado no cliente a partir de magnitude do
     vento interpolada por bilinear;
   - um canvas de partículas vetoriais por cima, para mostrar direção e fluxo.
2. O campo escalar não usa tiles de imagem, não reutiliza o loader de tiles de
   satélite/radar e não busca raster pré-renderizado de servidor.
3. A área buscada acompanha o viewport do mapa, com grade mais ampla para zoom
   global e recarga apenas em mudança significativa de câmera.
4. O canvas escalar é renderizado apenas quando dados/viewport mudam; o loop de
   `requestAnimationFrame` continua exclusivo das partículas para evitar flicker.
5. A feature permanece premium: usuário sem Premium não inicia fetch amplo,
   canvas, loop ou renderizador pesado; tocar em `Vento PREMIUM` leva ao upgrade.

**Consequence**: a camada passa a se comportar como Windfinder/earth.nullschool
em arquitetura, mas dentro do EOS: MapLibre fornece projeção/câmera, o EOS
calcula a imagem visível a partir do grid numérico e o provider meteorológico
pode evoluir sem trocar a superfície.

---

## D-144 — Vento é modo de mapa premium, não chip empilhado com satélite

**Date**: 2026-08-10
**Status**: DECIDED
**Roadmap**: WV2-T16

**Context**: O teste de uso real mostrou que tratar `Vento` como mais uma
camada empilhada sobre `Escuro`/`Satélite` criou uma experiência confusa e pesada:
o usuário esperava entrar numa leitura mundial do vento, mas via apenas uma
animação sobre a câmera atual. Além disso, renderizar campo escalar durante
pan/zoom travava o mapa.

**Decision**:

1. `Vento` passa a ser uma opção de base/visualização premium junto de
   `Escuro` e `Satélite`.
2. Ao selecionar `Vento`, o app liga o renderer premium, troca para câmera
   mundial plana e mostra o comportamento global do vento.
3. Ao voltar para `Escuro` ou `Satélite`, o app desliga o modo de vento para não
   sobrepor experiências incompatíveis.
4. O campo escalar não deve recalcular durante drag/zoom contínuo; redesenha
   depois que a câmera estabiliza ou quando chegam novos dados.
5. A grade global precisa ser mais densa e buscada em blocos para representar
   regiões diferentes do mundo sem depender de raster tile.

**Consequence**: a experiência passa a seguir o padrão mental do Windfinder:
escolher `Vento` muda o modo de leitura do mapa, não apenas adiciona um efeito.
Premium continua bloqueando renderer/fetch/canvas para usuário free.

---

## D-145 — Vento premium sincroniza com Hurricane Tracker sem provider pago

**Date**: 2026-08-10
**Status**: DECIDED
**Roadmap**: WV2-T17

**Context**: O modo Vento mundial existe, mas a grade gratuita global suaviza o
centro de ciclones tropicais. O resultado fica incoerente: o Hurricane Tracker
pode mostrar um sistema intenso enquanto o campo de vento animado parece fraco
perto do centro. O dono pediu alta fidelidade sem contratar provider novo,
usando Open-Meteo e os dados já disponíveis do tracker NHC.

**Decision**:

1. A API de vento continua Open-Meteo gratuita, usando `models=best_match`,
   `cell_selection=nearest` e frames horários cacheados no mesmo fetch.
2. O modo Vento passa a ter um `currentTime/currentFrame` que controla o frame
   do campo de vento e a leitura do Hurricane Tracker.
3. Quando há ciclone ativo, o renderer mistura o vento de fundo Open-Meteo com
   um perfil paramétrico local baseado em posição e vento máximo sustentado do
   NHC. Se raios oficiais de vento existirem depois, eles entram como parâmetros
   do mesmo perfil.
4. A transição entre perfil ciclônico e campo de fundo deve ser suave; não pode
   haver salto visual no limite da tempestade.
5. Zoom manual segue usando a mesma rota e busca em blocos; não duplicar lógica
   de provider nem criar API paga.

**Consequence**: EOS deixa de depender da resolução bruta do modelo global para
representar intensidade perto do olho. A visualização continua honesta: fundo =
Open-Meteo; núcleo tropical = NHC + perfil físico simplificado.

---

## D-146 — Vento animado precisa ser visível também em vento fraco

**Date**: 2026-08-10
**Status**: DECIDED
**Roadmap**: WV2-T18

**Context**: Depois de D-145, produção mostrava o campo escalar e a leitura local
de vento, mas os rastros animados quase não apareciam em regiões com vento baixo
ou moderado. O dado estava presente; o problema era visual: deslocamento
subpixel, linha fina e cores muito próximas da base azul/verde.

**Decision**:

1. O renderer deve manter direção e intensidade relativas, mas garantir um
   comprimento mínimo de rastro em tela para que o usuário perceba circulação.
2. Vento fraco não deve sumir; usa linha ciano/branca com opacidade suficiente,
   enquanto ventos fortes continuam amarelo/vermelho/branco.
3. Esse ajuste é somente visual. Não altera provider, cálculo de velocidade,
   popup nem leitura numérica.

**Consequence**: O modo Vento deixa de parecer um raster estático quando a região
tem vento fraco. A camada animada comunica fluxo mesmo sem tempestade ativa.

---

## D-147 — Vento animado deve parecer fluxo contínuo, não ticks piscando

**Date**: 2026-08-10
**Status**: DECIDED
**Roadmap**: WV2-T19

**Context**: D-146 resolveu contraste, mas expôs outro problema: o renderer
desenhava um rastro mínimo maior que o deslocamento real da partícula. O usuário
passou a ver pequenos segmentos aparecendo e desaparecendo, não fluxo. A
referência correta é um campo com caudas contínuas, onde o movimento deixa uma
memória visual que se apaga gradualmente.

**Decision**:

1. O deslocamento mínimo deve mover a própria partícula, não desenhar uma linha
   artificial desconectada da posição seguinte.
2. O fade deve preservar frames anteriores por mais tempo, criando cauda real.
3. Partículas devem viver mais tempo antes de respawn, reduzindo sensação de
   nascimento/sumiço.
4. O ajuste continua visual: não altera velocidade reportada, popup, API nem
   provider.

**Consequence**: O modo Vento passa de pontos/ticks visíveis para streamlines
animadas contínuas, mais próximas de Windfinder/earth.nullschool.

---

## D-148 — Vento animado não pode desenhar saltos retos de projeção

**Date**: 2026-08-10
**Status**: DECIDED
**Roadmap**: WV2-T20

**Context**: Com caudas contínuas, alguns artefatos ficaram visíveis como linhas
retas longas. Eles não são vento: são saltos de projeção quando a partícula
cruza borda/cópia do mundo ou reaparece perto do limite da grade, e o canvas
liga o ponto antigo ao novo.

**Decision**:

1. O renderer deve escolher a cópia horizontal mais próxima do ponto anterior
   quando o mapa mostra o mundo repetido.
2. Segmentos acima de um limite visual plausível devem ser descartados e a
   partícula deve renascer sem desenhar linha.
3. Esse guardrail vale apenas para o canvas animado; não altera campo escalar,
   vetor, velocidade ou popup.

**Consequence**: Linhas retas artificiais desaparecem, preservando apenas o
fluxo curvo/contínuo produzido pelos vetores de vento.

---

## D-149 — Densidade e velocidade do vento devem ser locais ao viewport

**Date**: 2026-08-11
**Status**: DECIDED
**Roadmap**: WV2-T21

**Context**: No modo global, as partículas eram distribuídas pela grade inteira.
Ao aproximar o zoom, a viewport passava a cobrir uma fração pequena do mundo e a
tela ficava com poucos segmentos visíveis, às vezes um ou zero. Além disso, o
passo visual mínimo deixava ventos fracos e fortes parecidos demais.

**Decision**:

1. Partículas devem nascer prioritariamente dentro da viewport visível, com uma
   margem pequena, para manter densidade visual ao dar zoom.
2. Partículas que saírem muito da viewport devem ser recicladas para dentro da
   área visível, sem desenhar linha de salto.
3. O passo mínimo deixa de ser igual para todos: ventos fracos continuam mais
   lentos, ventos fortes avançam mais rápido, preservando legibilidade sem
   igualar velocidades.
4. Não alterar API, provider, popup, valor numérico nem o campo escalar.

**Consequence**: O usuário vê fluxo contínuo tanto no mapa mundial quanto perto
do próprio ponto, e a animação comunica intensidade relativa do vento.

---

## D-150 — Usuário controla densidade e rastro do vento

**Date**: 2026-08-11
**Status**: DECIDED
**Roadmap**: WV2-T22

**Context**: Manter densidade no zoom resolveu o sumiço de partículas, mas o
padrão ficou visualmente poluído para alguns usuários. O modo Vento precisa ser
legível por padrão e ajustável por preferência pessoal.

**Decision**:

1. O modo Vento terá controles visíveis para quantidade de partículas e tamanho
   do rastro.
2. O padrão deve ser menos carregado que WV2-T21.
3. Ajustar os sliders não deve refazer fetch de vento nem remontar o mapa; deve
   atualizar somente o renderer imperativo.
4. A velocidade relativa continua vindo do vetor: vento fraco mais lento, vento
   forte mais rápido.

**Consequence**: O usuário pode escolher entre uma leitura limpa ou uma leitura
mais parecida com Windfinder/earth.nullschool, sem custo extra de provider.

---

## D-151 — Controles de vento colapsam no mobile

**Date**: 2026-08-11
**Status**: DECIDED
**Roadmap**: WV2-T23

**Context**: Os sliders de `Fluxo` e `Rastro` resolveram a preferência visual,
mas no celular o painel ficou escondido ou competindo com o bottom nav e os
controles do mapa. Controle que existe mas não é alcançável no mobile não serve.

**Decision**:

1. No desktop, a legenda/controles do vento podem ficar abertos.
2. No mobile, o painel deve ficar em posição lateral e colapsado por padrão,
   abrindo com um botão compacto.
3. Ao expandir, os sliders devem continuar ajustando o renderer imediatamente,
   sem fetch novo e sem remontar o mapa.
4. O painel expandido não pode cobrir a navegação inferior nem a coluna de
   controles principais do mapa.

**Consequence**: O modo Vento continua ajustável no celular sem esconder os
sliders nem poluir permanentemente a tela.

---

## D-152 — Painel de vento vira controle flutuante colapsável com transparência

**Date**: 2026-08-11
**Status**: DECIDED
**Roadmap**: WV2-T24

**Context**: O painel de vento ainda podia ficar escondido atrás do painel
principal no desktop, e faltava controle de transparência para enxergar melhor o
mapa base. O comportamento desejado é um controle flutuante que aparece e
desaparece sob comando, fecha ao tocar fora e não força o usuário a aceitar uma
opacidade fixa.

**Decision**:

1. O painel de vento deve ser colapsável em desktop e mobile.
2. O botão compacto `Vento` abre/fecha o painel; clicar fora recolhe.
3. No desktop, o painel fica à esquerda, mais ao centro da viewport, deslocado
   para fora do painel principal.
4. Adicionar slider `Mapa` para controlar a transparência do overlay de vento.
5. Sliders continuam alterando apenas o renderer/canvas, sem novo fetch e sem
   remontar o mapa.

**Consequence**: O modo Vento fica controlável sem esconder mapa, painel
principal ou navegação, e a leitura pode priorizar vento ou mapa conforme o
usuário quiser.

---

## D-153 — Setas fallback do vento também são controláveis

**Date**: 2026-08-11
**Status**: DECIDED
**Roadmap**: WV2-T25

**Context**: Mesmo com controle de partículas, rastro e transparência do overlay,
as setas azuis/números do fallback vetorial continuavam visíveis e podiam poluir
a leitura. Elas são úteis como fallback e orientação, mas devem ser opcionais.

**Decision**:

1. Adicionar slider `Setas` no painel de vento.
2. Valor 0 oculta completamente ícones e labels da camada `eos-wind`.
3. Valor máximo restaura tint/labels em opacidade cheia.
4. O controle altera apenas propriedades de paint do MapLibre; não altera dados,
   provider, canvas, popup ou fetch.

**Consequence**: O usuário pode escolher entre leitura puramente por partículas
ou partículas + setas numéricas.

---

## D-141 — Vento animado é camada premium no mapa existente

**Date**: 2026-08-09
**Status**: DECIDED
**Roadmap**: WV2-T13

**Context**: O dono pediu uma visualização de vento inspirada conceitualmente em
Windfinder, mas sem criar outro mapa, sem copiar código/asset/design/dado, e sem
carregar renderer pesado para usuário free. A arquitetura atual já tem MapLibre e
uma camada `wind` em `WorldMap`; criar uma tela paralela quebraria o Spine da
World v2.

**Decision**:

1. A camada `wind` passa a suportar partículas/streamlines animadas dentro do
   `WorldMap` existente.
2. O provider de vento expõe componentes vetoriais `uMps` e `vMps`; velocidade e
   direção continuam deriváveis, sem hardcode em fixture.
3. V1 usa a grade atual Open-Meteo como fonte pública/keyless. HRRR/NOAA e GFS
   ficam como adapters futuros do mesmo contrato vetorial.
4. A camada animada é premium. Usuário free vê `Vento PREMIUM`; tocar nela manda
   para o upgrade sem iniciar canvas/loop/requisição de vento.
5. A renderização é lazy e imperativa: começa só quando a camada está ativa,
   cancela `requestAnimationFrame` no cleanup, pausa fora de foco e evita
   re-render React por frame.
6. Clique/tap no campo de vento mostra card com velocidade, rajada quando
   disponível, direção e forecast real disponível. V1 só mostra `NOW`.

**Consequence**: EOS ganha leitura visual de fluxo de vento sem virar produto de
mapa paralelo e sem prometer resolução/modelos que ainda não existem.

---

## D-140 — Clicar fora fecha o Pilot

**Date**: 2026-08-09
**Status**: DECIDED
**Roadmap**: PILOT-T11

**Context**: O dono abriu o Pilot pelo orbe e esperava o comportamento padrão de
uma janela/sheet: clicar fora fecha. A UI já tinha um scrim com `onClick`, mas a
camada estava posicionada como `absolute` dentro do portal de tokens do Pilot,
que é estático. Na prática, o alvo fora da janela não era confiável como camada
global.

**Decision**:

1. O Pilot continua podendo fechar pelo X.
2. A área fora da janela também fecha o Pilot.
3. A camada externa do Pilot deve ser `fixed`, acima do app shell, e a janela do
   Pilot deve ficar acima dela.
4. Clicar dentro da conversa não fecha; só o scrim externo fecha.

**Consequence**: o Pilot passa a se comportar como uma superfície modal normal:
abre pelo orbe, fecha pelo X, Escape/scrim quando disponível, e não prende o
usuário numa ação pequena demais.

---

## D-139 — A BottomNav estava certa, mas o dashboard travava a navegação

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: NAV-T03

**Context**: Depois do D-138, os anchors da BottomNav voltaram a existir e o
clique principal não era mais interceptado. Mesmo assim, em teste real o toque
não saía do dashboard. A reprodução com Playwright mostrou o motivo: `WorldV2`
entrava em `Maximum update depth exceeded`.

O loop vinha da integração do Pilot unificado (D-137): `WorldV2` usava o objeto
`pilot` inteiro como dependência para registrar curso/contexto. O provider
atualizava estado ao receber o contexto, recriava o objeto `pilot`, e o dashboard
registrava de novo.

**Decision**:

1. Efeitos do dashboard não dependem do objeto `pilot` inteiro.
2. Eles dependem só dos callbacks estáveis que usam (`registerCourse` e
   `registerContext`).
3. BottomNav precisa ter teste de navegador próprio: o sucesso é a URL mudar
   depois de clicar cada ícone.

**Consequence**: corrigir o link visual não basta; a app shell precisa continuar
responsiva enquanto o dashboard registra fatos no Pilot global.

---

## D-138 — Badge informa, o ícone navega

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: NAV-T02

**Context**: A separação de badges por surface (D-117) resolveu o problema de
mostrar onde existe coisa nova, mas criou uma regressão operacional: quando um
ícone tinha badge, o clique principal deixava de navegar e abria a Inbox. Na
prática, o dono tocava em Clima, Preparação, Comms ou Cenário e o link parecia
quebrado.

**Decision**:

1. O clique principal em qualquer ícone da BottomNav sempre navega para a tela
   daquele ícone.
2. O badge vermelho continua visível e passa a ser o alvo secundário para abrir
   a Inbox filtrada por surface.
3. Abrir a Inbox pelo badge não marca notificações como lidas. A regra de leitura
   continua a mesma: só clicar em um item, ou "marcar todas", altera estado.

**Consequence**: a navegação volta a ser previsível mesmo quando há notificações,
e a timeline social continua acessível sem sequestrar o primeiro toque.

---

## D-113 — O agendador sai da Vercel para não pagar Pro, e o segredo que nunca existiu

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O `vercel.json` pedia `*/15 * * * *`. O plano Hobby só aceita uma
execução diária, e o efeito não era degradação — era **bloqueio total de
deploy**: nenhuma publicação passava, de ninguém.

E ao investigar apareceu algo pior: **`CRON_SECRET` não existia** — nem na
Vercel, nem localmente. A rota `/api/cron/weather-notifications` exige
`Bearer CRON_SECRET` e devolvia **401 sempre**. As notificações de clima nunca
dispararam uma única vez, e nada na tela dizia isso.

**Decision**:

1. **`CRON_SECRET` gerado e configurado** na Vercel. Verificado: sem segredo
   401, com segredo `{"ok":true,"checked":43}`.
2. **Cron da Vercel vira diário**, o que o Hobby aceita — e desbloqueia os
   deploys.
3. **A cadência real de 15 minutos vem do GitHub Actions**, de graça. A rota já
   era protegida por segredo, então o agendador externo não abre nada novo.
4. **O cron diário fica como rede de segurança.** Se o workflow for desativado ou
   o repositório sair do ar, sobra uma passada por dia em vez de nenhuma.
5. **O workflow falha ALTO** quando o segredo falta: `exit 1` com mensagem, nunca
   um "ok" silencioso. Foi exatamente o silêncio que deixou esta rota devolvendo
   401 por meses.

**Consequences**: verificado ponta a ponta em 2026-08-04 — segredo configurado
nos dois lados e execução manual do workflow **verde** (`ping` 7 s).

Fica um risco de operação que não existia antes desta decisão: o GitHub
**desativa workflows agendados após 60 dias sem commits** no repositório. Se o
projeto ficar parado, as notificações de clima param junto e **nada avisa** — a
mesma classe de falha silenciosa que motivou este trabalho, agora por um caminho
de infraestrutura. É o preço de não pagar Pro, e está anotado no build status
para ser reavaliado, não esquecido.

---
## D-112 — Convite por link, e o que um link nunca pode fazer

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Convidar alguém exigia ditar um código de seis letras e torcer para
a pessoa digitar certo, achar a tela e colar. É o gesto mais frágil do produto:
três chances de o convite morrer no caminho. E a Família íntima exigia uma
SEGUNDA conversa, dias depois da aprovação.

**Decision**:

1. **`/convite/[code]`**, compartilhável por WhatsApp, em Círculos e na Família.
   Rota **protegida**: quem clica sem conta cai no login com `redirectTo` e volta
   já autenticado. A alternativa — página pública — revelaria o nome do círculo a
   qualquer um que recebesse o link encaminhado.
2. **O convite mora também na Família**, junto da frase "sem conta no EOS · não
   aparece no mapa". É ali que a ausência aparece; a ação de resolvê-la tem de
   estar do lado do problema, não noutra tela.
3. **`?intima=1` carrega a intenção de Família íntima** através da aprovação
   (`circle_join_requests.wants_family_access`). Ao aprovar, o membro nasce com
   `family_access_status = 'requested'`.

**A trava que define esta decisão**: um link pode **fazer a pergunta** sobre a
ficha médica de alguém; nunca **respondê-la**. O status nasce `requested` e só a
própria pessoa, na conta dela, muda para `approved` — regra que já existia em
`/api/circles/[id]/family-access` e que este caminho não podia furar. Se algum
dia isso virar `approved`, a ficha de uma pessoa passa a ser aberta por quem
encaminhou um link num grupo de WhatsApp.

Por isso a caixa "incluir na Família íntima" **nasce desmarcada**: mesmo sem
conceder nada, é uma pergunta sobre o dado mais sensível do produto, e uma caixa
pré-marcada seria o app decidindo por quem convida.

**Consequences**: `npm run test:invite` — 6/6, com uma asserção dedicada só a
provar que o link **não** concede acesso à ficha. `test:circle` 5/5 e
`test:family` 5/5 sem regressão.

O `POST /api/circles/join` degrada sozinho: sem a coluna da migration, o convite
ao CÍRCULO continua funcionando e a tela avisa que a parte de Família íntima
ficará para depois — o convite principal nunca falha por causa do extra.

---
## D-099 — Afiliados usam Stripe Promotion Codes e tracker próprio

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono quer criar códigos/links de afiliado pelo admin, começando
por `EOSPARTNER`, com 100% off uma vez e comissão de 70% sobre o primeiro valor
real pago. Isso não é gift code: gift code dá acesso sem Stripe; afiliado precisa
passar por Checkout e preservar atribuição financeira.

**Decision**:

1. Criar `/admin/affiliates` owner-only.
2. Criar tabelas `affiliate_codes`, `affiliate_referrals` e
   `affiliate_conversions`.
3. Criar Stripe coupon `100% off once` e promotion code por afiliado.
4. Capturar `?ref=CODE` em cookie/local storage.
5. Enviar o código para `/api/billing/checkout` e preaplicar o promotion code no
   Checkout quando válido.
6. Registrar referral no `checkout.session.completed`.
7. Registrar conversão/commission owed apenas em invoice paga com
   `amount_paid > 0`.

**Consequences**:

- LA-T06 fica implementada; ainda exige aplicar a nova migration no Supabase e
  ter Stripe Live configurado para criar promotion codes reais.
- A comissão é calculada sobre dados reais do Stripe, sem hardcode de preço.
- O app não realiza payout automático; o admin mostra quanto deve ser pago.

---

## D-098 — WV2-T07 foi absorvida por entregas específicas da v2

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: WV2-T07 existia para reconstruir, sob demanda, features úteis do
HWD v1 sobre a World v2. As demandas explícitas eram camadas ao vivo, toggle de
base e notificar círculo. Durante as fases seguintes, essas capacidades deixaram
de ser uma única tarefa genérica e foram absorvidas por entregas mais
específicas.

**Decision**:

1. Camadas ao vivo e toggle de base são parte da World v2 atual:
   `WorldV2.tsx` controla radar, alertas, vento, ciclone, flood, surge,
   wind impact, tornado e base dark/satellite.
2. Notificar círculo deixou de ser ação genérica do HUD e virou ação contextual:
   `MemberSheet` envia pings/presets e o executor de plano alerta o círculo ao
   iniciar/cancelar plano.
3. Marcadores de família foram tratados na trilha FAM, não em WV2-T07.
4. O HWD v1 permanece referência histórica; a v2 é a superfície canônica.

**Consequences**:

- WV2-T07 fecha sem código novo.
- Futuras features de mapa entram como tarefas específicas, não como "copiar HWD
  v1".
- O próximo item PENDING é LA-T06, mas depende de parâmetros do dono/Stripe.

---

## D-097 — World v2 tem validação reproduzível de produção

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: WV2-T05 herdou os gates de HWD-06: E2E de navegador, a11y/perf,
custo de provider e privacidade/proveniência. O rollout para `/dashboard` já
tinha ocorrido por decisão do dono (D-063), então faltava transformar a revisão
em evidência repetível.

**Decision**:

1. Criar `scripts/world-v2-validation.mjs`.
2. Adicionar `npm run test:world-v2`.
3. Auditar `/dashboard` em mobile e desktop com Playwright real.
4. Medir tempo de navegação, recursos e bytes transferidos.
5. Validar existência de equivalente textual, proveniência, nomes acessíveis e
   tamanho mínimo dos controles EOS.
6. Registrar postura de custo por provider sem congelar preços.

**Consequences**:

- WV2-T05 fica concluído com relatório em
  `docs/29-world-v2-production-validation.md`.
- A validação atual passou com 0 console errors, 0 controles sem nome e 0 alvos
  pequenos em controles EOS.
- O script cria e remove usuário de teste via Supabase service role, como os
  outros testes de navegador do projeto.

---

## D-096 — Pilot revisa planos como propostas confirmáveis

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: PLAN-T07 estava bloqueado até UPP-03 porque o Pilot só poderia
propor ou revisar planos se a arquitetura já impedisse escrita silenciosa. O
plano da família é dado sensível e operacional: uma alteração invisível em ponto,
papel, rota ou gatilho pode fazer membros executarem versões diferentes.

**Decision**:

1. `/plan` ganha uma seção "Revisão do Pilot".
2. O Pilot propõe elementos pequenos, não substitui o documento inteiro.
3. A proposta pode virar apenas rascunho local depois do clique do usuário.
4. Persistência continua exclusiva do botão "Salvar plano", com versionamento,
   push ao círculo e reconhecimento explícito.
5. A implementação inicial é determinística para não inventar coordenadas,
   rotas, membros ou autoridade externa.
6. Qualquer evolução com modelo deve usar OpenAI como provider de AI e manter a
   mesma confirmação elemento a elemento.

**Consequences**:

- PLAN-T07 fica concluído sem nova migration.
- O Pilot pode revisar gatilhos e papéis sem gravar nada sozinho.
- Rotas e pontos continuam autorais; o Pilot não cria coordenadas fictícias.

---

## D-095 — Memória do Pilot só muda com confirmação e auditoria atômica

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: `pilot_memory_md` existia desde D-059, mas sem fluxo próprio para o
Pilot propor uma memória e o usuário confirmar. PLAN-T07 depende desta trava:
sem confirmação/auditoria, qualquer escrita do Pilot em estado persistente vira
mutação silenciosa.

**Decision**:

1. Criar `pilot_memory_events` como trilha de auditoria por perfil.
2. Criar RPC `confirm_pilot_memory(...)` para atualizar `pilot_memory_md` e
   inserir o evento na mesma transação.
3. Criar `POST /api/profile/personalization/memory` como rota autenticada de
   confirmação.
4. `/api/pilot/chat` pode retornar propostas `memory[]`, mas não grava.
5. A UI do Pilot mostra título, motivo e Markdown exato antes do botão de salvar.
6. O QR público continua sem expor memória do Pilot.

**Consequences**:

- UPP-03 desbloqueia trabalhos futuros em que Pilot propõe revisão de plano sem
  escrita silenciosa.
- Nova migration `20260803003000_pilot_memory_events.sql` precisa ser aplicada.
- Se a migration não existir, a rota retorna 503 e não atualiza memória.

---

## D-094 — Texto livre do simulador preenche painéis revisáveis

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: A spec do simulador dizia que linguagem natural é válida, mas que a
inferência precisa ser revisável antes de rodar. A tela já tinha textarea, porém
o texto só ficava como descrição; ele não configurava ameaça, severidade,
falhas, fontes ou leituras simuladas.

**Decision**:

1. Criar `POST /api/simulation/parse` autenticado.
2. Usar OpenAI para converter texto livre em patch validado de
   `SimulationConfig`.
3. Validar enums, booleanos e faixas numéricas no servidor.
4. Aplicar o patch aos painéis existentes, mantendo o texto original.
5. Mostrar notas de inferência para revisão.
6. Não iniciar simulação automaticamente e não gravar dados.

**Consequences**:

- "Furacão categoria 3 chegando em 12 horas, sem luz e minha filha machucou o
  joelho" passa a preencher os painéis correspondentes.
- O usuário continua no cockpit e pode ajustar qualquer campo antes de iniciar.
- OpenAI é usado como provider de AI desta inferência; o output do modelo não é
  autoridade direta.

---

## D-093 — Pilot educador usa propostas confirmáveis de preparação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono quer que o Pilot seja educador/host situacional, guiando a
família nas decisões em vez de apenas responder como chat. Depois de SIM-T11, o
produto passou a ter um contrato claro para transformar orientação em preparação:
tipo, fonte, destino e confirmação explícita.

**Decision**:

1. `/api/pilot/chat` passa a pedir e normalizar `kind` em cada task:
   `resource`, `task`, `plan_review` ou `comms_setup`.
2. A fonte e o destino da proposta são definidos pelo servidor, não pelo modelo.
3. A UI do Pilot mostra tipo, fonte e destino antes do botão de confirmação.
4. Itens confirmados pelo Pilot usam `kit_type=PILOT_RECOMMENDATION`.
5. Preparação mostra "Fonte: Recomendação do Pilot" para esses itens.
6. O provider de AI segue sendo OpenAI para Pilot/RAG.

**Consequences**:

- Pilot passa a ser educador acionável: instrui, pergunta quando falta contexto
  essencial e converte orientação em trabalho confirmado.
- Não há escrita silenciosa em checklist, inventário, plano, Comms ou memória.
- Um modelo dedicado de Preparedness Items continua fora desta task.

---

## D-092 — Debrief de simulação vira proposta confirmável de preparação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: SIM-T05/SIM-T06 já calculavam lacunas do treino e permitiam salvar
alguns itens no checklist. Para o Preparedness Engine, isso precisava virar um
contrato mais explícito: o usuário deve ver o que está sendo proposto, de onde
veio, qual tipo de ação é, e só então confirmar a escrita.

**Decision**:

1. Cada lacuna acionável do debrief passa a carregar tipo: recurso, tarefa,
   revisão de plano ou setup de Comms.
2. A UI mostra fonte e destino antes da confirmação.
3. A escrita continua item a item, nunca silenciosa e sem "aceitar tudo".
4. Itens confirmados usam o contrato existente de checklist com
   `kit_type=SIMULATION_DEBRIEF`.
5. Preparação mostra a origem "Debrief da simulação" nos itens salvos.
6. Não criar nova tabela em SIM-T11; um modelo persistente próprio de
   Preparedness Items fica para decisão futura se o checklist não bastar.

**Consequences**:

- O debrief vira ponte real entre treino e preparação.
- A origem persiste de forma simples via `kit_type`.
- PILOT-T08 deve seguir o mesmo padrão: propor, mostrar fonte e confirmar antes
  de escrever.

---

## D-091 — Onboarding preserva o contexto do convite de simulação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: A principal aquisição imaginada pelo dono é rodar um cenário
simulado e convidar pessoas para participar. O fluxo antigo tratava `/sim/[token]`
como rota protegida; usuário não logado ia para login, o login ignorava
`redirectTo`, e o onboarding não sabia qual cenário trouxe a pessoa.

**Decision**:

1. `/sim/[token]` deixa de depender do middleware para carregar contexto.
2. O link de simulação continua não sendo autoridade: só registra o usuário como
   `invited` depois de autenticação.
3. Login/signup preservam `redirectTo`.
4. `/onboarding` mostra o cenário do convite quando veio de `/sim/[token]`.
5. Depois de salvar perfil, onboarding devolve o usuário ao convite para entrar
   pelo mesmo pop-up de aceitação.
6. Nenhuma tabela nova é necessária.

**Consequences**:

- Novo `GET /api/simulation/join/[token]` para consultar contexto do convite.
- `/sim/[token]` funciona como ponte pública de contexto + doorbell autenticado.
- O próximo passo pode transformar esse contexto em tarefas/preparação, mas
  escrita persistente continua fora de ONB-T01.

---

## D-130 — O endereço vira a porta de entrada da casa

Ideia do dono: ao preencher o endereço completo na ficha, o app pergunta quem
mais mora ali e oferece criar o círculo. O acerto central é o **lugar** —
endereço é onde a pessoa já está pensando "minha casa", muito melhor que uma
tela de cadastro abstrata.

Ele pediu para melhorar a ideia antes de codar. Quatro coisas mudaram.

**Endereço estruturado por país, não formato americano fixo.** O app fala pt-BR
e en. E o campo de unidade não é detalhe: é o que separa a casa do dono da do
vizinho no condomínio onde vários prédios dividem o mesmo número de rua — caso
que ele mesmo relatou meses atrás, ao pedir a escolha de ponto no mapa.

**O endereço nunca junta casas sozinho.** Se casas fossem unidas por endereço
igual, os vizinhos entrariam na casa dele e as despensas deles somariam na
autonomia da família. O endereço dispara a pergunta; a confirmação continua
pessoa a pessoa (D-123).

**Nome digitado não vira pessoa.** Bifurca: *tem celular* → convite; *não tem* →
dependente com cuidador. Um nome solto seria um terceiro tipo de pessoa, e foi
exatamente ele que o D-123 removeu quando o dono perguntou *"por que eu tenho
que adicionar membros sendo que eles já fazem parte do círculo?"*. A Daniela
dele **já tem conta** — cadastrá-la de novo criaria a duplicata.

**O preço vem junto da oferta.** No desenho original ela clicava em "sim", ia
para Círculos e só lá descobria o paywall: pedir o trabalho e cobrar pelo
resultado dele. E a oferta virou uma faixa **depois** do salvamento, não um
popup — a pessoa terminou o que veio fazer, e a oferta não sequestra a
conclusão.

### Os nomes não se perdem

`household_invites` existe por um motivo só: se ela disser "agora não", o que
digitou fica guardado. Quando o círculo existir — hoje, semana que vem, ou
quando alguém a convidar — os convites já estão prontos.

**E o status continua `pending` quando o círculo nasce.** A primeira versão
marcava `sent` ali, e era mentira: nada tinha sido enviado. O convite deste app
é um link que a pessoa compartilha por onde quiser, e o servidor não tem como
saber que saiu. Marcar como enviado o que ninguém enviou faria a tela afirmar
que a Daniela foi convidada enquanto a Daniela não recebeu nada. Quem marca é
ela, em Círculos, com o botão "Já convidei".

### Duas decisões técnicas

**A unidade não vai para o geocodificador.** Nenhum deles sabe onde fica o
apartamento 4124, e mandá-la piora o resultado — alguns devolvem o centro da
cidade quando não casam a string inteira. A unidade importa para quem vai bater
na porta, não para o mapa.

**Falhar na geocodificação não derruba o salvamento.** O endereço escrito já
vale por si: é o que a pessoa lê e o que alguém usa para chegar. A tela diz que
não achou o ponto e oferece marcar à mão no Plano.

**Quem cria o círculo passa a morar nele.** Sem isso, a pessoa criaria a casa e
ela contaria uma pessoa a menos — a dela. Foi o que confundiu o dono no D-129.

### O Pilot cita quem falta

Pedido dele: *"o Pilot pode citar nas orientações que o usuário tem filhos mas
não está no EOS"*. `getHousehold` passa a devolver `pendingNames`, e o Pilot
recebe a instrução de citar quando for relevante — e de não repetir em toda
resposta. É informação que muda a resposta: quem não está no app não recebe
alerta nem aparece no mapa.

**Prova.** `address-flow-test`, 9/9 com o endereço real do dono, incluindo a
geocodificação (26.312, −80.204 — Parkland, Flórida) e dois controles
negativos: salvar duas vezes não duplica a lista, e criar o círculo **não**
marca ninguém como convidado.

---

## D-129 — Três telas, três respostas para a mesma pergunta

O dono mandou três capturas e disse: *"não estou entendendo por que as
informações não estão batendo."* Estavam assim:

| | Dashboard | Preparação | Círculos |
|---|---|---|---|
| Prontidão | **88%** | **68/100** | **68/100** |
| Autonomia | **0,3 dias** | **2 dias** | — |
| Pessoas | — | **1 membro** | **SUA CASA (3)** |

Três contradições, e **duas eram minhas, da mesma semana**.

### "Sua casa (3)" contra "1 membro" — regressão do D-124

O motor define a casa como o círculo onde **eu** confirmei morar. O dono nunca
confirmou (`household_status: 'none'`); Daniela e paola sim. Então a casa dele é
ele sozinho, e as despensas das outras duas não somam — que é exatamente o
desenho do D-123, e está certo.

Mas o filtro que escrevi em Círculos dizia *"quem confirmou, mais eu"*, e
mostrava 3. **Duas definições de "sua casa" na mesma versão do app**, com a tela
exibindo a mais generosa. Agora ela usa a definição do motor e diz o que falta:
*"Você ainda não confirmou que mora aqui — por isso a sua casa conta só você, e
as despensas dos outros não somam."*

### "0,3 dias" contra "2 dias" — e a ida e volta que valeu

`useWorldData` calculava `min(água, comida, energia, combustível)`;
`lib/household.ts` calculava `min(água, comida)`. Com a bateria do dono em 10%,
a primeira dava 0,3 dias e a segunda 2.

Unifiquei primeiro **incluindo os quatro**, achando que somar restrições era o
lado conservador. O teste unitário mostrou o absurdo: com `BATTERY_FULL_DAYS =
3`, nenhuma casa poderia ter mais de três dias de autonomia — e uma bateria em
10% passaria a afirmar que a família **sobrevive 0,3 dias**.

Não sobrevive: ela fica sem luz. **Água e comida são sobrevivência; bateria e
combustível são capacidade** — mudam o que dá para fazer, não quanto tempo se
fica vivo. Os dois continuam como barras próprias, que é onde a informação é
verdadeira.

A lição vale além deste número: ser conservador é bom, inventar uma restrição
de sobrevivência que não existe é outra coisa. **Um número alarmante e falso
gasta a confiança que o número alarmante e verdadeiro vai precisar.**

### "88% Prontidão" contra "68/100" — duas grandezas, um nome

O 88% é o percentual do checklist; o 68/100 é um score composto que pesa água,
comida, bateria, kit e comunicação. Duas métricas podem coexistir; **duas
métricas com o mesmo nome, não**. O rótulo do dashboard passa a dizer o que o
número é: `Checklist`.

**Medido depois, no estado exato do dono:** dashboard 2,0 dias (era 0,3),
Círculos "Sua casa (1)" (era 3) com o aviso do porquê, e o rótulo corrigido.

---

## D-128 — O dashboard para de tranquilizar sem base

O dono pediu uma análise sênior da tela de produto. Rodada com `impeccable
critique`, em duas avaliações isoladas — revisão de design e evidência medida,
nenhuma vendo a outra até a síntese. **Nota: 23/40, "Aceitável".**

O veredito que importa: **autoral por baixo, intercambiável por cima**. O
sistema de tokens é real e a escrita é a marca (*"O cone é a incerteza da
posição do centro, não a área de dano"*). Mas a tela em repouso era um app de
mapa escuro qualquer — nenhum membro da família, nenhuma autonomia, nenhum
plano sem um gesto.

### Os dois P0

**O painel de Camadas não tinha saída.** Sem botão de fechar, `Escape` ignorado
(zero ocorrências em `WorldV2.tsx`), toque fora ignorado, e cobrindo 54% do
próprio botão que o abriu. Um mau toque numa pilha de três controles prendia a
pessoa na tela inicial. Ganhou as três saídas.

**O chrome cobria o ✕ do Pilot.** A regra certa existia
(`body:has(.wv2-pilot-chat) .app-actions { display: none }`) e **nunca valia**,
porque `AppActions.tsx` declarava `display: 'flex'` inline — e inline vence a
folha sem `!important`. Eu já tinha tropeçado nessa armadilha no D-127 e posto
`!important` no `top`, sem perceber que o `display` tinha o mesmo problema. A
correção não foi mais um `!important`: foi devolver o layout à folha.

### O sinal estava invertido

`.wv2-bar.low` pintava a reserva crítica em `--ink-3`, a tinta mais apagada do
sistema: **quanto mais urgente, mais sumia**. E um zero medido desenhava igual a
"não sei". Agora a reserva baixa grita em âmbar, e "sem dados" tem desenho
próprio — numa tela de preparação, a diferença entre "você tem um problema" e
"espera aí" é a diferença entre agir e não agir.

### A faixa de repouso passa a dizer a verdade

Escolha do dono entre três opções: **o pior dos dois**.

A causa era estrutural, não descuido: `deriveRisk(s: WeatherSnapshot)` é uma
função só de clima, pela assinatura. Ela não tem como saber que a família não
tem água. O app tinha dois motores, dois veredictos e uma tela — e o que
tranquilizava era o que gritava, em verde, na única linha que a maioria das
sessões lê.

`components/world-v2/resting-verdict.ts` é função pura de propósito: dá para
provar por teste que a conta nunca fica otimista. Empate vai para a casa — o
clima já tem uma aba inteira, e a casa é a única coisa que só esta tela conta.
Autonomia não medida não vale "seguro".

Medido depois, na casa vazia da captura do dono: **"0.0 dias de autonomia ·
reabasteça hoje"** em vermelho, com alça para Preparação. Antes: "14 · Estável"
em verde.

**E todo número ganhou alça.** Antes "0 dias de água" era um veredito sem saída:
lia-se o problema sem poder agir sobre ele.

### Um achado de licença, não de acessibilidade

A atribuição do CARTO e do OpenStreetMap media **1,07:1** e estava **totalmente
coberta** pela barra de navegação — links reais, invisíveis e não tocáveis. Os
dois provedores exigem crédito visível.

Errei duas vezes antes de acertar, e as duas valem registro. Primeiro pus a
margem no bloco em vez do container, que é o que o maplibre posiciona: não
moveu nada. Depois pendurei em `--sheet-peek`, que é a altura do pegador (85px)
e não o quanto a folha cobre da tela. A medida certa é a distância do fundo da
janela até o topo da folha, republicada durante o arrasto — `--sheet-cover`,
medida em 157px. Resultado: atribuição em `y=651`, acima da folha em `y=687`,
tocável, sobre fundo próprio.

O contraste do 1,07:1 também tinha causa precisa: a regra do maplibre tem a
mesma especificidade que a nossa e vence por ordem de importação. É o único
`!important` do arquivo, e está comentado dizendo por quê.

**Prova.** 131 unitários (12 novos só para a faixa, metade provando que ela não
infla) e verificação no navegador de cada item: três saídas do painel, ✕ de
44px recebendo o toque, chrome com `display: none`, faixa em vermelho com o
texto certo, e a atribuição tocável.

### Consertei metade e chamei de pronto

O dono abriu o app e disse "não vejo mudanças" — no **desktop**. Estava certo.
`WorldV2` bifurca em `isDesktop`, e eu tinha religado só a faixa do celular. No
painel do desktop a contradição continuava inteira: `12 · Estável` em verde
sobre 0,3 dias de autonomia.

A avaliação determinística tinha me avisado disso na cara — *"`.wv2-panel` does
not exist at 390px, WorldV2.tsx:584 branches on isDesktop"* — e eu li como "o
painel é só de desktop" em vez de "existem dois caminhos e você mediu um".

O cartão de risco é **compartilhado** pelos dois layouts, então a correção certa
era lá, não na faixa: o acento passa a seguir o pior dos dois, e quando a casa
é o problema o cartão diz qual é e leva até ele. Verificado nos dois tamanhos na
mesma execução, que é o que eu deveria ter feito da primeira vez.

Junto foi a leitura de tela, que anunciava só a metade tranquilizadora — índice,
estado, alertas, e nunca a autonomia. Quem usa leitor recebia um retrato mais
confortável que o de quem enxerga.

**Fase 3, escolhida pelo dono e não feita ainda:** destilar — um foco em
repouso, o resto sob um toque. Hoje são 16 controles visíveis e cinco objetos
competindo pela atenção.

---

## D-127 — Uma fonte para o canto superior direito

**Regressão minha, do mesmo dia.** O D-126 empurrou o chrome global 74px para
baixo para liberar o orbe da PilotBar. No Mundo, isso o jogou exatamente em
cima dos controles do mapa, que ficavam em `topo + 50px`. O dono mandou a
captura: três grupos flutuantes disputando o mesmo canto, com os rótulos
cortados no meio da palavra.

**Empurrar de novo seria repetir o erro.** Três clusters escolhiam o próprio
`top` com números mágicos independentes, e funcionavam por coincidência —
bastou mexer em um para o arranjo quebrar. A correção não é um valor novo: é
**uma fonte só**. O chrome publica `--chrome-top`, e quem vem abaixo se
posiciona a partir dele. Mover o de cima passa a mover o de baixo por
construção.

**Um erro de cascata no caminho.** Minha primeira versão pré-calculava
`--chrome-bottom` no `:root`. Não funciona: a substituição de variável acontece
no elemento, e o override de `--chrome-top` vive no `body` — o `:root` é outro
elemento e não o enxerga. Quem consome calcula.

**Os rótulos cortados eram outro defeito, e mais antigo.** A coluna tinha 44px
fixos e "Atualizar" a 9px não cabe; o `overflow: hidden` do bloco cortava a
palavra. A coluna passa a ter a largura do conteúdo (`min-width: 44px`,
`white-space: nowrap`) — mediu 61px com "Atualizar". O alvo de toque continua
com 44px de altura: o que cresceu foi a largura, não a área mínima.

**Medido depois:** chrome `y=74..114`, controles `y=124..259`, orbe `y=16..62`.
Nenhuma colisão, nenhum rótulo cortado, nada saindo da tela.

---

## D-126 — O chrome sai da frente, e "tudo certo" ganha pré-requisito

Dois defeitos que o dono achou usando, e o segundo é de segurança.

**O orbe do Pilot estava inalcançável no Mundo.** Ele relatou "o orbi no World
do Pilot está escondido". Medido: a `PilotBar` ocupa `x=14..276, y=16..62`, e os
três orbes do `AppActions` ocupam `x=238..374, y=16..56`. Sobrepõem — e
`document.elementFromPoint` no centro do orbe do Pilot devolvia o ícone do
chrome. Não estava só escondido: **o toque ia para outro elemento**. O chrome
agora desce quando a barra está no topo, com a mesma técnica que a regra do
banner de simulação já usava. Verificado: `y=74..114`, sem sobreposição, e o
toque volta a chegar na `PilotBar`.

**E o chrome sai da frente de quem lê.** Os mesmos três orbes são `fixed` e
cobriam a primeira linha de qualquer lista rolada, interceptando o toque dela.
Agora somem ao descer e voltam ao subir — quem desce está lendo, quem sobe está
procurando. `pointer-events: none` acompanha a opacidade: escondido e ainda
clicável seria pior que visível.

### "Tudo certo" com zero dias de autonomia

A captura que ele mandou tinha três frases se contradizendo na mesma tela:

    TUDO CERTO
    Nada exige ação agora
    A família aguenta 0 dias com o que tem em casa
    Ainda não li a ficha da família — bebês, medicação e mobilidade
    não entraram nesta conta

O `return` final de `answerNow` era uma **queda livre**: se o risco não fosse
crítico nem alto, o Pilot dizia "nada exige ação" — **sem nunca olhar a
autonomia, e sem olhar se a ficha tinha sido lida**.

É a mesma falha otimista que o D-125 travou no servidor, e ela vale igual aqui:
o erro caro é o otimista. Quem lê "tudo certo" não vai conferir a despensa.

Agora "tudo certo" tem pré-requisito. Sem a ficha da família, o veredito é
`hold` e diz o que falta. Com menos de um dia de autonomia, é `act` e diz o
número. O caminho "tudo certo" só é alcançado quando as duas condições passam.

---

## D-125 — A regra crítica sobrepõe a IA, e a resposta passa a chegar escrevendo

**PILOT-T03 estava BLOCKED com a nota "Critical rules must override AI".** O
cabeçalho de `app/api/pilot/chat/route.ts` afirmava, desde sempre, que o Pilot
*"can never soften a critical rule"*. O código não fazia nada disso: pegava o
texto do modelo e devolvia. Era uma promessa escrita em comentário.

Num app de emergência isso não é dívida de qualidade. O modelo pode escrever
uma frase tranquilizadora enquanto a casa tem meio dia de água, e nada na
resposta contradiz — a pessoa lê a frase, não a planilha.

**`lib/pilot-guard.ts` não corrige o modelo: sobrepõe.** O veredito sai do
`RulesEngine`, que é determinístico, e é calculado sem olhar uma linha do que a
IA escreveu. `evaluateGuard` nem recebe a resposta — é isso que torna a trava
uma trava. Uma verificação que dependesse do modelo obedecer não seria trava
nenhuma.

**Casa desconhecida vira WAIT, nunca GO.** Se a leitura falhar, dizer "pode ir"
é inventar. Metade dos casos unitários existe para provar que o veredito não
fica otimista sem base — num app de emergência o erro caro é o otimista.

### O desenho que o dono corrigiu

Minha primeira versão enfiava a frase determinística **dentro** do texto da
resposta, em markdown. Ele cortou: *"a ideia é ter uma tag no Pilot sobre
determinístico que não estrague o chat livre"*. Estava certo — misturar as duas
vozes na mesma frase suja a conversa e faz ler duas coisas como se fossem uma.

O veredito virou **etiqueta**, no mesmo vocabulário que o chat já usava para o
motor local (`ready`/`watch`/`hold`/`act`). Duas mecânicas de veredito na mesma
tela seria como o produto passa a discordar de si mesmo.

### Três defeitos de interface que ele relatou usando

**"A UI do chat está poluída."** O texto do chat livre era renderizado em
`t-title2` — parágrafos inteiros em corpo de manchete. Agora `kind: 'chat'`
rende prosa como prosa, e sobra espaço para a etiqueta.

**"A resposta explode na tela enquanto eu aguardo."** Agora há **streaming de
verdade** (`?stream=1`, SSE). Considerei uma revelação falsa — esperar tudo e
depois digitar — e descartei: a espera continuaria igual e a leitura ficaria
mais lenta. O que muda a sensação é o tempo até a primeira palavra. Medido:
**6966ms → 4879ms**, com a resposta completa em 14s. A pessoa passa a ler
durante nove segundos em que antes olhava para um spinner.

A etiqueta é enviada **antes** do texto, porque não depende do modelo: não faz
sentido esperar a prosa para saber que há regra crítica ativa.

O contrato JSON continua valendo sem o parâmetro — `guardrails-test` e
`pilot-abilities-test` dependem dele.

**"O card aparece e não me deixa rolar para cima."** A rolagem seguia o fim
sempre; quem estava lendo era arrastado quando o cartão de tarefas chegava.
Agora **só acompanha o fim quem já estava no fim**, e quem subiu recebe um aviso
discreto — "Resposta nova ↓" — em vez de um empurrão.

### Uma sigla que vazou, e o teste que fecha a porta

O teste de integração mostrou `FOOD_LOW: 1.0 dias` e `SEM_COMMS` na tela: eu
tinha traduzido três chaves e o motor emite onze. Corrigido, e agora um caso
unitário **lê `lib/rules-engine.ts`** e cobra frase humana para cada mensagem
que ele emite — quem acrescentar uma regra é avisado antes do usuário ver a
sigla.

**Prova.** 9 casos unitários e um teste de integração contra o servidor
compilado, que mede a ordem dos eventos, o tempo até a primeira palavra e
confirma `PRIORITY_OVERRIDE` numa casa com água crítica.

---

## D-124 — Círculos sai de 7/20, e três funções que nunca funcionaram passam a funcionar

**Contexto.** O dono pediu um audit da tela de Círculos com a skill `impeccable`.
Nota: **7/20 — "Ruim, revisão grande"**. Era a única tela do EOS fora do design
system: 955 linhas, 139 blocos de estilo à mão, 22 cores literais, 31 botões sem
rótulo acessível, 16 alvos de toque abaixo de 44px (vários com 18), zero estilo
de foco, e 37 usos de texto de 11px.

**O achado que o audit não pediu.** Três coisas na tela **nunca funcionaram**, e
as três falhavam em silêncio:

1. `GET /api/circles/{id}/plans` devolvia **500 em toda abertura**. O PostgREST
   recusa `select('… profiles(name)')` com PGRST200 porque não há chave
   estrangeira declarada entre `circle_action_plans` e `profiles`. O bloco de
   planos nunca carregou.
2. `/monitoring` tinha o **mesmo defeito, latente**: o portão do plano Família
   devolve 403 antes, então só um cliente **pagante** chegaria ao erro. É o pior
   tipo de bug — o que só aparece para quem paga.
3. `supabase.rpc('circle_pooled_inventory')` chama uma função **que não existe
   no banco**. O resultado virava `null`, o bloco de recursos do círculo nunca
   renderizou para ninguém, e o **score do círculo era calculado com zeros** em
   tudo menos o tamanho. Era por isso que todo círculo mostrava nota baixa.

Os três foram corrigidos sem migration: duas consultas no lugar do `join`
embutido, e a soma feita no servidor a partir de quem marcou `share_inventory`.

**A destilação.** O cartão de cada membro carregava **doze controles** — papel,
inventário, campos, ficha, casa, remover, telefone. Sete decisões empilhadas na
mesma linha, em botões de 18px. A regra nova é uma só: **a lista mostra estado,
a folha guarda decisão**. Um toque na pessoa abre tudo o que se decide sobre
ela, com o motivo de cada opção ao lado dela.

**A lista separa SUA CASA de NO CÍRCULO** — o modelo do D-123. Não é enfeite:
quem mora junto soma despensa, quem está no círculo não. Mostrar os dois numa
lista só foi o que fez o dono ler "família íntima" como "mora comigo".

**Os recursos do círculo deixam de mentir.** Aparecem com a frase que impede a
leitura errada: *"Alcançável, não disponível: isto não entra na autonomia da sua
casa."* Antes o número aparecia como um total somado, do lado da autonomia — a
leitura otimista que o dono rejeitou explicitamente ao escolher o modelo.

**`InviteShare` também dizia a palavra errada.** O rótulo era "Incluir na Família
íntima" para o que é **acesso à ficha médica**. Corrigido para "Pedir acesso à
ficha médica dela", e a área de toque foi de 18px para 44.

**A armadilha do ASI pela QUARTA vez — e a primeira em que não passou.** O
`lint:scripts` do D-122 recusou o arquivo antes de rodar, com `Parsing error`.
Foi exatamente para isso que a trava existe: eu continuo cometendo o erro, e ele
deixou de chegar ao resultado.

**Dois erros meus que o teste desmentiu, e que valem mais que os acertos.**
Reportei um "P0: a página não rola, 609px inalcançáveis" — eu media
`window.scrollY`, e neste app quem rola é o `body`; medindo certo,
`body.scrollTop = 609` e o conteúdo aparece. E acusei a tela de mostrar "0
pessoas" quando o defeito era da minha semeadura (PGRST102, chaves diferentes no
lote). Nos dois casos a tela estava certa e a minha medição, errada.

**Depois.**

| | antes | depois |
|---|---|---|
| Estilos inline | 139 | 2 (cor dinâmica de severidade) |
| Cores literais | 22 | 5 (mapa de severidade compartilhado) |
| Uso do design system | 0 | 54 |
| `aria-label` / `role` | 0 | 11 |
| Alvos abaixo de 44px | 16 | 0 |
| Requisições falhando | 2 (uma 500) | 0 |

**Prova.** `circles-page-test`, 8/8, com três controles negativos: nenhum
resquício visual da tela antiga, nenhum alvo pequeno, e **as nove funções
antigas conferidas uma a uma** — numa reescrita de apresentação, o risco real é
deixar uma função cair no caminho.

**O que fica pendente.** Os orbes fixos do `AppActions` (topo direito) passam por
cima da primeira linha de membro quando a lista rola. É chrome global, afeta
todas as telas, e merece correção própria — não a resolvo escondendo aqui.

---

## D-123 Fase 3 — o dependente pertence a um cuidador

**A resposta do dono, nas palavras dele:** *"na ficha master, por exemplo, de
uma pessoa que cuida de idoso, ela deve ter um espaço que ele inclui esse idoso,
e o Pilot e toda a engine EOS contabiliza. Então na ficha dessa cuidadora ela
conta ela + 1. Tem que ter campo para descrever sobre o idoso."*

Isso mudou o desenho para melhor. Um dependente não é uma linha solta na conta:
ele **pertence a alguém**, e essa relação é dado que o plano usa — um dependente
não se desloca sozinho, por definição, então alguém vai buscá-lo.

**Dois campos novos, e a diferença entre eles é o ponto.** `relationship` diz
quem a pessoa é para o cuidador ("avó", "filho"). `care_notes` é **instrução de
resgate, não ficha médica**: *"3º andar sem elevador, não ouve bem, tem medo de
sirene"*. É o que faria diferença para quem chega na porta, e é diferente do que
um médico precisaria saber. Misturar os dois colocaria prontuário num campo que
outras pessoas do plano vão ler.

**A Ficha passa a dizer a conta.** *"Você conta como 3 pessoas na casa: você +
2"*, com cada dependente listado e a instrução de resgate à vista. Enquanto
carrega, a lista é `null` e não `[]` — mostrar "ninguém depende de você" para
quem cuida de alguém, mesmo por um segundo, faz a pessoa fechar a tela achando
que cadastrou errado.

**Prova.** `roster-page-test` 11/11: os dois campos chegam ao banco pela
interface (`"avó"` · `"3º andar sem elevador, não ouve bem"`) e a Ficha mostra a
contagem certa. O teste também sobreviveu a uma armadilha própria — com a
segunda área de texto na tela, o seletor antigo virou ambíguo e o Playwright
recusou em vez de preencher a errada em silêncio.

---

## D-123 Fase 2 — a casa se monta na tela, e os dois consentimentos param de usar a mesma palavra

**O que o dono viu.** Abrindo Círculos, o rótulo "Família íntima" nomeava
**acesso à ficha médica**. Ele leu como "mora na mesma casa" — que é o que o
nome diz. A confusão que ele relatou não era dele: a tela usava uma palavra para
outra coisa.

Agora cada rótulo diz o que é: 🏠 *Mora nesta casa* e ✚ *Ficha compartilhada*.
São duas linhas no mesmo cartão, com botões distintos, porque são dois
consentimentos distintos.

**Quem pode fazer o quê.** Pedir, qualquer membro do círculo. **Confirmar, só a
própria pessoa, na conta dela.** Sair, idem. A regra vive no servidor —
`app/api/circles/[id]/household/route.ts` — e a tela apenas não oferece o botão
errado. Uma tela que esconde o botão sem o servidor recusar é decoração.

**O erro 23505 vira frase.** O índice único que garante uma casa por pessoa
devolve um código cru; a rota o traduz para *"Esta pessoa já confirmou morar em
outra casa. Ela precisa sair da outra antes."* — que é acionável. E um UPDATE
que não encontra ninguém devolve **404**, não sucesso: foi exatamente esse
silêncio do PostgREST que escondeu o bug de papéis do D-077 por meses.

**O círculo aparece com distância, nunca somado.** Escolha do dono entre as duas
opções que apresentei. A água que está a dois quilômetros não está na sua casa;
mostrá-la junto produziria uma autonomia que parece boa e não existe. A seção
"No círculo, fora da casa" traz nome, distância e rota.

**Um defeito de navegação que o dono achou usando.** *"Não tem como eu excluir
esse EOS dessa tela."* Estava certo: a única saída era um "Editar cadastro"
genérico no rodapé, três níveis acima da pessoa que se queria mexer. Agora cada
pessoa carrega a própria ação, e o link leva direto a ela
(`/family/cadastro?editar=<id>`). Controle perto do que ele afeta.

O build cobrou a fronteira de Suspense do `useSearchParams()` antes que isso
virasse uma página em branco no telefone.

**Prova.** `household-consent-test`, 6/6, com navegador de verdade e três contas.
Os dois controles negativos são o motivo do teste existir: **quem pediu recebe
403 ao tentar confirmar pela outra pessoa**, e quem não está no círculo recebe
403 sem nada mudar no banco. Os outros quatro casos poderiam ser feitos direto
no banco; esses dois não — são sobre quem tem permissão de dizer o quê.

A medição que resume a fase: `autonomia 4,00 → 5,00 dias` **no momento da
confirmação**, e de volta a 4,00 ao sair.

---

## D-123 — A casa passa a existir (Fase 1: a fonte única)

**Contexto.** O dono disse que o conceito estava confuso e caro: *"por que eu
tenho que adicionar membros sendo que eles já fazem parte do círculo?"*. Ele
estava descrevendo um defeito de modelagem, não de tela.

A mesma pessoa vivia em três lugares que não se falavam — `profiles` (a conta),
`circle_members` (o círculo) e `family_members` (uma lista digitada à mão). E
**todos os cálculos liam a lista digitada à mão**: `analyze`, `readiness`,
`checklist/generate`, `pilot/chat`, Preparação e Família. Cinco contas reais no
círculo e a conta de água dizia uma pessoa. Pior: `share_inventory` nunca somou
nada — era só uma marcação de visibilidade na tela de Círculos.

**O modelo decidido com o dono.**

    Pessoa      = uma conta EOS
    Dependente  = quem não pode ter conta, SEMPRE ligado a um cuidador
    Círculo     = quem você alcança e com quem troca informação
    Casa        = membros do círculo que confirmaram morar juntos
                  + os dependentes dessas pessoas

**Três eixos, três consentimentos.** Estar no círculo, morar junto (entra na
conta de água) e ver a ficha médica são coisas diferentes. Antes, "promover a
família íntima" dava acesso à ficha médica de alguém como efeito colateral de
uma decisão sobre logística. O dono escolheu separar: `household_status` é
logística, `family_access_status` continua sendo a ficha — e essa só a própria
pessoa aprova.

**Morar junto exige CONFIRMAÇÃO.** Escolha minha, declarada: morar junto faz o
inventário somar, e uma marcação unilateral deixaria qualquer um marcar o
vizinho e passar a contar a água dele. É o mesmo otimismo que o dono rejeitou
ao escolher que o círculo apareça com distância em vez de somado.

**Uma pessoa mora em UMA casa** — índice único parcial no banco. Sem ele,
alguém em dois círculos entraria nas duas contas, e as duas telas mostrariam
autonomia que não existe, ambas parecendo certas.

**O erro que o teste unitário pegou, e que teria passado.** Eu somei `food_days`
de cada conta. Mas o campo na tela significa "dias que a MINHA casa aguenta" —
somar duas contas de quatro dias daria oito, dobrando a autonomia sem dobrar a
comida. A unidade correta é **pessoa-dia**: `dias × pessoas que aquela conta
cobre`. A soma passa a ser legítima e a divisão pelo tamanho devolve dias. Para
uma casa de uma conta o resultado é idêntico ao de antes, o que torna a mudança
retrocompatível. O nome do campo carrega a unidade (`foodPersonDays`) porque foi
exatamente ali que eu errei.

**Por que `getHousehold` usa o cliente admin.** Somar o inventário da casa exige
ler o inventário de outra pessoa, e a RLS — corretamente — impede. O
consentimento que autoriza é o `household_status = 'confirmed'`, dado pela
própria pessoa. Por isso o conjunto é derivado **primeiro** do vínculo
confirmado, e só então os inventários desse conjunto são lidos.

**O que esta fase NÃO faz, de propósito.** Nenhum cálculo foi religado ainda.
Enquanto a migration não estiver aplicada, `household_status` não existe e todo
cálculo cairia para "casa desconhecida" — uma regressão em produção para
resolver um problema de modelagem. A fundação entra sozinha; o religamento vem
depois da migration, com teste de integração.

Também não apaga as linhas de `family_members` que têm `linked_user_id`
preenchido — são duplicatas da mesma pessoa como registro e como conta. Apagar
dado de família por script, sem a pessoa ver o que some, não é decisão para se
tomar no escuro; a limpeza acontece na tela, com o usuário olhando.

**Prova até aqui.** 8 casos unitários de autonomia, metade deles provando que a
conta **não infla** — autonomia errada para cima é pior que nenhuma, porque a
família lê "seis dias", não se prepara, e descobre no terceiro.

---

## D-122 — A ação principal da aba Família saía do aplicativo

**Contexto.** O dono abriu `/family-legacy` e disse que "não estava condizente".
Estava certo, e o problema era maior do que estética: **aquela não era uma
página esquecida**. `FamilyPage` mandava o usuário para lá em "Cadastrar a
família" e em "Editar cadastro" — ou seja, a ação primária da aba levava a uma
tela de outro aplicativo.

O que havia lá: verde neon `#0DE864`, tipografia mono em caixa alta, botões
cortados em paralelogramo por `clip-path` e **três controles que mentiam** — um
hambúrguer que não abria nada, um sino com bolinha vermelha permanente e uma
pílula "CONNECTED · Family Grid" que não media conexão nenhuma. Sem botão de
voltar: quem entrava ficava preso. Erro em `alert()` do navegador.

**O que foi cortado, e por quê.** A tela abria com "SECURITY SCORE 00", três
mostradores e um feed de 24 horas — um painel de métricas antes da tarefa. A
pergunta que se faz ali é *"meu cadastro está completo?"*, não *"qual é o meu
score"*; o score já existe na aba Família, que é onde ele decide alguma coisa.
Controle decorativo saiu inteiro: um controle que promete um menu inexistente é
uma mentira, não um enfeite.

**O que entrou no lugar.** O que falta em cada pessoa, dito na cara: *"Falta:
idade, informação de saúde"*. O EOS calcula água, comida e rota POR PESSOA — uma
idade em branco não é campo vazio, é conta errada. Essa é a única razão da tela
existir, então é ela que ocupa o topo. Tudo que a tela antiga fazia de útil
ficou: cadastro, sugestão de etiquetas por IA, medicamentos, leitura de ficha
por QR e vínculo com a conta do círculo.

**A rota mudou para `/family/cadastro`.** "legacy" nunca foi um endereço para
onde se manda um usuário. `/family-legacy` virou redirecionamento, porque um 404
seria uma segunda falha em cima da primeira.

**Dois defeitos meus, achados pelo teste de navegador e pela captura de tela.**

O primeiro: eu dei `z-index: 60` ao painel do formulário, e a barra de navegação
é `100`. **O botão Salvar ficava atrás da barra** — no telefone não dava para
salvar. Uma tarefa modal cobre o fundo, e a barra é fundo. O segundo veio da
captura: o material da folha era translúcido demais e a tela de baixo continuava
legível através dela, com "Isadora" e "Falta: idade" competindo com o formulário.
`--mat-thick` existe para a folha do mapa, onde ver o mapa é a razão da
translucidez; aqui atrás não há nada que ajude a decidir. Superfície maior lê
como vidro mais grosso — e legibilidade não pode depender de o `backdrop-filter`
ter sido renderizado.

Também ficou o teclado: o botão de salvar mora no rodapé, que é exatamente onde
o teclado sobe. `dvh` não encolhe com o teclado no iOS, então a altura vem do
`visualViewport`.

**A armadilha do ASI pela TERCEIRA vez, e desta vez com trava.** Uma linha
começando com `/regex/` logo depois de `)` é lida como divisão, e o teste passa
verde testando outra coisa. Aconteceu no teste de push, no de convite e agora
neste. A causa de repetir é que `next lint` só olha `app/`, `lib/` e
`components/` — `scripts/` nunca foi verificado. Agora existe
`.eslintrc.scripts.json` com `eslint:recommended`, `npm run lint:scripts`, e o
passo entrou no CI. Confirmado com controle negativo: a regra
`no-unexpected-multiline` acusa o padrão exato.

**Prova.** `scripts/roster-page-test.mjs`, 9/9, com controles negativos que
importam mais que os positivos: não basta a tela nova existir, **a antiga não
pode ter sobrado** — o teste varre o DOM procurando o verde `#0DE864` em
qualquer propriedade que pinte, `clip-path: polygon`, e os textos "CONNECTED",
"Family Grid" e "SECURITY SCORE". Também confirma que nenhum `alert()` do
navegador dispara, que o caminho de volta existe **e volta**, e que o aviso de
informação faltando some quando o dado é preenchido.

**O que fica pendente.** Sobraram `/dashboard-legacy`, `/scenario-legacy` e
`/checklist-legacy`. Nenhuma delas é alvo de link no produto — são arquivo, não
caminho de usuário. Só valem o mesmo tratamento se alguma voltar a ser
alcançável.

---

## D-121 — Agrupamento automático de defeitos, sem Sentry

**Contexto.** O D-119 fechou a visibilidade: erro de servidor e de navegador
viram linha, e o dono é avisado. Sobrou a única capacidade que o Sentry tinha e
o `error_log` não — **agrupar**. Quinhentas ocorrências do mesmo defeito são um
defeito; listá-las uma a uma esconde exatamente o que interessa, que existem
outros três embaixo delas.

**Decisão.** Uma impressão digital calculada na gravação: escopo + mensagem
normalizada + primeiro quadro da pilha que é código nosso. `Usuário 481 não
encontrado` e `Usuário 902 não encontrado` são o mesmo defeito; `Failed to
fetch` vindo de dois componentes diferentes não são.

**Ela mora dentro do `context`, não em coluna nova.** Uma coluna pediria outra
migration e mais uma ação do dono; o `jsonb` já está lá e o volume é pequeno.
Promover `fp` a coluna indexada, se a tabela crescer, é uma migration de três
linhas — e aí ela se paga.

**Duas decisões de forma que o teste unitário justificou.** O número da linha do
arquivo é descartado: se entrasse na conta, o mesmo defeito viraria um grupo
novo toda vez que alguém editasse o arquivo acima dele. E a ordem das
substituições importa — número solto por último, senão o `<n>` come os dígitos
de dentro de um UUID e defeitos distintos colidem.

**O aviso mudou de critério, e é aqui que o agrupamento se paga.** Antes era por
ocorrência: um defeito em laço mandaria um aviso a cada quinze minutos até a
pessoa desligar a notificação — e desligar o aviso é como se perde a
visibilidade que ele existia para dar. Agora o critério é o *new issue* do
Sentry: **avisa quando aparece uma impressão digital nunca vista**. Com uma
trava de volume, porque um defeito CONHECIDO que passe a disparar dez mil vezes
por hora também precisa acordar alguém.

**E quando não avisa, diz que não avisou.** A resposta do cron sempre traz a
contagem, mesmo em silêncio. "Nada aconteceu" e "aconteceu e eu decidi não te
acordar" são coisas diferentes, e confundi-las é o defeito que este projeto mais
repetiu.

**`GET /api/errors`** responde a pergunta que se faz de verdade: quais problemas
existem, qual é o pior, algum é novo. Protegida pelo `CRON_SECRET` igual ao
`/api/health` — uma lista de onde o app quebra é um mapa para quem quiser
atacá-lo. Não devolve pilha nem `user_id` por padrão.

**Dois defeitos meus encontrados pelos próprios testes.** O unitário pegou que
`timeout after 30000ms` não agrupava: não há fronteira de palavra entre o dígito
e a unidade, então a regra genérica passava batido. E o teste de integração
falhou porque **o limite de 10 por minuto do D-119 barrou metade dos envios** —
o limite estava certo, o teste é que contava a menos em silêncio. Corrigido para
respeitar a janela e interromper se um envio for barrado.

**Prova.** `lib/__tests__/error-fingerprint.test.ts` (11 casos, metade juntando
e metade separando — agrupar de mais é pior que agrupar de menos, porque some
com o segundo defeito) e `scripts/error-grouping-test.mjs` 6/6 contra o banco de
produção, incluindo a confirmação de que `context->>fp` funciona no PostgREST,
que até então era suposição minha.

**O que o Sentry ainda faria melhor.** *Source map* — a pilha do navegador
continua minificada — e histórico por versão. Nenhum dos dois é a diferença
entre ter e não ter diagnóstico.

---

## D-120 — O `main` ganha um portão

**Contexto.** Até aqui, a única verificação antes de um deploy era o que eu
lembrasse de rodar na minha máquina. O histórico mostra o custo disso: uma tela
preta em **todo** o app, 64 arquivos de lixo entrando no precache e um `sw.js`
que nunca registrava — os três chegaram a produção, e os três eram pegáveis por
`type-check` ou `build`. Faltava alguém rodando **sempre**, não alguém rodando
melhor.

**Decisão.** `.github/workflows/ci.yml` roda tipos, lint, testes unitários e
build a cada push e a cada PR no `main`. Nessa ordem, de propósito: o que falha
rápido falha primeiro, para quem quebrou um tipo não esperar o build inteiro.

**O que o CI NÃO roda, e por quê.** Os testes de navegador ficam de fora.
Todos criam contas no Supabase de **produção** — é o único projeto que existe.
Rodá-los a cada push despejaria dado de teste no banco dos usuários reais várias
vezes por dia, e exigiria a chave service-role como segredo do GitHub. Eles
continuam sendo rodados à mão, com a limpeza garantida pelo D-114/D-119.

**Ambiente falso de propósito.** O build não precisa de banco de verdade, e
segredo que não está no CI é segredo que não vaza. Verificado localmente com o
`.env.local` fora do caminho: compila.

**Varredura do repositório, feita porque ele é PÚBLICO.** Nenhum `.env` real
jamais foi versionado, e cruzando cada valor do `.env.local` com o histórico
inteiro, os únicos que aparecem são `NEXT_PUBLIC_SITE_URL` e `VAPID_SUBJECT` —
uma URL e um `mailto:`, públicos por definição. Chave de serviço, OpenAI, VAPID
privada e `CRON_SECRET` nunca entraram em commit nenhum.

Isso **não** anula a pendência de rotação: os segredos foram expostos em
conversa, não no repositório. Mas separa as duas coisas, que estavam
misturadas.

**Primeira execução: verde.**

---

## D-119 — Erro na tela do usuário vira linha, e o dono fica sabendo

**Contexto.** O D-118 tornou visível o erro do **servidor**. Faltavam as duas
metades que sobraram: o erro de JavaScript no navegador da pessoa continuava
morrendo ali mesmo, e o `error_log` dependia de alguém lembrar de consultar. Um
registro que depende de memória humana ainda é meio invisível.

**Decisão.** Nenhuma conta nova, nenhum fornecedor.

*Captura.* `ClientErrorReporter` escuta `error` e `unhandledrejection` no layout
**raiz** — não no autenticado. A tela de entrada é onde uma falha dói mais:
quem não consegue entrar não consegue reportar nada.

*Aviso.* `avisarErrosNovos()` pega carona no cron que já roda de quinze em
quinze minutos e já tem o segredo. Nenhum agendador novo para configurar e para
esquecer.

**A marca d'água é a própria notificação anterior.** Guardar "até onde já
avisei" pediria coluna nova e outra migration; a última notificação enviada já
responde exatamente essa pergunta. Se o envio falhar, a marca não avança e a
próxima rodada tenta de novo — nada se perde em silêncio.

**Um reportador de erro mal-feito vira o próximo incidente.** Três travas: ele
nunca reporta a própria falha de envio (senão o `fetch` que reporta erro gera
erro, que gera erro); teto de cinco por sessão, porque uma tela quebrada dentro
de um `requestAnimationFrame` dispara centenas de vezes por segundo; e a mesma
mensagem viaja uma vez só.

**A rota aceita anônimo, e por isso é tratada como hostil.** Teto por IP no
Postgres, corpo limitado a 8 KB, e **query e hash removidos da URL antes de
gravar** — um link de convite ou de recuperação de senha carrega token na query,
e ele não pode virar log. O teste prova isso com um token de verdade na URL.

**Bug encontrado no caminho, e ele é da mesma família.** `guardrails-test.mjs`
terminava com `process.exit()`, e **`process.exit()` não dispara `beforeExit`** —
o gancho onde mora a limpeza do D-114. O teste passou por fora da rede de
proteção sem avisar nada e deixou **7 contas no banco de produção**. Corrigido
com `finish(fail)` em `scripts/lib/test-cleanup.mjs`; todo script de teste passa
a terminar por ali. As 7 contas foram removidas; restaram 0 de teste e 9 reais.

**Prova.** `scripts/client-error-test.mjs`, 6/6, com **três controles
negativos** — ruído conhecido não grava, 30 disparos da mesma falha gravam uma
linha só, token na URL não aparece no log. Provar que grava é metade do
trabalho; a outra metade é provar que não grava o que não deve. O push do
passo 5 foi enviado de verdade (`enviados=1`).

**O que continua fora.** Sem Sentry, não há agrupamento automático, nem *source
map* (a pilha vem minificada), nem histórico por versão. É a diferença entre bom
diagnóstico e nenhum diagnóstico que estava em jogo, e essa está resolvida.

---

## D-118 — Guardrails de custo e visibilidade operacional

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O roadmap mantinha `LA-T04` em DRAFT porque o rate limit dependia
de Upstash Redis, mas o app caía para um `Map` em memória quando Upstash não
estava configurado. Em serverless, esse fallback não é limite distribuído: cada
instância tem o próprio contador. Ao mesmo tempo, rotas caras de IA podiam
consumir OpenAI sem orçamento diário robusto, e erros de produção ficavam
invisíveis enquanto Sentry não tivesse DSN.

**Decision**:

1. Não bloquear `LA-T04` em Upstash. Supabase/Postgres passa a ser o guardrail
   distribuído v1, usando a função atômica `consume_rate_limit`.
2. `lib/rate-limit.ts` mantém a ordem: Upstash se existir, Postgres distribuído,
   memória apenas como fallback de degradação.
3. Rotas de IA caras passam a usar orçamento por minuto e por dia:
   `/api/pilot/chat` e `/api/weather-intelligence/custom-activity`.
4. `custom-activity` passa a exigir autenticação para que exista identidade a
   limitar.
5. Enquanto Sentry estiver sem DSN, `error_log` no Postgres guarda erro
   sanitizado por `scope`, `message`, `stack`, `user_id` e contexto escalar.
6. `/api/health` expõe o estado operacional de rate limit, error log, Sentry,
   OpenAI, push e cron sem expor segredo.

**Consequences**:

- Requer migration `20260804180000_rate_limit_and_error_log.sql`.
- Sem migration, o app degrada para memória e `/api/health` mostra
  `migration_pending`.
- Não registra conteúdo de conversa, ficha médica, coordenadas, tokens, cookies
  ou chaves.

---

## D-118 — Limite de uso é do banco, e erro de produção deixa de ser invisível

**Contexto.** A varredura do roteiro achou dois buracos que nenhum teste pegava
porque nenhum teste olhava para eles.

O primeiro custa dinheiro: `/api/pilot/chat` é o endpoint mais caro do produto —
gpt-4.1, mais embedding, mais tradução da pergunta, mais busca no RAG — e não
tinha limite **nenhum**. O cadastro é aberto. Uma conta criada em trinta segundos
podia queimar a conta da OpenAI do dono num laço de `fetch`. Pior:
`/api/weather-intelligence/custom-activity` chamava o modelo **sem exigir
sequer login**.

O segundo custa tempo: erro de servidor em produção não era registrado em lugar
nenhum. O Sentry está no código desde o começo, e **sem DSN**. Foi assim que o
push ficou meses quebrado sem ninguém saber, e assim que a rota do cron passou
meses devolvendo 401 em silêncio.

**Decisão.** Nenhum fornecedor novo: o Postgres que já paga a conta resolve os
dois. `consume_rate_limit()` incrementa e decide numa única declaração —
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` — sob o lock da linha. E
`error_log` guarda onde, quando, qual mensagem e qual pilha.

**Por que atômico, e não ler-depois-escrever.** Ler o contador e gravar em
seguida deixa duas requisições simultâneas lerem 9 e passarem as duas. O limite
vira decorativo justamente sob a carga em que ele importa.

**Por que no banco, e não em memória.** O limitador já existia e caía para um
`Map` de processo quando o Upstash não está configurado — que é o caso aqui.
Em serverless, isso significa N instâncias vezes o limite. Isso não é teoria:
com o fallback ativo, **as 14 chamadas seguidas ao Pilot passaram todas** no
teste. É a medição que justifica a migration.

**O que o log NUNCA guarda.** Conteúdo de conversa com o Pilot, ficha médica,
posição da família, chaves. Um log existe para achar o defeito, não para ler a
vida de ninguém — e um log com dado sensível é um vazamento esperando o primeiro
acesso indevido. `lib/error-log.ts` filtra por nome de campo e só aceita
escalares, porque um objeto aninhado carrega qualquer coisa dentro.

**Falso verde encontrado no próprio verificador.** A primeira versão de
`/api/health` consultava `error_log` com `select(head: true)` e respondeu **`ok`
para uma tabela que não existia** — o PostgREST devolve PGRST205, e o código só
tratava 42P01. Um verificador de saúde que dá verde no que está quebrado é pior
que não ter verificador: cria confiança falsa. Agora faz leitura real e trata os
dois códigos.

**Prova.** `scripts/guardrails-test.mjs`, com navegador de verdade contra o
servidor de produção compilado. Enquanto a migration não estiver aplicada, o
teste **falha de propósito** e diz exatamente por quê — em vez de passar
descrevendo um limite que não existe.

---

## D-117 — Badges de notificação são separados por surface do app

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono decidiu separar as notificações por ícone/página. Tudo que é
Comms deve aparecer no ícone Comms; Weather no ícone Clima; Preparação no ícone
Preparação; Família no ícone Família; e Cenário no ícone Cenário. O badge
global em Comms misturava sinais diferentes demais.

**Decision**:

1. A tabela única de notificações permanece, sem migration nova.
2. Cada notificação recebe uma `surface` canônica derivada de `metadata.surface`,
   `scope` e `kind`.
3. Surfaces v1: `weather`, `family`, `comms`, `preparedness`, `scenario`,
   `system`.
4. `/api/comms/notifications` retorna `unread_by_surface`.
5. BottomNav mostra badges separados em Clima, Família, Preparação, Comms e
   Cenário.
6. Clicar em um ícone com badge abre o Inbox filtrado por aquela surface; clicar
   em um item continua levando ao `href` correto.

**Mapping v1**:

- `weather_alert` / `scope=weather` → `weather`.
- `message` → `comms`.
- `edu_content_approved` / `scope=edu` → `preparedness`.
- `simulation_invite` / `scope=simulation` → `scenario`.
- `join_request_approved`, `member_joined`, `family_invite`,
  `family_invite_accepted`, `family_invite_denied` → `family`.

**Consequences**:

- Notificações antigas continuam funcionando porque a surface é derivada.
- Novas notificações passam a gravar `metadata.surface` pelo helper.
- `system` fica disponível para notificações futuras fora do BottomNav.

---

## D-116 — BottomNav prioriza Clima no primeiro item

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu para trocar as posições de Clima e Cenário no
BottomNav. A preferência operacional é que Clima seja o primeiro ícone da
esquerda para a direita, e Cenário seja o último ícone da esquerda para a
direita.

**Decision**:

1. `nav.weather` passa a abrir a sequência do BottomNav.
2. `nav.scenario` passa para o último item do BottomNav.
3. O item central World/Dashboard permanece no mesmo lugar.
4. Comms mantém a regra de Inbox quando houver badge.

**Consequences**:

- Não requer migration.
- A ordem visual fica: Clima, Família, Preparação, World, Comms, Círculos,
  Cenário.

---

## D-115 — Notificação de mensagem também atualiza o chat

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: No teste real do dono, a notificação de nova mensagem chegava, mas
o chat nem sempre recebia a mensagem, e clicar no resumo podia parecer não fazer
nada. O teste local com duas sessões confirmou que API e banco gravam a mensagem
e criam o `href`, mas a UI dependia demais do realtime direto de
`circle_messages` e de navegação client-side suave.

**Decision**:

1. O realtime de `circle_notifications` passa a ser fallback ativo do chat:
   quando chegar uma notificação `kind='message'` do círculo aberto, `/comms`
   recarrega as mensagens daquele círculo.
2. O clique no Inbox usa navegação hard (`window.location.assign`) depois de
   disparar `mark_read` com `keepalive`, para funcionar mesmo quando o App
   Router/PWA estiver em estado intermediário.
3. O realtime direto de `circle_messages` continua como caminho primário; polling
   continua fallback lento.

**Consequences**:

- Não requer migration.
- O sintoma "badge/notificação chega, mas conversa não atualiza" fica coberto
  porque a própria notificação agora acorda o chat.

---

## D-114 — Inbox deve navegar sem bloquear e `/comms` deve reagir à query

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Em teste real, a notificação aparecia, mas clicar no resumo não
levava de forma confiável para a mensagem, e o chat parecia parar de receber a
conversa. A causa operacional é que o Inbox aguardava marcação como lida antes
de navegar, e `/comms` lia `circleId`/`messageId` apenas no mount.

**Decision**:

1. Clique em item do Inbox navega imediatamente para o `href`; marcar como lido
   roda em paralelo.
2. `/comms` passa a observar `useSearchParams`, para reagir a mudanças de
   `view`, `circleId` e `messageId` sem depender de reload completo.
3. Scroll de mensagem focada usa o container do chat, não a página inteira.
4. O foco visual da mensagem expira depois de alguns segundos, para novas
   mensagens voltarem a auto-enquadrar no fim da conversa.

**Consequences**:

- Não requer migration.
- O Inbox fica mais parecido com apps sociais: toque primeiro transporta; estado
  de leitura atualiza em seguida.

---

## D-113 — Inbox EOS segue padrão social Today / Last 7 days

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono esclareceu que o clique no ícone Comms com badge não deve
levar para a timeline interna do Comms. A experiência esperada é mais próxima do
Instagram: clicar no ícone de notificações abre uma tela/lista social com
seções como Today e Last 7 days; clicar em "EOS off grid enviou uma msg" leva
direto para a mensagem.

**Decision**:

1. Comms com badge sempre abre o Inbox EOS global, nunca `/comms?view=timeline`.
2. Inbox mostra notificações recentes lidas e não lidas, agrupadas em Today,
   Last 7 days e Earlier.
3. O badge continua contando apenas não lidas.
4. Clicar em um item marca aquele grupo como lido e navega para o `href`.
5. O chat do círculo usa scroll do container para enquadrar a última mensagem,
   porque `scrollIntoView` sozinho pode rolar a página, não a caixa do chat.

**Consequences**:

- Não requer migration.
- A timeline interna de `/comms` permanece acessível, mas deixa de ser o destino
  do ícone Comms quando há badge.

---

## D-112 — Inbox/EDU polish e notificações operacionais verificáveis

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O teste real confirmou que mensagens no Comms ficaram
instantâneas, mas revelou ajustes de experiência: chat precisa permanecer
enquadrado na última mensagem, timeline precisa colapsar histórico antigo, EDU
precisa mostrar menos metadados por padrão, e notificações de EDU/simulação
precisam aparecer de forma verificável.

**Decision**:

1. O chat do círculo mantém scroll automático para a última mensagem quando o
   usuário está no chat.
2. A timeline do Comms mostra 4 notificações por padrão e permite expandir para
   consultar as antigas.
3. EDU mostra título e vídeo por padrão; resumo/metadados/transcript ficam
   recolhidos atrás de "Mais".
4. O vídeo mais clicado no EOS fica em destaque; os demais começam como títulos,
   expandem para thumbnail/vídeo e depois para detalhes.
5. EDU aprovado notifica também o usuário admin que publicou, para teste e
   auditoria do próprio dono.
6. Convite de simulação permanece com pop-up, mas também precisa entrar no
   Inbox EOS como histórico acionável.

**Consequences**:

- Requer migration `20260804015000_edu_view_count.sql`.
- `edu_content.view_count` é métrica simples de destaque v1, não analytics
  completo.
- O Inbox segue app-level; não muda push/SMS/dispatch.

---

## D-111 — Comms vira Inbox EOS global

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de D-109/D-110, o badge do Comms já indicava interações,
mas a experiência ainda tratava notificações como uma aba dentro de Comms. O
dono pediu uma janela expandida com resumos acionáveis e destinos por tipo:
mensagem abre chat, alerta meteorológico abre Weather, material EDU abre EDU e
convite de simulação abre o fluxo de simulação.

**Decision**:

1. O ícone Comms passa a representar o **Inbox EOS**.
2. Se houver notificações não lidas, clicar Comms abre uma janela global sobre a
   tela atual; se não houver, navega para o chat.
3. Abrir o Inbox não marca notificações como lidas.
4. Clicar em um item marca somente aquele item como lido e navega para `href`.
5. `circle_notifications` evolui para notificações app-level com `scope`,
   `severity`, `source_key` e `metadata`; `circle_id` passa a ser opcional.
6. Novas fontes iniciais:
   - chat e interações de círculo/Família íntima;
   - conteúdo EDU aprovado;
   - convite para simulação;
   - alerta meteorológico pessoal por cron servidor.

**Consequences**:

- Requer migration `20260804014000_inbox_eos_notifications.sql`.
- Weather v1 roda por Vercel Cron a cada 15 minutos com `CRON_SECRET`.
- Inbox EOS continua sendo app-level persistente; não é SMS, dispatch ou push
  garantido.

---

## D-110 — Comms precisa ser realtime-first no Web/PWA

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: No teste real do dono, mensagens e números de notificação
apareceram apenas depois de alguns minutos. D-109 criou a timeline persistente,
mas o cliente ainda dependia de polling para perceber novidades, o que não é
compatível com a expectativa de chat/social apps.

**Decision**:

1. Comms usa realtime como caminho primário no Web/PWA.
2. `circle_messages` publica inserts para membros do círculo ativo.
3. `circle_notifications` publica inserts/updates para o destinatário.
4. Badge vermelho atualiza assim que uma notificação chega.
5. `/comms` recarrega o chat quando chega uma mensagem no círculo ativo.
6. Polling continua apenas como fallback de reconciliação.
7. Realtime não muda a natureza do produto: continua app-level, não push
   garantido, SMS, dispatch ou alerta de emergência.

**Consequences**:

- Requer policies RLS de leitura controlada para realtime:
  membros leem mensagens do próprio círculo; usuários leem notificações
  destinadas a eles.
- Escrita continua pelas APIs do app.
- Requer migration `20260804013000_comms_realtime.sql`.

---

## D-109 — Comms vira timeline social de notificações

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu que Comms mostre um número vermelho ao lado do ícone,
como apps Apple/social, sempre que houver mensagem, convite aceito ou alguém
entrar no círculo. Ao clicar, o usuário precisa ver uma timeline das interações,
não apenas o chat.

**Decision**:

1. Criar `circle_notifications` como feed durável por usuário/círculo.
2. A badge vermelha no ícone Comms usa a contagem de notificações não lidas.
3. `/comms` passa a ter uma timeline de notificações com eventos recentes.
4. Eventos iniciais:
   - nova mensagem de círculo para os demais membros;
   - pedido de entrada aprovado para o usuário aprovado;
   - novo membro entrou para os membros existentes;
   - convite de Família íntima enviado;
   - convite de Família íntima aceito/recusado.
5. Abrir a timeline marca as notificações como lidas via API explícita.
6. Isto é app-level notification/timeline, não push garantido, SMS, alerta de
   emergência ou dispatch.

**Consequences**:

- Comms deixa de ser só chat/rádio e passa a registrar interações sociais do
  círculo.
- Badge e timeline sobrevivem reload porque vêm do banco.
- Migration necessária: `20260804012000_circle_notifications.sql`.

---

## D-108 — Família íntima é convite aceito pelo dono da ficha

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de D-107, a UI ainda mostrava "Pedir Família íntima" na
linha do próprio usuário. Isso era confuso e errado: Paulo, como criador do
círculo `Libanio's Family`, não precisa pedir a si mesmo para entrar na própria
família. O caso real é: Paulo quer pedir para Daniela aceitar entrar na Família
íntima, porque a ficha master pertence a Daniela.

**Decision**:

1. O pedido de Família íntima é iniciado por Admin/head do círculo para outro
   membro.
2. O aceite/recusa só pode ser feito pelo próprio dono da ficha, na conta dele.
3. Admin não pode aprovar ficha master de outro adulto sem aceite desse adulto.
4. Admin pode remover/revogar alguém da Família íntima.
5. O próprio usuário, quando vê um pedido pendente na sua linha, pode aceitar,
   recusar ou sair da Família íntima.
6. `family_access_requested_by` registra quem iniciou o pedido.

**Consequences**:

- Na conta de Paulo, a linha de Paulo não mostra mais "Pedir Família íntima".
- Na conta de Paulo, a linha de Daniela mostra "Convidar Família íntima" quando
  ainda não há pedido/aprovação.
- Na conta de Daniela, a linha dela mostra "Aceitar Família íntima" ou "Recusar"
  quando Paulo tiver convidado.
- O Pilot só lê ficha master de Daniela depois de Daniela aceitar.
- Migration necessária: `20260804011000_circle_family_access_requested_by.sql`.

---

## D-107 — Círculo não é Família íntima

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: D-106 corrigiu o Pilot para reconhecer membros reais do círculo,
mas ainda confundia dois níveis de confiança. Entrar em um círculo permite
coordenação, chat, simulação, plano e compartilhamentos limitados. Isso não deve
equivaler a entrar na família íntima nem autorizar automaticamente leitura de
ficha master de outra pessoa pelo Pilot.

**Decision**:

1. Círculo e Família íntima passam a ser conceitos separados.
2. Um usuário pode ser membro do círculo sem ser membro da Família íntima.
3. Entrar na Família íntima exige pedido/autorizaçao própria dentro do círculo.
4. `circle_members.family_access_status` registra `none`, `requested`,
   `approved` ou `denied`.
5. Apenas `family_access_status='approved'` autoriza o Pilot a ler ficha master
   médica/contato de outro usuário do círculo.
6. `shared_fields.medical` volta a significar compartilhamento operacional do
   item médico/estoque do círculo, não acesso íntimo à ficha master.
7. Localização continua independente: `location` em `shared_fields` segue sendo
   o consentimento explícito para mapa/Pilot citar posição.

**Consequences**:

- O Pilot não lê ficha master de um conhecido/vizinho do círculo só porque essa
  pessoa participa do círculo.
- O painel de Círculos passa a mostrar o estado Família íntima por membro e
  permitir pedido, cancelamento, aprovação e negação.
- Migration necessária: `20260804010000_circle_family_access.sql`.
- D-106 fica refinada por D-107: "ficha visível do círculo" significa
  identificação e permissões operacionais; ficha master íntima exige aprovação
  de Família.

---

## D-106 — Pilot lê fichas visíveis do círculo

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono perguntou pela ficha master de Daniela Oliveira pelo Pilot.
Depois de D-105, o Pilot já lia a ficha master do usuário autenticado e seus
dependentes cadastrados em `family_members`, mas não lia os perfis dos outros
usuários que participam do mesmo círculo. Isso fazia o Pilot responder que a
pessoa não existia no sistema, mesmo quando ela estava no círculo.

**Decision**:

1. `/api/pilot/chat` passa a montar, no servidor, um bloco de contexto com os
   membros dos círculos do usuário autenticado.
2. O Pilot só pode usar campos de outro usuário quando a participação desse
   usuário no círculo autorizar o compartilhamento.
3. O campo `medical` em `circle_members.shared_fields` também libera a ficha
   médica visível ao Pilot: tipo sanguíneo, alergias, medicamentos e notas
   médicas. A semântica anterior de `medical` para pool de recursos continua.
4. `emergency_contact` libera nome/telefone do contato de emergência.
5. `location` continua exigindo consentimento explícito e não entra no legado
   "array vazio = compartilhar tudo".
6. Se a ficha existir mas o campo não estiver compartilhado, o Pilot deve dizer
   que o dado não está compartilhado no círculo. Se estiver compartilhado mas
   vazio, deve dizer que não consta.

**Consequences**:

- O Pilot deixa de tratar membros reais do círculo como inexistentes.
- Perguntas como "o que diz a ficha master da Daniela?" podem ser respondidas
  com os campos compartilhados por Daniela no círculo.
- Não há migration: o compartilhamento usa `shared_fields` existente.
- O uso de service-role fica restrito à rota server-side depois de confirmar que
  o usuário autenticado pertence aos círculos consultados.

---

## D-105 — Pilot lê ficha master e membros familiares no servidor

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono perguntou por que o Pilot não estava lendo a ficha da
família. O código enviava ao Pilot apenas agregados (`people`, bebê, condições
médicas e mobilidade), calculados no cliente a partir de `/api/family-members`.
A ficha master (`/api/profile/ficha`) com alergias, medicamentos, tipo sanguíneo,
contato de emergência e notas médicas não entrava no prompt conversacional.

**Decision**:

1. `/api/pilot/chat` passa a buscar a ficha master do usuário autenticado no
   servidor antes de chamar o modelo.
2. A mesma rota também busca os membros familiares do usuário com idade,
   condições, medicamentos, notas, bebê e mobilidade reduzida.
3. Esses dados entram no prompt como "FICHA DA FAMÍLIA / FAMILY RECORD".
4. O cliente continua podendo enviar agregados para cálculos rápidos, mas o
   servidor é a fonte para a ficha detalhada usada pelo Pilot conversacional.
5. O Pilot deve dizer "não consta na ficha" quando um dado sensível não estiver
   preenchido, em vez de inventar.

**Consequences**:

- Perguntas sobre alergias, medicamentos, contato de emergência, tipo sanguíneo
  e necessidades de membros podem ser respondidas pelo Pilot.
- Não expõe ficha de outros usuários/círculo: a rota lê apenas o usuário
  autenticado e seus `family_members`.
- O motor local/offline continua usando agregados; ficha detalhada é enriquecida
  pela rota online do Pilot.

---

## D-104 — EDU bloqueia ingestão RAG sem texto instrucional suficiente

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de EDU-T03, o dono perguntou o que acontece se um vídeo for
ingerido sem `Transcript / notas`. A resposta correta é que EOS só teria título,
resumo, URL e tags; isso cria risco de falso RAG, em que um link parece conteúdo
ingerido mas não contém instrução suficiente para o Pilot responder com fonte.

**Decision**:

1. EDU-T04 adiciona um guardrail de qualidade antes da ingestão RAG.
2. O texto instrucional contado para ingestão vem apenas de `summary` e
   `transcript/notas`.
3. `title`, `source_url` e tags continuam entrando como metadados no chunk, mas
   não bastam para liberar a ingestão.
4. A ingestão exige no mínimo 160 caracteres de texto instrucional.
5. O Admin EDU mostra a contagem de caracteres instrucionais por item e desabilita
   "Ingerir RAG" quando o conteúdo é insuficiente.

**Consequences**:

- Um vídeo só com URL não entra no RAG.
- O dono precisa adicionar resumo/notas antes de ingerir.
- YouTube API/transcript automático continuam fora; esta fase só impede ingestão
  vazia ou enganosa.

---

## D-103 — EDU aprovado pode ser ingerido para o RAG com proveniência

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: EDU-T01 criou o catálogo aprovado e `rag_enabled`; EDU-T02 tornou
o vídeo consumível no app. O próximo passo é permitir que conteúdo aprovado do
dono alimente o RAG sem virar busca genérica nem escrita silenciosa em
`knowledge_base`.

**Decision**:

1. EDU-T03 cria ingestão admin-only de conteúdo `edu_content` para
   `knowledge_base`.
2. Só conteúdo `status='approved'` e `rag_enabled=true` pode ser ingerido.
3. O texto ingerido vem de `title`, `summary`, `transcript/notas`,
   `source_url` e tags. Não há YouTube API nem transcript automático.
4. A proveniência fica em `knowledge_base.source = 'edu:<edu_content.id>'` e
   `knowledge_base.source_version = 'v<edu_content.version>'`.
5. Reingerir um item apaga os chunks anteriores daquele `source` e grava chunks
   novos com embeddings OpenAI `text-embedding-3-small`.
6. Depois de inserir, `edu_content.rag_ingested_at` é atualizado.

**Consequences**:

- O Pilot/RAG passa a poder recuperar conteúdo aprovado do dono quando
  semanticamente relevante.
- Não há nova migration nesta fase; o schema atual de `knowledge_base` já tem
  `source_version`.
- Captura automática de transcript, scraping de YouTube e criação de tarefas a
  partir de EDU continuam fora até decisão própria.

---

## D-102 — Rotas admin exigem privilégio no middleware

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: As APIs admin já validam `ADMIN_EMAILS`, e `/edu` só mostra o botão
Admin EDU quando `/api/edu` retorna `canAdmin=true`. Mesmo assim, uma rota
`/admin/*` carregada por usuário autenticado comum dependeria da tela cliente
para mostrar 403. Para superfícies administrativas, a autorização deve acontecer
antes de renderizar a página.

**Decision**:

1. Todo pathname `/admin` ou `/admin/*` exige usuário autenticado e
   `isAdminEmail(user.email)` no middleware.
2. Usuário autenticado não-admin é redirecionado para `/dashboard` antes de
   carregar a UI admin.
3. As APIs admin continuam mantendo seus próprios 403 server-side; middleware é
   defesa adicional, não substituição.
4. O botão Admin EDU em `/edu` continua condicionado a `canAdmin=true` vindo de
   `/api/edu`.

**Consequences**:

- Usuários comuns não veem o botão Admin EDU e não carregam páginas `/admin/*`.
- Links admin em Settings e EDU podem existir para admins sem expor superfície
  administrativa a usuários comuns.

---

## D-101 — EDU exibe vídeo aprovado dentro do EOS

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: EDU-T01 permite ao dono cadastrar vídeo do YouTube como conteúdo
aprovado, mas o usuário ainda sai do app pelo link da fonte para assistir. Para
o Preparedness Engine funcionar como experiência guiada, o conteúdo aprovado
precisa ser consumível dentro do `/edu` sem confundir isso com ingestão RAG.

**Decision**:

1. EDU-T02 adiciona consumo de vídeo aprovado dentro do `/edu`.
2. Quando `source_type='youtube'` e `source_url` for reconhecida, o app renderiza
   um player embutido com domínio `youtube-nocookie.com`.
3. A fonte continua visível como link externo; o player não substitui
   proveniência.
4. Sem YouTube API, transcript automático, embeddings ou escrita em
   `knowledge_base` nesta tarefa.
5. URLs não reconhecidas continuam degradando para o link de fonte.

**Consequences**:

- `/edu` passa a permitir assistir conteúdo YouTube aprovado no app.
- `edu_content` não muda; a URL existente é suficiente.
- A próxima evolução continua sendo ingestão aprovada para RAG com
  `edu_content.id/version` como proveniência, ou uma experiência de aula com
  progresso/checklists se for priorizada explicitamente.

---

## D-090 — EDU vira catálogo aprovado antes de alimentar RAG

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono quer usar o próprio canal do YouTube como fonte para EDU e
RAG do EOS. O risco é ligar YouTube/RAG direto sem catálogo, aprovação,
versionamento ou fonte visível, fazendo o Pilot responder com conteúdo sem
proveniência operacional.

**Decision**:

1. EDU-T01 cria um catálogo oficial `edu_content`.
2. Usuários autenticados veem apenas conteúdo `approved` em `/edu`.
3. O dono/admin (`ADMIN_EMAILS`) alimenta e edita o catálogo em `/admin/edu`.
4. Cada item guarda tipo de fonte, URL, tags de cenário, resumo, transcript/notas,
   status, versão e `rag_enabled`.
5. `rag_enabled` não escreve embeddings e não altera `knowledge_base`; é apenas
   a intenção de ingestão futura.
6. YouTube entra por URL/transcript/summary aprovados. Integração com YouTube API
   e ingestão automática ficam fora desta tarefa.

**Consequences**:

- Nova migration `20260803002000_edu_content.sql`.
- Novo endpoint `/api/edu`.
- Novas superfícies `/edu` e `/admin/edu`.
- Próxima evolução correta é um job de ingestão aprovado que leia `edu_content`
  e grave chunks em `knowledge_base` mantendo `edu_content.id/version` como
  proveniência.

---

## D-089 — Frequências de rádio são editáveis por círculo

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: A referência de frequências familiares inserida em D-088 não pode
ficar congelada no código. Cada família/círculo precisa ajustar canais, usos,
notas, serviços para escuta e guia rápido conforme seus rádios, região e plano.

**Decision**:

1. Criar `circle_radio_profiles` como documento JSON por círculo.
2. Todos os membros autenticados do círculo podem ler a referência.
3. Somente membros `Admin` ou `Editor` podem salvar alterações.
4. A referência padrão D-088 continua como fallback quando o círculo ainda não
   salvou um perfil próprio ou quando a migration não está aplicada.
5. A edição não altera a regra legal: EOS armazena referência operacional, não
   valida licença, autorização FCC, scanner, despacho, SMS ou transmissão real.
6. Não usar `circle_messages` para guardar configuração; chat e perfil de rádio
   são contratos separados.

**Consequences**:

- Nova migration `20260803001000_circle_radio_profiles.sql`.
- Novo endpoint `/api/comms/radio`.
- `/comms` ganha modo leitura/edição inline para canais VHF/UHF, referências
  nacionais, opções úteis, guia rápido e aviso legal.
- Próxima evolução possível: histórico/versionamento e perfis por cenário.

---

## D-088 — Comms inclui referência de frequências familiares pré-programadas

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois do chat do círculo entrar em COMMS-T01, o dono forneceu uma
referência visual com canais VHF/UHF da família, frequências nacionais, serviços
para escuta, opções MURS/GMRS/FRS e guia rápido de Baofeng UV-5R. O objetivo é
que a aba Comms tenha utilidade real antes de qualquer Mesh/LoRa.

**Decision**:

1. `/comms` passa a mostrar uma referência estática owner-provided de rádio:
   canais familiares VHF/UHF, frequências nacionais, NOAA, marítima, serviços
   de emergência para escuta, MURS/GMRS/FRS e guia rápido de uso.
2. Essa referência é conteúdo operacional do EOS, não fonte legal definitiva.
3. A tela deve manter aviso explícito: transmissão VHF/UHF de radioamador nos
   EUA exige licença apropriada em operação normal; em risco imediato, priorizar
   911/autoridades quando disponíveis e confirmar regras FCC/locais antes de
   transmitir.
4. Não há migration nesta etapa. Frequências editáveis por círculo ficam para
   evolução futura.
5. Mesh/LoRa continua bloqueado por G-05.

**Consequences**:

- `/comms` deixa de ter apenas um guia genérico de rádio e passa a carregar a
  tabela operacional inicial da família.
- O próximo passo natural em Comms, se priorizado, é tornar frequências
  configuráveis por círculo com permissões de Admin/Editor.
- A presença das frequências no app não transforma o EOS em rádio, SMS,
  dispatch, scanner garantido ou rede off-grid.

---

## D-087 — Comms começa como chat do círculo + guia de rádio, sem Mesh hardware

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de PREP-T01 liberar a antiga aba Checklist, o dono quer uma
aba Comms para comunicação do círculo, referência de rádio amador e futuro mesh.
O risco é misturar três coisas diferentes: chat app-level, alerta/dispatch e
hardware off-grid.

**Decision**:

1. COMMS-T01 começa no Web/PWA core com chat de texto por círculo.
2. Mensagens são `circle_messages`, escopadas ao círculo, com RLS deny-all e
   acesso apenas via API autenticada que checa membership.
3. Rádio/frequências entram como guia rápido e referência operacional na UI,
   sem transmissão real.
4. Mesh/LoRa fica visível como status/futuro canal, mas hardware continua
   bloqueado por G-05.
5. Chat não é alerta, SMS, dispatch, WhatsApp nem garantia de entrega fora do
   EOS.

**Consequences**:

- `docs/21-comms.md` passa a ser a spec canônica.
- Migration `20260803000000_circle_messages.sql` adiciona a tabela.
- `/api/comms/messages` é o contrato v1 para leitura/escrita.
- Próximas evoluções devem decidir retenção, push por mensagem, delete/edit,
  anexos e eventual alerta escalável separadamente.

---

## D-086 — Checklist e Recursos viram Preparação; Comms entra na navegação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu que Checklist e Recursos fossem unificados em uma
mesma aba, liberando o espaço da navegação para uma nova aba Comms. A página de
Recursos já continha o comportamento correto para PREP-T01: resumo de prontidão,
recursos reais, briefing OpenAI e checklist embutido com sincronização
checklist → inventário quando um item é marcado como adquirido.

Manter `/inventory` e `/checklist` como abas separadas preservaria a confusão de
fluxo que o Preparedness Engine existe para resolver.

**Decision**:

1. Criar `/preparedness` como a superfície única de Preparação.
2. Redirecionar `/inventory` e `/checklist` para `/preparedness`.
3. A aba antiga Recursos passa a abrir Preparação.
4. A aba antiga Checklist passa a abrir Comms.
5. Comms recebe uma primeira superfície navegável, mas sem backend de chat,
   retenção, permissões ou Mesh/LoRa. Isso continua para COMMS-T01.
6. Nenhuma migration é necessária: os contratos `/api/inventory` e
   `/api/checklist` continuam sendo as fontes atuais.

**Consequences**:

- O usuário vê uma única aba para recursos, tarefas, gaps e checklist.
- Links antigos para `/inventory` e `/checklist` não quebram, mas convergem para
  Preparação.
- O Pilot e o dashboard passam a apontar para `/preparedness`.
- COMMS-T01 permanece como próximo passo para especificar chat do círculo,
  rádio/frequências, permissões, retenção e relação com alertas.

---

## D-085 — Preparedness Engine transforma monitoramento em preparação acionável

**Date**: 2026-08-03
**Status**: DECIDED / DOCUMENTADO

**Context**: O dono definiu que o EOS não pode ser apenas um app que monitora
weather, hazards e sistemas externos. A maior solução de produto é ajudar a
família a se preparar: aprender, comprar/adquirir materiais, treinar, revisar
planos, convidar pessoas para simulações e melhorar comunicação antes da crise.

Também ficou claro que Checklist e Recursos estão artificialmente separados, e
que a nova aba Comms deve nascer no espaço liberado por essa unificação. EDU
deve poder ser alimentado por conteúdo aprovado do canal do dono no YouTube,
mas esse conteúdo só pode virar RAG/ação depois de ingestão, transcript,
classificação, aprovação e versionamento.

**Decision**:

1. Criar o **Preparedness Engine** como core Web/PWA, não como feature mobile.
2. Unificar Checklist + Recursos em **Preparação**, uma superfície para tarefas,
   materiais, gaps de aquisição, itens possuídos e prontidão por cenário.
3. Criar **Comms app-level** como lane própria: chat do círculo, guia rápido de
   rádio, frequências, referência de radioamador e status de canais. Mesh/LoRa
   hardware continua separado e bloqueado por G-05.
4. Criar **EDU** como fonte editorial aprovada do EOS. O canal do dono no
   YouTube pode alimentar EDU/RAG, mas só por fluxo especificado de ingestão,
   transcript, classificação por cenário, aprovação e versionamento.
5. Criar **onboarding contextual por simulação**: convidado entra pelo cenário
   que o trouxe e o Pilot guia até estar coberto pelo círculo/plano.
6. O Pilot passa a ter um papel explícito de **educador situacional**: instrui,
   pergunta, valida e conduz preparação, mas não escreve estado persistente sem
   confirmação.

**Consequences**:

- `docs/20-preparedness-engine.md` passa a ser a spec canônica.
- PREP-T00 fica completo; PREP-T01 é o próximo task de produto.
- Nenhuma migration, UI, YouTube API, chat, mobile, Automotive ou LoRa é
  autorizada por esta decisão.
- Toda recomendação de Pilot/EDU/Simulação que virar tarefa/recurso deve ter
  fonte visível e confirmação explícita do usuário.

---

## D-084 — EOS passa a ser plataforma multi-superfície, não quatro produtos

**Date**: 2026-08-03
**Status**: DECIDED / DOCUMENTADO

**Context**: O dono trouxe a intenção de levar o EOS para App Store, Google
Play, CarPlay, Web e futuras superfícies, junto com a evolução de EDU,
Preparação e Comms. O relatório externo `EOS-PHASE0-FOUNDATION-ALIGNMENT_1.md`
mostrou que o App Spine ainda descrevia uma estratégia antiga: Web PWA ativo,
React Native planejado e LoRa longo prazo, mas sem uma camada formal de
plataforma.

O risco seria abrir frentes paralelas — Web, iOS, Android, Automotive e Mesh —
como produtos separados, duplicando lógica de decisão, UI, regras de segurança,
consentimento e plano.

**Decision**:

1. **EOS será tratado como plataforma multi-superfície com um único core
   operacional.** Web/PWA permanece a superfície primária de validação.
2. **Não iniciar mobile agora.** G-03 continua aberto; `/mobile/` contém
   template/código conceitual e não é um app React Native inicializado.
3. **iOS e Android serão adapters nativos futuros**, usados para capacidades que
   a PWA não deve prometer sozinha: push nativo, background location, secure
   storage, câmera/QR, empacotamento e release nas lojas.
4. **CarPlay/Android Auto serão companion modes restritos**, não EOS completo no
   carro. Sem chat longo, edição de plano, vídeos ou simulador.
5. **Comms e Mesh não são a mesma coisa.** Comms app-level pode nascer no Web
   core; Mesh/LoRa hardware continua bloqueado por G-05.
6. O App Spine ganha **PHASE 0B — Foundation Alignment**, uma etapa documental
   curta para reconciliar plataforma, roadmap, gates e próxima fase de produto
   antes de novas features grandes.

**Consequences**:

- `docs/05-platform-strategy.md` passa a falar em Product Core, Domain Core,
  Shared UI e Platform Adapters.
- `docs/07-roadmap.md` registra PHASE 0B e a próxima fase de produto:
  Preparedness Engine.
- `docs/10-decision-gates.md` mantém G-03 e G-05 abertos e adiciona G-06 para
  Automotive.
- Nenhum código mobile, Capacitor, Expo, React Native init ou integração de loja
  é autorizado por esta decisão.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — Rota autoral do EOS pode abrir Google Maps com múltiplas paradas

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu que uma rota criada no EOS como ponto 1 → ponto 2 →
ponto 3 possa iniciar navegação no Google Maps já com a sequência inteira, não
apenas com um destino final. Isso é diferente de pedir que o EOS calcule ruas
como o Google: o plano carrega a intenção e a ordem; o app de mapas calcula as
ruas.

**Decision**:

1. A rota do plano continua sendo **autoral e offline**: a família desenha o
   caminho/ordem que quer seguir e o EOS guarda a `LineString`.
2. Quando houver handoff, o EOS monta um Google Maps URL com `origin`,
   `destination` e `waypoints` na ordem do traçado. O Google Maps calcula a rota
   por ruas e pode pedir o toque final em "Iniciar".
3. O EOS não promete que o Google obedecerá cada vértice desenhado como rua
   exata. Para não estourar URL nem transformar todo clique em parada, o handoff
   usa uma sequência limitada de pontos intermediários, preservando a ordem.
4. O fallback antigo de um destino continua existindo para ações simples
   ("rota até ela", "como chegar ao abrigo").

**Consequences**: sem migration. `lib/world/navigation.ts` vira o lugar único de
construção de links de navegação, incluindo rotas multi-stop. A UI do plano passa
a oferecer "Google Maps" em cada rota desenhada.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos por círculo, e o servidor nunca adivinha qual

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: A migration `20260731000000_multiple_family_plans.sql` derrubou o
índice de plano-ativo-único: uma família precisa de planos separados para
situações separadas — queda de energia, sem sinal, incidente na escola. Um
documento só forçava tudo junto e deixava a execução ambígua.

Só que o `PUT /api/plans` pegava **o plano mais recente do círculo** e
sobrescrevia. Enquanto havia um só, isso era equivalente a "o plano". Com a
migration aplicada em produção, virou **destruir o outro plano em silêncio** —
provado em teste antes da correção: dois `PUT` devolveram o mesmo `planId` e o
ponto de encontro do primeiro plano apareceu dentro do segundo.

**Decision**:

1. **`planId` seleciona; `createNew` cria.** O editor já mandava os dois.
2. **Sem `planId` e com mais de um plano no círculo, o servidor RECUSA** com
   `409 ambiguous_plan`. Adivinhar qual sobrescrever é a operação errada: perder
   o plano que a família combinou é a pior falha que este código pode ter. Com
   zero ou um plano não há ambiguidade e o comportamento antigo continua.
3. **Id de outro círculo é 403, não silêncio.** A busca por id deixou de filtrar
   por círculo justamente para que a checagem de posse decida — antes, um id
   estrangeiro simplesmente não casava e caía no fallback perigoso.
4. **O GET devolve a lista de planos** junto com o documento escolhido, para a
   escolha ficar na tela e não escondida no servidor.

**Consequences**: `scripts/multi-plan-test.mjs` (`npm run test:multiplan`) — 4/4,
todas lendo o BANCO depois da operação. Foi ele que provou o defeito antes de eu
corrigir, e é ele que impede a volta.

---

## D-081 — Camadas hidrológicas, vento de impacto e direção oficial de tornado

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu novas camadas na base do mapa: flood area, storm
surge, wind impact e modelos/forecast para saber a provável direção de um
tornado. O EOS já desenha radar, alertas genéricos, vento em grade e ciclones,
mas isso ainda mistura ameaças diferentes na mesma camada "Alertas".

**Decision**:

1. **Flood area** e **storm surge** entram como camadas próprias a partir dos
   polígonos oficiais de alerta do NWS já normalizados por `/api/hazards`.
   NFHL/FEMA e mapas de risco NHC ficam como evolução estática, mas não bloqueiam
   a leitura operacional de alertas ativos.
2. **Wind impact** é uma camada derivada do grid de vento já existente: rajadas
   e vento sustentado viram células de impacto com thresholds explícitos. Ela é
   análise visual do EOS/Open-Meteo, não aviso oficial.
3. **Tornado direction** nunca será inferida por geometria ou pelo modelo. O mapa
   só desenha uma seta quando o texto oficial do NWS traz movimento, como
   "moving northeast at 40 mph". Sem isso, a camada fica silenciosa e a UI deve
   dizer que não há direção oficial disponível.
4. O mapa separa visualmente `Alertas`, `Flood`, `Surge`, `Vento impacto` e
   `Tornado`, para o usuário limpar a tela sem desligar o dado que o Pilot
   recebe.

**Consequences**: WV2-T12 entra no roadmap. A primeira versão resolve o uso
operacional com alertas ativos oficiais e vento derivado. Providers estáticos de
NFHL/FEMA e SLOSH/NHC podem ser adicionados depois como camadas de risco
pré-evento, com legenda própria para não confundir risco histórico com alerta
ativo.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos, execução cancelável e passos editáveis

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: Ao testar PLAN-T08, o dono encontrou três problemas de produto:

1. uma família precisa de **vários planos** por situação ("sem luz", "sem
   celular", "evento aglomerado", "escola");
2. o passo "Pare e confirme a fonte" aparecia como etapa 1, mas não vinha do
   plano editável — era uma trava fixa do EOS;
3. executar plano precisa ter **cancelar / falso alarme**.

**Decision**:

1. O EOS passa a aceitar múltiplos planos ativos por círculo. O nome do plano é
   o seletor operacional, até existir um campo estruturado de cenário.
2. O executor mostra somente passos derivados do plano editável: gatilhos,
   papéis, pontos, rotas e encerramento. Avisos fixos do EOS podem existir, mas
   precisam ser rotulados como **aviso do sistema**, não como passo do plano.
3. Execução local tem cancelamento explícito. Cancelar não apaga nem altera o
   plano; apenas encerra aquela execução e pode avisar o círculo de falso alarme.

**Consequences**: a migration remove o índice que obrigava um único plano ativo
por círculo. A próxima camada ainda deve persistir execuções compartilhadas, mas
o modelo de plano já não bloqueia múltiplos cenários.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos por círculo, e o servidor nunca adivinha qual

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: A migration `20260731000000_multiple_family_plans.sql` derrubou o
índice de plano-ativo-único: uma família precisa de planos separados para
situações separadas — queda de energia, sem sinal, incidente na escola. Um
documento só forçava tudo junto e deixava a execução ambígua.

Só que o `PUT /api/plans` pegava **o plano mais recente do círculo** e
sobrescrevia. Enquanto havia um só, isso era equivalente a "o plano". Com a
migration aplicada em produção, virou **destruir o outro plano em silêncio** —
provado em teste antes da correção: dois `PUT` devolveram o mesmo `planId` e o
ponto de encontro do primeiro plano apareceu dentro do segundo.

**Decision**:

1. **`planId` seleciona; `createNew` cria.** O editor já mandava os dois.
2. **Sem `planId` e com mais de um plano no círculo, o servidor RECUSA** com
   `409 ambiguous_plan`. Adivinhar qual sobrescrever é a operação errada: perder
   o plano que a família combinou é a pior falha que este código pode ter. Com
   zero ou um plano não há ambiguidade e o comportamento antigo continua.
3. **Id de outro círculo é 403, não silêncio.** A busca por id deixou de filtrar
   por círculo justamente para que a checagem de posse decida — antes, um id
   estrangeiro simplesmente não casava e caía no fallback perigoso.
4. **O GET devolve a lista de planos** junto com o documento escolhido, para a
   escolha ficar na tela e não escondida no servidor.

**Consequences**: `scripts/multi-plan-test.mjs` (`npm run test:multiplan`) — 4/4,
todas lendo o BANCO depois da operação. Foi ele que provou o defeito antes de eu
corrigir, e é ele que impede a volta.

---

## D-081 — Um marcador que pisca é um marcador sendo recriado

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono relatou o pino com a foto piscando no mapa. Duas causas,
independentes, e as duas confirmadas antes de qualquer correção:

1. **`/api/circles` assina as fotos a cada requisição.** A URL muda a cada
   consulta apontando para o MESMO arquivo, e o mapa consulta a cada 15 s. O
   `src` da imagem mudava sozinho e o navegador rebaixava a foto.
2. **`placeOverlays` destruía e recriava TODOS os marcadores** a cada
   atualização. Um `<img>` remontado é um `<img>` que recarrega.

**Decision**:

1. **A URL assinada não conta como mudança.** O hook compara pela parte estável
   da URL (sem a query) e, quando o arquivo é o mesmo, **preserva a URL
   anterior** — o `src` literalmente não muda.
2. **Marcadores de PESSOAS são reconciliados, não recriados.** Guardados num
   mapa por id: posição nova move o pino; só uma mudança de forma (foto, nome,
   freshness) cria elemento novo. Abrigos e destino seguem recriados — são
   poucos, sem imagem, e não se movem; ali reconciliar não se paga.

**Consequences**: "não pisca" não se mede olhando. `scripts/marker-stability-test.mjs`
(`npm run test:marker`) carimba os nós no DOM e confere que o carimbo sobreviveu
a duas rodadas de atualização — se o marcador tivesse sido recriado, o carimbo
teria ido embora com o nó antigo.

O teste **sobe uma foto real** para a conta de teste. Sem isso a asserção da URL
comparava duas listas vazias e passava sem medir nada — a mesma válvula de escape
que já deixou dois outros testes desta suíte reportarem verde sem testar. Hoje
"nenhuma foto no mapa" é reportado como FALHA do teste, não como sucesso.

Controle negativo executado: revertendo as duas correções, o teste acusa
`preservados=0 de 2` e a troca da URL.

---

## D-079 — Executar plano: Pilot vira host situacional, não só chat

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO MVP

**Context**: O dono apontou a falha certa: o Plano da Família recebeu muito
investimento, mas ainda se comportava como documento. Durante um evento real
("active shooting" perto da escola da filha, por exemplo), a pergunta não é
"onde está escrito o plano?", é **"como eu aciono a família e o que acontece
agora, passo a passo?"**

O Pilot também estava limitado por forma: respondia perguntas, mas não conduzia
uma sessão. Num evento, a pessoa não quer um chat aberto; quer um host
situacional dizendo a próxima ação, quem falta responder e o que não fazer.

**Decision**:

1. **Executar Plano vira modo do produto.** O plano deixa de ser só documento e
   passa a ser um playbook executável: alertar círculo, pedir/compartilhar
   localização, seguir papéis, pontos, rotas e gatilhos na ordem lógica.
2. **O Pilot vira host situacional.** O tom é de onboarding operacional: uma
   instrução por vez, linguagem curta, próxima ação clara, confirmação visível.
   Ele lê o plano aprovado e o estado do EOS; não inventa um plano durante a
   crise.
3. **A entrada fica no painel da pessoa/foto.** Tocar no próprio rosto no mapa
   abre ferramentas de presença e comando: estou seguro, enviar/pedir
   localização, alertar família e executar o plano atual.
4. **Active shooting exige trava explícita.** O EOS pode coordenar comunicação,
   localização e responsabilidades. Ele não deve improvisar instrução tática,
   nem mandar familiar se aproximar de área perigosa. A orientação padrão é:
   seguir escola/autoridades, chamar emergência quando apropriado, não dirigir
   para a área se a autoridade mandou evitar.
5. **MVP sem nova tabela.** A primeira execução é local e derivada da versão
   atual do plano: o aparelho monta os passos, permite marcar progresso e envia
   push preset ao círculo. Persistência multiusuário, timeline auditável e
   estado compartilhado viram a próxima migration (`family_plan_executions`).

**Consequences**: PLAN-T08 fica criado no roadmap. PLAN-T07 (Pilot propõe/revisa
planos) continua existindo, mas a prioridade operacional muda: antes de a IA
escrever planos melhores, o EOS precisa **executar** o plano que a família já
aprovou.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos por círculo, e o servidor nunca adivinha qual

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: A migration `20260731000000_multiple_family_plans.sql` derrubou o
índice de plano-ativo-único: uma família precisa de planos separados para
situações separadas — queda de energia, sem sinal, incidente na escola. Um
documento só forçava tudo junto e deixava a execução ambígua.

Só que o `PUT /api/plans` pegava **o plano mais recente do círculo** e
sobrescrevia. Enquanto havia um só, isso era equivalente a "o plano". Com a
migration aplicada em produção, virou **destruir o outro plano em silêncio** —
provado em teste antes da correção: dois `PUT` devolveram o mesmo `planId` e o
ponto de encontro do primeiro plano apareceu dentro do segundo.

**Decision**:

1. **`planId` seleciona; `createNew` cria.** O editor já mandava os dois.
2. **Sem `planId` e com mais de um plano no círculo, o servidor RECUSA** com
   `409 ambiguous_plan`. Adivinhar qual sobrescrever é a operação errada: perder
   o plano que a família combinou é a pior falha que este código pode ter. Com
   zero ou um plano não há ambiguidade e o comportamento antigo continua.
3. **Id de outro círculo é 403, não silêncio.** A busca por id deixou de filtrar
   por círculo justamente para que a checagem de posse decida — antes, um id
   estrangeiro simplesmente não casava e caía no fallback perigoso.
4. **O GET devolve a lista de planos** junto com o documento escolhido, para a
   escolha ficar na tela e não escondida no servidor.

**Consequences**: `scripts/multi-plan-test.mjs` (`npm run test:multiplan`) — 4/4,
todas lendo o BANCO depois da operação. Foi ele que provou o defeito antes de eu
corrigir, e é ele que impede a volta.

---

## D-081 — Um marcador que pisca é um marcador sendo recriado

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono relatou o pino com a foto piscando no mapa. Duas causas,
independentes, e as duas confirmadas antes de qualquer correção:

1. **`/api/circles` assina as fotos a cada requisição.** A URL muda a cada
   consulta apontando para o MESMO arquivo, e o mapa consulta a cada 15 s. O
   `src` da imagem mudava sozinho e o navegador rebaixava a foto.
2. **`placeOverlays` destruía e recriava TODOS os marcadores** a cada
   atualização. Um `<img>` remontado é um `<img>` que recarrega.

**Decision**:

1. **A URL assinada não conta como mudança.** O hook compara pela parte estável
   da URL (sem a query) e, quando o arquivo é o mesmo, **preserva a URL
   anterior** — o `src` literalmente não muda.
2. **Marcadores de PESSOAS são reconciliados, não recriados.** Guardados num
   mapa por id: posição nova move o pino; só uma mudança de forma (foto, nome,
   freshness) cria elemento novo. Abrigos e destino seguem recriados — são
   poucos, sem imagem, e não se movem; ali reconciliar não se paga.

**Consequences**: "não pisca" não se mede olhando. `scripts/marker-stability-test.mjs`
(`npm run test:marker`) carimba os nós no DOM e confere que o carimbo sobreviveu
a duas rodadas de atualização — se o marcador tivesse sido recriado, o carimbo
teria ido embora com o nó antigo.

O teste **sobe uma foto real** para a conta de teste. Sem isso a asserção da URL
comparava duas listas vazias e passava sem medir nada — a mesma válvula de escape
que já deixou dois outros testes desta suíte reportarem verde sem testar. Hoje
"nenhuma foto no mapa" é reportado como FALHA do teste, não como sucesso.

Controle negativo executado: revertendo as duas correções, o teste acusa
`preservados=0 de 2` e a troca da URL.

---

## D-079 — O Pilot deixa de morar numa tela, enxerga o clima ao vivo e analisa atividades

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: Três coisas do dono, todas sobre o mesmo produto:

1. o orbe do Pilot só existia no dashboard — para perguntar era preciso voltar
   para casa, o oposto de um copiloto;
2. perguntado sobre um evento climático **em andamento**, ele dizia que não
   enxergava — enquanto o mapa ao lado desenhava o cone da tempestade;
3. o assistente da aba Clima analisava atividades ("vou trabalhar no telhado") e
   o Pilot, que sabe muito mais, não.

**Decision**:

1. **O risco virou estado do APP.** `RiskProvider` subiu para o layout
   autenticado; `PilotDock` põe o orbe em qualquer tela. No dashboard o dock
   some, porque lá a entrada é a PilotBar (D-070) — dois orbes seriam dois
   caminhos para a mesma coisa.
2. **O contexto do dock é montado SOB DEMANDA.** Inventário, ficha, checklist,
   ciclones e vento só são buscados ao abrir. Um app de emergência não pode
   cobrar cinco requisições de rede e bateria em toda tela por uma conversa que
   talvez não aconteça.
3. **O Pilot recebe ciclones e vento medido.** O dado existia desde D-078 e
   simplesmente não era enviado — a mesma armadilha de estender uma ponta e
   esquecer a outra que já custou cinco bugs neste projeto.
4. **Ciclone citado é ciclone qualificado.** Regra explícita: dizer na mesma
   frase se aquela tempestade pode ou não afetar a pessoa, com o rumo em ponto
   cardeal e não em graus. Sem isso o modelo anunciava "tempestade tropical
   Genevieve, ventos de 93 km/h, a 5.051 km, direção 285°" — verdadeiro, e lido
   como ameaça pelo dono de uma casa na Flórida.
5. **Análise de atividade absorvida e melhorada.** O endpoint da aba Clima tinha
   prompt próprio e não sabia nada da casa. O Pilot já tem família, reservas,
   alertas oficiais, ciclone e plano, então a mesma pergunta rende mais. O
   formato estruturado (veredito, motivo com números, janela do dia, o que muda a
   resposta) foi copiado de lá porque funciona: quem pergunta se pode subir no
   telhado quer um sim/não com hora, não três parágrafos.
6. **Atividade não se julga pelo estoque.** Regra explícita depois do teste vetar
   trabalho no telhado com rajada de 13 km/h: o veredito depende das condições
   que afetam AQUELA atividade — rajada, chuva, raio, UV, visibilidade, alerta.
   Água e checklist não entram; ninguém deixa de subir no telhado porque tem
   pouca água guardada. E não se veta sem um número que justifique.

**O orbe é o mesmo, e é do usuário.** Mesma estrela da PilotBar — duas formas
diferentes para a mesma coisa fariam aprender o produto duas vezes. E ele é
**arrastável**: um canto fixo atrapalha alguém (canhoto, tela grande, lista cujo
conteúdo importante mora ali), e não existe canto certo para eu escolher. A
posição é guardada em fração da tela, não em pixels, senão girar o aparelho
jogaria o orbe para fora da vista. Histerese de 8 px separa toque de arrasto, e
o arrasto respeita onde o dedo pegou.

**Regressão que eu causei e que foi para produção**: envolvi o Pilot num `.wv2`
só para herdar as cores. `.wv2` é a CASCA do dashboard — fixed, inset 0, fundo
preto —, então o app inteiro ficou preto menos o dashboard e a Família, que já
têm casca própria. `wv2-portal` mantém os tokens e devolve o layout. Ver
[[.wv2 é a CASCA do dashboard]].

**Consequences**: `scripts/pilot-abilities-test.mjs` (`npm run test:pilot`)
exercita o MODELO de verdade — o defeito relatado não é reproduzível sem ele. O
teste custa tokens e é mais lento, e vale: foi ele que pegou os itens 4 e 6.

Ele também mostrou, pela terceira vez nesta sequência, como um teste passa sem
testar: a primeira versão lia o fluxo inteiro do chat, que já contém o briefing
local com rajada e chuva — então "responde com números" passava **antes** de o
modelo dizer qualquer coisa. Hoje ele espera a resposta HTTP e lê **apenas a
última bolha**.

---

## D-078 — A tempestade no mapa: onde está, para onde vai, e o que o cone NÃO diz

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu o que os apps de clima entregam e o EOS não: ver os
ventos e as direções, tocar num alerta e descobrir **onde** ele é, e acompanhar
para onde a tempestade está indo.

O EOS já *sabia* dessas coisas em texto — o provider `nhc` lê o `CurrentStorms`
desde sempre. O que faltava era **geometria**: "furacão a 340 km" é um número que
ninguém traduz em decisão. Com o cone desenhado, "minha casa está dentro?" se
responde num olhar.

**Decision**:

1. **Ciclones vêm do serviço GIS do NHC**, com cone, trajetória e pontos de
   previsão oficiais (`lib/world/cyclones.ts`). O EOS **redesenha**; não calcula,
   não interpola e não "melhora" o cone. O dia em que fizermos isso, a tela passa
   a afirmar algo que nenhuma autoridade afirmou.
2. **O cone é incerteza da posição do CENTRO, não área de dano** — e a UI diz
   isso, sempre. Ventos e chuva vão muito além dele. Sem essa frase, "estou fora
   do cone" vira falsa segurança, que é o pior resultado possível desta feature.
3. **Vento é uma GRADE, não um ponto** (`lib/world/wind.ts`). Uma seta na casa da
   pessoa não mostra o vento girar. São 25 leituras numa requisição única e sem
   chave — o Open-Meteo aceita listas de coordenadas. E são leituras pontuais
   desenhadas como setas, **não** um modelo interpolado nem animação de
   partículas: uma animação bonita insinuaria resolução que estes dados não têm.
4. **Alerta vira lugar.** Os alertas do card passam a vir de `/api/hazards`, que
   carrega geometria, e tocar num deles leva a câmera até ele.
5. **Camadas são escolha de LEITURA, não de dado.** Desligar o radar não deixa o
   EOS cego nem o Pilot mudo — só limpa a tela, que num evento com alerta, cone,
   vento e família no mesmo mapa é a diferença entre ler e não ler. Ciclone fica
   ligado por padrão: "existe um furacão vindo" não é informação opcional.

**O evento pulsa na cor do risco.** Pedido do dono, e é a decisão de design mais
barata desta feature: a cor que diz *quão ruim está* no topo da tela passa a
marcar *onde isso está acontecendo*. Dois lugares, um vocabulário — a ligação se
faz sem legenda nenhuma. O item tocado na lista pulsa junto, então fica claro
qual dos alertas está no mapa. Com `prefers-reduced-motion`, o pulso vira
contorno permanente: a informação é a cor, não o movimento.

**A tempestade é um botão, e a distância é qualificada.** O dono tocou em
"Genevieve" e nada aconteceu — com razão: era texto com cara de link. Agora cada
tempestade leva a câmera até ela, e a linha diz se aquilo é **assunto seu** ou
contexto distante. Um ciclone a 5.000 km, noutra bacia, exibido com o mesmo
destaque de um a 300 km, insinua uma ameaça que não existe — e um app que grita
quando não é para gritar ensina a pessoa a ignorar quando for. Acima de 1.500 km
a linha fica apagada e diz "longe demais para te afetar agora".

Viajar milhares de quilômetros acende o caminho de volta ("← Voltar para a minha
área"): tirar alguém da própria área sem forma óbvia de retornar é abandoná-la
longe de casa numa tela que ela abriu para se orientar.

**A câmera ENQUADRA o cone, não mergulha no olho.** Primeira versão usava `flyTo`
com zoom fixo e o cone estourava para fora da tela. A pergunta que o cone responde
— "minha casa está dentro?" — só existe se ele couber no enquadramento. Hoje o
`focus` aceita uma caixa, calculada a partir do cone e da trajetória **daquela**
tempestade (as camadas do NHC trazem todas as ativas juntas; sem filtrar por
nome, enquadrar uma no Pacífico e outra no Atlântico daria uma caixa
atravessando o continente e mostrando nenhuma). O padding desconta a folha
inferior, senão metade do cone fica embaixo dela.

**Consequences**: dois defeitos que só um teste de RENDERIZAÇÃO pega:

- a primeira versão das setas usava o caractere `➤` num `text-field`. Os dados
  chegavam, a camada ficava visível, e **nada aparecia**: a fonte do estilo não
  tem esse glifo. `querySourceFeatures` devolvia features e
  `queryRenderedFeatures` devolvia zero. Hoje a seta é um ícone desenhado em
  canvas, que não depende de fonte;
- a grade era de 0,5° (≈55 km) e a câmera padrão enquadra poucos quilômetros: o
  usuário via **uma** seta. Uma seta só não mostra direção. Passou a 0,15°.

E um terceiro, achado depois: o provider cacheava a resposta das camadas do NHC
por cinco minutos **inclusive quando ela vinha vazia**. Uma falha momentânea do
serviço congelava a ausência do cone, e a tela mostrava a tempestade sem o cone
enquanto o NHC o publicava normalmente. **Cachear ausência é pior que não
cachear: congela um erro.** Hoje a busca de camada é `no-store` — o cache que
vale é o da rota, que guarda a resposta já montada — com uma repetição, e o que
falhou é declarado em `missing` para a UI avisar que o desenho está incompleto.

Por isso `scripts/weather-layers-test.mjs` (`npm run test:weather`) pergunta ao
MapLibre **o que ele renderizou**, não o que foi entregue à fonte. A primeira
versão do teste lia `_data` e teria passado com a camada invisível.

O teste usa dado AO VIVO de propósito, e trata "nenhum ciclone ativo" como
resposta correta em vez de falha — na maior parte do ano é isso que o mundo
devolve.

Para os alertas ele vai além: **procura** no feed do NWS uma região que tenha
alerta agora e roda lá. Parkland quase nunca tem um, e um teste que só exercita o
caminho quando o tempo colabora não testa nada na maior parte do ano. Continua
sendo dado real — só não é o do quintal do dono.

---

## D-077 — Escrita bloqueada por RLS responde sucesso; o círculo precisa de dono de verdade

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono relatou que nomear alguém Editor "não fazia nada", e que não
conseguia editar nem excluir os círculos que criou. Reproduzido em navegador:

| Ação | Resposta | Realidade |
|---|---|---|
| `PATCH` papel → Editor | `200 {"ok":true}` | banco continuava `Viewer` |
| `PATCH` círculo (renomear) | `404` | rota nunca existiu |
| `DELETE` círculo | `404` | rota nunca existiu |

**A causa do primeiro é a mais perigosa das três**: o endpoint escrevia na linha
de OUTRA pessoa usando o cliente do usuário. A RLS de `circle_members` bloqueia
isso — e **um UPDATE bloqueado por RLS não devolve erro**. Ele afeta zero linhas
e o Supabase responde sucesso. O endpoint então dizia `{ok:true}` sobre nada.

**Decision**:

1. **Escrita em linha de terceiro usa service-role, depois de checar o papel na
   mão** — o mesmo padrão de `/api/plans`. Vale para mudar papel e remover membro.
2. **Toda escrita confere quantas linhas mudaram.** Zero linha vira 404 com
   mensagem, nunca `ok`. É a trava que impede a classe inteira de voltar.
3. **`PATCH` e `DELETE /api/circles/:id` passam a existir.** Renomear é simples;
   excluir é destrutivo e em cascata — leva membros, o plano de voo e os treinos
   compartilhados —, então **exige o nome exato do círculo no corpo**. Não é
   burocracia: é a diferença entre um toque errado e perder o plano que a família
   combinou. A resposta devolve o que foi apagado, em números, para a tela poder
   dizer o que se perdeu.

**Consequences**: `scripts/circle-admin-test.mjs` (`npm run test:circle`) — 5/5.
Toda asserção lê o BANCO depois da ação; conferir só o código HTTP teria dado
tudo verde com o produto quebrado, que foi exatamente o que aconteceu por meses.

Regra que fica para revisão: **`supabase` do usuário só escreve na própria linha.
Qualquer escrita em linha de terceiro é service-role com checagem explícita — e
confere linhas afetadas.**

---

## D-076 — Endereço se escolhe no mapa, e satélite não depende de chave

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: Usando o plano de verdade, o dono trouxe três coisas:

1. Buscar endereço não resolve o caso dele — mora num condomínio onde **vários
   prédios dividem o mesmo número**. O geocoder devolve um ponto só, e "o ponto
   de encontro é no bloco C" não cabe num resultado de busca.
2. **"Usar minha posição" não fazia nada** ao ser apertado.
3. Só existia mapa preto; ele precisa do detalhe de satélite para se orientar.

**Decision**:

1. **Escolher no mapa, com mira fixa no centro** (`MapPointPicker`). A mira não
   se move e o mapa desliza por baixo — mais preciso que tocar num alvo, porque
   no zoom de um telhado o dedo cobre justamente o pixel que se quer enxergar. É
   o padrão de todo app de entrega, então já é conhecido. Abre em satélite por
   padrão: é a camada que distingue prédios.
2. **Satélite sem chave, via ESRI World Imagery** + camada de referência para os
   nomes de rua (imagem sem rótulo é bonita e inútil para achar endereço). O
   MapTiler resolveria com uma linha, mas exige `NEXT_PUBLIC_MAPTILER_KEY`, que
   não está configurada — e deixar o produto pior por causa de uma conta que
   ninguém abriu não se justifica. A atribuição do ESRI vai em cada fonte, como
   os termos exigem.
3. **Orbe de camadas** no grupo de controles do mapa, com a escolha guardada no
   aparelho. O `WorldV2` passava `mapBase="dark"` **cravado** — era essa linha, e
   não a falta de suporte, que prendia o dashboard no preto.
4. **O botão de posição passa a falar.** Ele tinha `() => {}` como tratador de
   erro: GPS negado, expirado ou indisponível produziam silêncio absoluto, e o
   único retorno de sucesso era uma linha pequena de coordenadas fácil de não
   ver. Agora há estado de espera, confirmação explícita ("Ponto marcado", com a
   precisão em metros) e um motivo nomeado para cada falha — sempre oferecendo a
   escolha no mapa como saída.
5. **E o botão passa a FUNCIONAR, em dois estágios.** A primeira correção deixou
   o erro visível e o dono viu, na hora, um timeout real. A culpa era da minha
   configuração: `enableHighAccuracy: true` com `maximumAge: 0` é a combinação
   mais dura que existe — recusa qualquer posição que o aparelho já tenha e exige
   uma trava de GPS nova, o que dentro de casa ou num laptop simplesmente expira.
   O `RiskProvider`, que sempre funcionou, já usava baixa precisão aceitando fix
   de até dois minutos. Agora são dois estágios: um rápido, que aceita fix
   recente e coloca o ponto na tela em segundos, e um refino por `watchPosition`
   de alta precisão que só substitui o ponto **quando a leitura melhora**. Falha
   só é reportada se os dois falharem.

**Refinamentos após o dono usar (2026-07-31)**:

- **O mapa abre onde a pessoa está.** Ele abria no centro de referência do app, e
  o dono tinha que navegar procurando a própria casa. Agora parte do melhor
  palpite estático (a casa do plano, ou o endereço do perfil) e vai para a
  posição do aparelho assim que ela chega — **exceto** se a pessoa já encostou no
  mapa. Uma posição chegando com atraso não pode arrancar a câmera de onde alguém
  acabou de arrastar; é a mesma trava de D-070.
- **Confirmar não exige mais digitar endereço.** Marcar no mapa é a parte
  PRECISA do fluxo — num condomínio a coordenada é a única coisa exata. Bloquear
  a confirmação até que se digitasse um nome punha o obstáculo no lugar errado.
  O nome vem preenchido pelo tipo do lugar ("Ponto 2", "Trabalho") e pode ser
  trocado: ele existe para a família **chamar** o lugar de algo durante a
  execução, não para validar a coordenada.

**Consequences**: tornar o erro visível foi o que revelou o segundo defeito em
minutos. Um erro calado não é só ruim para o usuário: **esconde o bug de quem
escreveu o código**. Vale como argumento sempre que a tentação for engolir uma
falha "para não poluir a tela".

É a terceira vez nesta sequência que a causa raiz é a mesma —
**a tela não dizia o que estava acontecendo**. Ver [[D-075]] (cache servindo dado
velho como novo) e a distância que sumia sem explicação. O `catch` vazio e o
tratador de erro vazio entraram na lista de coisas a procurar em revisão.

Verificado em navegador: `npm run test:plan` 12/12, incluindo arrastar o mapa e
provar que a coordenada muda com a mira; e uma checagem à parte confirmou 58
tiles do ESRI carregando após tocar o orbe, com a preferência sobrevivendo ao
recarregamento.

---

## D-075 — O App Router não registrava service worker nenhum; e o plano tem cópia própria

**Date**: 2026-07-30
**Status**: DECIDED / IMPLEMENTADO

**Context**: Ao construir o cache offline do Plano da Família (PLAN-T05), o teste
de navegador mostrou `getRegistrations()` devolvendo **0** em `/plan`,
`/dashboard`, `/checklist` — em tudo. O `next.config.mjs` tem `register: true`,
mas essa opção do `next-pwa` injeta o registro no `_app` do **Pages Router**.
Este app é App Router inteiro.

Ou seja: **o service worker só existia para quem abrisse `/settings`**, a única
tela que registrava por conta própria, para o push. O app parecia ser PWA e não
era — não havia cache offline em lugar nenhum, para ninguém.

**Decision**:

1. **`ServiceWorkerRegistrar` no layout autenticado.** Registra `/sw.js` após o
   `load`, com `updateViaCache: 'none'` (a mesma trava de [D-074]). Fica no
   layout autenticado e não na raiz: quem não entrou não tem o que usar offline.
2. **`/plan` entra na lista explícita de páginas NetworkFirst.** Estava só no
   catch-all. A tela cuja função é funcionar sem rede não pode depender de uma
   regra genérica.
3. **`GET /api/plans` é `NetworkOnly` — de propósito.** Esta é a decisão que
   custou uma iteração para enxergar: com o worker ativo, o cache genérico de API
   respondia `/api/plans` offline, `response.ok` vinha `true`, e a tela
   apresentava um documento velho **como se fosse ao vivo**. É exatamente a falha
   que o doc 18 §6 existe para evitar. O plano tem a **própria** cópia no
   dispositivo (IndexedDB, com versão e instante da sincronização), e essa cópia
   é rotulada na tela. Fazendo a rede falhar honestamente, a UI cai na cópia
   local — e diz que é cópia local.

**Consequences**: offline passa a existir de verdade no app inteiro, não só na
tela de Ajustes. E fica a regra geral: **cache de API não pode servir dado cuja
idade a tela afirma**. Sempre que a UI declarar frescor — posição da família,
abrigos, plano — o dado precisa vir de um cache nosso, com carimbo, ou de uma
rede que falhe de forma visível. Verificado por
`scripts/plan-editor-test.mjs` (6/6), que derruba a rede e confere o rótulo.

---

## D-074 — Push só existe se o service worker instalar; e isso se prova, não se acredita

**Date**: 2026-07-29
**Status**: DECIDED / IMPLEMENTADO

**Context**: Nenhuma notificação push jamais chegou em produção. A tela de
Ajustes dizia "Service Worker timeout" e depois "Service Worker ficou
redundante". Duas hipóteses minhas estavam erradas antes de eu achar a causa:
não era o `worker/index.ts` com nome hasheado, nem o cache do `sw.js`.

A causa real só apareceu quando anexei `ServiceWorker.workerErrorReported` do
CDP a um Chrome de verdade:

```
bad-precaching-response :: [{"url":".../_next/app-build-manifest.json","status":404}]
```

O `next-pwa` varre `.next/` e coloca **todo** arquivo que encontra no manifesto
de precache do Workbox — inclusive metadados de build que o Next **não serve por
HTTP**. E o precache é **atômico**: um único 404 rejeita a promessa do
`install`, o worker vira `redundant`, e o navegador tenta de novo para sempre.

Um arquivo de metadados de build, que navegador nenhum busca, desligava o
service worker inteiro — e com ele **todo** o push do produto: ping da família,
convite de simulação, aviso de mudança de plano.

**Decision**:

1. **Metadados de build nunca entram no precache.** `buildExcludes` remove
   `app-build-manifest.json`, `build-manifest.json`, os manifests de middleware
   e loadable, `_buildManifest.js`, `_ssgManifest.js` e `.map`.
2. **O `push-sw.js` tem nome estável e é versionado no repositório.** Um worker
   customizado com hash referenciado por um `sw.js` cacheado é a mesma armadilha
   por outro caminho: o hash muda no deploy, o `importScripts` 404, o install
   falha.
3. **Ninguém mais escreve espera de service worker à mão.**
   `navigator.serviceWorker.ready` é a espera canônica. A versão anterior vigiava
   `installing`/`waiting` e **rejeitava ao ver `redundant`** — mas `redundant` é
   estado NORMAL (significa substituído, em geral por um worker bom), e o worker
   vigiado não é necessariamente o que serve a página. Ou seja: além do bug real,
   havia um segundo bug que reportava falha em cima de um worker saudável.
4. **`updateViaCache: 'none'`** e um caminho de recuperação que desregistra tudo
   e registra de novo — porque um registro quebrado não se cura sozinho e o
   usuário não tinha saída.
5. **Push regride em silêncio, então tem teste.** `scripts/push-test.mjs`
   (`npm run test:push`) prova os 6 elos num Chrome real, e o elo 1 é o
   guarda-de-regressão direto desta causa: todo URL do precache tem que
   responder 200.

**Consequences**: o `web-push` só fala HTTPS, então o teste sobe um serviço de
push falso **com TLS de verdade** e faz o `next start` confiar no CA via
`NODE_EXTRA_CA_CERTS` — a verificação de certificado fica **ligada**. O único elo
não exercitado é o transporte do Google: `pushManager.subscribe()` falha com
"Registration failed - permission denied" em qualquer Chrome automatizado, então
a inscrição é fabricada com as mesmas primitivas do navegador (ECDH P-256 + 16
bytes de auth) e a entrega ao worker usa `ServiceWorker.deliverPushMessage`. O
código do EOS exercitado é o real, ponta a ponta, incluindo descriptografar o
payload (RFC 8291) e conferir a assinatura VAPID. O teste exige Google Chrome
instalado — o Chromium empacotado do Playwright nega permissão de notificação.

---

## D-073 — Localização em tempo real e interação a partir do marcador

**Date**: 2026-07-29
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono relatou que ele e a esposa continuavam sem se localizar, e pediu comportamento **igual ao Life360** — tempo real —, além de poder **tocar na foto de alguém no mapa** e agir: rota até a pessoa, mensagem pré-configurada.

Diagnóstico nos dados de produção: ele tinha ponto ao vivo de 2 minutos; ela, nenhum. O `LocationReporter` tinha dois defeitos:
1. **Checava a permissão UMA vez ao montar.** O flag de permissão é gravado quando o dashboard obtém a primeira posição — o que acontece *depois* do componente montar. Ele já havia desistido e nunca tentava de novo na sessão.
2. **`getCurrentPosition` a cada 2 minutos não é tempo real.** Uma família se procurando durante um evento não espera dois minutos por atualização.

**Decision**:
1. **`watchPosition` contínuo**, publicando quando a pessoa **se move ≥ 25 m** ou quando o último envio passa de 45 s. Movimento, não jitter; e quem está parado continua fresco.
2. **Prontidão é reavaliada a cada 10 s** até ser possível começar. Checar uma vez foi o bug.
3. **Cadência de leitura**: 90 s → **15 s**, e o rótulo "agora" passa a valer até 75 s (antes eram 2 min, o que fazia "agora" mentir).
4. **Piso de escrita no servidor**: 15 s → **8 s**. Baixo o bastante para parecer vivo, alto o bastante para um GPS tremido não martelar a linha.
5. **Tocar num rosto abre o `MemberSheet`**: leitura e distância, **rota até a pessoa desenhada no mapa do EOS** (D-069), handoff para o app de mapas, e **mensagens pré-configuradas**.
6. **Mensagens são presets, não texto livre.** Sob estresse ninguém compõe — escolhe. E vocabulário fixo é reconhecido instantaneamente por quem recebe. Só chega a quem compartilha um círculo, e nunca anônimo: o nome do remetente vai na notificação.
7. **Falha de entrega é dita.** Se o destinatário não tem aparelho registrado para notificações, a UI diz isso em vez de deixar o remetente acreditar que a mensagem chegou.

**Consequence**: o mapa deixa de ser um retrato e passa a ser uma superfície de ação. O custo é GPS contínuo enquanto o app está aberto — mitigado pelo limite de movimento, que evita envio a cada fix.

---

## D-072 — Escolher com quem treinar, e convidar de fora por link

**Date**: 2026-07-28
**Status**: DECIDED / IMPLEMENTADO — depende da migration `20260728010000_simulation_join_token.sql`

**Context**: A D-071 convidava "o círculo", mas o código usava `circles[0]` — o primeiro da lista, sem o dono escolher. Quem tem mais de um círculo não conseguia decidir, e não havia como chamar alguém de fora (um vizinho, um parente que ainda não está no círculo).

**Decision**:
1. **Seleção múltipla de círculos** na tela do Cenário, todos pré-marcados: o caso comum é "treinar com a minha família". Uma pessoa que está em dois círculos selecionados entra uma vez só.
2. **Link de convite** (`/sim/[token]`) para quem está fora. O token é opaco e concede **exatamente uma coisa**: ser adicionado como `invited`.
3. **O link é campainha, não chave.** Quem abre ainda precisa de conta no EOS (o middleware protege a rota) e ainda precisa aceitar o mesmo pop-up de todo mundo (D-071). Um link nunca coloca ninguém num cenário em silêncio — nem família, nem convidado.
4. **Idempotente**: abrir o link duas vezes não reseta uma resposta já dada, e um treino encerrado responde que acabou em vez de ressuscitar.
5. O link aparece **depois** de iniciar, na própria tela do Cenário, porque só existe quando a sessão existe — e é ali que o dono ainda está decidindo quem mais chamar.

**Consequence**: o treino deixa de ser "o meu primeiro círculo" e passa a ser um exercício que o dono compõe. O custo é uma superfície de convite por link, mitigada por exigir conta e aceite explícito.

---

## D-071 — Simulação compartilhada com o círculo

**Date**: 2026-07-28
**Status**: DECIDED / IMPLEMENTADO — depende da migration `20260728000000_shared_simulation.sql`
**Spec**: `docs/19-scenario-simulator.md` §11 (SIM-T07)

**Context**: O dono pediu que, ao rodar uma simulação, todos do círculo recebam um pop-up instantâneo perguntando se querem participar — e que os parâmetros passem a valer na tela de quem aceitar. A simulação até então era local ao aparelho (D-067 §5.3: nunca persiste).

**Decision**:
1. **A sessão ganha uma linha** (`simulation_sessions` + `simulation_participants`). Uma simulação local continua efêmera; uma **compartilhada** precisa existir tempo suficiente para chegar ao telefone dos outros.
2. **Ninguém é colocado num treino que não aceitou.** Participantes nascem `invited`; só uma resposta explícita move para `joined`. O pop-up é central e bloqueante, não um aviso descartável — entrar numa simulação muda todos os números que a pessoa vai ver na próxima hora.
3. **Alerta real crítico encerra para TODOS** (escolha do dono). Qualquer participante pode encerrar com `reason: real_alert`, porque uma família dividida entre realidade e ficção é a falha que esta feature poderia criar. Encerrar nunca é destrutivo, então o caminho permissivo é o seguro.
4. **Um treino ativo por círculo.** Iniciar um novo encerra o anterior; dois cenários competindo sobre a mesma família é exatamente a confusão a evitar.
5. **Expira em 90 min** no servidor, além da expiração local por inatividade. Ninguém herda um cenário parado.
6. **Push é best-effort**: o convite também aparece pelo poll no app, então uma notificação perdida não impede o treino.

**Consequence**: o EOS deixa de treinar uma pessoa e passa a treinar uma família — que é a unidade que o produto sempre disse proteger. O custo é a primeira persistência de estado de simulação; mitigado por expiração curta, aceite explícito e encerramento coletivo.

---

## D-070 — O Pilot é a única entrada; a câmera pertence ao usuário

**Date**: 2026-07-28
**Status**: DECIDED / IMPLEMENTADO

**Context**: Uso real no celular expôs três falhas que se somavam:
1. **O mapa brigava com o usuário.** `watchPosition` dispara a cada tremida do GPS → `coords` muda → `flyTo` recentraliza. E `flyTo` é programático, mas o MapLibre dispara `dragstart`/`zoomstart` também para movimentos programáticos — que estavam ligados ao `onMapInteraction`. Resultado: **a recentragem recolhia o sheet que a pessoa estava rolando**, no mesmo instante. Impossível navegar.
2. **Não dava para digitar no Pilot no celular.** O teclado encolhe o *visual viewport* sem alterar `dvh`, então o campo de escrita ficava embaixo do teclado.
3. **Barra de busca sobrando.** O Pilot já procura lugares, nomeia coordenadas, desenha trajeto e cria tarefas. Uma caixa separada que só geocodifica era uma versão mais fraca da mesma coisa, ao lado dela.

**Decision**:
1. **A câmera segue o usuário exatamente uma vez**, na primeira leitura. Depois disso ela é dele. A setinha no canto é como se pede de volta (`recenterNonce`).
2. **Só movimento originado por gesto recolhe o HUD.** O handler agora exige `event.originalEvent`, que só existe quando um ponteiro real causou o movimento.
3. **Uma entrada só.** A barra de busca vira a **PilotBar**: digitar ali é falar com o Pilot, com o orb ao lado. Ele procura, encontra, responde, redireciona e orquestra. `MapSearch` sai da composição.
4. **A conversa acompanha o teclado** via `visualViewport`, publicando `--wv2-keyboard`.
5. **"Mais próximo" passa a significar isso**: a janela de busca caiu de 0.6° (~66 km, que alcançava Miami a partir de Parkland) para 0.25°, o limite subiu para 12 resultados, e a lista vai ao modelo **ordenada por distância** com a instrução de que a resposta ao "mais próximo" é *o primeiro item* — o modelo não escolhe.

**Consequence**: o mapa deixa de disputar o controle com quem o usa, e o Pilot passa a ser o orquestrador único que o produto sempre quis ser.

---

## D-069 — O trajeto é uma camada do EOS; o app de mapas é o segundo passo

**Date**: 2026-07-28
**Status**: DECIDED / IMPLEMENTADO

**Context**: Com D-068 o Pilot passou a propor destinos, mas a única ação era um deep-link — tocar em "Navegar" **saía do EOS**. O dono buscou uma loja pelo Pilot, recebeu o destino certo, e o botão abriu outro app. A expectativa do produto é explícita: *"Rotas, família, abrigos, recursos e zonas de risco são camadas inteligentes sobre o mapa."* Entregar tudo para fora contradiz isso.

**Decision**:
1. **EOS responde primeiro, no próprio mapa.** "Ver no mapa" desenha o trajeto como camada (`eos-course`), crava o pino do destino e enquadra a câmera nas duas pontas. O sheet recolhe para peek — mostrar o mapa significa mostrar o mapa.
2. **A linha é tracejada de propósito.** Tracejado lê como *direção*; contínuo leria como *esta é a estrada* — e o EOS não conhece as estradas (D-065). A honestidade está na forma, não numa nota de rodapé.
3. **O app de mapas continua disponível, como segundo passo.** "Abrir no app de mapas" entrega o turn-by-turn com trânsito e interdições ao vivo, que o EOS nunca terá.
4. Fonte própria (`eos-course`), separada de `eos-route`, para o polling de família e abrigos não apagar o trajeto.

**Consequence**: a promessa de "camadas inteligentes sobre o mapa" passa a valer para rota também. O EOS diz *onde, a que distância e para que lado* sem soltar o usuário; a navegação passo a passo continua sendo do aparelho.

---

## D-068 — Pilot acessa posições consentidas e propõe navegação

**Date**: 2026-07-28
**Status**: DECIDED / IMPLEMENTADO

**Context**: O Pilot conversacional recebia clima, reservas e composição da família, mas nenhuma coordenada — então não sabia dizer onde a família estava nem para onde ir. O dono pediu explicitamente: *"eu quero que ele me responda as coordenadas de tudo que eu tiver permissão. Sim, as coordenadas da minha família com certeza eu preciso. Sugerir rota até o ponto de interesse e iniciar navegação."*

**Ampliação de divulgação registrada**: o consentimento de D-064 era para o **círculo** ver a posição. Enviar essas coordenadas ao provedor de IA é uma divulgação **diferente e mais ampla**. O dono decidiu assumi-la. Mitigações aplicadas:
1. **O gate de consentimento continua sendo o mesmo e único.** Só chegam ao modelo posições que `/api/circles` já liberou server-side — quem não ativou o toggle de localização não aparece, nem para a IA.
2. **A regra 6 do prompt** proíbe o modelo de citar posição de quem não está na lista de posições consentidas.
3. Nenhuma coordenada é persistida no provedor além da chamada.

**Decision**:
1. O Pilot recebe: posição do usuário, posições consentidas da família (nome, coordenada, idade da leitura), e abrigos oficiais com coordenada.
2. **Toda geometria é calculada no aparelho** e enviada como número pronto — distância e rumo. A regra 5 do prompt **proíbe** o modelo de calcular distância, rumo ou coordenada. Modelos de linguagem erram trigonometria com confiança, e um rumo errado em emergência aponta a família para o lado errado.
3. O Pilot passa a devolver `destinations[]` com coordenadas **copiadas** da lista fornecida, nunca inventadas. A UI renderiza cada destino com distância e rumo (calculados localmente) e um botão **Iniciar navegação**, que entrega ao app de mapas do aparelho (D-065).

**Consequence**: o Pilot responde "onde está minha filha" e "como chego lá" — fechando o ciclo entre saber e agir. O custo é a ampliação de divulgação acima, registrada e mitigada.

---

## D-067 — Cenário vira simulador: o app inteiro responde ao ambiente simulado

**Date**: 2026-07-27
**Status**: DECIDED / SPEC — implementação faseada (SIM-T00→T07)
**Spec**: `docs/19-scenario-simulator.md`

**Context**: A aba Cenário é hoje um analisador de pergunta única. O dono definiu o que ela deve ser, na metáfora aeronáutica estrita: um simulador onde a família configura o ambiente (clima, inventário, saúde, infraestrutura) e **o EOS inteiro passa a se comportar como se fosse verdade** — como um aluno de aviação cujos instrumentos não sabem que é mentira.

**Decision**:
1. **Injeção no `RiskProvider`, não nas telas.** Todas as telas já leem `useRisk()`; dar duas fontes ao provider (REAL / SIMULADO) coloca o app inteiro em simulação sem tocar em nenhuma tela. Mesmos instrumentos, entradas injetadas.
2. **Alerta real crítico encerra a simulação imediatamente.** A sessão é abortada, o app volta ao real, o alerta ocupa a tela. Abrupto de propósito: ameaça real nunca disputa atenção com ficção.
3. **Escrita em dado real só com confirmação explícita item a item.** O debrief propõe lacunas quantificadas para o checklist; nada muda sozinho. Mesma trava de D-062.1 e UPP-03.
4. **Travas adicionais**: cromo persistente e impossível de ignorar em todas as telas; expiração automática ao recarregar e por inatividade; zero escrita durante a sessão.
5. **O simulador é o único lugar do EOS onde um modelo pertence ao caminho principal.** Reconcilia D-062.1 (Pilot local porque a rede cai em emergência): treina-se em calmaria, com rede, onde profundidade vale mais que latência. Reusa `/api/analyze` + `getRelevantChunks` em vez de criar outro pipeline. Regra crítica continua vencendo o modelo.
6. **SIM-T01 vem sozinho e primeiro**: as travas de segurança precisam existir antes de a simulação alcançar o app inteiro.

**Consequence**: EOS passa de informação para preparo — e ganha a forma de testar o Plano da Família (D-066), que hoje seria um compromisso que ninguém nunca exercitou. Assume-se a feature de maior risco do produto, mitigada pelas travas acima.

---

## D-066 — Planos de Emergência da Família ("plano de voo")

**Date**: 2026-07-27
**Status**: DECIDED / SPEC — implementação faseada (PLAN-T00→T07)
**Spec**: `docs/18-family-plans.md`

**Context**: Abrigo oficial (D-065) só existe durante desastre ativo e não resolve o caso mais comum de uma família: pai no trabalho, filha na escola, mãe na estrada, celular mudo. O dono definiu o conceito: um plano autoral, escrito em calma, compartilhado no círculo, **executado quando o sistema está degradado** — combinado antes, seguido sem negociação durante.

**Decision**:
1. **O plano é autoral e determinístico.** Pontos de encontro, lugares conhecidos, rotas desenhadas, papéis ("quem busca quem") e gatilhos, todos escritos pela família. Nenhum passo depende de inferência em tempo de execução.
2. **Rotas são desenhadas, não roteadas.** Carregam conhecimento local que nenhum motor tem ("não pegue a ponte baixa, ela alaga") e sobrevivem offline. Um roteador pode **propor** um traçado para o usuário editar; nunca substitui a rota salva.
3. **Versionamento é requisito de segurança, não de conveniência.** Plano tem `version`; o aparelho exibe a idade da cópia local; alteração dispara push ao círculo; membros **reconhecem** explicitamente a nova versão e o autor vê quem reconheceu. Duas pessoas em versões diferentes vão para lugares diferentes — é a falha que mata.
4. **Escopo é o círculo, jamais público.** O plano revela casa, escola, trabalho e ponto de encontro; é o dado mais sensível do EOS. **Nunca** entra na ficha pública nem no QR.
5. **Pilot participa sem escrita silenciosa** (mesma trava de UPP-03): propõe rascunho, aponta lacunas, indica qual contingência se aplica durante o evento. Confirmação do usuário elemento a elemento. Plano alterado por IA sem o usuário saber é indistinguível de sabotagem.
6. **O plano precede os mapas offline** no roadmap: o envelope geográfico do plano é o que torna o download offline finito e certo (spec §10).

**Consequence**: EOS deixa de ser só diagnóstico e passa a carregar o combinado operacional da família. Assume-se o custo de um modelo de dados novo, RLS por círculo, e o problema de sincronismo do §6 — que é a parte difícil e não pode ser adiada para depois do editor.

---

## D-065 — Fonte oficial de abrigo + navegação entregue ao aparelho

**Date**: 2026-07-27
**Status**: DECIDED / IMPLEMENTAÇÃO EM CURSO
**Resolve**: a dívida de **D-051 §5** (tirar rota/abrigo da inferência por OpenAI antes de produção).

**Context**: Pesquisa de fontes feita contra endpoints reais em 2026-07-27, não de memória:

| Fonte | Verificado | Resultado |
|---|---|---|
| **FEMA NSS `gis.fema.gov/.../NSS/OpenShelters/FeatureServer/0`** | HTTP 200 | **Oficial, público, sem chave.** Geometria WGS84, `shelter_status`, capacidade, ADA, pets. 20 abrigos abertos no país no dia. |
| OpenFEMA API | HTTP 200 | 48 datasets, **zero** de abrigos |
| OSM via Overpass | 504 na instância pública; mirror OK | 15 "shelters" perto de Parkland, todos sem nome e sem `shelter_type` — são abrigos de ônibus. Semântica errada. |
| Camadas ArcGIS da comunidade | HTTP 200 | Fragmentadas por estado/condado, várias de contas pessoais. Não autoritativas. |
| OSRM demo | HTTP 200, 0,6s | Funciona, mas o servidor público proíbe uso em produção. |

**Decision**:
1. **Abrigos: FEMA National Shelter System**, consumido via proxy server-side com cache. Único uso permitido. **Ressalva documentada**: `evacuation_capacity`, `total_population` e `org_name` vêm frequentemente nulos e acessibilidade vem `UNK` — o EOS pode afirmar *onde* e *se está aberto*, nunca prometer vaga ou acessibilidade.
2. **Zero abrigo aberto é a resposta normal.** Fora de desastre ativo não há nenhum. A UI diz isso; não inventa candidato — foi exatamente o erro do `SHELTER · mock` (D-064 §5).
3. **Navegação é entregue ao app de mapas do aparelho** (deep-link Apple/Google Maps). Ele tem trânsito e interdições ao vivo que o EOS nunca terá; desenhar rota confiante que ignora estrada alagada é o mesmo erro do abrigo fictício.
4. **Rumo e distância são calculados no aparelho** — trigonometria pura, sem rede e sem chave. É o único componente de navegação que funciona em degradação total, e por isso é o que o EOS realmente possui.
5. **Nenhuma chave de roteamento nesta fase.** Uma API hospedada morre 100% offline e seria dívida, não ativo. Roteamento fica atrás de um **adaptador** (padrão já usado em `lib/world/providers.ts` e nos adapters de hazard), para o motor on-device do app nativo plugar sem reescrever UI.

**Nota técnica registrada**: navegação turn-by-turn offline **não é viável numa PWA** — exibir mapa offline é (PMTiles + MapLibre + Cache API), mas não existe engine de rotas WASM madura com grafo empacotado. Navegação offline real mora no app nativo (fase M), com Valhalla ou GraphHopper embarcados.

**Consequence**: D-051 §5 fica resolvida — nenhuma rota ou abrigo inferido volta ao mapa. O EOS passa a mostrar abrigo oficial de verdade, e admite quando não há nenhum.

---

## D-064 — Localização familiar ao vivo + consentimento próprio

**Date**: 2026-07-27
**Status**: DECIDED

**Context**: Ao retomar as pendências, quatro achados:
1. A v2 não passa `family`/`guidance` ao `WorldMap`, então **marcadores mock** (nomes fixos "Paulo/Isadora/Ana" + rota + `SHELTER · mock`) foram para produção na tela principal.
2. `/api/circles` devolve `location_lat/lng` de todo membro **sem gating**, enquanto `emergency_contact` é gated. `location` sequer existe em `shared_fields`. Isso contraria doc 12 §103 e **D-051 §1**.
3. Não existe localização ao vivo: o que há é `profiles.location_lat/lng`, ponto estático geocodificado. O EOS sabe onde cada um mora, não onde está.
4. A dívida de **D-051 §5** (tirar rota/abrigo do OpenAI antes de substituir `/dashboard`) venceu com D-063.

**Decision (dono, 2026-07-27)**:
1. **Localização ao vivo sempre.** Enquanto o app está aberto e o membro consentiu, o cliente envia GPS periodicamente. Persistência é **apenas o último ponto** (mantém D-051 §2: sem trilha, sem replay, sem histórico).
2. **Consentimento com toggle próprio.** Novo campo `location` em `circle_members.shared_fields`, com controle separado na tela de Círculos. Localização não pega carona no compartilhamento de inventário — é dado mais sensível e merece decisão própria. **Default = não compartilhado.**
3. **Freshness é obrigatória na UI.** Todo ponto exibido carrega idade ("agora", "há 4 min", "perfil"). Um ponto velho apresentado como atual é pior que nenhum ponto.
4. **Fallback honesto.** Sem consentimento ou sem GPS recente, cai para o ponto de perfil rotulado como `perfil`, nunca como posição atual.
5. **Mocks banidos da produção.** `WorldMap` deixa de inventar família/rota/abrigo quando não recebe dados. Sem dado real → sem marcador.

**Consequence**: EOS passa a responder "onde minha família está agora", que é a pergunta central em emergência. Assume-se o custo: bateria, e um dado sensível de posição atual por membro consentido. Mitigações: só o último ponto, opt-in explícito, freshness visível e revogação imediata pelo toggle.

**Ainda aberto**: revisão de fonte de rota/abrigo (D-051 §5) permanece **não resolvida** — nenhuma rota ou abrigo volta ao mapa até haver fonte oficial ou curada. Registrado em FAM-T05.

---

## D-063 — Promoção do World v2 a `/dashboard` e rollout em produção

**Date**: 2026-07-27
**Status**: DECIDED / IMPLEMENTADO

**Context**: Com o World v2 pronto (D-062), o dono determinou que essa passa a ser a **primeira e principal tela do app**, e autorizou o lançamento em produção. Até então a entrada real do app era `/scenario`, e `/dashboard` era rota órfã (fora do BottomNav, linkada apenas pelo `RiskIslandPro`, que o layout não monta).

**Decision**:
1. **URL canônica** `/dashboard`. O dashboard anterior foi preservado em `/dashboard-legacy` (protegido no middleware); o protótipo HWD v1 permanece em `/dashboard-world`. Reverter = trocar o redirect e renomear duas pastas.
2. **Três entradas convergem** no dashboard: `app/page.tsx` (usuário logado), `signIn` e `updatePassword` em `lib/auth/actions.ts`. **As duas últimas eram a causa real** de o app abrir no cenário — o redirect de `/` sozinho não bastava. O `start_url` do PWA é `/`, então o app instalado também cai no dashboard.
3. **BottomNav**: o dashboard sai da fila de abas e vira **botão elevado central** (`.nb-home`), com 3 destinos de cada lado. Sem isso o usuário sairia da tela principal sem caminho de volta, e 7 abas em fila davam ~52px por alvo.

**Rollout — o que NÃO foi validado**: os gates abertos do HWD-06 (`docs/17`) **não foram fechados** para esta superfície. Não houve E2E de navegador na v2, nem medição de a11y/perf, nem revisão de custo de provider. O rollout é **decisão direta do dono**, com o histórico preservado nas rotas legacy como caminho de volta. Gates registrados em WV2-T05.

**Consequence**: EOS passa a abrir na pergunta "quão ruim está e o que eu faço", em vez de num seletor de cenário. O risco assumido é uma superfície de produção sem validação formal.

---

## D-062 — World v2: design system Apple substitui o HUD do HWD

**Date**: 2026-07-27
**Status**: DECIDED / IMPLEMENTADO

**Context**: Reavaliação do `/dashboard-world` (HWD v1) sob a skill `apple-design` encontrou problemas estruturais, não cosméticos: o bottom sheet exibia um grabber que parecia arrastável mas era um botão animando `height`; o colapso por wheel no desktop era disparado ao rolar dentro da própria rail, que então fugia da tela; tracking tipográfico fixo em todos os tamanhos; dois numerais gigantes competindo; e apenas 1 dos 3 sinais de acessibilidade implementado.

**Decision**: reconstruir toda a superfície acima do mapa como design system próprio em `components/world-v2`, **reaproveitando o `WorldMap` sem alteração** (travado em base dark). Referência de forma: Runna. Referência de comportamento: Apple.
1. `motion.ts` — fonte única de física: springs em termos Apple (damping ratio + response) mapeados sobre Framer Motion, projeção de momentum exponencial (a curva que o iOS usa, não `v²/2a`), rubber-banding e hápticos.
2. `DetentSheet.tsx` — sheet com gesto real: tracking 1:1 via Pointer Events + capture, histórico de velocidade, handoff de velocidade para a spring, **interrompível a qualquer frame** (o pointer-down para a animação e a próxima parte do valor de apresentação), e apenas `transform` animado.
3. `world-v2.css` — materiais iOS por peso hierárquico, escala tipográfica com **tracking específico por tamanho** (-0.045em no display, +0.065em nos micro-labels), spacing em `rem`, e os **três** sinais: `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`.
4. `Pilot` — ver D-062.1 abaixo.

**D-062.1 — Pilot local-first**: o Pilot responde de forma **pura, síncrona e offline** (`pilot-engine.ts`), a partir de dados já no cliente. Justificativa: quando a situação piora, a rede é a primeira coisa a cair; um copiloto que precisa de round-trip está ausente exatamente quando existe para servir. Um modelo pode enriquecer depois, mas **estritamente aditivo** — nunca quem decide. Regras de domicílio vêm do `RulesEngine` canônico, para o Pilot não discordar do resto do app. Duas travas de responsabilidade: **evacuação nunca é inferida** (só ordem oficial no alerta), e o Pilot **declara o que não sabe** quando a ficha da família ou o inventário não carregaram, em vez de assumir ausência de vulnerabilidade.

**Consequence**: o HUD do HWD v1 (rail, cápsula Pilot, painel de camadas) deixa de ser o caminho de produção. As features do v1 serão reconstruídas sobre a v2 conforme demanda, não portadas em bloco.

---

## D-061 — Códigos presente sem Stripe (gift codes) + criação owner-only

**Date**: 2026-07-22
**Status**: DECIDED / IMPLEMENTADO
> Renumerada de D-060 → D-061 (2026-07-22) para resolver colisão: **D-060 pertence ao Profile photo upload storage** (UPP-02, 2026-07-21).

**Context**: O dono quer dois mecanismos promocionais: (A) código de afiliado via Stripe (1 mês grátis com cartão salvo, cobra no 2º mês) e (B) código-presente **sem Stripe** (teste grátis). Também exigiu que **apenas o dono** (conta `eosoffgrid@gmail.com`) possa **criar** códigos.

**Decision (B — implementado nesta sessão)**:
1. Tabela `gift_codes` (`code` PK texto owner-gerado, `plan` family/premium, `grant_days` variável 1–366, `note`, `redeemed_by`, `redeemed_at`). **RLS ON sem policies** = deny-all direto; só service-role acessa. Migration `20260722000000_gift_codes.sql` aplicada via Management API.
2. **Resgate** `POST /api/billing/redeem` (usuário logado): valida código não usado, **claim atômico** (`.is('redeemed_by', null)`) garante 1 uso, seta `profiles.plan` + `plan_status='gift'` + `plan_current_period_end = agora + grant_days`. Não sobrepõe assinatura Stripe ativa. UI de resgate em Settings.
3. **Expiração lazy** (`lib/plan.ts:reconcileGiftPlan`): na leitura do plano (`/api/profile/plan`), se `plan_status='gift'` e vencido → downgrade para `free` (persistido → propaga a todas as rotas). Sem cron por ora (pode-se adicionar depois).
4. **Criação owner-only**: allowlist `ADMIN_EMAILS` (default `eosoffgrid@gmail.com`) em `lib/admin.ts`; endpoint `GET/POST /api/admin/gift-codes` e tela `/admin/gift-codes` só respondem ao dono (403 para o resto). Rota `/admin` protegida no middleware. **Obs:** `eosoffgrid@gmail.com` ainda não é usuário do app — o dono precisa criar/entrar com essa conta para usar a tela.

**Código A (afiliado/Stripe)**: DECIDIDO mas **não implementado** — falta o dono definir formato dos códigos (por-afiliado p/ atribuição), planos, limites, validade, e fornecer a Stripe Live key. Mecanismo: cupom "100% off · once" + promotion code (checkout já aceita promo code).

**Consequence**: EOS ganha teste grátis por código sem tocar no Stripe. Segredos de admin ficam server-side; nenhum usuário comum cria ou lê códigos.

---

## D-053 — HWD-05 Pilot action integration prototype scope

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: HWD-05 pede que a Pilot Capsule deixe de ser apenas seletor visual e passe a integrar estados e ações reais no `/dashboard-world`: GO/LIMITED/WAIT/AVOID/PRIORITY OVERRIDE, abrir cenário, checklist, notificar família e focar rota candidata.

**Decision**:
1. A primeira entrega de HWD-05 será **determinística e client-side**, usando `RiskProvider`, alertas, clima atual, checklist, família/círculos e guidance já carregados pelo World Dashboard.
2. Não será criado novo schema de persistência de preferências/histórico do Pilot nesta etapa. Aprendizado avançado continua fora do MVP.
3. `PRIORITY OVERRIDE` vence sempre quando `state=critical` ou alerta oficial crítico existe.
4. Estados `GO`, `LIMITED`, `WAIT` e `AVOID` serão calculados por regras conservadoras de clima/risco/readiness para o activity intent selecionado.
5. Ações reais nesta etapa: abrir `/scenario`, abrir `/checklist`, enviar push para círculo administrado quando permitido pela rota existente, e focar a rota/shelter candidata no mapa.

**Consequence**: HWD-05 entrega comportamento útil e testável sem acoplar o Pilot a um novo backend prematuro. Métricas, preferências aprendidas e payload persistente do Pilot permanecem pendências para evolução posterior.

---

## D-059 — Unified Profile Personalization + Pilot memory layer

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono quer enriquecer o perfil do usuário com foto, preferências em Markdown no estilo de custom instructions das LLMs, e uma camada persistente que o Pilot possa consultar e melhorar ao longo do tempo. Essa personalização deve ser unificada com a Ficha Master, sem expor dados sensíveis no QR público.

**Decision**:
1. A Ficha Master continua sendo a experiência central de edição do usuário, mas ganha uma seção autenticada de **Personalização do Pilot**.
2. Dados curtos/operacionais existentes permanecem em `profiles`; dados longos e privados de personalização vivem em uma nova tabela `profile_personalization`, vinculada 1:1 ao `profiles.id`.
3. A primeira entrega inclui `avatar_url`, `user_context_md`, `pilot_memory_md`, `decision_style` e `risk_tolerance`.
4. `user_context_md` é escrito pelo usuário como preferências livres; `pilot_memory_md` é reservado para memória progressiva do Pilot, mas no MVP só será editável/gravável de forma explícita. Escrita automática pelo Pilot exige confirmação e auditoria futura.
5. O QR público `/ficha/[id]` e `POST /api/profile/ficha` **não** expõem foto, preferências, contexto nem memória do Pilot.
6. O World Dashboard pode consumir essa camada para personalizar componentes autenticados, começando pela foto no readiness card e pela leitura de preferências no Pilot Capsule.

**Consequence**: O perfil passa a ser a camada de contexto de longo prazo do Pilot sem quebrar a separação de privacidade da ficha de emergência. HWD-06 permanece aberto e `/dashboard-world` continua isolado; esta decisão autoriza uma trilha paralela pequena para personalização.

---

## D-060 — Profile photo upload uses private Supabase Storage

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: A primeira entrega de D-059 aceitava `avatar_url`, mas o dono esclareceu que a Profile photo deve ser uploadada também. Como a foto é parte do contexto autenticado da Ficha Master e não deve aparecer no QR público, o upload precisa preservar autenticação e isolamento por usuário.

**Decision**:
1. Criar bucket Supabase Storage privado `profile-photos`.
2. Armazenar o path canônico da foto em `profile_personalization.avatar_path`; `avatar_url` permanece como fallback/manual ou URL assinada retornada pela API.
3. A rota autenticada `POST /api/profile/personalization/photo` recebe multipart upload, valida imagem e tamanho, salva em `profile-photos/{user.id}/avatar.{ext}` com overwrite, e atualiza `profile_personalization`.
4. `GET /api/profile/personalization` retorna uma signed URL temporária quando `avatar_path` existe.
5. O QR público continua sem expor avatar, path de storage, signed URL ou preferências.

**Consequence**: A foto passa a ser asset controlado pelo EOS em storage privado. Componentes autenticados podem exibir a imagem via signed URL temporária, e o app ainda mantém fallback para `avatar_url` manual.

---

## D-054 — HWD-06 responsive HUD collapse + mobile bottom sheet

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: O `/dashboard-world` ficou visualmente forte no desktop largo, mas os painéis atuais competem com o mapa em desktop menor e tornam o mobile inviável. O dono pediu uma proposta usando um elemento do MCP 21st.dev para scroll dinâmico/menus que colapsam e abrem.

**Decision**:
1. HWD-06 passa a incluir um passe específico de responsividade do HUD antes da validação completa de produção.
2. O padrão escolhido é o **Drawer/bottom sheet com snap points** inspirado no componente 21st.dev `Drawer` (`id=11441`, by coss.com): alça, posições `peek`/`half`/`full`, painel interno rolável e recolhimento por interação com o mapa.
3. A implementação EOS será feita com React + CSS existentes, sem instalar `@base-ui/react`, Tailwind ou shadcn nesta etapa.
4. No mobile, status rail, camadas, alertas e ticker deixam de disputar espaço absoluto e passam para um bottom sheet.
5. No desktop, scroll/gestos de mapa podem colapsar painéis auxiliares, mantendo hover/foco como caminho rápido para reabrir.

**Consequence**: O mapa volta a ser a superfície primária em telas pequenas e médias, sem perder os controles críticos. HWD-06 continua aberto para validação completa de performance, a11y, privacidade, custos e E2E antes de substituir `/dashboard`.

---

## D-055 — World Dashboard Status Rail becomes the household readiness card

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: O card esquerdo do `/dashboard-world` deveria se parecer com o mock aprovado: painel branco vertical com score central, estado operacional, modelo visual da casa, callouts de prontidão, autonomia familiar, barras de recursos, família e comunicação. A versão atual estava correta funcionalmente, mas visualmente simples demais e não comunicava a "casa pronta" como instrumento principal.

**Decision**:
1. O Status Rail será redesenhado como **household readiness card**, mantendo dados reais já disponíveis no EOS.
2. A hierarquia visual passa a ser: conexão/estado no topo, Risk Index grande centralizado, diagrama de casa com callouts, autonomia familiar, barras de água/comida/energia/combustível, família e comunicações.
3. O diagrama da casa será implementado como SVG/CSS local, não como imagem gerada fixa, para continuar sendo componente React real e permitir estados dinâmicos.
4. Campos sem fonte perfeita no MVP podem ser inferidos conservadoramente a partir do inventário existente: `battery_percent` para energia e `fuel_liters` para combustível. Dados indisponíveis devem degradar para `--`, não para números fictícios.

**Consequence**: O card principal passa a cumprir a direção visual aprovada sem criar nova dependência nem alterar schema. Métricas mais avançadas de energia/combustível continuam pendentes para refinamento de modelo.

---

## D-056 — World Dashboard removes central location title

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois do redesign do readiness card, o título central "Your Area/Sua área" passou a competir visualmente com o mapa e com o card principal. O dono pediu remover esse elemento e deixar o centro sem texto.

**Decision**: Remover o Location Brief visual do centro do `/dashboard-world`. O equivalente textual de acessibilidade permanece no `role=status`; a ação de abrir cenário continua disponível no Pilot e no mobile sheet.

**Consequence**: O mapa fica mais limpo e o readiness card vira o instrumento principal. Nenhuma API, dado ou rota muda.

---

## D-057 — World Dashboard alert counter moves to footer and rail scroll is protected

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: O contador de alertas no topo direito estava comprimido por outros controles e ilegível. O dono também reportou que o card Risk Index não rolava até o fim, deixando conteúdo inferior inacessível.

**Decision**: Mover o alert counter para o rodapé direito, acima da bottom navigation, e reservar espaço vertical para o Status Rail terminar antes da nav fixa. O rail permanece scrollável e deve permitir acessar família, comms e C/W/R.

**Consequence**: Top-right fica livre para controles globais, alertas passam a viver no rodapé onde há mais respiro, e o readiness card volta a ser navegável até o final.

---

## D-058 — HWD-06 validation pass keeps World Dashboard isolated

**Date**: 2026-07-21
**Status**: DECIDED

**Context**: Após os ajustes D-054→D-057, foi executada uma validação objetiva do `/dashboard-world` contra parte dos critérios de saída do doc 16 §33. Build, type-check, lint, testes unitários, jornada completa de produção, E2E de círculos/membros, proteção de rota, RainViewer e hazards passaram.

**Decision**: `/dashboard-world` continua isolado e **não substitui `/dashboard` ainda**. O release para dashboard padrão fica bloqueado até aprovação visual do dono, validação a11y/performance/browser, revisão de custo/provider e revisão de privacidade/proveniência de rota/shelter.

**Consequence**: O protótipo está saudável para teste controlado pelo dono, mas HWD-06 permanece IN PROGRESS. Relatório completo em `docs/17-hwd-06-validation.md`.

---

## D-052 — World Dashboard runtime map base toggle

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois do deploy com `NEXT_PUBLIC_MAPTILER_KEY`, o World Dashboard passou a abrir em MapTiler hybrid/satélite. O dono pediu uma opção para voltar ao visual anterior, escuro, semelhante ao protótipo operacional com ruas/labels em dark mode.

**Decision**:
1. `/dashboard-world` deve oferecer um toggle de base visual no painel "Camadas ao vivo": **Híbrido** e **Dark**.
2. **Híbrido** mantém MapTiler hybrid + terreno 3D quando a key pública está configurada.
3. **Dark** força o estilo keyless CARTO dark, mesmo quando existe `NEXT_PUBLIC_MAP_STYLE_URL` ou MapTiler key, para restaurar o visual operacional anterior.
4. A preferência é local do dispositivo/browser (`localStorage`) e não altera dados EOS, localização, hazards, radar, família ou guidance.

**Consequence**: O usuário consegue alternar entre inspeção satelital e leitura operacional dark sem redeploy/env var. Como MapLibre remove fontes/layers ao trocar style, a implementação remonta o mapa e reanexa rota, radar, hazards e marcadores no `load`.

---

## D-051 — HWD-04 privacy baseline + OpenAI inferred route/shelter prototype

**Date**: 2026-07-21
**Status**: DECIDED / PROTOTYPE AUTHORIZED

**Context**: HWD-04 was blocked on privacy/data choices for family location, routing, and shelter source. The owner explicitly chose: family location requires consent, exact point is acceptable, freshness must be visible, and MVP retention is only the latest point. For routes and shelters, the owner asked to use the OpenAI API for now and accepts the risk.

**Decision**:
1. **Family location**: HWD may show exact points for circle/family members whose location is already exposed through EOS circle/profile data. The UI must show freshness/availability state; MVP does not implement location history.
2. **Retention**: MVP stores/uses only the latest known profile/current location. No trail, replay, or historical route.
3. **Routes/shelters**: OpenAI API may be used temporarily as an **inference layer** for candidate shelter/route guidance in the isolated `/dashboard-world` prototype.
4. **Important limitation**: OpenAI is **not** an official geospatial, routing, emergency management, or shelter-status source. Any route/shelter generated this way must be labeled as AI/inferred/candidate, not official or guaranteed safe.
5. **Review debt**: before production replacement of `/dashboard`, shelters and routing must be reviewed and moved to appropriate official/geospatial providers or curated/admin-verified data.

**Consequence**: HWD-04 is unblocked for a prototype implementation only. Production rollout remains blocked until HWD-06 validation and the route/shelter source review.

---

## D-050 — Dono autoriza a implementação do Hybrid World Dashboard (gate liberado)

**Date**: 2026-07-21
**Status**: DECIDED / AUTORIZADO

**Context**: `docs/16-hybrid-world-dashboard.md` (D-047) definiu a arquitetura do World Dashboard mas com gate explícito: *"NO IMPLEMENTATION AUTHORIZED until the owner explicitly approves"*. Ao revisar por que o dashboard no código (Living Dashboard v2 — mostrador + tactical cards) não batia com a imagem que o dono criou no Higgsfield, ficou claro que a imagem **é** o World Dashboard. O dono então **autorizou iniciar a implementação**.

**Decision**:
1. Gate do doc 16 **liberado**. Começar por **HWD-01** (protótipo visual estático): rota isolada `/dashboard-world`, imagem do Higgsfield como fundo temporário, HUD em componentes React reais (Status Rail, Pilot Capsule, Location Brief, Environmental Ticker, Alert Counter), marcadores de família/rota **mock rotulados**, dados reais do `RiskProvider` onde seguro, responsivo, reduced-motion. **Sem MapLibre ainda** (isso é HWD-02).
2. **Não** substituir `/dashboard` — o World Dashboard fica isolado e reversível até os critérios de saída (doc 16 §33).
3. O EOS Pilot (D-046) passa a ter como casa alvo a **Pilot Capsule** do World Dashboard; o protótipo de complication no v2 (PILOT-T01) fica em espera.

**Consequence**: roadmap ganha a seção **Hybrid World Dashboard (HWD)** — HWD-00 completo, HWD-01 em andamento. O Pilot entra via HWD-05.

---

## D-048 — Stripe Live cutover concluído

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO

**Context**: O Stripe Test mode já estava validado ponta-a-ponta em LA-T01, mas o app ainda não podia cobrar de verdade. LA-T02 exigia repetir a configuração em Live mode, trocar as env vars da Vercel e fazer um deploy fresco.

**Decision**:
1. Ativar o faturamento real do EOS em Stripe Live mode na conta `acct_1TuL40IaCSStSVaq` (EOS, US, ativada).
2. Manter o mesmo modelo de monetização de D-042: Stripe Checkout hospedado, Billing Portal e webhook como fonte de verdade de `profiles.plan`.
3. Usar produtos/preços Live mensais para Family ($9.90) e Premium ($19.90), referenciados apenas via `STRIPE_PRICE_FAMILY` e `STRIPE_PRICE_PREMIUM`.
4. Trocar as env vars Production da Vercel para `sk_live`, `whsec` Live e Price IDs Live, seguido de redeploy.
5. Limpar IDs sandbox obsoletos dos profiles para que checkout/portal recriem customer/subscription no ambiente Live.

**Consequence**: LA-T02 fica completa; o próximo trabalho de produto pode avançar para o protótipo EOS Pilot (`PILOT-T01`). As chaves expostas durante a operação devem ser rotacionadas pelo dono.

---

## D-049 — Aba Família vira vista unificada (roster pessoal + membros do círculo)

**Date**: 2026-07-21
**Status**: DECIDED / IMPLEMENTADO
> Renumerada de D-047 → D-049 em 2026-07-21 para resolver colisão: **D-047 pertence ao Hybrid World Dashboard** (`docs/16-hybrid-world-dashboard.md`).

**Context**: O dono relatou que, quando familiares entraram no seu círculo, a aba Família **não preencheu automaticamente** com esses membros. Revisão do código confirmou a causa: são dois conceitos separados no banco — a aba Família lê `family_members` (roster pessoal que o usuário cria), enquanto entrar no círculo insere em `circle_members` (aparece na aba Círculos). O fluxo de join/approve (`/api/circles/join`, `/api/circles/[id]/requests/[reqId]`) **não escreve em `family_members`**, e a única ponte era uma sugestão de vínculo por nome (P2-T05) que só surgia se o membro já tivesse sido cadastrado manualmente. Isso é o comportamento MVP documentado ("Nenhum merge automático — usuário decide", `docs/12-circle-model.md`), mas **contradiz a promessa-título da própria spec**: "Entrar num círculo = acesso imediato a tudo que o grupo já configurou; ninguém re-cadastra".

**Decision**:
1. A aba Família passa a ser uma **vista unificada**: mostra o roster pessoal (`family_members`) **mais** os co-membros do círculo, exibidos como cards **somente-leitura** com selo "Do círculo · <nome>". Mesmo padrão do Household de inventário — uma **vista calculada, sem duplicar dado** (nenhuma escrita nova em `family_members`).
2. **Dedup**: um co-membro do círculo não é exibido como card separado se já estiver vinculado a um `family_members` (`linked_user_id`) ou se o nome bater com um membro pessoal existente — nesses casos o card pessoal já o representa (e oferece o vínculo P2-T05).
3. **Escopo das informações nesta 1ª entrega**: usa apenas o que o círculo já expõe via `/api/circles` (nome, role, localização, contato de emergência quando compartilhado). **Ficha médica** dos co-membros (tipo sanguíneo, alergias, medicações) fica como follow-up, pois exige uma decisão de privacidade + ampliação da API (hoje `/api/circles` não expõe campos médicos).
4. Sem mudança de schema. Implementação client-side na tela Família consumindo `/api/circles`.

**Consequence**: entrar/aprovar alguém no círculo passa a refletir na aba Família automaticamente, cumprindo a promessa da spec, sem merge destrutivo nem duplicação. `docs/12-circle-model.md` atualizado. Follow-up registrado: compartilhamento de ficha médica no círculo (privacy-gated).

---

## D-047 — Hybrid World Dashboard (arquitetura híbrida: mundo como interface)

**Date**: 2026-07-21
**Status**: DECIDED / SPEC (implementação autorizada em D-050)

**Decision**: EOS prototipa um Dashboard "mundo como interface" com **MapLibre GL JS** como engine de render, providers de mapa/terreno/imagem substituíveis como base, fontes oficiais de hazard normalizadas, e overlays proprietários do EOS (Risk Index, família, rotas, abrigos, recursos, cenários, Pilot). Meta visual: interface situacional automotive-grade, independente de provider. Primeira implementação **isolada e reversível**, dados mock rotulados, sem persistência de localização de família sem decisão de privacidade separada. Spec completa: `docs/16-hybrid-world-dashboard.md`.

**Consequence**: registra a direção de produto/arquitetura do próximo Dashboard. Gate de implementação estava fechado no doc 16; liberado por D-050.

---

## D-046 — EOS Pilot como camada contextual integrada ao Dashboard

**Date**: 2026-07-20
**Status**: DECIDED / SPEC

**Context**: O EOS resolve preparação, monitoramento e resposta, mas emergências graves são esporádicas. O dono identificou uma oportunidade de uso diário: os mesmos dados que ajudam a decidir evacuação, preparação e risco também podem ajudar a decidir se a família deve pescar, navegar, acampar, viajar ou voltar antes de o contexto piorar. A pergunta central foi: como usar os dados do EOS no dia a dia antes de uma emergência séria?

**Decision**:
1. Criar **EOS Pilot** como a camada contextual de decisão do EOS, não como nova identidade principal do produto.
2. O Pilot começa perguntando **"What's the plan?"** / **"Qual e o plano?"**, aprende por opções progressivas e cruza intenção, ambiente, família, recursos e regras de segurança.
3. No primeiro teste, o Pilot entra como **complication/módulo integrado ao Dashboard**, não como nova aba permanente e não como chatbot genérico.
4. As respostas usam estados objetivos: `GO`, `LIMITED`, `WAIT`, `AVOID` e `PRIORITY OVERRIDE`.
5. Regras críticas e alertas oficiais sempre vencem preferências aprendidas ou interpretação por IA.
6. O Pilot é uma etapa de experiência de produção após a ativação Stripe Live, salvo decisão explícita do dono para prototipar antes.

**Consequence**: A spec fica em `docs/15-eos-pilot.md`; o roadmap ganha a etapa **Production Experience — EOS Pilot**. O próximo item operacional continua sendo LA-T02 (Stripe Live cutover). O Pilot não muda código agora.

---

## D-045 — Landing de conversão v3 ("Prévia Viva") adiada até depois do Stripe no ar

**Date**: 2026-07-19
**Status**: DECIDED / DEFERRED

**Context**: Existe uma landing muito mais ambiciosa documentada em `EOS documents/Landing EOS/` — `eos-landing-v3-interactive-spec.md` (spec da "Prévia Viva": a página inteira é uma máquina de estados de risco SAFE/WATCH/WARNING/CRITICAL, com protótipo navegável) e `eos-landing-v2-preview.jsx` (preview React). A landing **em produção** (`app/page.tsx`) é minimalista e foi estendida em 2026-07-17 com preços públicos + rodapé legal + `/terms`, `/privacy`, `/refund` para a revisão do Stripe.

**Decision**: Priorizar **pôr no ar + ativar o Stripe** com a landing minimalista atual (que já é suficiente para a revisão do processador). A landing de conversão v3 é um projeto de produto à parte, de esforço bem maior, e fica **adiada** para depois do lançamento pago. Registrada no roadmap como tarefa futura (ver P3-T07).

**Consequence**: Não implementar a v3 agora. A landing atual serve tanto ao usuário quanto ao revisor do Stripe. Quando o faturamento estiver ativo, retomar a v3 a partir da spec já escrita.

---

## D-044 — 3 agentes de sobrevivência (MacGyver/SEAL/SAS) + fix de truncagem da análise

**Date**: 2026-07-11
**Status**: DECIDED / IMPLEMENTADO

**Context**: Após a análise determinística/base na tela Cenário, o dono quis dar ao usuário a opção de aprofundar com 3 "especialistas de sobrevivência": improviso (MacGyver), operação (Navy SEAL) e sobrevivência de campo (SAS). Além disso, o texto da análise aparecia **cortado no final** (palavras incompletas, raciocínio não conclui).

**Decision**:
1. **Agente = experiência distinta, não o mesmo plano com outro tom.** (Refinado em 2026-07-12 a pedido do dono: a 1ª versão saía "quase idêntica ao determinístico".) Quando `agent` está setado, `/api/analyze` usa `buildAgentPrompt` (não o formato rígido) — um **companheiro/mentor** que, nesta ordem, lê o **inventário**, checa **cada ficha da família** (idade/condições/medicamentos/mobilidade/bebês), consulta o **clima ao vivo** da localização (via `fetchOpenMeteoForecast` + alertas NWS, injetado no prompt) e o que a pessoa está **planejando** (próximas horas/dias), e então **soma tudo** para dar sugestões personalizadas por perfil, ensinando o porquê. Saída **conversacional livre** (`raw_text`), **sem seções rígidas e sem disclaimers**. O Rules Engine ainda roda e informa a prioridade (grounding), mas não força o formato. RAG enriquecido por agente. Consultas de agente **não são persistidas**.
2. **UI**: na tela Cenário, após o resultado base, um seletor com os 3 agentes (glyphs vetoriais, sem emoji); tocar re-executa com aquele companheiro e mostra badge do agente ativo. A resposta do agente é renderizada em tipografia de leitura (DM Sans), não monoespaçada. O cliente envia lat/lng para o clima. Bilíngue PT/EN. Verificado com OpenAI: saída calorosa, cita inventário real, personaliza por membro (bebê/idoso/condição médica), usa o clima real, sem disclaimer.
3. **Fix de truncagem (2 causas)**: (a) `useTypewriter` não resetava o índice na transição para "done" — quando o texto formatado era mais curto que o índice já digitado do stream bruto, o `displayed` congelava no stream bruto (cortado pelo `max_tokens`). Agora o typewriter só anima durante o streaming e o texto **completo** é renderizado ao concluir. (b) `max_tokens` 1500 → **2400** e timeout 30s → 45s, para o LLM não parar no meio da última ação. Também corrigido um bug pré-existente: a mensagem do usuário mandava `\${body.scenario}` literal (com `$` escapado) em vez do cenário real.

**Consequence**: o usuário recebe a análise base determinística e pode pedir a visão de cada especialista; o texto nunca mais aparece cortado. O Rules Engine continua sendo a fonte de verdade de prioridade/riscos. Build/lint/tsc limpos; 41 testes passam.
---

## D-043 — Rede de inteligência de riscos: subsistema `lib/hazards/` desacoplado + honestidade de estado

**Date**: 2026-07-10
**Status**: DECIDED / IMPLEMENTADO (fundação); Fase 2 (persistência + push por hazard) deferida e documentada

**Context**: Pedido de auditoria completa das integrações meteorológicas/emergência e implementação das ausentes (WeatherKit, nowcast, NHC, raios, IPAWS, ShakeAlert) + um componente visual "Live Intelligence Network" com estado real. Auditoria (`docs/hazard-data-integrations-audit.md`) confirmou: previsão real é Open-Meteo (não WeatherKit), NWS/USGS parciais, NHC/raios/IPAWS/ShakeAlert/nowcast ausentes, push só manual.

**Decision**:
1. **Subsistema novo e aditivo** em `lib/hazards/` — não altera `lib/monitor.ts` nem `lib/weather/` (não quebrar o existente).
2. **Modelo unificado `HazardEvent`** + interfaces desacopladas por provider.
3. **Providers reais keyless**: NWS (normalização completa + dedup), USGS (distância/tsunami/relevância), NHC (`CurrentStorms.json`), Open-Meteo `minutely_15` (nowcast).
4. **Adapters `NOT_CONFIGURED`** para WeatherKit/AccuWeather/Xweather/ShakeAlert/FEMA IPAWS — interface + env + flag, **sem chamada falsa, sem chave fake, sem "connected" simulado**.
5. **Honestidade de estado** (`aggregateNetworkStatus`): "ALL SYSTEMS LIVE" só quando todo canal obrigatório+configurado está `live` e nenhum em fallback. Estado atual real: `USING BACKUP WEATHER SOURCE` (WeatherKit ausente → Open-Meteo).
6. **Componente `LiveIntelligenceNetwork`** na tela Cenário (rotativo, reduce-motion, expansível), consumindo `GET /api/hazards`.
7. **Segredos só no servidor** (`lib/hazards/env.ts`); thresholds centralizados (`config.ts`).
8. **Deferido**: persistência (migration `20260710010000_hazard_tables.sql` com RLS, a aplicar) e automação de push por hazard.

**Consequence**: EOS passa a ter uma central multi-fonte com status verificável e classificação visual que separa alerta oficial de análise do EOS. Ativar um provider comercial = preencher env vars + implementar o branch real do adapter (ver `hazard-provider-setup.md`). 41 testes passam; build/lint/types limpos.
---

## D-042 — Monetização (P3-T04): Stripe self-serve, preços via env, downgrade na expiração

**Date**: 2026-07-10
**Status**: DECIDED / IMPLEMENTADO (código pronto; ativação depende de checklist do dono)

**Context**: Os 3 tiers (D-020) e o mapa completo de features→tier (`lib/feature-gates.ts`, D-021/D-025) já estavam prontos e sendo **lidos** em Settings/Círculos, mas **não existia caminho de escrita** para `profiles.plan` — nenhum código de cobrança. O botão "Fazer upgrade" só dava `alert(...)`. Sem isso, o freemium não gera receita e ninguém consegue subir de plano. Único item aberto do roadmap.

**Decision** (confirmada pelo dono em 2026-07-10):
1. **Provedor: Stripe.** Checkout hospedado + Billing Portal (usuário gerencia/cancela sozinho) + webhooks como fonte de verdade. Cartão internacional; Pix fica para depois via parceiro.
2. **Escopo: self-serve completo.** Checkout → webhook escreve `profiles.plan` automaticamente → Portal para gerenciar → **downgrade para `free` quando a assinatura expira/cancela**.
3. **Preços via env var (Price IDs).** O código referencia `STRIPE_PRICE_FAMILY` e `STRIPE_PRICE_PREMIUM`; o dono cria produtos/preços (valor, moeda, mensal/anual) no Stripe Dashboard. Nenhum valor hardcoded — trocar preço = trocar env var, sem deploy de código.

**Implementação**:
- **DB** (`supabase/migrations/20260710000000_stripe_billing.sql`): `profiles` ganha `stripe_customer_id`, `stripe_subscription_id`, `plan_status`, `plan_current_period_end`. **Precisa ser aplicada no SQL Editor** (sem credencial de DB no ambiente do agente — mesmo padrão de D-038).
- **`lib/stripe.ts`**: client server-only (`getStripe()` → null se sem chave, degrada limpo); `planForPriceId()` (reverse map preço→plano) e `priceIdForPlan()`.
- **Rotas**: `POST /api/billing/checkout` (cria/reusa customer, abre Checkout Session), `POST /api/billing/portal` (abre Billing Portal), `POST /api/billing/webhook` (verifica assinatura com `STRIPE_WEBHOOK_SECRET`, raw body, escreve plano via service-role em `checkout.session.completed` / `customer.subscription.updated` / `.deleted`).
- **UI**: Settings — botão de upgrade abre Checkout; botão "Gerenciar assinatura" (Portal) quando plano ≠ free; trata retorno `?billing=success|cancelled`.

**Checklist de ativação (dono)** — feature fica inerte (503) até:
1. Aplicar a migration no Supabase SQL Editor.
2. Criar 2 produtos/preços recorrentes no Stripe → copiar os Price IDs.
3. Setar no Vercel (Prod+Preview): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FAMILY`, `STRIPE_PRICE_PREMIUM`.
4. Registrar o endpoint de webhook no Stripe: `https://eos-app-fawn.vercel.app/api/billing/webhook` (eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`).
5. Redeploy.

**Consequence**: com o checklist feito, qualquer usuário faz upgrade/downgrade sozinho e o plano reflete a assinatura real. `profiles.plan` deixa de ser manual. Enquanto o checklist não roda, as rotas degradam para 503 e a UI mantém o estado atual (nada quebra).
---

## D-041 — Entrar num círculo por convite é grátis (só criar é gate Família)

**Date**: 2026-07-08
**Status**: DECIDED / IMPLEMENTADO

**Context**: A tela `/circles` inteira era bloqueada para o plano `free` (gate `circulos: 'family'`). Consequência: quem era **convidado** (e está no free) não conseguia nem inserir o código para aceitar o convite — teria que fazer upgrade só para entrar. Isso trava a viralização (o dono paga, mas cada convidado esbarra num paywall).

**Decision**: **Entrar** num círculo (código, QR, busca por nome, pedir para entrar) e **ver** círculos dos quais já é membro passam a ser **grátis para todos**. Apenas **criar** um círculo permanece no plano Família. Na UI, o card "Criar" mostra prompt de upgrade para o free; o card "Entrar" fica sempre funcional. As rotas de API de join/requests nunca checaram plano (o gate era só de UI), então a mudança é só na página.

**Consequence**: o modelo freemium fica: organizar/criar círculo = pago; ser convidado e participar = grátis. `circulos: 'family'` agora significa "criar". `qr_emergencia` e monitoramento multi-local seguem gated normalmente.
---

## D-040 — Fluxo completo de adicionar membros (6 formas) + aprovação

**Date**: 2026-07-05
**Status**: DECIDED / IMPLEMENTADO E TESTADO (19/19 E2E)

**Context**: O doc `12-circle-model.md` descreve 6 formas de adicionar membro, mas só 1½ estavam implementadas (família manual; join por código era instantâneo, sem a aprovação que o spec pede). Faltava: aprovação, pedido sem código (busca por nome), e scanner de QR (convite e ficha).

**Decision** — implementadas todas as 6 formas:
1. **Família manual** — já existia (`/api/family-members`).
2. **Escanear ficha → membro manual** — botão 📷 na Família abre `QRScanner`; ao ler `/ficha/[id]`, lê a ficha pública e pré-preenche o cadastro.
3. **Convite por código** — `POST /api/circles/join` agora cria **pedido pendente** (não entra direto); Admin aprova.
4. **Convite por QR** — o QR do círculo embute o código; `QRScanner` na tela Círculos lê e preenche o código.
5. **Pedido por busca (sem código)** — `GET /api/circles/search?q=` + `POST /api/circles/[id]/requests`.
6. **Escanear ficha → convidar** — mesmo scanner; ficha reconhecida abre a ficha pública.

**Aprovação** (novo): tabela `circle_join_requests` (pending/approved/rejected, migration `20260705000100`). Rotas: `[id]/requests` (GET Admin lista / POST pedir), `[id]/requests/[reqId]` (aprovar/rejeitar), `my-requests`. Admin verificado em app-code; operações cross-user via **service-role client** (`lib/supabase/admin.ts`) para não recair na recursão de RLS de círculos.

**Bugs corrigidos no caminho** (RLS/embed): (a) join resolvia o círculo pelo código com o client do usuário, mas `circles` é member-only sob RLS → não-membro via 404 → agora resolve via service-role; (b) embeds PostgREST `profiles(...)` em `circle_members` e `circle_join_requests` **não funcionam** porque `user_id`/`requester_id` referenciam `auth.users` (não `profiles`) e `profiles` é owner-only → a lista de membros vinha **vazia até para o criador** → agora busca perfis em query separada via service-role.

**Scanner**: `html5-qrcode` (client-only, import dinâmico) + `lib/qr-parse.ts` (parser puro, distingue código de 6 chars vs URL `/ficha/[id]`, testado 8/8). Câmera testada no dispositivo pelo usuário.

**Consequence**: entrar num círculo agora exige aprovação do Admin (muda o comportamento anterior de join instantâneo — alinhado ao spec). Verificado E2E com `scripts/_members.mjs`: 19/19 (criar → pedir por código/busca → listar com nome → aprovar/rejeitar → virar membro → autorização de não-admin).
---

## D-001 — Next.js App Router (not Pages Router)
**Date**: Project init  
**Decision**: Use Next.js 14 App Router with TypeScript strict mode.  
**Rationale**: Server components, streaming, built-in middleware auth support.

---

## D-002 — Supabase as Backend
**Date**: Project init  
**Decision**: Supabase for PostgreSQL + pgvector + auth + RLS.  
**Rationale**: Managed Postgres with vector search built-in. No separate vector DB needed.

---

## D-003 — SSR Cookie Auth (not localStorage)
**Date**: 2026-06-23  
**Decision**: All auth uses @supabase/ssr with SSR cookies.  
**Rationale**: localStorage tokens are empty in server components and API routes. Cookies work everywhere. This fixed the Decision Engine 401 bug.

---

## D-004 — Rules Engine is Sacred
**Date**: 2026-06-23  
**Decision**: The Rules Engine always runs before the LLM and the LLM cannot downgrade its urgency output.  
**Rationale**: Safety guarantee. In a real emergency, a false "LOW" from the LLM could cost lives. The rules are deterministic and conservative.

---

## D-005 — Three-Tier Intelligence (not two)
**Date**: Project design  
**Decision**: CONNECTED → LOCAL_AI → SURVIVAL as a fallback chain, not feature flags.  
**Rationale**: The app must work in zero-infrastructure scenarios. Degrading gracefully is a core product requirement.

---

## D-006 — text-embedding-3-small for RAG
**Date**: Project design  
**Decision**: Use OpenAI text-embedding-3-small (1536 dims) with HNSW index and 0.78 cosine threshold.  
**Rationale**: Balance of quality and cost. 1536 dims > 1024 (ada-002 small) without the cost of large.

---

## D-007 — PDF → Text → Embed (two-step ingest)
**Date**: 2026-06-23  
**Decision**: Ingest pipeline is split: Python (PyMuPDF) extracts text, then Node (native fetch) embeds and upserts.  
**Rationale**: pdf-parse + tsx caused OOM (openai SDK v6 = 13MB JS exhausts V8 heap before any code runs). PyMuPDF handles 34MB PDFs trivially. Native fetch avoids all SDK overhead.

---

## D-008 — Knowledge Base: 14 Emergency PDFs
**Date**: 2026-06-23  
**Decision**: Ingest 14 curated emergency PDFs. Exclude Bibles (docs/bibles/).  
**Rationale**: The knowledge base should be domain-specific emergency content. Religious texts are personal, not emergency protocol.

---

## D-009 — Vercel for Hosting
**Date**: Project init  
**Decision**: Deploy to Vercel, auto-deploy on push to main.  
**Rationale**: Zero-config Next.js deployment. Edge functions for middleware.

---

## D-010 — SDD / App Spine Methodology
**Date**: 2026-06-23  
**Decision**: Adopt Spec-Driven Development. /docs is the source of truth. Code follows spec.  
**Rationale**: The project has grown organically with many uncommitted or undocumented decisions. SDD provides a structured way to maintain alignment across sessions and collaborators.

---

## Pending Decisions

| ID | Question | Blocking |
|---|---|---|
| PD-001 | Language strategy: English-only vs bilingual (PT/EN)? | P1-T05 |
| PD-002 | Landing page approach: minimal orienting page vs full marketing? | P1-T04 |
| PD-003 | Monetization model: freemium, subscription, or free? | Phase 3 |
| PD-004 | Mobile timeline: when to initialize React Native? | P2 start |

---

## D-011 — Apenas OpenAI como provedor LLM
**Date**: 2026-06-28  
**Decision**: O projeto usa exclusivamente a API da OpenAI. Anthropic nunca foi intencional.  
**Rationale**: O usuário confirmou: "eu nunca quis usar a api da anthropic pois eu uso da open ai". Todo código com Anthropic SDK foi removido. `/api/analyze` e `/api/checklist/generate` usam `gpt-4o-mini`.

---

## D-012 — Checklist integrado na tela de Recursos
**Date**: 2026-06-28  
**Decision**: Os itens do checklist são exibidos e interativos na tela de Recursos (inventory), não apenas na tela dedicada `/checklist`.  
**Rationale**: O usuário quer ver os recursos e o checklist juntos — "devem estar integrados tudo que é gerado o checklist com a tela de Recursos". Marcar um item como adquirido atualiza automaticamente o inventário.

---

## D-013 — Sync unidirecional: checklist → inventory (nunca decresce)
**Date**: 2026-06-28  
**Decision**: Marcar um item do checklist como adquirido ATUALIZA o inventário (via `Math.max`). Desmarcar NÃO diminui o inventário.  
**Rationale**: Preservar dados inseridos manualmente. Se o usuário já tem 100L de água no inventário e marca um item de 45L, o inventário continua 100L. A sincronização é aditiva, não substitutiva.
---

## D-014 — Círculo como espaço compartilhado (não lista de contatos)
**Date**: 2026-06-28
**Decision**: Entrar num círculo dá acesso imediato a todos os dados do grupo — membros, inventário, checklist, fichas.
**Rationale**: O usuário não deve re-cadastrar o que o líder já configurou. O círculo é o "sistema nervoso" da família preparada.

---

## D-015 — Household inventory = soma calculada (não entidade separada)
**Date**: 2026-06-28
**Decision**: Não existe tabela "household_inventory". O Household é uma vista calculada: soma dos itens pessoais de cada membro onde `shared = true`.
**Rationale**: Evita duplicação de dados e conflitos de sync. Cada pessoa é dona dos seus itens. O sharing é granular por campo, não por perfil inteiro.

---

## D-016 — Roles no círculo: Admin / Editor / Viewer
**Date**: 2026-06-28
**Decision**: Três roles com permissões distintas. Admin = full control + nomear roles. Editor = editar dados, não gerenciar membros. Viewer = leitura + comentários.
**Rationale**: Família tem hierarquia natural. Pai e mãe têm controle total, filha mais velha pode editar, filha mais nova só visualiza. O líder (criador) é sempre Admin e não pode ser rebaixado.

---

## D-017 — Merge de membro manual ao entrar como vinculado: badge + decisão do usuário
**Date**: 2026-06-28
**Decision**: Quando um membro vinculado (conta real) entra no círculo e já existe um cadastro manual para a mesma pessoa, mostra badge "possível duplicata". O Admin decide vincular ou manter separado. Nenhum merge automático no MVP.
**Rationale**: Merge automático por nome/idade é propenso a erro. Melhor deixar o humano decidir.

---

## D-018 — UX: nunca bloquear com erro por falta de círculo
**Date**: 2026-06-28
**Decision**: Se o usuário tenta convidar alguém ou compartilhar ficha sem ter um círculo, o app guia para criar o círculo primeiro — nunca exibe erro cru.
**Rationale**: O usuário não pensa em "criar círculo" e "convidar" como passos separados. Ele pensa em "trazer minha filha para o app". A sequência técnica não pode vazar para a UX.

---

## D-019 — Ficha Master como identidade central do usuário logado
**Date**: 2026-06-28
**Decision**: Não existe "perfil" separado de "ficha". Existe uma única **Ficha Master** que é a identidade central do usuário — coletada progressivamente desde o onboarding e presente em todas as partes do app.
**Rationale**: Atualmente os dados do usuário estão fragmentados: nome em `profiles`, localização em `profiles`, tipo sanguíneo em `/ficha`, role do círculo em outra tela. O usuário não sabe quem ele é no sistema. A Ficha Master é o ponto único de identidade de onde tudo deriva: análise de cenário, checklist personalizado, QR de emergência, e o que os membros do círculo enxergam sobre ele.
**Impacto**: A tela `/ficha` atual é um rascunho. Precisa ser redesenhada como Ficha Master com coleta progressiva desde o onboarding.

---

## D-020 — Modelo de assinatura: Gratuito / Família / Premium
**Date**: 2026-06-28
**Decision**: Três tiers de assinatura. A Ficha Master é o ponto de entrada e apresenta o que está disponível e o que requer upgrade. Tiers: `free`, `family`, `premium`.
**Rationale**: O produto tem valor diferenciado por nível de preparação e tamanho do círculo. Features futuras serão atribuídas a tiers sem refatoração de banco.
**Campo no banco**: `profiles.plan` enum `('free', 'family', 'premium')` com default `'free'`.

---

## D-021 — Feature gates em código, não em banco

**Date**: 2026-06-28
**Decision**: O mapeamento de features → tiers vive num único arquivo de configuração no código (ex: `lib/feature-gates.ts`). O banco guarda apenas `profiles.plan`. Adicionar uma nova feature a um tier = modificar só esse arquivo, sem migration.
**Rationale**: Flexibilidade total para evoluir o modelo de negócio. Hoje são 3 tiers e X features; amanhã podem ser 4 tiers e 3X features. A regra de acesso não pode estar espalhada pelo código.
**Estrutura**:
```
FEATURE_GATES = {
  qr_emergencia:      'family',
  circulos_multiplos: 'premium',
  analise_ia:         'family',
  exportar_ficha:     'premium',
  ...
}
```

---

## D-022 — Monitoramento como camada proativa (não reativa)
**Date**: 2026-06-28
**Decision**: O EOS passa de reativo (usuário descreve → recebe plano) para proativo (app detecta ameaças → alerta usuário → plano com contexto real). O monitoramento não substitui o campo livre de descrição — enriquece o contexto da análise AI com dados oficiais antes de o usuário digitar.
**Rationale**: A maior dor de um pai de família em emergência é não saber o que está acontecendo nem se deve agir. Dados em tempo real de NWS, USGS, FEMA eliminam esse vazio. Spec completa em `docs/14-monitoring.md`.

---

## D-023 — Tela Cenário redesenhada como hub de monitoramento
**Date**: 2026-06-28
**Decision**: A tela Cenário é redesenhada para mostrar um painel de status de ameaças (clima, terremoto, incêndio, qualidade do ar, desastres FEMA) ANTES do campo de descrição livre. Tocar num alerta pré-preenche o campo e dispara análise com contexto real.
**Rationale**: O campo de texto vazio é intimidador sem contexto. Com o painel de monitoramento, o usuário vê imediatamente o que é relevante para sua localização e pode agir com um toque. O campo livre continua disponível para situações não monitoradas.

---

## D-024 — Localização deve ser lat/lng, não texto livre
**Date**: 2026-06-28
**Decision**: `profiles.location` (texto) continua como label legível na UI, mas adiciona-se `profiles.location_lat float8` e `profiles.location_lng float8`. Geocodificação via Nominatim (OpenStreetMap, gratuito) ao salvar a localização.
**Rationale**: Todas as APIs de monitoramento (NWS, USGS, AirNow, NASA FIRMS, FEMA) são geo-baseadas e requerem coordenadas. Sem lat/lng, nenhuma delas funciona. Este campo é pré-requisito (P2-T08) para toda a feature de monitoramento.

---

## D-025 — Fontes de monitoramento por tier
**Date**: 2026-06-28
**Decision**: Gratuito = NWS + USGS (universalmente úteis, sem chave). Família = + AirNow + FEMA + NASA FIRMS + monitoramento de múltiplas localizações do círculo. Premium = + CDC + FDA + notificações push + histórico 30 dias.
**Rationale**: As fontes gratuitas cobrem as ameaças mais imediatas (clima severo e terremotos) e são suficientes para o valor básico do produto. Fontes especializadas (qualidade do ar, recalls, surtos) justificam upgrade.

---

## D-026 — Idioma bilíngue PT/EN selecionado em Settings
**Date**: 2026-06-28
**Decision**: EOS terá interface bilíngue Português/Inglês. O usuário escolhe o idioma no menu Settings; a preferência é persistida no dispositivo e aplicada sem exigir uma mudança de conta ou plano.
**Rationale**: A base atual mistura os dois idiomas e o produto atende famílias em contextos internacionais. Uma preferência explícita evita inferências incorretas pelo navegador e mantém o controle com o usuário.

---

## D-028 — Sentry: Deferido até pós-viabilidade de MVP
**Date**: 2026-06-29
**Decision**: Não configurar `SENTRY_DSN` no Vercel nem ativar o Sentry no MVP. Tarefa P1-T07 movida para DEFERRED.
**Rationale**: Os configs `sentry.*.config.ts` existem e são guardados por `if (dsn)` — sem `SENTRY_DSN` configurada, o SDK não inicializa e nenhum overhead é adicionado. Para um MVP com base de usuários pequena, os logs de funções do Vercel cobrem erros críticos sem custo ou complexidade adicionais. Configurar Sentry agora não resolve nenhum problema presente.
**Quando reavaliar**: >50 usuários ativos OU primeiro bug de produção que não aparece nos logs do Vercel. Pré-requisito: criar conta Sentry, obter DSN, adicionar `SENTRY_DSN` (server) e `NEXT_PUBLIC_SENTRY_DSN` (client) no Vercel.
**Alternatives considered**: Ativar agora (rejeitado — custo de setup > benefício no MVP), Remover configs (rejeitado — já existem, não atrapalham nada desativados).

---

## D-027 — Repriorizar Ficha Master antes de concluir alinhamento bilíngue
**Date**: 2026-06-29
**Decision**: P1-T05 retorna a PENDING com trabalho restante preservado. P2-T06 passa a IN PROGRESS por solicitação explícita do usuário. Após a Ficha Master, P1-T05 deve ser retomada; não está cancelada nem considerada concluída.
**Rationale**: A Ficha Master é a base de identidade usada pelos próximos incrementos de assinatura e Círculos. Consolidá-la agora reduz retrabalho nas telas subsequentes.

---

## D-029 — Cross-device sync: 3 camadas (cache + Realtime + fila offline)
**Date**: 2026-06-30
**Decision**: Sincronização cross-device implementada em 3 camadas: (1) TTL da cache Workbox reduzido de 24h para 2min para APIs; (2) Supabase Realtime `postgres_changes` invalida e refaz fetch em tempo real; (3) Fila de escrita offline em `localStorage` (`eos:offline_queue`) com flush automático ao reconectar.
**Rationale**: A raiz do problema era o Workbox com `NetworkFirst` e TTL de 24h — dados atualizados no servidor não chegavam ao dispositivo até a cache expirar. Realtime garante propagação imediata entre dispositivos. A fila offline garante que escritas feitas sem internet não se perdem.
**Arquivos**: `lib/sync.ts`, `hooks/useRealtimeSync.ts`, `hooks/useOfflineQueue.ts`, `components/SyncStatus.tsx`

---

## D-030 — Salvar formulários só no blur / ação explícita (não debounce)
**Date**: 2026-06-30
**Decision**: Formulários de edição (ex: Ficha) não salvam automaticamente enquanto o usuário digita. Salvamento ocorre: (a) ao sair do campo (`onBlur`), (b) ao clicar em botão "Salvar" explícito, (c) em ações discretas (selecionar tipo sanguíneo, adicionar/remover item de lista). Flag `isDirtyRef` impede o Realtime de sobrescrever o formulário com mudanças não salvas.
**Rationale**: Debounce de 700ms combinado com Realtime causava sobrescrita do campo enquanto o usuário digitava. `onBlur` é o contrato correto: o usuário terminou de editar quando saiu do campo.

---

## D-031 — Safe area insets via CSS env() no body (não por página)
**Date**: 2026-06-30
**Decision**: `viewportFit: 'cover'` + `statusBarStyle: 'black-translucent'` no manifest causavam conteúdo "sangrando" sob o notch do iPhone. Solução: variáveis CSS `--sat/--sab/--sal/--sar` em `:root` + `padding-top: var(--sat)` no `body`. Elementos `position: fixed` (AppActions, SyncStatus) requerem tratamento individual com `env(safe-area-inset-top/bottom)`.
**Rationale**: Aplicar no `body` cobre todas as páginas automaticamente sem precisar modificar cada inline style. Elementos fixed não herdam padding do body, então precisam de `env()` direto.

---

## D-032 — Push notifications via VAPID + Web Push API
**Date**: 2026-06-30
**Decision**: Notificações push usam VAPID (Voluntary Application Server Identification) via `web-push` npm package. Chaves geradas uma vez e armazenadas em Vercel env vars. ServiceWorker injeta handlers de `push` e `notificationclick` via `next-pwa` `customWorkerSrc`. Inscrições armazenadas em `push_subscriptions` com RLS (usuário gerencia as próprias).
**Rationale**: Web Push é o padrão W3C para PWAs. VAPID elimina a necessidade de conta em serviços de push de terceiros. Admin de círculo pode enviar alertas de emergência para todos os membros inscritos.

---

## D-033 — Weather Intelligence uses Open-Meteo as primary provider

**Date**: 2026-07-01
**Status**: DECIDED

**Context**: Weather Intelligence feature needs global weather data (temperature, wind, rain probability, UV, AQI, hourly forecast). NWS only covers US. Open-Meteo covers globally, has no API key requirement, and returns WMO-coded conditions.

**Decision**: Open-Meteo forecast + air quality as primary. NWS alerts (via existing monitor.ts) and USGS earthquakes layered on top. Provider statuses tracked in WeatherSnapshot.providers map.

**Consequence**: App works globally. Adding future providers (NOAA, ECMWF, etc.) only requires a new file in lib/weather/providers/ and one parallel fetch in the API route.

---

## D-034 — Weather Intelligence engine runs client-side, not server-side

**Date**: 2026-07-01
**Status**: DECIDED

**Context**: 29 activity toggles need instant response — 0ms latency. Running generateRecommendations() on the server would require a round-trip per toggle.

**Decision**: generateRecommendations(snapshot, activeActivities) is a pure function in lib/weather/engine.ts imported directly into the weather page. It runs in the browser with no network call when activities are toggled.

**Consequence**: Recommendations are instant. The WeatherSnapshot is fetched once from /api/weather-intelligence (server → Open-Meteo → cache 5min) and reused client-side.

---

## D-035 — `SUPABASE_SERVICE_ROLE_KEY` estava ausente no Vercel (bug crítico de produção)

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Teste E2E de jornada completa (usuário real: onboarding → ficha master → família → inventário → checklist → círculos → weather → analyze) revelou que a **página pública da ficha de emergência** `/ficha/[id]` (destino do QR code) e a rota `POST /api/profile/ficha` (leitura por socorristas) retornavam **HTTP 500 com corpo vazio** para qualquer ID. Causa raiz: `SUPABASE_SERVICE_ROLE_KEY` **não estava configurada nas env vars do Vercel** (confirmado via `vercel env ls production` — só existiam ANON_KEY, URL, OPENAI, VAPID, SITE_URL). Sem a chave, `createClient(url, undefined)` lança exceção síncrona → crash da função serverless. O mesmo faltante fazia o RAG (`lib/knowledge.ts → getRelevantChunks`) retornar `[]` silenciosamente, então o Motor de Decisão **nunca usou a base de conhecimento** (3887 chunks ingeridos) em produção — sempre degradava para modo sem-RAG.

**Decision**:
1. Adicionada `SUPABASE_SERVICE_ROLE_KEY` ao Vercel (Production + Preview) via `vercel env add`.
2. Adicionadas guardas defensivas em `app/ficha/[id]/page.tsx` (retorna `notFound()` em vez de crashar) e `app/api/profile/ficha/route.ts` (retorna 503 JSON em vez de 500 vazio) para que uma env var faltante nunca mais derrube a função serverless de forma abrupta.

**Consequence**: A ficha de emergência pública volta a funcionar; o RAG passa a usar a base de conhecimento real; falhas futuras de configuração degradam de forma limpa. A tabela de env vars em `09-build-status.md` foi atualizada.

**Gotcha (importante)**: o valor de `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` está **entre aspas duplas** (`="sb_secret_..."`) e no formato NOVO da Supabase (`sb_secret_...`, 41 chars — não é JWT longo). Na primeira tentativa a chave foi gravada no Vercel **com as aspas literais** → o client instanciava mas não autenticava como service_role → RLS aplicada → `404`. Ao setar via CLI, **remover aspas/whitespace**: `grep ... | cut -d= -f2- | tr -d '"' | tr -d '[:space:]'`. Vercel Sensitive vars não podem ser lidas de volta (`vercel env pull` redige), então valide pelo comportamento em produção, não pelo pull.

**Verificação (2026-07-05)**: `scripts/full-journey.mjs` → **31/31 ✅** contra produção. `POST /api/profile/ficha` e página `/ficha/[id]` retornam 200 com dados reais.

---

## D-036 — VAPID_PRIVATE_KEY + OPENAI_MODEL corrigidos no Vercel

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Duas configs pendentes/quebradas em produção:
1. **Push notifications**: `VAPID_PRIVATE_KEY` estava ausente no Vercel (só a pública `NEXT_PUBLIC_VAPID_PUBLIC_KEY` existia). Sem a privada, `webpush.setVapidDetails` falha e `/api/circles/[id]/push` retorna erro. A privada correspondente à pública existente estava **perdida** (não estava no `.env.local` nem no Vercel).
2. **OPENAI_MODEL**: o valor no Vercel estava corrompido como `"gpt-5\n"` (aspas + newline literal). Só `app/api/ai/readiness` lê essa var (`getOpenAIModel`); as demais rotas tinham `gpt-4o-mini` hardcoded como contorno.

**Decision**:
1. **VAPID**: como `push_subscriptions` tinha **0 linhas** (push nunca funcionou), gerar um **par novo** é seguro (nada a invalidar). Novo par via `web-push generate-vapid-keys`; gravadas `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (substituída) + `VAPID_PRIVATE_KEY` (nova) em Production + Preview e no `.env.local` (gitignored) para não perder a privada de novo.
2. **OPENAI_MODEL**: regravado limpo como `gpt-4o-mini` (sem aspas/newline) em Production + Preview. `getOpenAIModel()` agora faz `.trim()` defensivo. Os 4 `model: 'gpt-4o-mini'` hardcoded (`analyze`, `checklist/generate`, `suggest-tags`, `weather custom-activity`) foram trocados por `getOpenAIModel()` → **fonte única de verdade** (conforme "ação recomendada" registrada em 09-build-status).

**Consequence**: Push notifications passam a funcionar; o modelo OpenAI é configurável por uma única env var saneada. A pública VAPID é inlined em build-time (`NEXT_PUBLIC_`), então exigiu redeploy. Chaves VAPID futuras: **público e privado devem ser um par** — não setar um sem o outro.

---

## D-037 — Gestão de conta em Settings: logout + excluir conta (self-service)

**Date**: 2026-07-05
**Status**: DECIDED / IMPLEMENTADO

**Context**: A tela `/settings` tinha idioma, plano e push, mas **faltava o básico de qualquer app**: botão de logout e gestão da própria conta. O `signOut()` já existia em `lib/auth/actions.ts` mas não estava exposto em nenhuma UI.

**Decision**: Adicionados em `/settings`:
- **Card "Conta"**: e-mail logado, link "Editar meus dados" → `/ficha` (a Ficha Master concentra o CRUD dos dados pessoais), e botão **Sair** (logout via `supabase.auth.signOut()` no browser → redirect `/auth/login`).
- **Card "Zona de perigo"**: botão **Excluir minha conta** com `confirm()`, chamando a nova rota `POST /api/account/delete`.
- Nova rota `app/api/account/delete/route.ts`: autentica o usuário e apaga, em ordem de dependência, todos os dados (action_plans → scenarios → checklists → resource_inventory → family_members → círculos liderados + participações → push_subscriptions → profiles) e por fim o auth user (service role). Desvincula `linked_user_id` em fichas de terceiros. Guarda defensiva se `SUPABASE_SERVICE_ROLE_KEY` faltar (503).

**Consequence**: Usuário pode sair e excluir a própria conta sem suporte. O CRUD de dados de domínio (ficha, família, inventário, checklist) já existia nas telas próprias; Settings passa a ser o hub de conta. Bilíngue PT/EN inline.

---

## D-038 — Perfil ausente quebrava Ficha e Recursos ("Cannot coerce" / FK constraint)

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Usuário real (Paulo, após re-cadastro) viu dois erros que os testes automatizados **não** pegaram:
- Ficha Master: `Cannot coerce the result to a single JSON object`
- Recursos: `insert or update on table "resource_inventory" violates foreign key constraint "resource_inventory_profile_id_fkey"`

**Causa raiz**: o usuário **não tinha linha em `profiles`**. A linha só é criada no **onboarding** (`POST /api/profile`). Mas o **login por senha redireciona para `/scenario`** (não onboarding), e a confirmação de e-mail vai para `/onboarding` que pode não ser concluído. Quem chega em Ficha/Recursos sem perfil quebra: `profiles...single()` com 0 linhas → "Cannot coerce"; insert com `profile_id`/`leader_id` FK → violação. **Por que os testes passavam**: `full-journey.mjs` sempre criava o perfil no passo 1 (onboarding). Reproduzido com `scripts/_noprofile.mjs` (usuário sem perfil) → 6/6 erros idênticos aos prints.

**Decision** (defesa em profundidade):
1. **App self-heal**: `lib/ensure-profile.ts` — `ensureProfile(supabase, user)` faz upsert idempotente (`ON CONFLICT DO NOTHING`) da linha `profiles` usando `full_name` do metadata / prefixo do e-mail / 'Usuário'. Chamado logo após `getUser()` em: ficha (GET+PATCH), inventory (POST), family-members (POST), profile/plan (GET), analyze (POST), checklist/generate (POST). RLS permite o usuário inserir o próprio perfil.
2. **Backfill imediato** (service role): criado perfil para o usuário existente sem um (Paulo). 21 perfis órfãos de testes antigos identificados (auth user deletado, profile ficou) — inofensivos.
3. **Trigger no banco** (`supabase/migrations/20260705000000_auto_create_profile.sql`): `handle_new_user` cria `profiles` em todo INSERT em `auth.users` + backfill. Não aplicado via CLI (sem credenciais de DB no ambiente); a self-heal do app cobre o caso em produção. Aplicar no Supabase Dashboard quando possível.

**Consequence**: qualquer usuário autenticado passa a ter perfil garantido on-demand, independente de completar onboarding. Os erros de Ficha/Recursos não ocorrem mais.

---

## D-039 — "Não autenticado" na Ficha: rotas autenticadas fora do PROTECTED_ROUTES

**Date**: 2026-07-05
**Status**: DECIDED / CORRIGIDO

**Context**: Usuário com sessão expirada/ausente abria `/ficha` e via o banner **"Não autenticado."** (a API `/api/profile/ficha` retorna 401). Em rotas protegidas (ex: `/scenario`) ele seria redirecionado ao login; mas **`/ficha`, `/settings` e `/weather` não estavam em `PROTECTED_ROUTES`** no `middleware.ts`, então o usuário sem sessão não era redirecionado — ficava preso numa página autenticada quebrada.

**Decision**:
1. Adicionados `/settings` e `/weather` a `PROTECTED_ROUTES`.
2. `/ficha` adicionado a uma nova lista **`PROTECTED_EXACT`** (match exato), **não** ao prefixo — porque `/ficha/[id]` é a **ficha de emergência pública** (destino do QR) e precisa continuar acessível a socorristas sem login. Proteger o prefixo `/ficha/` teria quebrado o QR.
3. `app/(app)/ficha/page.tsx`: em resposta 401 no load ou no save, redireciona para `/auth/login?redirectTo=/ficha` (trata expiração de sessão no meio do uso, em vez de mostrar o erro).

**Consequence**: sessão inválida em página autenticada leva ao login (com retorno), não a uma tela quebrada. A ficha pública permanece aberta. Aplica o mesmo padrão de proteção que as demais telas do app já tinham.
## D-119 — EDU aprovado vira ação confirmável de Preparação

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: EDU-T05

**Context**: EDU já permite assistir conteúdo aprovado, ingerir no RAG com
proveniência e destacar o vídeo mais clicado. Ainda faltava o elo de produto
mais importante do Preparedness Engine: o usuário sair de uma aula/vídeo com
ações concretas de preparação, sem o EOS escrever nada automaticamente.

**Decision**:
1. Conteúdo EDU aprovado pode gerar propostas determinísticas de preparação a
   partir de `summary + transcript`.
2. A primeira versão não usa IA nem nova tabela: identifica linhas numeradas,
   bullets ou comandos operacionais e as apresenta como itens revisáveis.
3. O usuário precisa clicar para salvar. A persistência usa o contrato v1
   existente de `checklists`, com `kit_type='EDU_CONTENT'`.
4. Preparação deve mostrar a origem como "Fonte: EDU" para esses itens.
5. Itens EDU não viram inventário automaticamente; só entram no checklist de
   preparação. O sync checklist→inventário existente continua valendo apenas
   quando o usuário marca um item adquirido/concluído.

**Consequence**: EDU deixa de ser só catálogo/vídeo e passa a alimentar a rotina
de preparação do usuário, mantendo confirmação explícita e sem abrir nova
migration antes da decisão de uma tabela dedicada de Preparedness Items.

---

## D-120 — Curadoria semântica das ações EDU antes de salvar

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: EDU-T06

**Context**: O teste real mostrou que extrair ações diretamente do transcript
salvava lixo de mídia no checklist: markdown (`**`), minutagem de vídeo
(`3:30`), títulos entre aspas/ênfases e descrições longas em inglês. Isso
quebra a promessa do Preparedness Engine: o usuário precisa ver uma tarefa limpa
e acionável, no idioma em que usa o app.

**Decision**:
1. Ações EDU passam por curadoria antes de aparecer/salvar.
2. A curadoria remove markdown, aspas decorativas, timestamps, minutagem e
   ruído de transcript.
3. Se o idioma preferido do usuário for diferente do conteúdo, as ações devem
   ser traduzidas para o idioma da UI.
4. OpenAI é o provider de curadoria/tradução, mantendo a decisão do dono de usar
   OpenAI como provider de AI do EOS.
5. A curadoria retorna frases curtas de checklist, sem explicação longa. Se a IA
   falhar, o fallback determinístico ainda remove markdown/timestamps e impede
   salvar texto cru demais.

**Consequence**: EDU continua sem escrita automática, mas as propostas ficam
prontas para execução: verbos claros, sem minutagem, sem asteriscos, sem aspas e
no idioma correto do usuário.

---
## D-121 — Checklist de Preparação editável e removível

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: PREP-T02

**Context**: EDU, Pilot e Simulação agora podem propor itens para Preparação.
Isso torna obrigatório o usuário poder limpar o checklist: apagar itens que não
fazem sentido e editar nome, quantidade, unidade e tier. Sem isso, o checklist
vira acúmulo de sugestões e perde confiança.

**Decision**:
1. `/preparedness` deve permitir editar e excluir itens do checklist.
2. Exclusão é por linha (`checklists.id`), não por `canonical_key`, para não
   apagar o mesmo item em outros kits/fontes por acidente.
3. Edição altera `item_name`, `quantity`, `unit` e `tier`.
4. Quando `item_name` muda, a API recalcula `canonical_key` para manter dedupe,
   toggle e futuras inserções coerentes.
5. Não há nova migration; usa `PATCH/DELETE /api/checklist/[id]`.

**Consequence**: Preparação deixa de ser só uma tela de consumo de sugestões e
passa a ser uma lista operacional controlada pelo usuário.

---
## D-122 — Salvar conteúdo EDU também gera notificação para o admin

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: EDU-T07

**Context**: O fluxo existente notificava `Novo EDU` apenas quando o conteúdo
estava `approved`. Em teste real, o dono esperava feedback também ao salvar um
conteúdo EDU como rascunho ou nova versão, porque o Admin EDU é uma ação de
publicação/curadoria que precisa deixar rastro no Inbox.

**Decision**:
1. Todo save bem-sucedido em `/api/edu` cria uma notificação `edu_content_saved`
   para o admin/ator que salvou.
2. Se o status salvo for `approved`, continua existindo a notificação
   `edu_content_approved` para os usuários elegíveis, incluindo o admin para
   teste do fluxo.
3. `edu_content_saved` pertence à surface `preparedness`, porque EDU é parte da
   Preparação no Web/PWA core.
4. O destino da notificação de save é `/admin/edu?contentId=<id>`; o destino de
   aprovado continua `/edu?contentId=<id>`.

**Consequence**: Salvar rascunho, versão ou conteúdo aprovado deixa feedback
visível no Inbox/Preparação. A notificação pública de conteúdo aprovado continua
separada da notificação administrativa de save.

---

## D-131 — Destilar o Mundo: dois grupos no canto, e o verde com um dono só

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: HWD — Fase 3 (destilar), escolha do dono

**Context**: A crítica do dashboard mediu o canto superior direito com **três
grupos** flutuantes disputando o mesmo pedaço de tela — o orbe do Pilot, três
círculos globais sem rótulo (alfinete / engrenagem / silhueta) e a cápsula verde
dos controles do mapa — e **cinco objetos verdes** competindo pelo olho na tela
em repouso. O dono resumiu como "slopy". Numa tela que uma família abre sob
estresse, um canto assim pede mais do que informa.

Junto com isso, dois defeitos de conteúdo apareceram na medição:
o veredito em repouso saía cortado no meio da palavra ("0.0 dias de autonomia ·
reabaste…"), e o cartão de autonomia dizia "limitada pelo recurso mais escasso"
com quatro barras — bateria e combustível inclusive — quando `autonomyDays` é
`min(água, comida)` de propósito desde a reversão anterior.

**Decision**:

1. **As três portas globais viram uma.** `AppActions` passa a ser um botão só,
   que abre uma lista com **Plano da família**, **Minha Ficha de Emergência** e
   **Configurações** escritos por extenso. Um ícone sem rótulo só se sustenta
   quando é universal; "engrenagem" e "silhueta" eram duas apostas do usuário.
   O menu tem três saídas (Esc, tocar fora, escolher) e itens de 44px.
2. **O chrome volta para a fileira da PilotBar.** Ele tinha sido empurrado para
   baixo porque 136px não cabiam ao lado da busca; 40px cabem. Com isso o canto
   perde uma fileira inteira e passa de **três grupos para dois**: a fileira do
   topo (buscar + Pilot + menu) e a coluna do mapa embaixo. A PilotBar reserva a
   largura do botão no próprio `right`; `--chrome-h` passa a 46px na página que
   tem PilotBar, e o orbe se centra pela mesma fonte (D-127 preservado).
3. **Os controles do mapa recolhem.** Em repouso: **Você** e **···**. Sob um
   toque: Atualizar, Camadas e (no desktop) Painel. "Você" fica de fora do
   recolhimento porque centralizar no próprio ponto é o gesto mais usado num
   mapa — escondê-lo cobraria dois gestos pelo mais comum.
4. **O verde volta a significar uma coisa.** O acento fica com quem carrega
   estado de vida: o puck (você no mapa) e a faixa do veredito. "GPS ligado" é
   ajuste, não risco — diz-se com o ícone aceso em branco.
5. **O veredito em repouso cabe numa linha.** "de autonomia" sai; a cláusula
   depois do "·" fica, porque é ela que separa vermelho de âmbar para quem não
   distingue as duas cores.
6. **Água/comida e bateria/combustível ficam separadas no cartão.** Duas barras
   acima ("água ou comida, o que acabar antes"), duas abaixo de uma linha que
   diz **"Não limita a autonomia"**. Nada foi escondido; o cartão passa a dizer
   qual barra responde qual pergunta.

**Consequence**: Em repouso o canto tem 4 alvos em 2 grupos, contra 3 grupos
antes, e nenhuma função saiu do produto — tudo o que recolheu está a um toque.
`scripts/dashboard-destilar-test.mjs` mede isso no navegador (10 checagens,
inclusive o controle negativo de sobreposição por `elementFromPoint`, as três
saídas do menu e a ausência de reticências na faixa). `scripts/weather-layers-test.mjs`
passou a abrir o grupo antes de tocar em Camadas — se o botão estivesse visível
em repouso, seria o recolhimento que teria quebrado.

**Não coberto**: o orbe elevado da navegação continua verde. Ele é a única pista
de "onde estou" numa barra de sete itens, e trocá-lo é uma decisão da navegação,
não desta tela.

---

## D-132 — A telemetria do Pilot mede comportamento e recusa conteúdo

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: PILOT-T04 (último portão de lançamento)

**Context**: PILOT-T04 era o único item BLOCKED antes do rollout, e não existia
telemetria nenhuma no app — nem para o Pilot, nem para nada. A spec
(docs/15, §19) pede cinco famílias: descoberta, compreensão, confiança,
retenção, personalização e segurança.

O risco óbvio de construir isso é o de sempre com telemetria: ela é a tabela
que mais cresce e a que menos gente audita. Um dia alguém registra "só a
pergunta, para depurar", e a conversa da família com o Pilot — que pode conter
ficha médica, endereço e rotina de criança — passa a viver num lugar que
ninguém olha.

**Decision**:

1. **A linha de privacidade está no esquema, não só no código.** `pilot_events`
   não tem coluna de texto livre: são quatro colunas `text`, todas com CHECK de
   lista fechada, mais um `integer` e o carimbo de tempo. A pergunta, a
   resposta, a coordenada e a ficha não têm onde caber.
2. **Allowlist, não denylist.** `parsePilotEvent` aceita cinco chaves e
   descarta o resto. Com denylist, o dia em que alguém acrescentasse `question`
   no cliente, ela passaria.
3. **Nada é descartado em silêncio.** Todo caminho de escape devolve um
   `skipped` com o motivo, e um evento recusado vira linha no `error_log` —
   sem o conteúdo. Foi um escape mudo que deixou o push quebrado por meses.
4. **A métrica nunca derruba o produto.** Todas as respostas são 200, o cliente
   usa `sendBeacon` e ignora falhas. Verificado com a tabela AUSENTE: a rota
   responde `migration_pending`, o Pilot abre, responde, e o console fica limpo.
5. **O vocabulário é o do motor.** As intenções são `now / stay_or_go /
   endurance / gaps / outside`, lidas de `pilot-engine.ts`, mais `free`. Um
   teste falha se as duas listas se separarem — um vocabulário paralelo de
   métrica é como um painel passa a contar uma coisa e o produto a fazer outra.
6. **O resumo é do dono.** `GET /api/pilot/metrics` reaproveita
   `ERROR_ALERT_USER_IDS` em vez de criar uma segunda lista de operadores:
   duas listas divergem, e a que fica velha é sempre a que guarda o acesso.

**O que isto NÃO mede, dito na cara**: a spec pergunta "as pessoas entendem o
que GO significa?". Comportamento não responde isso — só pesquisa responde. O
que existe é o PROXY `handle`: depois de ler um veredito, a pessoa seguiu a
alça? Está registrado como proxy no código e aqui. Um número apresentado como
resposta a uma pergunta que ele não responde é pior que nenhum número.

**Consequence**: PILOT-T04 sai de BLOCKED. `lib/__tests__/pilot-metrics.test.ts`
(17 testes) prova a fronteira de privacidade, a paridade código↔banco e que
nenhum agregado devolve `NaN`. `scripts/pilot-metrics-test.mjs` (9 checagens)
prova o caminho inteiro contra o Supabase real, incluindo o CHECK do banco como
segunda porta e o RLS como terceira.

**Um erro que o controle negativo pegou**: a primeira versão do teste "a tabela
não tem coluna de texto livre" recortava o SQL no primeiro `);` do arquivo — e
caía dentro de um comentário que terminava com `pilot-engine.ts`);`. Ela via
duas das quatro colunas e passava. Passou também quando acrescentei uma coluna
de texto solta de propósito para conferir. O recorte agora é ancorado em linha e
a asserção é de conjunto exato. Sem o controle negativo, isto teria entrado no
repositório como guarda de privacidade sem guardar nada.

**Pendência do dono**: aplicar `20260808150000_pilot_events.sql`. Até lá o app
funciona igual e a rota responde `migration_pending`.

---

## D-133 — Play Store: o manifest, o ícone que a máscara não corta, e a prova de posse

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: preparo para publicação Android (TWA)

**Context**: Um TWA é este site embrulhado num APK. Se o manifest ou o
Digital Asset Links estiverem errados, o app instala e abre — com a barra de
endereço do Chrome por cima, ou com o ícone cortado na gaveta. Nada disso falha
em desenvolvimento; só aparece depois de publicado.

**Decision**:

1. **`assetlinks.json` é rota, não arquivo.** A impressão digital só existe
   depois que o dono cria o app no Play Console — o Play assina com a chave
   dele. Um arquivo estático obrigaria commit e deploy para colar esse valor;
   a rota lê `TWA_PACKAGE_NAME` e `TWA_SHA256_FINGERPRINTS` da Vercel.
2. **Sem fingerprint, a rota devolve `[]` com 200.** É a resposta verdadeira:
   nenhum app está autorizado por este site. Um placeholder faria o Chrome
   tentar verificar, falhar, e o dono caçar um erro que ele mesmo causou.
3. **Fingerprint malformada é descartada, não publicada.** Uma inválida faz o
   Chrome falhar a verificação em silêncio — a barra de endereço continua lá
   sem dizer por quê. Melhor a lista vazia, que se vê.
4. **O ícone maskable passou a ser um arquivo próprio.** O manifest declarava
   `icon.svg` como `"any maskable"` e ele não é: o ponto verde do logotipo fica
   a 221px do centro, e a zona segura de um maskable é o círculo de raio 205 —
   a máscara circular do Android cortaria o ponto pela metade.
   `scripts/make-maskable-icon.py` redesenha a mesma composição com fundo full
   bleed e tudo dentro dos 80% centrais, e **mede os pixels** ao gerar: sai com
   código 1 se sobrar conteúdo fora da zona segura.
5. **O manifest ganhou `id`, `lang`, `categories` e três atalhos** (Ficha,
   Plano, Preparação). Sem `id`, mudar o `start_url` faria o navegador tratar
   como outro app e a pessoa perderia o que já tinha instalado.

**Consequence**: `lib/__tests__/twa-manifest.test.ts` (10 testes) exige que todo
ícone declarado exista em disco, que haja PNG maskable de 512, que o SVG **não**
volte a ser declarado maskable, que o maskable não seja o ícone comum
reetiquetado, que todo atalho aponte para uma rota que existe, e que nenhuma
impressão digital seja escrita no repositório.

**O que falta e é do dono**: criar o app no Play Console, colar as duas
variáveis na Vercel, gerar o APK com o Bubblewrap. Está em
`docs/PENDENCIAS-DONO.md §1-B`. As capturas de tela da loja e o gráfico de
destaque também faltam — material de listagem, não de código.

---

## D-134 — Uma casa, um número: o painel do Mundo entra no modelo de casa

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: correção de consistência (D-123 completado)

**Context**: O dono relatou duas coisas que são a mesma: "o Pilot insiste em não
saber quem está morando em casa" e "as informações não estão batendo".

Não era dado faltando. Medido na conta real dele, no mesmo minuto:

| fonte | dizia |
| --- | --- |
| `/api/household` (canônica, D-123) | **3** — ele, Daniela e Paola, confirmados no círculo |
| painel do Mundo (`useWorldData`) | **1** — contava `family_members`, que estava vazia |
| prompt do Pilot | **as duas**, a três linhas de distância |

O prompt saía literalmente assim:

```
FAMÍLIA: Pessoas: 1.
…
MEMBROS CADASTRADOS (3): Você, Daniela Oliveira, paola letteriello libanio
```

Um modelo que recebe duas respostas para a mesma pergunta não escolhe uma: ele
para de afirmar. A queixa sobre o Pilot era um sintoma; a doença era o painel.

O painel do Mundo foi **a última tela que sobrou do modelo antigo**. Família e
Preparação já liam `/api/household` desde o D-123; esta não.

**Decision**:

1. **`useWorldData` lê `/api/household`.** Pessoas, vulnerabilidades e a
   despensa passam a vir da casa somada no servidor. `family_members` continua
   sendo lido, mas só como rede de segurança — e quando ela é usada, `known`
   fica `false`, que o guard traduz em WAIT, nunca em GO.
2. **As reservas do painel são as da CASA.** Ele dividia a MINHA água pelas
   MINHAS bocas e ignorava a despensa de quem mora junto. Numa casa de três em
   que só uma conta tem inventário, o painel mostrava zero — a família lia "não
   temos água" tendo água.
3. **O servidor não aceita mais o headcount do cliente.** A linha `FAMÍLIA:` do
   prompt é montada a partir de `getHousehold`, não de `context.people`. Saber
   quem mora junto exige ler conta de outra pessoa; só o servidor pode, e a RLS
   garante isso. Sem a casa montada, o prompt diz "não foi possível confirmar" —
   e manda **não afirmar um número**, em vez de repetir o palpite da tela.
4. **O rótulo passou a dizer o que a lista é.** "MEMBROS CADASTRADOS" soava a
   cadastro opcional de dependentes; virou "QUEM MORA NESTA CASA (N) — esta é a
   lista completa e confirmada". Cada linha diz se a pessoa **tem conta no EOS**
   (recebe alerta, aparece no mapa, pode ter papel no plano) ou está **sob
   cuidados de alguém, sem conta** — a diferença muda a instrução, porque "avise
   a Isadora" não funciona para quem não tem o app.

**Um 500 achado no caminho**: `TONE[context.riskState]` era indexado cru com
valor do cliente. Um `riskState` fora da lista devolvia `undefined` e a rota
estourava com **500 de corpo vazio** — o chat não mostrava nem resposta nem
erro. Agora cai em `watch`. Mesmo princípio: o servidor não pode quebrar porque
a tela mandou uma palavra que ele não conhece.

**Consequence**: `scripts/household-consistency-test.mjs` (8 checagens) monta
uma casa real — duas contas confirmadas mais uma dependente, com a despensa
inteira na conta da OUTRA pessoa — e exige que toda superfície diga o mesmo.
Inclui o controle negativo que prova que o painel não está mais contando só a
própria conta, e um cliente que mente dizendo "99 pessoas" para provar que o
servidor o ignora. O Pilot agora responde `3 pessoas: Você, Parceira, Avó Ana.`

**Um erro do próprio teste, que o preparo silencioso escondeu**: os `insert` de
semeadura não checavam resposta. Dois falharam (a dependente e o inventário) e o
teste reprovou o PRODUTO por defeito do preparo — já tinha acontecido aqui com
um `PGRST102`. Agora `semear()` aborta com o HTTP e o corpo do erro. Foi ela que
revelou a causa real na execução seguinte: `circle_role_enum` é `Admin/Editor/
Viewer`, com maiúscula.

---

## D-135 (fase 1) — A mesma pessoa em duas linhas

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: redundância de fontes de pessoa — fase 1 de 3

**Context**: O app tem três portas para dizer quem mora na casa e elas não se
conhecem: o endereço da ficha grava um convite, o cadastro grava um dependente,
o círculo grava uma conta. Quando a mesma pessoa entra por duas, a casa fica
com duas linhas para uma cabeça.

Está acontecendo em produção, medido:

- a conta **"Isadora da Rosa Libanio"** tem um dependente **"Isadora"**. A casa
  conta 3 onde há 2, e a autonomia dela é dividida por três — ela lê que está
  menos preparada do que está.
- a conta do dono tem dois convites marcados `sent` para **Daniela** e
  **Paola**, que já estão confirmadas morando com ele. O app afirmava, para ele
  e para o Pilot, que as duas "não estão no EOS".

**Decision**:

1. **A assimetria de risco decide tudo.** Juntar duas pessoas por engano tira
   uma boca da conta e faz a autonomia **subir** — a família lê que aguenta
   mais do que aguenta e se prepara menos. Deixar duplicado faz a autonomia
   **cair** — ela se prepara demais. Um erro machuca, o outro não. Logo: **o
   app nunca funde sozinho.**
2. **`lib/same-person.ts` tem dois níveis.** `provavel` (um nome cabe dentro do
   outro, ou o primeiro nome bate) basta para **perguntar** na tela. `forte`
   (duas partes do nome batendo) basta para **fechar um convite**, que é
   reversível e não muda quantas pessoas a casa tem. Dois irmãos — mesmo
   sobrenome, primeiros nomes diferentes — não alcançam nem `provavel`.
3. **A casa aponta, a tela pergunta, o usuário decide.** `getHousehold` devolve
   `duplicates`; a Família mostra os dois nomes lado a lado com duas saídas —
   "é a mesma pessoa" (funde, via a rota de vínculo que já existia e ninguém
   achava) e "são duas pessoas" (não escreve nada; pai e filho de mesmo nome é
   real).
4. **O convite de quem já entrou se fecha sozinho**, com o status novo
   `joined`. `dismissed` não servia: significa "desisti de convidar", que é o
   oposto — e juntar os dois perderia a diferença entre a família que desistiu
   e a que conseguiu.

**Consequence**: `scripts/duplicate-person-test.mjs` (8 checagens) monta o caso
real da Isadora e prova o movimento inteiro, inclusive que juntar faz a
autonomia ir de 10,00 para 13,33 dias — o número que explica por que o app não
faz isso sozinho.

**Dois enganos que os controles negativos pegaram, os dois meus**:

1. A primeira versão filtrava o convite da lista da tela **mesmo quando a
   gravação falhava**. O CHECK da tabela ainda não conhecia `joined`, o UPDATE
   voltava 23514, e a tela ficava certa com o banco errado — reintroduzindo,
   dentro do próprio conserto, o defeito que ele existe para eliminar. Agora
   falha alto no `error_log` e o convite continua aberto.
2. A sonda que detecta a migration fazia PATCH num id inexistente. Zero linhas
   casadas nunca exercitam um CHECK: o PostgREST devolve 200 e a sonda concluía
   que estava tudo aplicado. Agora ela cria uma linha de verdade.

**Pendência do dono**: aplicar `20260808200000_invite_joined.sql`.

---

## D-135 (fase 3) — "Quem busca quem" precisa dos dois

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: redundância de fontes de pessoa — fase 3 de 3

**Context**: `family_plan_roles` só tinha `member_user_id` — uma conta. A seção
da tela se chama "Quem busca quem" e só sabia dizer **quem**. Quem é buscado
normalmente não tem conta: é a criança, é a avó, é justamente quem não sai
sozinho e por isso nunca apareceu na lista.

Na prática a família escrevia "buscar a Avó Ana" no texto livre da
responsabilidade. Funciona para um humano lendo e falha para todo o resto: o
Pilot não raciocina sobre um nome dentro de uma frase, a verificação de lacunas
não sabia se alguém tinha ficado sem responsável, e no dia em que o nome for
corrigido no cadastro o plano continua com o nome velho.

**Decision**:

1. **`for_member_id` aponta para quem é buscado** — um dependente. Nulo na
   maioria dos papéis, que não são sobre uma pessoa ("levar o rádio", "fechar o
   gás"); exigir um alvo transformaria cada um deles numa pergunta sem resposta.
2. **`ON DELETE SET NULL`, nunca CASCADE.** Se a pessoa buscada sai do cadastro,
   o papel não pode sumir junto: um plano que perde uma linha sozinho é um plano
   em que a família confia e que não está mais lá.
3. **Avisar não é bloquear.** O cheque novo — "ninguém ficou encarregado de
   Avó Ana" — vive em `planWarnings`, não em `planGaps`. Só cobra de quem **não
   sai sozinho** (bebê, mobilidade reduzida, ou menos de 12 anos): se toda
   pessoa cadastrada exigisse responsável, uma casa de seis abriria o plano com
   seis avisos e a família aprenderia a ignorar a seção inteira — junto com a
   linha da avó, que é a que importa.
4. **A rota degrada sem a migration**: salva o plano sem o alvo em vez de perder
   o plano inteiro, e grava o motivo no `error_log`.

**O erro que o teste existente pegou**: a primeira versão pôs o cheque dentro de
`planGaps`, que **trava o botão Salvar**. O `plan-editor-test` falhou no clique
— "element is not enabled". Uma família que abrisse o plano para corrigir uma
rota não conseguiria salvar até resolver outra coisa, e o provável não é que ela
resolva: é que feche a tela e perca a correção que veio fazer. O próprio
`planGaps` já dizia isso no comentário, sobre outro caso — *"bloquear o save por
causa da casa seria eu inventando regra"*. Valia para mim também.

**Consequence**: `lib/__tests__/plan-gaps-dependents.test.ts` (9 testes), com o
teste que fixa a separação: a avó desamparada **não** entra no que trava o save,
e as lacunas estruturais continuam travando. `plan-editor-test` voltou a 14/14.

---

## D-135 (fase 2) — Uma porta só para "quem mora aqui"

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: redundância de fontes de pessoa — fase 2 de 3

**Context**: O app tinha três lugares para dizer quem mora na casa e eles não se
conheciam. O caso mais absurdo: a tela `/family/cadastro` se chama literalmente
**"Quem mora aqui"** — e não mostrava os convites. O nome que a pessoa digita ao
preencher o endereço vira uma linha em `household_invites`, conta na casa,
aparece para o Pilot, e sumia exatamente da tela que promete listar quem mora
ali. Ela cadastrava a filha num lugar, não a encontrava no outro, cadastrava de
novo — e a casa passava a contar duas.

**Decision**:

1. **As três formas de morar na casa cabem na mesma tela.** "Quem mora aqui"
   passa a listar quem tem conta, quem está sob cuidados, e **quem foi
   convidada e ainda não entrou**.
2. **Cada uma diz o que é.** A distinção é o que muda o comportamento da
   família: quem tem conta recebe alerta e aparece no mapa; quem não tem depende
   de alguém avisar. Uma lista que não diz isso parece completa e não é.
3. **O endereço continua perguntando, mas entrega.** O campo fica onde está — é
   o momento em que a pessoa já está pensando "minha casa", e essa era a parte
   forte da ideia original (D-130). O que muda é o fim: depois de salvar, ele diz
   quantas pessoas foram para a lista e leva até lá, em vez de deixá-la procurar.

**Consequence**: `scripts/one-door-test.mjs` (6 checagens) preenche o formulário
de verdade e segue o nome até a lista.

**Dois enganos meus nesta fase**:

1. A primeira versão do item 4 só contava links para `/family/cadastro` na
   ficha — e passava sem testar nada, porque um desses links já existia antes do
   conserto. Agora o teste preenche o formulário e verifica a frase que aparece
   depois de salvar.
2. Escrevi `/(pessoa foi|…)/.test(texto) && …` numa linha começando com barra,
   depois de uma linha terminando em `)`. É a **sexta** vez que a armadilha do
   ASI aparece neste repositório. O `lint:scripts` a pegou como era para pegar —
   quem falhou fui eu, que rodei o lint com `| tail -1` e escondi a saída dele.

---

## D-136 — Um orbe do Pilot, em toda tela

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: consistência de superfície

**Context**: O dono notou que o Pilot é um objeto no dashboard e outro nas
demais telas. Medido, eram dois botões diferentes:

| | dashboard (`.bar-orb`) | demais telas (`.wv2-dock-orb`) |
| --- | --- | --- |
| tamanho | 46px | 56px |
| forma | pílula de vidro esfumaçado (`.wv2-fume`) | círculo com borda e fundo próprios |
| ícone | 22px | 24px |
| cor | verde do acento, sempre | **mudava com o risco**: verde/amarelo/laranja/vermelho |
| brilho | nenhum | `drop-shadow` de 8px |

O comentário do próprio `PilotDock` afirmava *"O MESMO orbe da PilotBar"*. Não
era — e um comentário que afirma o que o código não faz é pior que nenhum,
porque quem lê para de conferir.

Custa mais que feiura: num app que a família abre sob estresse, reconhecer é
metade do trabalho. Aprender o Pilot numa tela e ter que aprender de novo na
seguinte é uma cobrança feita no pior momento possível.

**Decision**:

1. **Um componente, `PilotOrb`.** A `PilotBar` e o `PilotDock` montam o mesmo
   botão. Não é estilo copiado nos dois lugares — é um objeto só.
2. **A aparência é a do dashboard**, por decisão do dono.
3. **O orbe NÃO muda mais de cor com o risco.** O risco tem lugares próprios
   para ser dito — a faixa, o índice, os alertas. Um botão que muda de cor é um
   botão que se deixa de reconhecer justamente no dia em que mais se precisa
   achá-lo. O pulso no crítico ficou, e agora é o mesmo nas duas telas: antes
   cada uma pulsava com uma animação diferente.
4. **Quem usa decide só o LUGAR.** `.bar-orb` virou `flex: none`; `.wv2-dock-orb`
   virou posição fixa mais o gesto de arrastar. Toda a forma mora em
   `.pilot-orb`.
5. **Os tokens moram no componente.** `--accent` e `--r-pill` são declarados em
   `.wv2`, a casca do dashboard, e o orbe do dock renderiza fora dela.

**Dois erros que a medição pegou, os dois meus e depois de eu já achar que
tinha unificado**:

1. Na primeira versão o orbe fora do dashboard saiu com **canto reto e branco**
   (raio 0px, `rgb(240,240,248)`), porque herdava os tokens de um ancestral que
   ali não existe. Um componente que aparece em toda tela não pode depender de
   estar dentro de um ancestral específico.
2. Ao extrair o componente, deixei `onPointerCancel` de fora. Sem ele, um gesto
   cancelado pelo sistema — uma chamada entrando — deixaria o orbe preso no
   estado "arrastando", crescido, até a próxima navegação.

**Consequence**: `scripts/pilot-orb-test.mjs` (6 checagens) mede tamanho, raio,
cor, borda, fundo, sombra e ícone em **seis telas** e exige que sejam idênticos;
exige um só por tela; prova que a cor não varia; e confirma que unificar a
aparência não custou o arraste do dock (D-079).

---

## D-137 — Um Pilot, uma verdade, e uma conversa

**Date**: 2026-08-08
**Status**: DECIDED
**Roadmap**: consistência do Pilot

**Context**: O dono abriu o Pilot em duas telas no mesmo minuto e leu duas
casas diferentes:

| | Comms | Dashboard |
| --- | --- | --- |
| veredito | "Não sei o suficiente para dizer que está tudo certo" | "Nada urgente — feche uma lacuna" |
| checklist | **0%** | **88%** |
| casa | "falta a ficha da família" | limitante combustível 0.7d |

O motor é o mesmo (`pilot-engine.ts`). O que divergia era **o que ele recebia**.
Existiam três montagens do mesmo contexto:

- `/api/household` — canônica: casa confirmada, despensa somada, autonomia
  `min(água, comida)`
- `useWorldData` — lia a canônica (corrigido no D-134)
- **`PilotDock`** — pessoas por `family_members.length`; despensa só da PRÓPRIA
  conta; `known = members.length > 0`; e **`autonomyDays = food_days` cru**,
  sem dividir por ninguém e sem olhar a água

E havia **duas instâncias** do `<Pilot>` — uma no `WorldV2`, outra no
`PilotDock` — cada uma com as próprias mensagens. Trocar de página trocava de
Pilot, e a conversa sumia.

**Decision**:

1. **`usePilotFacts` é a única montagem.** Lê `/api/household` e o checklist, e
   aplica as mesmas fórmulas de `lib/household.ts` sobre a despensa somada.
   Sem a casa, devolve `known: false` — que o guard traduz em WAIT, nunca em GO
   — em vez de cair num palpite de "uma pessoa".
2. **Um `<Pilot>` só, montado no layout.** O dashboard não monta mais o seu; a
   PilotBar apenas pede a este para abrir. A conversa vive no `PilotProvider` e
   atravessa a navegação.
3. **A tela acrescenta o que só ela sabe.** Unificar não podia deixar o Pilot
   *pior* onde ele é mais usado: o dashboard registra abrigos, posições da
   família, ciclone e vento por cima da base. É a armadilha do D-079 — o mapa
   desenhava o cone e o Pilot dizia não enxergar o evento — e ela não podia
   voltar por causa de uma unificação.
4. **A abertura se corrige quando os fatos chegam.** Era `current.length ?
   current : [abertura]`: escrita no instante em que o Pilot abre e **congelada**.
   Como a casa é lida do servidor logo depois, a mensagem nascia com
   `known: false` e ficava dizendo "falta a ficha da família" para sempre. Era
   metade da queixa. Agora, enquanto a conversa for só a abertura automática,
   ela acompanha os fatos; na primeira coisa que a pessoa disser, vira histórico
   e não se mexe mais — reescrever o que já foi lido seria pior.

**Consequence**: `scripts/pilot-one-truth-test.mjs` (7 checagens) monta uma casa
de três com a despensa toda na conta da OUTRA pessoa e um checklist de 3 em 4, e
exige **75% em painel, comms e círculos** — um número que só bate se as telas
lerem a mesma fonte. Também prova que a conversa sobrevive à navegação sem
recarregar, que existe uma instância só, e que o dashboard não perdeu o
enriquecimento do mapa.

**Dois erros meus no caminho**:

1. A primeira versão do enriquecimento ainda sobrescrevia `powerDays`,
   `fuelDays` e `autonomyDays` com os do dashboard — o lint apontou as
   dependências e foi por elas que percebi: se ficassem, a autonomia voltaria a
   divergir entre telas, dentro do próprio conserto que a unifica.
2. A primeira versão do teste comparava `0 === 0` e `null === null`, porque a
   conta de teste não tinha checklist. Passava sem testar nada.

---
