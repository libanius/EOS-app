# SPEC — SIGNAL-001: Sinais e Protocolos curados
Version: 0.5 | Status: **Ready** (aprovado pelo dono em 2026-11-05) | Marco 1 em implementação | Author: Paulo Neto

> Regra 1: nenhum código antes de Ready. Este spec está **Draft**.
> Regra 3: os edge cases ficam escritos aqui (§7) e não são descobertos no código.
> Regra 4: se a implementação revelar algo que este spec não cobre, **pare** e atualize o spec antes de continuar.
> Regra 5: critérios binários. Não existe "parcialmente implementado".
> Regra 11 (AGENTS.md): este spec mexe em arquitetura de informação. A §9 lista o que precisa passar pelo Wren antes de Ready.

---

## 1. Objetivo

Dar ao EOS uma resposta **curada e proporcional** para acontecimentos que
geram medo, e transformar essa resposta em preparo que **se acumula** na casa.

O caso que originou o spec (2026-11-02): a cobertura do FORTRESS (Pentágono
exigindo 90 dias de autossuficiência das bases militares) gerou pânico na
comunidade do dono. Amigos perguntaram "o que eu devo fazer?". O EOS não tinha
o que mostrar, e o Pilot não sabia orientar, porque nada no app transformava
uma notícia em ação familiar.

O spec cria dois objetos de conteúdo, escritos pela curadoria EOS:

- **Sinal**: o acontecimento, com fonte, data, nível e a leitura honesta do que
  ele é e do que não é.
- **Protocolo**: a resposta prática, em degraus de autonomia (72 h, 2 semanas,
  30 dias, 90 dias), que vira **requisitos sugeridos** para a família.

O que a família adota entra no motor que já existe (`requirements`, `holdings`,
`lib/coverage.ts`). Nada aqui cria uma segunda conta de prontidão.

---

## 2. Contexto

### 2.1 De onde vem

- Conversa de produto de 2026-11-02 e protótipo navegável de 2026-11-03,
  guardado em `docs/prototypes/base-da-familia-v1.html` (referência de
  experiência, **não** de implementação).
- O protótipo foi validado com o dono em oito iterações: espaçamento para baixa
  visão, linguagem visual dos conceitos de execução, dicas em todo dado,
  carrossel Autonomia/Sistemas e auditoria de acessibilidade.

### 2.2 O que o motor já resolve e este spec reusa

| Necessidade | Já existe | Onde |
|---|---|---|
| O que a família tem, onde | `holdings` + `locations` | `lib/holdings.ts`, docs/37 §15–16 |
| O que deveria ter | `requirements` + `kits` | docs/37 §17, migração `20260813120000` |
| Quem pode mover o requisito | `proposed` → `needed` só pelo usuário | `lib/acquisition.ts`, docs/37 §19 |
| "Herdado" de outro evento | Cobertura conta cada holding **uma vez** | `lib/coverage.ts`, docs/37 §15.1 |
| Dias de autonomia | `householdDays()`, fonte única | `lib/household-days.ts` (D-174) |
| Push | Web Push + nativo | `lib/push.ts`, `lib/push-native-fanout.ts` |
| Autoria restrita | `ADMIN_EMAILS` | `lib/admin.ts` |

### 2.3 Onde o protótipo diverge do motor, e o motor vence

O protótipo inventou contas próprias. Na integração, **todas** cedem:

| Protótipo | Motor (vence) | Fonte |
|---|---|---|
| Autonomia = mín(água, comida, remédios) | Autonomia = **mín(água, comida)** | D-129 |
| 4 L/pessoa + 1 L/pet | `WATER_LITERS_PER_PERSON_DAY` = 1 galão (3,785 L), sem pet | `lib/units.ts`, FEMA |
| Comida em refeições | Comida em **dia-pessoa**. A tela pode exibir refeições (1 dia-pessoa = 3 refeições), nunca gravar | D-158 |
| Um item por compra | `holdings`: **uma linha por recurso por local** | docs/06 `holdings` |
| Protocolo marca o checklist | Protocolo só **propõe**; a família confirma | `lib/acquisition.ts`, docs/37 §4 |
| Barra própria com 3 abas | A barra global tem 5 destinos fixos | docs/35 §5 |

