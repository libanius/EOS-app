# 08 — Decisions Log

> Decisions made. Not up for re-discussion without a new entry.

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

**Consequences**: dois defeitos que só um teste de RENDERIZAÇÃO pega:

- a primeira versão das setas usava o caractere `➤` num `text-field`. Os dados
  chegavam, a camada ficava visível, e **nada aparecia**: a fonte do estilo não
  tem esse glifo. `querySourceFeatures` devolvia features e
  `queryRenderedFeatures` devolvia zero. Hoje a seta é um ícone desenhado em
  canvas, que não depende de fonte;
- a grade era de 0,5° (≈55 km) e a câmera padrão enquadra poucos quilômetros: o
  usuário via **uma** seta. Uma seta só não mostra direção. Passou a 0,15°.

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
