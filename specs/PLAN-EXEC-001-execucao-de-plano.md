# SPEC — PLAN-EXEC-001: Execução de Plano (arquétipo Encontrar)
Version: 1.1 | Status: **Ready** | Author: Paulo Neto

> Regra 1: nenhum código antes de Ready. Este spec está Ready.
> Regra 4: se a implementação revelar algo que este spec não cobriu, **pare** e
> atualize o spec antes de continuar.
> Regra 5: os critérios da seção 7 são binários. Sem "parcialmente implementado".

---

## 1. Objetivo

Transformar o plano da família de **documento editável** em **modo operacional**.

Hoje `/preparedness/plano` é um formulário de 1409 linhas que serve para autoria e
finge servir para execução. Este spec separa os dois: o editor continua onde está,
e a execução vira um **MODO declarado** do EOS — com entrada explícita, sinal
permanente e saída visível — na mesma mecânica do Modo Simulação (D-184).

Escopo desta versão: o arquétipo **Encontrar** (`action_type: 'meet'`). O caso
canônico é a família num evento de multidão quando alguém se separa do grupo.

---

## 2. Contexto

### 2.1 De onde isso vem

- `docs/35` §7 previu esta tela e a deixou registrada como evolução futura:
  *"Modo emergência (…) Não é para agora — fica registrado como evolução possível
  depois que Model C estiver de pé."* Model C fechou em 2026-08-14.
- `docs/18` §9.1 já propôs `family_plan_executions` e `family_plan_execution_events`
  e escreveu a trava: *"até essa migration existir, a execução não deve fingir
  auditoria compartilhada."* É essa dívida que este spec paga.
- `docs/18` §2 define o princípio que governa tudo abaixo:
  **o plano precisa funcionar exatamente quando o EOS não funciona.**

### 2.2 Restrições reais da stack (não negociáveis nesta versão)

| Restrição | Consequência de projeto |
|---|---|
| PWA: push exige internet | A entrega da mensagem **não pode** ser o que faz o plano funcionar |
| Sem SMS, Bluetooth ou mesh (LoRa é fase 11) | Nenhuma cascata de entrega é prometida ao usuário |
| Dependente não tem conta (`family_members`, não `circle_members`) | Ele entra por **carta**, não por tela |
| Cache offline hoje é chaveado por círculo | **Pré-requisito bloqueante** — ver EXEC-T00 |

### 2.3 A inversão central

Cada aparelho já tem o plano inteiro em IndexedDB. **Executar não é transmitir um
plano — é acender localmente um roteiro que aquele aparelho já podia rodar
sozinho.** A notificação é reforço, nunca gatilho.

Teste da regra: se a esposa não receber push nenhum, ela abre o EOS, vê que o
plano está em execução, e o roteiro dela está lá — completo, com rumo e distância.

### 2.4 O ponto de entrada já existe, e está errado por dentro

`components/world-v2/MemberSheet.tsx`: tocar no **próprio avatar** no Mundo abre
`Comando familiar → Executar plano`. O caminho está certo; a sequência não.

**Hoje:** `Executar plano` → escolhe plano (só se houver >1) → escolhe protocolo →
`Alertar círculo: executar agora` → lista de passos.
São **três decisões antes de qualquer coisa acontecer**, e o aviso é um segundo
botão manual que dispara `family/ping` um a um.

**Neste spec:** `Executar plano` → escolhe plano → **segura 1,5s**. Um gesto
produz três efeitos: cria a execução, avisa o círculo, abre o playbook.

O protocolo deixa de ser portão e vira **primeiro passo do playbook**. No momento
em que a criança sumiu você sabe qual plano é; não deveria precisar decidir se o
gatilho ativo é "sem contato por 2h" ou "ordem de evacuação". Disparar é barato e
reversível por 30 s; escolher duas vezes em menu antes de agir não é.

### 2.5 Decisões do dono (todas fechadas)