Contar remédio ou pet na autonomia é decisão de produto possível, mas não
pertence a este spec: exige entrada própria no decisions-log e mudança em
`householdDays()`.

---

## 3. Comportamento

### 3.1 A curadoria escreve um Sinal

Em `/admin/sinais` (só `ADMIN_EMAILS`), o curador cria um Sinal com:

- título, data do acontecimento, nível (`MONITORAR`, `PREPARAR`, `AGIR`,
  `CONTEXTO`) e região de alcance (nacional, estado ou condados);
- **o que é**, **o que não é** e a **orientação da curadoria** (uma frase);
- fontes (título + URL, pelo menos uma);
- protocolo ligado (opcional: um Sinal de `CONTEXTO` pode só apontar para o
  protocolo de outro Sinal, como o "Grã-Bretanha pede 3 dias" aponta para o
  FORTRESS no degrau de 72 h).

O Sinal nasce `draft`. Só aparece para famílias depois de `published`.

### 3.2 A curadoria escreve um Protocolo

Um Protocolo é uma lista de **itens-modelo**, cada um com:

- `resource_key` (a mesma chave de `requirements` e `holdings`);
- rótulo e dica;
- tipo: `PER_DAY` (quantidade que escala com dias e pessoas, ex.: água,
  comida) ou `PRESENCE` (durável, ex.: rádio, filtro);
- **degrau mínimo** em que o item passa a valer (`D3`, `D14`, `D30`, `D90`);
- para `PER_DAY`: a régua diária. Água e comida **não têm régua própria**: leem
  as constantes do motor.

O protocolo define quais degraus oferece (furacão: D3 e D14; FORTRESS: os
quatro) e qual é o **degrau recomendado**.

### 3.3 A família vê o Sinal

Sinais é um **destino da barra global**, logo à esquerda do MUNDO (D1):

```text
[ FAMÍLIA ] [ PREPARAÇÃO ] [ SINAIS ] (( MUNDO )) [ COMMS ] [ MAIS ]
```

A barra passa de cinco para seis destinos e mantém o comportamento atual de
`components/BottomNav.tsx`: o item ativo cresce (`flex-grow: 2.35`) e mostra o
rótulo; os demais se deslocam para os lados e ficam só com o ícone. As
proporções não mudam, só a distribuição. O MUNDO mantém o orbe verde.

Tocar em Sinais abre `/sinais`: a lista dos Sinais publicados da região, por
nível e depois data. Cada cartão mostra nível, data, título, resumo e "% pronto
no degrau recomendado", e abre `/sinais/<slug>`, a página do protocolo. O selo
do ícone conta só Sinais **ainda não vistos** pelo perfil e some depois de vistos. O "% pronto"
é calculado **sem** que a família tenha adotado nada: o motor de cobertura roda
sobre os itens-modelo × os holdings atuais, em memória, sem gravar.

### 3.4 A família abre o Protocolo

A página do protocolo mostra, nesta ordem:

1. nível, código e data do Sinal; título;
2. percentual pronto no degrau selecionado e a seleção de degrau;
3. o que é, o que não é, a orientação da curadoria com as quantidades da
   família, e as fontes;
4. o checklist do degrau, agrupado por módulo, com o status de cobertura de
   cada item (`covered`, `partial`, `missing`, `unknown`, `not_applicable`) e os
   holdings que cobrem cada um.

A barra "de onde veio o progresso" e o selo "herdado de …" do protótipo **não**
entram aqui: `holdings` guarda uma linha agregada por recurso e local, sem
histórico, e não permite separar o estoque anterior ao Sinal do que veio
depois. Isso fica para o HOLDING-HISTORY-001 (§10).

### 3.5 A família adota o Protocolo

> **Substituído em 2026-11-07 pelo SIGNAL-002 (D-235):** a adoção passa a ser item a item, pela folha "Tenho / Ainda não tenho / Não se aplica". O texto abaixo fica como histórico.

"Adotar este protocolo" mostra a lista de requisitos para o degrau escolhido,
com a quantidade calculada para a casa. A família confirma tudo de uma vez ou
desmarca itens antes.

**Identidade.** Os requisitos de protocolo são de **linha de base da casa**:
`kit_id = NULL` e `scenario_id = NULL`. Assim a chave natural
(`requirementNaturalKey()` em `lib/requirements.ts`, docs/37 §26.2) é a mesma
para a água do Pilot, a água do FORTRESS e a água do protocolo de furacão. Um
recurso, um requisito, qualquer que seja a origem. Não existe kit por protocolo.

Ao confirmar, para cada item:

- **sem requisito de linha de base para o `resource_key`**: cria um com
  `status = 'needed'`, `provenance = 'PROTOCOL'` e `provenance_ref =
  <protocol_id>`. A confirmação é do usuário, então `needed` é legítimo pela
  tabela de transições do `acquisition.ts`;
- **com requisito existente em `needed` ou `met`**: reaproveita a linha e
  preserva `provenance` e `provenance_ref` originais (D-161). Se a quantidade
  existente for menor que a do degrau, a tela mostra "hoje: X · este degrau:
  Y" e só grava Y se a família marcar a atualização;
- **com requisito existente em `not_applicable`**: não mexe. O item aparece
  como "você marcou que não se aplica" e pode ser reativado ali mesmo, por
  toque explícito;
- **item desmarcado sem requisito existente**: cria a linha em
  `not_applicable`, para não voltar na próxima visita.

O vínculo "este requisito faz parte do protocolo X" é **calculado na leitura**
(itens do protocolo × requisitos de linha de base por `resource_key`), não
gravado. Requisitos criados pela adoção aparecem em `/preparedness/o-que-falta`
com o selo de origem "via Protocolo".

### 3.6 Mudança de degrau depois da adoção

Subir de D14 para D30 cria os itens novos como `proposed` (sem requisito de
linha de base existente) e mostra o aumento de quantidade dos itens `PER_DAY`
como "hoje: X · este degrau: Y", gravado só com o toque da família. Nada muda
sem confirmação. Descer de degrau não apaga nada: o requisito mantém a quantidade
maior, porque descer é uma escolha de visualização, não uma decisão sobre a
casa.

### 3.7 Notificação

Publicar um Sinal com nível `PREPARAR` ou `AGIR` envia push para os perfis
dentro da região de alcance que têm notificações ativas. `MONITORAR` e
`CONTEXTO` não notificam. Dedup por `source_key = 'signal:<id>'`, no mesmo
mecanismo de `circle_notifications` (docs/37 §5.2).

### 3.8 Pilot

O Pilot lê os Sinais publicados e os protocolos como conhecimento curado. Ao
ser perguntado "o que eu faço sobre o FORTRESS?", responde a partir do texto da
curadoria e das quantidades da casa, e oferece abrir o protocolo. A voz segue o
PILOT-VOICE-001. O formato de entrada no conhecimento do Pilot (RAG ou fato
fixo) é decidido na §9 (D4).

---

## 4. Data Contract

> Proposta. Nenhuma tabela abaixo existe. Rule 7: `docs/06` e `docs/37` §18
> mudam no mesmo PR da migração, antes do código.

### 4.1 `signals`

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| slug | text | único, usado na rota e no `kit.slug` |
| status | text | `draft`, `published`, `archived` |
| level | text | `MONITORAR`, `PREPARAR`, `AGIR`, `CONTEXTO` |
| title | text | não vazio |
| occurred_on | date | data do acontecimento, não da publicação |
| what_it_is | text | não vazio |
| what_it_is_not | text | não vazio. **Obrigatório**: é o antídoto contra pânico |
| curator_note | text | a orientação, uma frase |
| region | jsonb | `{scope:'national'}` ou `{scope:'state', codes:[]}` ou `{scope:'county', fips:[]}` |
| sources | jsonb | `[{title, url}]`, mínimo 1 |
| protocol_id | uuid | FK → `protocols.id`, nulo permitido |
| context_degree | text | para Sinal sem protocolo próprio: o degrau sugerido do protocolo apontado |
| locale | text | `pt`, `en`. Um Sinal por idioma (D-225: uma tela, um idioma) |
| published_at, archived_at | timestamptz | |
| created_by | uuid | FK → profiles.id |
| created_at, updated_at | timestamptz | |

### 4.2 `protocols` e `protocol_items`