| # | Decisão |
|---|---|
| D-a | MVP cobre **adultos com conta + carta do dependente**. Sem tela para o dependente. |
| D-b | Ponto do dia é **efêmero na sessão**, promovível ao catálogo no encerramento. |
| D-c | Disparo: **segurar 1,5 s + janela de desfazer de 30 s**. |
| D-d | Plano **aponta** para o lugar do catálogo (referência), com trava de exclusão. |
| D-e | Só o arquétipo `meet`. Evacuar fica para spec própria. |
| D-f | Círculo com **um** plano: não pergunta — **mostra** o nome na tela de segurar. |
| D-g | Editar lugar do catálogo só versiona os planos se a coordenada mover **> 50 m**. |
| D-h | Preferência de basemap **persiste**, é única para o app, e o padrão é satélite. |
| D-i | Modo execução amplia corpo dos números e melhora contraste na PWA; **brilho máximo** fica para Native futuro. Sem variante de tema. |
| D-j | Ordem da lista de planos: sessão armada → proximidade → hora do dia → `updated_at`. |
| D-k | Intervalo de escalonamento é configurado por **protocolo** no planejamento; padrão 15 min, faixa 5–120 min. |

---

## 3. Comportamento Esperado

### 3.1 Os três ciclos de vida

| | O que é | Versiona? | Pede ack? |
|---|---|---|---|
| **Lugar** (`circle_places`) | Um ponto que o círculo conhece | Só se mover > 50 m (D-g) | Idem |
| **Plano** (`family_plans`) | O compromisso: *neste cenário, ali* | Sim | Sim |
| **Sessão** (`plan_sessions`) | O dia: *hoje, na Parade, com estas pessoas* | Não | Não |

Regra derivada: **o ack não existe porque um lugar mudou — existe porque um
compromisso mudou.**

### 3.2 Superfície A — Armar a sessão

Entrada: card no plano, ou faixa no MUNDO. Nunca obrigatório.

Ao armar, o usuário declara:
1. Qual plano é o provável hoje.
2. Quais adultos do círculo estão junto (subconjunto — não o círculo inteiro).
3. Quais dependentes estão junto e com qual guardião por padrão.
4. Uma janela de tempo (`starts_at`, `ends_at`).
5. Opcionalmente, o centro e o raio do evento.

Enquanto armada: banner permanente com saída explícita (padrão `SimulationBanner`),
e o disparo a um toque de qualquer tela.

Há no máximo **uma sessão armada por círculo**. Se uma sessão `armed` já existir,
armar outra é recusado com motivo na tela; o sistema não substitui nem desarma a
sessão anterior em silêncio.

**Pontos do dia** são marcados a qualquer momento durante a sessão, no local. Não
versionam nada, não notificam ninguém, não pedem ack. Funcionam no playbook
exatamente como pontos do plano.

**Desarme** tem três saídas: janela expirou, usuário saiu do raio, ou desarme
manual. Nas duas primeiras o EOS **pergunta** — nunca desarma em silêncio.

### 3.3 Superfície B — Disparar

Entrada primária: avatar próprio no Mundo → `Executar plano` (§2.4).

- Com sessão armada: o plano do dia vem em destaque; os demais abaixo.
- Sem sessão armada: lista ordenada por D-j.
- Com um plano só: não há escolha — o nome aparece em destaque na tela de segurar (D-f).
- Gesto: **segurar 1,5 s** com anel de progresso, alvo circular de no mínimo 140 px.
  Sem modal de confirmação.
- Ao completar: a execução é criada, o aviso ao círculo sai **imediatamente**, e
  abre uma **janela de desfazer de 30 s** na tela de quem disparou.