| `protocols` | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| slug | text | único |
| title | text | |
| degrees | text[] | subconjunto ordenado de `D3, D14, D30, D90` |
| recommended_degree | text | pertence a `degrees` |

| `protocol_items` | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| protocol_id | uuid | FK, `ON DELETE CASCADE` |
| resource_key | text | mesma identidade de `requirements.resource_key` |
| label, hint | text | |
| module | text | `agua`, `comida`, `saude`, `energia`, `comunicacao`, `documentos`, `casa` |
| kind | text | `PER_DAY` ou `PRESENCE` |
| min_degree | text | a partir de qual degrau vale |
| per_person_day | numeric | só `PER_DAY` sem constante do motor; nulo para água e comida |
| unit | text | unidade é dado (D-158) |

### 4.3 Mudança em contrato existente

- `requirements.provenance` ganha o valor **`PROTOCOL`**. Atualizar o tipo em
  `lib/requirements.ts`, o mapa de selos de origem e docs/37 §18.
- Nenhuma coluna nova em `requirements`, `kits` ou `holdings`.

### 4.4 Rotas

| Rota | Quem | O quê |
|---|---|---|
| `GET /api/signals` | autenticado | Sinais `published` no idioma e na região do perfil, por nível e depois data |
| `GET /api/signals/[slug]` | autenticado | Sinal + protocolo + itens + cobertura calculada em memória |
| `POST /api/signals/[slug]/adopt` | autenticado | Body `{degree, accepted: resource_key[], rejected: resource_key[]}`. Idempotente pela chave natural de `requirements` |
| `GET/POST/PATCH /api/admin/signals` | `ADMIN_EMAILS` | CRUD e mudança de status |

### 4.5 Funções puras (testáveis sem banco)

- `protocolRequirements(protocol, degree, householdSize)` → lista de
  requisitos com quantidade, usando `WATER_LITERS_PER_PERSON_DAY` e dia-pessoa.
- `protocolCoverage(requirements, holdings, locations, homeId)` → reaproveita
  `lib/coverage.ts`; não reimplementa regra.
- `adoptionPlan(protocolRequirements, existingBaseline)` → para cada item, uma
  das ações da §3.5 (`create_needed`, `reuse`, `offer_quantity_update`,
  `keep_not_applicable`, `create_not_applicable`). Pura e testável; a rota só
  executa o plano.

---

## 5. Regras de Negócio

1. **Uma conta só.** Dias, cobertura e unidade vêm do motor. Qualquer número que
   o protocolo mostra e que o painel da casa também mostra tem que ser igual
   (teste de verdade única, no espírito do `pilot-one-truth-test`).
2. **Sistema propõe, família decide.** Sinal, protocolo, Pilot e push nunca
   criam requisito em `needed` e nunca criam holding.
3. **"O que não é" é obrigatório.** Um Sinal sem esse texto não publica.
4. **Fonte é obrigatória.** Um Sinal sem fonte não publica.
5. **Proporção antes de alarme.** `AGIR` exige justificativa interna do curador
   e não pode ser o nível de um Sinal sem alerta oficial correspondente.
6. **Degrau alto não é ponto de partida.** A UI abre no degrau recomendado,
   nunca no maior.
7. **Arquivar não apaga preparo.** Arquivar um Sinal tira o cartão da lista; os
   requisitos adotados e os holdings continuam.
8. **Durável conta uma vez.** Um rádio cobre o item "rádio" de todos os
   protocolos alcançáveis da casa (docs/37 §15.1).
9. **Idioma único por tela** (D-225).
10. **Sinal não é alerta oficial.** A UI nunca usa o visual de alerta do NWS/IPAWS
    para um Sinal de curadoria.

---

## 6. Experiência (referência do protótipo)

**Visual (D2):** a aba de Sinais, o painel e a página do protocolo usam a
linguagem visual do protótipo `docs/prototypes/base-da-familia-v1.html`, a
mesma dos conceitos de execução: tema escuro único (azul-noite), menta como
destaque com brilho, numerais condensados grandes, âmbar para a orientação da
curadoria e vermelho só para queda ou perigo. Os tokens do protótipo viram
tokens nomeados no código; nenhuma cor literal em componente.

O protótipo define também o padrão de experiência que os critérios da §8 verificam:

- número grande + rótulo de "rumo" (ex.: "06 dias / Rumo até 2 semanas");
- degraus em pílulas D-03, D-14, D-30, D-90, com indicação de alcançado e próximo;
- cartão de **próxima ação** apontando o recurso que limita a autonomia;
- citação da curadoria com barra âmbar e selo de fonte com escudo;
- dica explicativa em todo número e controle (hover, foco e toque longo);
- alvos de toque ≥ 44 px, contraste ≥ 4,5:1 em texto pequeno, estado nunca só
  por cor.

O gráfico de trajetória da autonomia e o painel de sistemas do protótipo
**não** entram neste spec (ver §10).

---

## 7. Edge cases

| # | Caso | Comportamento |
|---|---|---|
| E1 | Casa de tamanho desconhecido | O protocolo mostra os itens sem quantidade e um aviso "conte quem mora na casa" com link para Família. Nunca calcula com 1 pessoa (PREP-T07 fase 2, item 4). |
| E2 | Família sem nenhum holding | Percentual 0%, checklist todo `missing`, próxima ação aponta o primeiro item do degrau recomendado. Nenhuma divisão por zero. |
| E3 | Holding com unidade não conversível | O item fica `unknown`, nunca `covered` e nunca zero (PREP-T06, critério 6). |
| E4 | Família já adotou e o curador edita o protocolo | Itens novos aparecem como `proposed` na próxima visita. Itens removidos pelo curador **não** apagam requisitos já adotados. |
| E5 | Adotar duas vezes (toque duplo, rede lenta) | Idempotente pela chave natural de `requirements`; nenhuma linha duplicada. |
| E6 | Requisito de linha de base igual já existe com outra origem (ex.: água via Pilot) | Não duplica: mesma chave natural, porque o protocolo não usa kit (§3.5). A linha é reaproveitada e a origem original é preservada (`provenance` fora da chave, D-161). |
| E7 | Família descartou o item como `not_applicable` em outro protocolo ou pelo Pilot | É a mesma linha de base, então continua descartado. O protocolo mostra "você marcou que não se aplica" com a opção de reativar por toque explícito. |
| E7b | Requisito existente vive num kit (ex.: água no `BUG_OUT`) | Não é a mesma chave e **não é tocado**. O kit continua com o seu requisito; o protocolo trabalha só sobre a linha de base. A cobertura conta o mesmo holding uma vez para cada requisito, sem somar estoque (docs/37 §15.1). |
| E8 | Sinal arquivado com link compartilhado | Abre em modo leitura com o aviso "Sinal arquivado em <data>", e a adoção fica desabilitada com o motivo visível. |
| E9 | Perfil fora da região do Sinal | Não recebe push e não vê o cartão na lista; o link direto abre normalmente com a região visível. |
| E10 | Offline | Sinais e protocolos já vistos abrem do cache (`lib/offline-storage.ts`). Adotar offline fica desabilitado com o motivo; nada é enfileirado em silêncio. |
| E11 | Protocolo pede quantidade maior que a do requisito existente | A tela mostra "hoje: X · este degrau: Y". Sem o toque da família, a quantidade não muda e o item mostra a cobertura contra X. |
| E12 | Protocolo sem item `PER_DAY` | O percentual usa só presença; a tela não mostra régua de dias. |
| E14 | Tela com menos de 360 px de largura | Seis destinos com alvo de 44 px só cabem a partir de 358 px. Abaixo disso o rótulo do item ativo some e o ativo se marca só por fundo e peso (D-194); nenhum alvo fica abaixo de 44 × 44 px e a barra não rola para o lado. |
| E15 | Nenhum Sinal publicado na região | `/sinais` mostra um estado vazio que explica o que aparece ali e mostra os Sinais arquivados; o ícone segue na barra, sem selo. |
| E13 | Curador publica com erro | Despublicar volta a `draft`; o push já enviado não é reenviado na republicação (dedup por `source_key`). |

---

## 8. Critérios de Aceitação