- Cancelar dentro da janela emite um **segundo aviso** ("falso alarme, plano
  cancelado"). O primeiro aviso nunca é segurado à espera da janela.
- A janela de desfazer é uma faixa, **nunca um modal**: é preciso poder começar a
  agir nos mesmos 30 s em que se pode cancelar.

### 3.4 Superfície C — Playbook por papel

O aparelho sabe quem é o usuário. Portanto:

- **Escolha do protocolo**, quando o plano tem mais de um gatilho e a sessão não o
  resolveu: é o **primeiro passo**, dentro do playbook, não um portão antes.
- **O que é seu**: no topo, uma ação por vez, com estado de conclusão.
- **O que os outros vão fazer**: colapsado abaixo. Visível, não primeiro.
- **Rumo, distância e minutos a pé** até o ponto ativo, derivados da carta SVG
  (`PlanChart`) — sem tiles, sem chave de provedor, sem rede.
- **Carta do dependente**: a instrução combinada com ele ("ficar parada e procurar
  alguém de colete") aparece na tela de quem procura, como **citação**, nunca como
  passo numerado — é informação sobre o comportamento dele, não instrução para você.
- **Aviso do sistema** (autoridade local, fonte oficial) aparece como aviso do
  EOS, **nunca** como passo 1 do plano (`docs/18` §9.1).

### 3.5 Superfície D — Estado e encerramento

- Cada adulto marca: `no local` · `a caminho` · `procurando` · `sem sinal`.
- Cada estado carrega **idade** ("cheguei · há 4 min"), como D-064 faz com posição.
- **Dependentes aparecem na lista** com estado `sem aparelho`. Omiti-los faria a
  lista dizer "duas pessoas" quando são três, e faria a família esperar um sinal
  que não vem.
- Encerramento é **ação humana**: `resolvida` (avisa todos, desliga o modo) ou
  `cancelada` (falso alarme).
- **Escalonamento**: relógio local determinístico. O intervalo vem do protocolo
  (`escalation_minutes`); quando vazio, usa 15 min. Ao expirar, o EOS **sugere**
  o próximo passo (segurança do evento → achados e perdidos → polícia), com dois
  botões que não executam nada: `Fiz isso` registra evento e reinicia o relógio;
  `Ainda não` adia.
- Ao encerrar, e só então, o EOS pergunta se os pontos do dia devem virar lugares
  do círculo.

### 3.6 Degradação

| Situação | Comportamento |
|---|---|
| Sem rede ao disparar | Execução começa local; aviso enfileirado; a tela diz que o aviso não saiu |
| Sem rede no playbook | Renderiza completo do cache; estados dos outros mostram idade da última leitura |
| Sessão armada sem rede | Funciona: sessão é local-first, sincroniza depois |
| Migration ausente | Degrada como os gatilhos hoje: salva o que dá, registra em `logError`, nunca perde o plano |

---

## 4. Design

> Estrutura antes de pele, na ordem que `docs/35` §9 pede. Os tokens são os do
> `EOS-Design-System-v1`; nenhum vocabulário visual novo é introduzido.

### 4.0 As duas cenas

A feature tem duas cenas, e elas não se parecem. A v1.0 deste spec descreveu
princípios só para a execução e deixou a autoria sem nenhum — sem declarar por
quê. A omissão produziu duas metades da mesma feature desenhadas por filosofias
diferentes, e é corrigida aqui.

| | Autoria | Execução |
|---|---|---|
| Quando | 23h, véspera, cansado, cônjuge ouvindo pela metade | Em pé, andando, com medo |
| Tarefa | Chegar a um acordo e registrá-lo | Fazer a próxima coisa certa |
| Unidade | O documento inteiro | Uma ação |
| Falha típica | Perder o que foi digitado | Ler a coisa errada |

**Os princípios da execução (§4.1) não valem na autoria, e isso é deliberado.**
"Uma ação por vez" seria errado em cima de um documento que precisa ser revisado
como um todo antes de virar compromisso: esconder seções de quem está combinando
com a família piora a compreensão em vez de melhorar. O que a autoria tem são
princípios próprios (§4.0.1), não a ausência deles.

#### 4.0.1 Princípios da superfície de autoria

1. **Nada digitado se perde.** O rascunho é persistido localmente a cada
   alteração e sobrevive a navegação, troca de plano, troca de círculo e
   fechamento do app. Nenhum controle da própria página descarta trabalho em
   silêncio. Ver `PLAN-AUTHOR-001`.
2. **Progressão por estado do plano, nunca amputação.** Um plano vazio mostra o
   caminho mínimo que `planGaps` já calcula — um ponto de encontro e um papel.
   Um plano completo mostra tudo, porque quem volta em março para conferir
   precisa das dez seções. O que muda é a ordem de revelação, não o conteúdo
   disponível.
3. **Alarme só quando existe o que fazer.** Nenhuma sugestão automática sobre
   rascunho vazio: "Revisão do Pilot · 3" num plano em branco ensina que o
   produto reclama sem motivo, e treina a pessoa a rolar por cima do único aviso
   que importa.
4. **O compromisso é alcançável sem rolar.** A ação de salvar não pode viver
   depois de catorze cartas.
5. **Contraste é requisito funcional, não acabamento.** Ver §4.3.

### 4.1 Princípios da superfície de execução

1. **Uma ação por vez no primeiro nível.** O defeito da tela atual é empilhar tudo
   numa rolagem. A próxima ação do usuário ocupa o topo inteiro; o resto é
   secundário **por posição**, não por tamanho de fonte.
2. **Rumo antes de mapa.** Uma seta e um número funcionam sem tiles. Um mapa que
   carrega pela metade mente sobre o que a pessoa está vendo.
3. **Ação primária no terço inferior.** Uma mão só, provavelmente segurando alguém.
4. **Nenhuma cor nova.** `--ac` execução ativa e valores; `--ac3` destrutivo e
   cancelar; `#FFB347` estado degradado; `--mu` só para metadado.
5. **Valor numérico em mono, corpo ampliado.** No modo execução, `Mono Large Value`
   sobe de 24 px para 32 px — é a única informação que continua verdadeira sem rede.

### 4.2 Basemap (D-h)

Satélite é o padrão. `lib/world/providers.ts` já monta o estilo keyless sobre ESRI
World Imagery com camada de rótulos e a atribuição obrigatória em cada fonte;
`MapBaseMode` já tem `hybrid | dark | satellite`, e `MapPointPicker` já abre em
satélite. O que muda: **a escolha passa a persistir** e vale em todas as
superfícies de mapa, em vez de resetar a cada abertura.

Consequência obrigatória: sobre imagem de satélite a variância de luminância é
altíssima (telhado branco, mata, água). Todo marcador, traçado e rótulo precisa de
**halo/contorno definido como token**, não caso a caso, e as superfícies de leitura
sobre imagem levam **scrim** translúcido. Sem isso o marcador que lê bem sobre a
mata some sobre o estacionamento.

A imagem tem idade de um a dois anos. Pela regra de `docs/18` §7 (*nada é
inventado*), a tela declara a data da imagem quando o provedor a fornece.

### 4.3 Legibilidade ao sol (D-i / D-214)

O EOS é dark-only (`--bg #0A0A0F`) e este modo roda ao ar livre. Ao entrar em
execução na Web/PWA: corpo dos números ampliado (§4.1.5) e contraste de leitura
elevado dentro da superfície. **Brilho máximo real fica para adaptadores Native
futuros**; a PWA não controla o brilho do sistema. Não se cria variante de tema
clara nesta versão — a decisão fica registrada como possível evolução, e depende
de os tokens ganharem uma variante em vez de hex solto.

Os tokens mais frágeis são `--mu #6B6B8A` e `--ink-3 rgba(235,235,245,0.38)`
(≈3.0:1 sobre `--bg`). **A proibição vale nas duas superfícies, não só na
execução**: quem preenche o plano às 23h cansado é a mesma pessoa que o executa
com medo. Nenhum texto essencial — rótulo de seção, frase de porquê, rótulo de
precisão, linha de distância/rumo/minutos — usa `--mu` ou `--ink-3`. Esses
tokens ficam restritos a metadado descartável. Texto abaixo de 18 px cumpre
4.5:1; acima, 3:1.

### 4.4 As quatro telas

| Tela | Conteúdo, de cima para baixo |
|---|---|
| **A — Armar** | Faixa de sessão · plano do dia (chips) · quem está junto · pontos do dia + `Marcar ponto onde estou` · nota de que ponto do dia não altera o plano · CTA `Armar até HH:MM` |
| **B — Disparar** | Faixa de sessão armada · nome do plano em destaque · alvo circular de segurar (≥140 px, anel de progresso) · outros planos abaixo, em lista discreta · faixa de desfazer após o disparo |
| **C — Playbook** | Versão + tempo em execução + estado do aviso · cartão `Sua próxima ação` · bloco de rumo/distância em mono ampliado · carta do dependente como citação com borda lateral · `O que os outros estão fazendo (N)` colapsado · aviso do EOS em faixa separada |
| **D — Estado** | Lista de pessoas com estado e idade em mono · dependentes com `sem aparelho` · cartão de escalonamento com `Fiz isso` / `Ainda não` · CTA `Encontrada — encerrar` · secundário `Falso alarme` |

### 4.5 Container

A execução **não** vive dentro do `MemberSheet`. Uma folha sobre o mapa é o
container certo para escolher e o errado para uma execução em curso: fechar a folha
perderia o estado, e ele precisa sobreviver à navegação. A execução tem banner
global permanente e superfície própria, como `SimulationBanner`. `MemberSheet`
mantém apenas a entrada (§2.4).

---

## 5. Data Contract

### 5.1 Catálogo de lugares (novo)

```
circle_places
  id uuid pk
  circle_id uuid → circles
  name text
  lat double precision
  lng double precision
  kind text            -- 'home'|'school'|'work'|'rendezvous'|'custom'
  precision text       -- 'gps'|'address'|'city'|'unknown'
                       -- 'unknown' = nunca declarada (waypoints legados). Nunca é
                       -- escolhida pelo sistema: só o usuário promove para um dos
                       -- outros três.
  notes text null
  created_by uuid
  created_at, updated_at timestamptz
  archived_at timestamptz null
```

### 5.2 Waypoint passa a apontar (alterado)

```
family_plan_waypoints
  id uuid pk
  plan_id uuid → family_plans
  place_id uuid → circle_places      -- NOVO
  kind text                          -- papel DENTRO do plano: rendezvous_1|2|3|home|school|work|custom
  sort_order int
  name, lat, lng, notes              -- MANTIDOS, apenas para planos legados
```

`kind` fica no waypoint e não no lugar de propósito: a mesma praça pode ser
`rendezvous_2` num plano e `custom` em outro.

**Migração**: cada waypoint existente gera um `circle_place` (dedupe por
proximidade < 25 m e nome igual) e recebe `place_id`. Planos sem `place_id`
continuam lendo `lat/lng` próprios até serem tocados.

Todo `circle_place` criado pela migração recebe `precision = 'unknown'`. A
migração não infere precisão: ela não sabe se o ponto foi tocado no mapa,
digitado ou geocodificado, e atribuir qualquer um dos três valores declararia
uma confiança que ninguém deu.

### 5.3 Carta do dependente (novo)

```
family_plan_dependent_briefs
  id uuid pk
  plan_id uuid → family_plans
  member_id uuid → family_members
  instruction text                   -- o que ele foi combinado a fazer
  updated_at timestamptz
```

Por plano, não por pessoa: na Parade é *"fique parada"*; noutro plano será outra
coisa.

### 5.4 Sessão de evento (novo)

```
plan_sessions
  id uuid pk
  circle_id uuid, plan_id uuid null
  name text
  status text                        -- 'armed'|'disarmed'|'expired'
  starts_at, ends_at timestamptz
  center_lat, center_lng double null, radius_m int null
  created_by uuid, created_at, disarmed_at timestamptz null

plan_session_members
  session_id uuid, user_id uuid       -- adultos presentes hoje

plan_session_dependents
  session_id uuid, member_id uuid, guardian_user_id uuid null

plan_session_places
  id uuid pk
  session_id uuid
  name text, lat, lng double, notes text null
  created_by uuid, created_at timestamptz
  promoted_place_id uuid null → circle_places
```

### 5.5 Execução (paga a dívida de `docs/18` §9.1)

```
family_plan_executions
  id uuid pk
  plan_id uuid, circle_id uuid
  session_id uuid null               -- execução sem sessão é válida
  protocol_index int null            -- índice do trigger; null enquanto não escolhido
  plan_version int                   -- a versão executada, congelada
  status text                        -- 'running'|'resolved'|'cancelled'
  started_by uuid, started_at, ended_at timestamptz null
  outcome text null

family_plan_execution_events
  id uuid pk
  execution_id uuid
  actor_user_id uuid
  kind text    -- 'started'|'cancelled'|'protocol_set'|'status'|'arrived'|'step_done'
               -- |'escalation_suggested'|'escalation_taken'|'resolved'
  payload jsonb
  created_at timestamptz
```

O estado de cada pessoa é **derivado** do último evento `status`/`arrived` dela.
Não há coluna de estado por membro — evento é a fonte, e é o que permite retomada
em outro aparelho.

`family_plan_triggers.escalation_minutes int null` pertence ao planejamento do
protocolo (D-k). Valor nulo significa padrão explícito de 15 min; valores salvos
precisam ficar entre 5 e 120 min.

### 5.6 Preferência de basemap (D-h)

```
profiles
  map_base_mode text default 'satellite'   -- 'satellite'|'hybrid'|'dark'
```

Uma preferência para o app inteiro. `MapPointPicker`, `RouteDraw`, Mundo e as
superfícies de execução leem daqui em vez de manter estado local próprio.

### 5.7 Gatilho aponta para o lugar (alterado)

```
family_plan_triggers
  …
  destination_place_id uuid null → circle_places   -- NOVO
  destination_kind text null                       -- MANTIDO, só para gatilhos legados
```

`destination_kind` guarda **categoria**, não identidade. Um plano com "Casa da
vovó" e "Praça do Cruzeiro" — ambos `custom` — gera duas opções de mesmo valor,
e o select resolve sempre para a primeira. Como o playbook de execução deriva o
destino ativo daí, o sintoma é a família indo para o lugar errado no momento em
que ninguém confere.

`place_id` é identidade e resolve a colisão. A migração converte
`destination_kind` em `destination_place_id` quando a resolução for única, e
deixa `null` quando for ambígua — **nunca escolhe a primeira**. Gatilho com
destino ambíguo aparece no editor pedindo que o usuário escolha.

Isto é escopo da **EXEC-T07**, não da EXEC-T01. A EXEC-T01 fechou em 2026-08-19
com a migração aplicada, e T02 a T06 foram construídas sobre ela; acrescentar
critério a uma fase encerrada tornaria retroativamente ilegítimo tudo que veio
depois, pela regra da §9. O defeito é real e grave — o lugar dele é uma fase
nova.

---

## 6. Regras de Negócio

1. **A execução nunca espera o servidor para renderizar.** Toda tela do playbook
   monta a partir do documento em IndexedDB.
2. **O aviso é reforço, não gatilho.** Falha de push nunca impede execução, e a
   tela declara quando o aviso não saiu.
3. **Disparar é um ato só**: completar o gesto cria a execução, envia o aviso e
   abre o playbook. Não existe botão separado de "alertar círculo".
4. **A escolha do protocolo acontece depois do disparo**, dentro do playbook,
   quando não puder ser resolvida pela sessão ou por gatilho único.
5. **Editar um `circle_place` só versiona os planos que o usam se a coordenada
   mover mais de 50 m** (D-g). Mudar nome ou nota não é evento de segurança.
   Quando versiona, versiona **todos** os planos que apontam para ele e dispara ack.
6. **Apagar um `circle_place` em uso é bloqueado.** Só arquivável quando nenhum
   plano ativo o referencia.
7. **`plan_session_places` não versionam nada e não notificam ninguém.**
8. **Promoção é em dois estágios**: criar o `circle_place` no encerramento não
   versiona; adotá-lo como waypoint de um plano, em tempo de calma, versiona.
9. **A ordenação da lista de planos é determinística** (Rules Engine antes de
   qualquer inferência), na ordem de D-j.
10. **`action_type` determina a forma da tela.** Nesta versão só `meet` tem forma
    própria; os demais salvam normalmente e caem em `meet` na execução.
11. **Execução sem sessão armada é válida** e deve funcionar desde o MVP.
12. **Escalonamento sugere; humano executa.** Nenhuma ligação, aviso a terceiros
    ou acionamento de autoridade é automático.
13. **Violência ativa**: quando o gatilho indica violência, a primeira fala do host
    prioriza autoridade local e bloqueia deslocamento para a zona de risco
    (`docs/18` §9.1).
14. **A carta do dependente nunca aparece em `/ficha/[id]`** nem em qualquer
    superfície pública (`docs/18` §8).
15. **RLS**: `circle_places`, `plan_sessions` e `family_plan_executions` são
    legíveis e escrevíveis apenas por membros do `circle_id`.
16. **Ponto com `precision: 'unknown'` é usado normalmente** — a coordenada é
    real; o que falta é a confiança declarada. Rumo e distância são calculados e
    exibidos, mas a tela marca o ponto como não confirmado e oferece `Confirmar
    no mapa`. Confirmar sem mover o ponto altera só a precisão e **não** versiona
    o plano nem invalida acks; mover mais de 50 m cai na D-g.
17. **Gatilho aponta para o lugar, não para a categoria.** Nenhuma superfície
    resolve destino por `kind`. Destino ambíguo é declarado como ambíguo e
    pedido ao usuário; nunca resolvido por ordem de lista.
18. **Precisão nunca bloqueia a confirmação de uma coordenada que existe.** Um
    ponto marcado no mapa é confirmável independentemente do valor de
    `precision`. Ver `PLAN-AUTHOR-001` §3.2 — que também fixa o valor gravado
    como `'address'`, nunca `'gps'`: marcar no mapa confirma a coordenada, não
    atesta presença física no local.

---

## 7. Critérios de Aceitação

Binários. Sem "parcialmente implementado".

**EXEC-T00 — pré-requisito**
- [ ] O cache offline é chaveado por `(circleId, planId)`.
- [ ] Com N planos e sem rede, o seletor lista os N e abre o escolhido.

**EXEC-T01 — catálogo**
- [ ] Um lugar criado aparece em qualquer plano do círculo sem ser recriado.
- [ ] Mover um lugar **> 50 m** incrementa a versão de todos os planos que o usam e invalida os acks.
- [ ] Mover um lugar **< 50 m**, ou editar nome/nota, **não** altera versão nem ack.
- [ ] Apagar um lugar usado por ≥1 plano ativo é recusado com motivo na tela.
- [ ] A migração converte 100% dos waypoints existentes sem perder coordenada.
- [ ] 100% dos waypoints migrados recebem `precision: 'unknown'`; nenhum recebe
      `gps`, `address` ou `city` por inferência.
- [ ] Confirmar a precisão de um ponto sem movê-lo não altera `version` nem
      invalida acks.

**EXEC-T02 — sessão**
- [ ] Armar uma sessão exibe banner permanente com saída explícita.
- [ ] Marcar ponto do dia **não** incrementa a versão do plano e **não** dispara push.
- [ ] Sessão expirada pergunta antes de desarmar.

**EXEC-T03 — disparo**
- [ ] Toque curto (< 1,5 s) não dispara.
- [ ] Ao completar 1,5 s, `family_plan_executions` é criada **e** o aviso sai na mesma ação.
- [ ] Com um plano só, nenhuma tela de escolha aparece e o nome do plano é visível na tela de segurar.
- [ ] Cancelar dentro de 30 s marca `status: 'cancelled'` e emite segundo aviso.
- [ ] Passados 30 s, a faixa de desfazer some.
- [ ] A faixa de desfazer nunca bloqueia a interação com o playbook.

**EXEC-T04 — playbook**
- [ ] **Com o aparelho em modo avião**, o playbook do papel do usuário renderiza
      completo: passos, rumo, distância e minutos a pé até o ponto ativo.
- [ ] Dois usuários diferentes do mesmo círculo veem listas de primeiro nível
      diferentes na mesma execução.
- [ ] A carta do dependente aparece na tela de quem procura, fora da numeração.
- [ ] Avisos do sistema nunca aparecem numerados junto aos passos do plano.
- [ ] Entrar em execução aplica o modo de legibilidade da PWA e o corpo ampliado
      dos números; brilho máximo fica para Native futuro.

**EXEC-T05 — estado e encerramento**
- [ ] Estado de cada membro exibe idade em minutos.
- [ ] Dependentes aparecem na lista com `sem aparelho`.
- [ ] Encerrar como `resolvida` desliga o modo em todos os aparelhos alcançáveis.
- [ ] O escalonamento aparece como sugestão; nenhum dos dois botões executa ação externa.

**EXEC-T06 — promoção**
- [ ] Ao encerrar, o EOS oferece promover cada ponto do dia.
- [ ] Recusar a promoção não perde o registro da execução.

**EXEC-T07 — destino por identidade**
- [ ] Um plano com dois lugares `custom` distintos gera duas opções de destino
      que resolvem para lugares diferentes.
- [ ] Gatilho legado com destino ambíguo migra para `null` e aparece no editor
      pedindo escolha — nenhum é resolvido por ordem de lista.

**Transversal**
- [ ] A preferência de basemap persiste entre sessões e vale em todas as superfícies de mapa.
- [ ] Marcadores e traçados permanecem legíveis sobre imagem clara e sobre imagem escura.
- [ ] Nenhum texto essencial usa `--mu` ou `--ink-3`, na autoria ou na execução.

---

## 8. Fora do Escopo

**Adiado por decisão, não esquecido:**
- Arquétipo **Evacuar** (`action_type: 'evacuate'`) e sua conferência de presença — spec própria.
- `shelter`, `communicate`, `wait` com forma de tela própria.
- Tela ou aparelho para o dependente.
- Variante de tema claro de alto contraste.

**Fora por restrição de stack:**
- SMS, Bluetooth, mesh e LoRa como fallback de entrega.
- Widget de tela de bloqueio ou atalho por botão físico (indisponível em PWA).
- Download de tiles de mapa: os termos do ArcGIS Online, como os da CARTO, não
  autorizam cache em massa. Trocar de provedor para obter esse direito continua
  sendo a pendência aberta de `docs/18` §10.

**Fora por escolha de arquitetura:**
- Motor de roteamento em tempo de execução (`docs/18` §5).
- Qualquer escrita no plano feita por IA durante a execução (`docs/18` §9).
- Detecção automática de chegada ao ponto (geofence) — o usuário declara.

---

## 9. Faseamento

| Fase | Entrega |
|---|---|
| **EXEC-T00** | Cache offline por `(circleId, planId)` — **bloqueante** |
| **EXEC-T01** | `circle_places` + migração + waypoint por referência + trava de exclusão + regra dos 50 m |
| **EXEC-T02** | `plan_sessions` + armar/desarmar + banner + pontos do dia |
| **EXEC-T03** | `family_plan_executions` + disparo por gesto + aviso no mesmo ato + desfazer |
| **EXEC-T04** | Playbook por papel, offline-first, carta do dependente, protocolo como primeiro passo |
| **EXEC-T05** | Estado compartilhado, escalonamento por tempo, encerramento |
| **EXEC-T06** | Promoção de ponto do dia + preferência de basemap persistente |
| **EXEC-T07** | Destino do gatilho por `destination_place_id` + migração que recusa ambiguidade |

Uma fase por vez. Nenhuma fase começa antes de a anterior passar todos os seus
critérios da seção 7. **A EXEC-T01 não é reaberta**: ela fechou em 2026-08-19 com
a migração aplicada, e reabri-la invalidaria retroativamente T02 a T06. O que a
v1.1 acrescentou entra como EXEC-T07 (§5.7).

**Dívida aberta pela EXEC-T01, a pagar antes da T07**: a migração marcou todo
waypoint legado como `precision: 'unknown'`, e a UI de autoria desabilita
`Confirmar` nesse estado — o acervo inteiro de pontos do usuário está hoje num
estado que a tela se recusa a confirmar, pelo caminho que ela mesma indica. Não
é risco a evitar; é defeito vivo. `PLAN-AUTHOR-001` AUTHOR-T02 é o conserto e
tem prioridade sobre a T07.