1. Um curador em `ADMIN_EMAILS` cria, edita, publica, despublica e arquiva um Sinal. Qualquer outro perfil recebe 403 nas rotas de admin.
2. Publicar sem "o que não é" ou sem fonte é recusado com mensagem que diz o que falta.
3. Uma família na região vê o Sinal publicado; uma fora da região não vê.
4. Para os mesmos dados, os dias de água e comida mostrados no protocolo são **idênticos** aos de `/preparedness` e aos do Pilot. Há um teste automatizado que falha se divergirem.
5. Água usa `WATER_LITERS_PER_PERSON_DAY`; nenhuma régua de água vive no código do protocolo.
6. Antes de adotar, nenhuma linha é escrita em `requirements` ao abrir um protocolo.
7. Adotar cria requisitos `needed` com `provenance = 'PROTOCOL'` só para os itens confirmados, e `not_applicable` para os desmarcados.
8. Adotar duas vezes seguidas não cria linha duplicada.
9. Um holding durável cobre o item correspondente em dois protocolos ao mesmo tempo, e a autonomia da casa não muda por isso.
10. Com um requisito de linha de base de água já existente via Pilot, adotar o protocolo não cria segunda linha de água, preserva a origem `PILOT` e só altera a quantidade se a família marcar a atualização.
11. Subir de degrau após adotar cria apenas `proposed`; nada vira `needed` sem toque do usuário.
12. Push sai para `PREPARAR` e `AGIR` na região, uma única vez por Sinal; `MONITORAR` e `CONTEXTO` não notificam.
13. Toda informação numérica e todo controle da página do protocolo têm dica explicativa acessível por hover, foco e toque longo.
14. Todos os controles têm alvo ≥ 44 × 44 px e texto pequeno tem contraste ≥ 4,5:1 sobre as superfícies do tema escuro (D2).
17. A barra global tem seis destinos na ordem Família, Preparação, Sinais, MUNDO, Comms, Mais. Com Sinais ativo, o item cresce e mostra o rótulo; os demais ficam só com ícone. Em 360, 375, 390 e 430 px nenhum alvo fica abaixo de 44 × 44 px e a página não rola para o lado; abaixo de 360 px vale o E14.
19. O selo de Sinais conta só Sinais publicados ainda não vistos pelo perfil e zera ao abrir cada um.
18. O Pilot recebe os Sinais ativos da região como fato fixo (D4); Sinais arquivados não entram nesse fato.
15. O Pilot, perguntado sobre um Sinal publicado, responde com o texto da curadoria e oferece abrir o protocolo.
16. Lint, type-check, testes e `next build` limpos; docs 06, 07, 09, 11 e 37 atualizados no mesmo PR (Regra 8).

---

## 9. Decisões (fechadas pelo dono em 2026-11-03)

- **D1 = destino na barra global, à esquerda do MUNDO** (revisado pelo dono em
  2026-11-04). A primeira leitura, "aba na borda esquerda do MUNDO", foi
  corrigida pelo dono: o lugar é a barra global. A passada do Wren de
  2026-11-03 (quadro "Sinais no MUNDO", cinco mecanismos) mostrou que a aba
  dentro do MUNDO colidia com o painel esquerdo que já existe no computador; o
  destino na barra elimina a colisão. **Isto revoga a regra "cinco slots, a
  barra nunca muda" do D-180 / docs/35 §5**, atualizada no mesmo PR.
- **D2 = visual do protótipo.** Aba, painel e página do protocolo usam a
  linguagem do protótipo validado (§6), tema escuro único.
- **D3 = fora.** Remédios e pets não entram na autonomia. A autonomia segue
  mín(água, comida) (D-129).
- **D4 = (b) + (a).** Sinais ativos da região entram como fato fixo em
  `usePilotFacts`; arquivados vão para o RAG do EDU (`lib/edu-rag.ts`).
- **D5 = linha de base.** Requisitos de protocolo têm `kit_id` e `scenario_id`
  nulos. Kit por protocolo poria o kit na chave natural e duplicaria requisitos
  entre origens, contradizendo E6 e E7. O filtro por protocolo em "O que falta"
  lê o vínculo calculado (§3.5).

---

## 10. Fora do Escopo

- Gráfico de trajetória da autonomia: depende de histórico de holdings → **HOLDING-HISTORY-001**.
- Barra "de onde veio o progresso" e selo "herdado de …": `holdings` é agregado por recurso e local, sem histórico; reabastecer mantém o `created_at` e muda a quantidade, então nem `created_at` nem `updated_at` separam o estoque anterior do novo → **HOLDING-HISTORY-001**.
- "Por que comprei", evento e degrau por aquisição: mesmo motivo → **HOLDING-HISTORY-001**.
- Carrossel e redesenho de `/preparedness`: → **BASE-001**.
- Sexto destino em automotivo (CarPlay/Android Auto): fica fora; o companion segue com os destinos atuais.
- Painel de sistemas da casa (energia, internet, água, celular, LoRa, satélite): → **SYSTEMS-001**. LoRa continua bloqueado por G-05.
- Sinal gerado automaticamente a partir de alerta oficial (NHC, NWS). O alerta pode **sugerir** um rascunho ao curador numa versão futura; nunca publica sozinho.
- Comentários, reações e compartilhamento social dentro do app.
- Compra, preço e afiliados por item do protocolo (`lib/affiliate.ts` fica intocado).
- Tradução automática de Sinais.

---

## 11. Sequência proposta

| Task | Entrega | Depende de |
|---|---|---|
| SIGNAL-T01 | Migração `signals`, `protocols`, `protocol_items`; `PROTOCOL` em `provenance`; docs 06 e 37 | Spec Ready |
| SIGNAL-T02 | Funções puras da §4.5 + testes (incluindo o de verdade única) | T01 |
| SIGNAL-T03 | Admin: autoria e publicação | T01 |
| SIGNAL-T04 | Página do protocolo + adoção | T02, D1, D2 |
| SIGNAL-T05 | Push por região | T03 |
| SIGNAL-T06 | Pilot lê Sinais ativos | T03, D4 |
| SIGNAL-T07 | Conteúdo: FORTRESS e Temporada de Furacões publicados em PT e EN | T03 |

---

## 12. Marco 1 — "FORTRESS no ar" (decisão do dono, 2026-11-05)

O dono aprovou o spec e pediu o FORTRESS publicado **agora**, sem passar pela
revisão da curadoria, e anunciou que o conteúdo passará a vir de um **pipeline
próprio** (o mesmo conteúdo vai para o YouTube, vira RAG no EDU e alimenta os
Sinais). Isso muda a ordem, não as regras.

### 12.1 O que entra

| Peça | Como entra no Marco 1 |
|---|---|
| Conteúdo | **Versionado no código** (`lib/signals-content.ts`), PT e EN, validado por teste: sem "o que não é" ou sem fonte, o teste falha e o deploy não sai (regras 3 e 4 da §5 viram teste). |
| Barra | Sexto destino, Sinais à esquerda do MUNDO (D1, §3.3). |
| `/sinais` e `/sinais/<slug>` | Leitura: o que é, o que não é, orientação, fontes, degraus, checklist com cobertura calculada em memória. Visual do protótipo (D2). |
| Cobertura | Água e comida pela mesma conta do painel e do Pilot (`householdDays()` sobre `/api/household`); duráveis pela presença no inventário legado (kit médico, rádio) ou por requisito `met` com a mesma `resource_key` em `/api/checklist`. Nada é gravado. |
| Selo "não visto" | Por aparelho (`localStorage`). O selo por perfil, no servidor, entra com as tabelas. |

### 12.2 O que fica para depois, e por quê

| Peça | Para onde vai | Motivo |
|---|---|---|
| Tabelas `signals`, `protocols`, `protocol_items` (T01) | Spec do pipeline | O formato de ingestão do pipeline decide o contrato; criar tabelas antes dele é chutar o contrato. |
| Autoria no admin (T03) | Substituída pelo pipeline | O dono escreve no pipeline, não numa tela do app. |
| Adotar protocolo (§3.5) | Marco 2 | Escreve em `requirements`; exige `PROTOCOL` em `provenance` (migração). |
| Push (T05) e Pilot (T06) | Marco 2 | Dependem das tabelas e do selo por perfil. |

### 12.3 Conteúdo sem revisão da curadoria

O texto do FORTRESS foi escrito a partir das fontes listadas no próprio Sinal e
publicado por decisão explícita do dono, sem a revisão dele. Fica marcado no
dado (`reviewedByCurator: false`) para o pipeline substituí-lo pela versão
curada.
