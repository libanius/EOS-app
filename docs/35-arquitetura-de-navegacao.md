# Arquitetura de navegação do EOS — auditoria e proposta

> **Status: PROPOSTA. Nada foi implementado.**
> Nenhum código, componente, rota, token ou dependência foi tocado.
> Levantado em 2026-08-12 lendo o código, não a documentação.
> Este documento existe para ser revisado e virar (ou não) uma decisão em
> `docs/08-decisions-log.md` antes de qualquer execução.

---

## 1. Inventário real — o que existe hoje

### 1.1 Rotas dentro do shell autenticado (`app/(app)/`)

| Rota | Componente | Linhas | Papel hoje |
| --- | --- | --- | --- |
| `/dashboard` | `world-v2/WorldV2` | 1213 | Home. Mapa, risco, alertas, condições, abrigos, camadas |
| `/weather` | inline | 790 | Clima detalhado, eventos, nowcast, recomendações de atividade |
| `/family` | `world-v2/FamilyPage` | 703 | Quem está onde, necessidades, alcançáveis |
| `/family/cadastro` | `world-v2/RosterPage` | 965 | Cadastro de pessoas e dependentes |
| `/preparedness` | `world-v2/PreparednessPage` | 1611 | Prontidão + estoque + checklist + briefing IA + ponte EDU |
| `/plan` | `world-v2/PlanPage` | 1409 | Plano da família: pontos, rotas, papéis, gatilhos, ack |
| `/circles` | inline | 989 | Círculos, convites, papéis, pedidos, monitoramento |
| `/comms` | inline | 953 | Conversa do círculo + linha do tempo de notificações |
| `/scenario` | `world-v2/SimulatorPage` | 568 | Simulador: configura o ambiente, o app inteiro voa nele |
| `/ficha` | inline | 927 | Ficha master, endereço, "quem mais mora aqui" |
| `/settings` | inline | 607 | Idioma, plano, push, admin, conta, zona de perigo |
| `/edu` | inline | 345 | Base de conhecimento curada |
| `/onboarding` | inline | 409 | Primeiro uso |
| `/convite/[code]`, `/sim/[token]` | — | — | Entradas externas (convite de círculo, convite de treino) |
| `/admin/{affiliates,edu,gift-codes}` | — | — | Administração |

**Legado ainda montado:** `/dashboard-legacy` (389), `/checklist-legacy` (528),
`/scenario-legacy` (1135), `/dashboard-world` (protótipo HWD v1).
**Redirecionamentos:** `/inventory` → `/preparedness`, `/checklist` →
`/preparedness`, `/family-legacy` → `/family/cadastro`.
**Fora do shell:** `/auth/*`, `/ficha/[id]` (QR público), `/(legal)/*`.

### 1.2 A barra inferior de hoje — 7 destinos

> **Superado por NAV-T06 / D-180 (2026-08-14).** A barra tem cinco destinos
> desde então; o que segue é o retrato do diagnóstico. Ver §11.

```text
[ CLIMA ]  [ FAMÍLIA ]  [ PREPARAÇÃO ]  (( MUNDO ))  [ COMMS ]  [ CÍRCULOS ]  [ CENÁRIO ]
```

`components/BottomNav.tsx`: antes de NAV-T06 era `NAV_LEFT` (3) + `HOME`
(orbe elevado, centro) + `NAV_RIGHT` (3). O comentário do próprio arquivo já
afirmava a tese:
*"The World dashboard is the app's home, so it does not compete as one tab among
seven."* E `app/page.tsx:40` prova: usuário logado em `/` é redirecionado para
`/dashboard`. **WORLD já é a home — no código, não só na intenção.**

### 1.3 Superfícies globais (montadas em `app/(app)/layout.tsx`)

| Superfície | O que é | Categoria |
| --- | --- | --- |
| `PilotDock` / `PilotOrb` | Copiloto em qualquer tela, conversa sobrevive à navegação | Overlay |
| `NotificationInbox` | Inbox aberta pelo badge de cada ícone da barra | Overlay |
| `AppActions` (☰ topo-direita) | Plano, Ficha, Configurações | **Segunda navegação** |
| `SimulationBanner` / `Invite` / `Debrief` | Modo treino ativo | Modo |
| `SyncStatus`, `LocationReporter`, `FichaFirstRun` | Estado do app | Não-navegação |

### 1.4 Onde cada coisa é alcançável

| Destino | Barra inferior | ☰ topo | Atalho PWA | Link de dentro |
| --- | --- | --- | --- | --- |
| `/dashboard` | ✔ centro | — | — | — |
| `/weather` | ✔ | — | — | `WorldV2:1066,1075` |
| `/family` | ✔ | — | — | — |
| `/preparedness` | ✔ | — | ✔ | veredito da casa |
| `/comms` | ✔ | — | — | badges |
| `/circles` | ✔ | — | — | `FamilyPage:696` |
| `/scenario` | ✔ | — | — | `WorldV2:991` |
| `/plan` | ✖ | ✔ | ✔ | `FamilyPage:621` |
| `/ficha` | ✖ | ✔ | ✔ | `settings:469`, `weather:383` |
| `/settings` | ✖ | ✔ | — | `circles:620` |
| `/edu` | ✖ | ✖ | ✖ | **um só**: `PreparednessPage:680` |

---

## 2. Diagnóstico — oito achados

**A1. Sete slots numa barra desenhada para cinco.**
iOS HIG e Material 3 convergem em 3–5 destinos. Sete produz alvos estreitos,
rótulo ilegível e nenhum peso hierárquico. Já registrado como fato em
`docs/34` (15.6) e como desconforto em D-131.

**A2. O problema não é visual — é ausência de nível 2.**
São **14 telas irmãs** e **uma única sub-rota** em todo o app
(`/family/cadastro`). A hierarquia é plana e a barra é o único mapa que existe.
Sua percepção de "página acumulada" está certa; a causa não é a barra, é o L2
que nunca foi criado.

**A3. `/weather` e `/dashboard` são o mesmo domínio brigando por dois slots.**
Alertas, condições atuais, AQI e nowcast aparecem nos dois, em duas linguagens
visuais diferentes. `/weather` é **detalhe de MUNDO posando de irmão de MUNDO**.

**A4. `/edu` é órfã.**
Uma única porta de entrada em todo o app: um card dentro de Preparação
(`PreparednessPage:680`). Cinco capacidades e busca semântica atrás de um card.

**A5. `/plan` e `/ficha` estão no nível errado — e o produto já sabe disso.**
Ambos são atalhos do `manifest.json` (o produto os trata como primários) e
itens do ☰ sem rótulo (a navegação os trata como terciários). `/plan` tem 1409
linhas atrás de um ícone de hambúrguer.

**A6. Cenário é um MODO, não um lugar.**
`SimulationProvider` é global; banner, convite e debrief são globais; o modo
derruba fontes e reconfigura o app inteiro. Um modo ocupando slot de destino é
erro de categoria — o mesmo erro que o Pilot **não** comete.

**A7. Preparação acumula cinco responsabilidades numa rolagem só.**
Score de prontidão · briefing de IA · ponte para EDU · editor de estoque (água,
comida, combustível, bateria, equipamentos, dinheiro) · checklist inteiro.
1611 linhas. **É a tela que você sentiu.**

**A8. Círculos e Família são o mesmo assunto em dois slots.**
`useCircleFamily.ts` prova que o código já funde os dois para desenhar a
família no mapa. Para o usuário, "meu círculo" é a plumbing de "minha família".

---

## 3. Avaliação da hipótese (Model A)

### 3.1 Onde a hipótese está certa

1. **WORLD = HOME.** Correto, e já é verdade no código (`app/page.tsx:40`,
   comentário do `BottomNav`). Merece virar regra permanente do produto.
2. **Há slots demais.** Correto.
3. **Os domínios precisam de subdivisão.** Correto — é o achado A2.

### 3.2 Onde a hipótese quebra

**B1 — Mata o movimento lateral, no pior momento.**
Estou em Preparação, dispara alerta de tornado, preciso da Família.
Hoje: **1 toque**. Com barra contextual: MUNDO → Família = **2 toques + uma
reorientação**. Um app de emergência não pode transformar troca de domínio em
rota obrigatória pelo hub.

**B2 — Memória espacial é a única coisa que sobrevive ao estresse.**
Sob pressão ninguém lê rótulo de 10px; toca onde o dedo já sabe. Um slot que é
"Família" às vezes e "Suprimentos" outras produz **erro de toque no evento
real** — exatamente quando o erro custa caro.

**B3 — Quebra o contrato da tab bar (iOS HIG e Material 3).**
Tab bar = destinos de topo, persistentes, mutuamente exclusivos. Trocar itens
por contexto é o padrão de **navegação local** (segmented control / tabs / chips),
não de tab bar. No Android, o botão voltar não desfaz troca de barra: o usuário
fica com barra de um domínio e conteúdo de outro.

**B4 — Deep link chega sem contexto.**
Três atalhos do manifest, links de convite (`/convite/[code]`), convite de
treino (`/sim/[token]`) e push apontam para rotas profundas. A barra teria que
se auto-configurar antes de pintar. Isso não é hipótese: já é o tráfego de hoje.

**B5 — Acessibilidade e onboarding.**
`aria-current` e a ordem de foco mudam de identidade sem que haja evento de
navegação — leitor de tela anuncia uma barra nova sem que nada tenha navegado.
E não existe momento para ensinar "essa barra muda": um app de emergência não
tem tempo de treinar ninguém.

### 3.3 O nome do que a hipótese produz

Manter WORLD fixo e trocar os outros quatro é **hub-and-spoke com persistent
home**. Hub-and-spoke funciona em sessão curta e tarefa única (caixa eletrônico,
quiosque, checkout). Falha em **monitoramento contínuo com urgência lateral** —
que é exatamente o EOS.

| Padrão | Onde se aplica no EOS |
| --- | --- |
| Global (persistent) navigation | O que a barra deve continuar sendo |
| Local navigation (segmented / chips / tabs) | O que os subtemas devem ser |
| Nested routes / drill-down | O que falta (só `/family/cadastro` existe) |
| Hub-and-spoke | O que Model A produz — inadequado aqui |
| Contextual tab bar | Existe, mas **sempre atrelada a um modo declarado, visível e com saída explícita** |
| Overlay / modeless assistance | O Pilot — já está certo |

> **A intuição está certa; o alvo está errado.** Barra contextual é legítima
> para **MODO**, não para **DOMÍNIO**. Ver §7.

---

## 4. Três modelos

### Model A — WORLD persistente + barra contextual por domínio

```text
GLOBAL      [ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ MAIS ]
                              ↓ toca em Preparação
PREPARAÇÃO  [ VISÃO ]   [ RECURSOS ]   (( MUNDO )) [ CHECKLIST ] [ PLANO ]
```

| Eixo | Avaliação |
| --- | --- |
| Estrutura | 1 slot fixo + 4 mutáveis por domínio |
| Vantagem | Resolve a lotação; dá subdivisão a cada domínio; um só componente |
| Desvantagem | Troca de domínio vira 2 toques via hub; memória espacial destruída |
| Complexidade | **Alta** — barra vira máquina de estados derivada da rota, com estado inicial para cada deep link |
| Discoverability | **Baixa** — subtemas só existem depois de entrar; nada é visível de fora |
| Escalabilidade | Ruim: cada feature nova gera a briga "de qual contexto ela é" |
| Impacto no código | `BottomNav` reescrita + mapa rota→contexto + `aria-current` por contexto + teste `bottom-nav-test.mjs` refeito |
| Risco de confusão | **Alto** (B1, B2, B3) |
| Adequação mobile | Fraca sob estresse; aceitável em uso calmo |

### Model B — WORLD persistente + barra global fixa + navegação secundária no domínio

```text
GLOBAL      [ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ MAIS ]   ← nunca muda
DENTRO      ┌ Visão · Recursos · Checklist · Plano · Aprender ┐          ← chips no topo
```

| Eixo | Avaliação |
| --- | --- |
| Estrutura | 5 slots fixos + navegação local no topo de cada domínio |
| Vantagem | Memória espacial intacta; troca lateral em 1 toque; padrão nativo dos dois SOs |
| Desvantagem | Sozinho, não corrige `/weather` duplicado, `/edu` órfã nem Cenário-como-lugar |
| Complexidade | **Baixa** — a barra já funciona assim, só encolhe |
| Discoverability | **Alta** — os chips são visíveis na chegada ao domínio |
| Escalabilidade | Boa dentro dos domínios existentes |
| Impacto no código | Reduzir `NAV_LEFT`/`NAV_RIGHT`; criar sub-rotas; mover conteúdo |
| Risco de confusão | Baixo |
| Adequação mobile | Alta |

### Model C — **recomendado**: B + as três correções estruturais

Model B arruma a barra. Model C arruma a **arquitetura**, e a barra é
consequência. Três correções que B sozinho não faz:

1. **`/weather` desce um nível.** Vira detalhe de MUNDO (alertas e condições),
   não irmão de MUNDO. Fim da duplicação A3.
2. **Cenário deixa de ser destino e vira MODO.** Entrada por MAIS e por card em
   Preparação; o banner global que já existe é a saída. Fim do erro A6.
3. **Círculos é absorvido por FAMÍLIA; EDU e PLANO entram em PREPARAÇÃO; o ☰
   morre.** Fim de A4, A5 e A8 — e da segunda navegação escondida no topo.

```text
GLOBAL      [ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ MAIS ]
```

| Eixo | Avaliação |
| --- | --- |
| Estrutura | 3 níveis + camada de overlays; 5 slots fixos; L2 por rota real |
| Vantagem | Cada feature ganha **um** dono; escala sem tocar na barra; mata duas navegações concorrentes |
| Desvantagem | Mais trabalho que B: exige mover telas, não só encolher a barra |
| Complexidade | Média — mas concentrada em rotas e redirecionamentos, que o projeto já faz bem |
| Discoverability | **Alta** — EDU e Plano saem da invisibilidade |
| Escalabilidade | **Alta** — teste de escala em §8: 6 famílias novas, zero slots novos |
| Impacto no código | Barra encolhe · 4 telas mudam de endereço com redirect · ☰ removido · Simulador vira modo |
| Risco de confusão | Baixo, com redirecionamentos (padrão já usado: `/inventory`, `/checklist`, `/family-legacy`) |
| Adequação mobile | Alta — 5 alvos no arco do polegar, centro elevado |

---

## 5. RECOMENDAÇÃO

```text
RECOMMENDED NAVIGATION MODEL:  MODEL C
```

**Por quê, em três frases.** A dor que você sentiu é falta de nível 2, não
excesso de barra — e Model A resolve a barra criando um problema pior
(movimento lateral e memória espacial, §3.2). Model C entrega a subdivisão que
você quer, mas no lugar onde ela pertence: **dentro do domínio, como navegação
local**, mantendo a barra global previsível. E só o Model C corrige as quatro
patologias que nenhuma mudança de barra corrige sozinha: `/weather` duplicada,
`/edu` órfã, Cenário-como-lugar e o ☰ como segunda navegação.

Sua regra de `WORLD = HOME` **é aceita e promovida a regra permanente** — ver §6.

### GLOBAL NAV

```text
┌──────────────────────────────────────────────────────────────┐
│  [ FAMÍLIA ]  [ PREPARAÇÃO ]  (( MUNDO ))  [ COMMS ]  [ MAIS ] │
└──────────────────────────────────────────────────────────────┘
      ▲              ▲             ▲           ▲          ▲
   quem é meu     estamos      o que está    como falo  o resto
   e onde está   prontos?     acontecendo?   com eles   do app
```

Cinco slots. **Nunca mudam. Em nenhuma tela. Em nenhum modo.**
MUNDO permanece no centro, elevado, maior alvo — como já é hoje.

### DOMAIN NAV

Navegação local no topo do domínio (chips, o padrão que `/comms` já usa),
cada uma com **rota real** — nunca só estado em memória:

```text
MUNDO         Mapa · Alertas · Abrigos · Camadas
FAMÍLIA       Status · A casa · Ficha · Círculos
PREPARAÇÃO    Visão · Recursos · Checklist · Plano · Aprender
COMMS         Conversa · Linha do tempo · Rádio
MAIS          Conta · Plano e cobrança · Notificações · Idioma · Treino · Admin
```

### SCREEN HIERARCHY

```text
EOS
│
├── MUNDO  (( home global — raiz de tudo ))
│   ├── Mapa + índice de risco + veredito em repouso   ← a tela em si
│   ├── Alertas e condições        (hoje /weather)
│   ├── Abrigos abertos            (hoje card no sheet)
│   └── Camadas                    (folha sobre o mapa: chuva, vento, ciclone, flood…)
│
├── FAMÍLIA
│   ├── Status — quem está onde, necessidades, alcançáveis
│   ├── A casa — pessoas, dependentes, endereço, duplicados
│   ├── Ficha — ficha master + QR público
│   └── Círculos — convites, papéis, pedidos, monitoramento
│
├── PREPARAÇÃO
│   ├── Visão — prontidão, autonomia, lacunas, briefing
│   ├── Recursos — água, comida, combustível, bateria, equipamentos, dinheiro
│   ├── Checklist — tarefas, geração por cenário, itens do Pilot
│   ├── Plano — pontos, rotas, papéis, gatilhos, confirmação de leitura
│   └── Aprender — EDU
│
├── COMMS
│   ├── Conversa — mensagens do círculo
│   ├── Linha do tempo — notificações
│   └── Rádio — perfis de frequência
│
└── MAIS
    ├── Conta · Plano e cobrança · Notificações · Idioma
    ├── Treino (entra no MODO simulação)
    └── Admin (quando aplicável)

OVERLAYS — fora da hierarquia, alcançáveis de qualquer nível:
    Pilot (orbe/dock) · Inbox de notificações · folhas de detalhe · MODO simulação
```

**Três níveis. Nunca quatro.** Se algo precisar de L3, é sinal de que o L1
está errado — e a regra é reabrir o L1, não afundar mais um nível.

### ROUTE HIERARCHY

```text
/dashboard                    MUNDO — raiz
/dashboard/alertas            ← /weather redireciona
/dashboard/abrigos
/dashboard/camadas            (folha; rota para permitir deep link)

/family                       FAMÍLIA — status
/family/casa                  ← /family/cadastro redireciona
/family/ficha                 ← /ficha redireciona (o QR público /ficha/[id] NÃO muda)
/family/circulos              ← /circles redireciona

/preparedness                 PREPARAÇÃO — visão
/preparedness/recursos        ← /inventory (já redireciona hoje)
/preparedness/checklist       ← /checklist (já redireciona hoje)
/preparedness/plano           ← /plan redireciona (atalho do manifest continua valendo)
/preparedness/aprender        ← /edu redireciona

/comms                        COMMS — conversa
/comms/linha-do-tempo         ← hoje ?view=timeline
/comms/radio

/mais                         MAIS
/mais/conta  /mais/plano  /mais/notificacoes  /mais/idioma  /mais/treino
                              ← /settings redireciona

/scenario                     deixa de ser destino; abre o MODO e devolve para /dashboard
```

> **Regra de rota:** toda sub-tela tem endereço próprio. Estado de navegação que
> só existe em memória não pode receber push, QR, atalho de manifest nem link de
> convite — e o EOS já vive dos quatro.

### FEATURE OWNERSHIP

| Feature | Domínio primário | Tela primária | Entradas secundárias | Intenção do usuário |
| --- | --- | --- | --- | --- |
| Índice de risco / veredito | MUNDO | `/dashboard` | Pilot; faixa em Preparação | "Estou em perigo agora?" |
| Alertas, terremotos, ciclones | MUNDO | `/dashboard/alertas` | Card no sheet; push | "O que está acontecendo?" |
| Camadas do mapa (chuva, vento, flood…) | MUNDO | `/dashboard/camadas` | Botão de camadas | "Mostra no mapa" |
| Abrigos abertos | MUNDO | `/dashboard/abrigos` | Pilot ("para onde vou?"); Plano | "Para onde eu vou?" |
| Condições atuais / AQI | MUNDO | `/dashboard/alertas` | Tiles no sheet | "Dá para sair hoje?" |
| Recomendação de atividade | MUNDO | `/dashboard/alertas` | Pilot | "Dá para pescar amanhã?" |
| Quem está onde | FAMÍLIA | `/family` | Marcadores no mapa | "Cadê todo mundo?" |
| Pessoas e dependentes | FAMÍLIA | `/family/casa` | Onboarding | "Quem mora aqui?" |
| Ficha master + QR | FAMÍLIA | `/family/ficha` | Atalho PWA; primeira execução | "Socorrista precisa saber" |
| Casa somada / autonomia | FAMÍLIA (dado) | `/family/casa` | **Exibida** em Preparação | "Quanto tempo aguentamos?" |
| Círculos, convites, papéis | FAMÍLIA | `/family/circulos` | `/convite/[code]` | "Com quem eu compartilho?" |
| Monitoramento de localização | FAMÍLIA | `/family/circulos` | Mapa | "Posso ver onde eles estão?" |
| Prontidão / lacunas | PREPARAÇÃO | `/preparedness` | Veredito da casa em MUNDO | "Estamos prontos?" |
| Estoque | PREPARAÇÃO | `/preparedness/recursos` | Pilot ("o que falta") | "O que eu tenho?" |
| Checklist | PREPARAÇÃO | `/preparedness/checklist` | Pilot; EDU; simulação | "O que eu faço agora?" |
| Plano da família | PREPARAÇÃO | `/preparedness/plano` | Atalho PWA; Família | "Para onde a gente vai?" |
| EDU | PREPARAÇÃO | `/preparedness/aprender` | Checklist; Pilot | "Como se faz isso?" |
| Mensagens do círculo | COMMS | `/comms` | Badge; push | "Preciso falar com eles" |
| Notificações | COMMS | `/comms/linha-do-tempo` | **Inbox overlay** (qualquer tela) | "O que eu perdi?" |
| Rádio | COMMS | `/comms/radio` | Plano (gatilho de queda de rede) | "E se cair a rede?" |
| Ping para a família | COMMS | `/comms` | Família | "Você está bem?" |
| Simulador / treino | **MODO** | overlay + `/mais/treino` | Card em Preparação; `/sim/[token]` | "Vamos ensaiar" |
| Pilot | **OVERLAY** | orbe global | Barra do Pilot no MUNDO | "Me diz o que fazer" |
| Plano e cobrança | MAIS | `/mais/plano` | Muro de plano em features gated | "Quanto custa" |
| Idioma, push, conta | MAIS | `/mais/*` | — | "Ajustar o app" |

> **Regra do dono único.** Uma feature pode ter quantos atalhos precisar, mas
> **um** endereço. Hoje "autonomia da casa" é calculada em Família, exibida em
> Preparação e citada pelo Pilot — está certo: o dono é o dado (Família), as
> outras são leituras. O que está errado é ter **duas telas** capazes de editar
> o mesmo assunto, como `/dashboard` e `/weather` fazem com alertas.

### BACK BEHAVIOR

| Situação | Comportamento |
| --- | --- |
| L2 → voltar | Vai para o L1 **do mesmo domínio**. Nunca para MUNDO |
| L1 → voltar | Domínio anterior do histórico; **sem histórico (deep link) → MUNDO** |
| MUNDO → voltar (Android) | Sai do app. MUNDO é a raiz — não há nada atrás dele |
| Tocar em MUNDO já estando em MUNDO | Recentra o mapa em casa. Reorientação, não recarga |
| Tocar num domínio já estando nele | Volta ao L1 do domínio (*pop to root*, padrão iOS) |
| Overlay aberto (Pilot, inbox, folha) → voltar | Fecha o overlay. Só o toque seguinte navega |
| MODO simulação ativo → voltar | **Nunca** sai do modo. Sair é ação explícita no banner |

### DEEP LINK BEHAVIOR

1. Toda rota L2 é endereço real e abre direto, sem passar por L1.
2. A barra deriva o slot ativo **do path**, não do histórico — é o que
   `BottomNav.isActive` já faz hoje (`pathname.startsWith(href + '/')`).
   Model C preserva essa propriedade; Model A a destrói.
3. Rota antiga **nunca** vira 404 — redireciona. O projeto já tem o padrão
   escrito em `app/(app)/family-legacy/page.tsx`.
4. `/ficha/[id]` (QR público, fora do shell) **não muda de endereço**. Está
   impresso, colado e compartilhado.
5. Atalhos do `manifest.json` continuam apontando para `/ficha`, `/plan` e
   `/preparedness` — os três passam a redirecionar sem quebrar nada instalado.

---

## 6. WORLD = HOME — vale como regra permanente?

**Sim. E deve ser escrita como invariante do produto.**

| Critério | Veredito |
| --- | --- |
| Dashboard operacional global | ✔ Já é: risco, alertas, casa, família, abrigos, camadas numa tela |
| Raiz universal | ✔ Já é: `app/page.tsx:40` redireciona logado para `/dashboard` |
| Primeiro item permanente | ✔ Já é: orbe central elevado, maior alvo, mesma posição |
| Ponto de reorientação em emergência | ✔ É o único lugar que responde "onde eu estou e o que vem na minha direção" |

**Regra proposta:**

> **INV-NAV-01 — MUNDO é a raiz.** O botão MUNDO ocupa a mesma posição, tem a
> mesma função e está disponível em qualquer tela e em qualquer modo. Tocá-lo
> devolve a pessoa ao estado global do EOS em um toque, de onde ela estiver.
> Nenhuma tela, modo ou overlay pode removê-lo, movê-lo ou reatribuí-lo.

Isso é **mais forte** do que a hipótese original: em Model A, MUNDO é fixo mas
os vizinhos não — o que faz MUNDO virar o único ponto estável de uma barra
instável, e portanto uma **passagem obrigatória**. Em Model C, MUNDO é fixo
**e** os vizinhos também: MUNDO vira um destino privilegiado, não um pedágio.

---

## 7. A concessão: onde a barra contextual é a resposta certa

Sua intuição não está errada — está **aplicada ao eixo errado**.

Barra contextual é legítima quando o contexto é um **MODO declarado**, com
entrada explícita, sinal permanente e saída visível. O EOS tem dois candidatos
reais, e nenhum deles é "domínio":

**Modo simulação** — já tem banner global permanente (`SimulationBanner`) e
saída explícita. Uma barra que mudasse aqui seria honesta: o usuário *declarou*
que entrou.

**Modo emergência** — quando o veredito é `act`, o app pode assumir uma barra
de resposta:

```text
REPOUSO      [ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ MAIS ]
EMERGÊNCIA   [ FAMÍLIA ] [ ROTA ]       (( MUNDO )) [ COMMS ] [ SAIR ]
```

Isso é *contextual tab bar* no uso correto: modo raro, declarado, visível,
com saída. **Não é para agora** — fica registrado como evolução possível
depois que Model C estiver de pé, e depende de o veredito `act` já estar
provado (`resting-verdict`, 20 testes unitários, já está).

---

## 8. Teste de escala

Passando as áreas futuras pela arquitetura proposta, **sem** colocá-las no menu:

| Área futura | Onde entra | Slot novo? |
| --- | --- | --- |
| Vento animado, radar, fumaça | Camada de MUNDO | Não |
| Incêndio (NASA FIRMS), flood | Camada de MUNDO + alerta | Não |
| Evacuação | `/preparedness/plano` (rota) + MUNDO (desenho) | Não |
| Abrigos | `/dashboard/abrigos` | Não |
| Status da família | `/family` | Não |
| Comunicação (LoRa, rádio) | `/comms/radio` | Não |
| Suprimentos, checklists | `/preparedness/*` | Não |
| Scenario planning | MODO simulação | Não |
| Decision engine | Pilot (overlay) + veredito | Não |
| Ações de emergência | Faixa de veredito em MUNDO e Preparação | Não |

**Dez áreas futuras, zero slots novos.** É esse o teste que Model A não passa:
em Model A, cada feature nova abre a discussão "de qual contexto ela é" e
disputa um dos quatro slots mutáveis — que agora são quatro slots **por
domínio**, ou seja, dezesseis decisões em vez de cinco.

---

## 9. O que fica de fora desta proposta (de propósito)

- Nenhum código, componente, rota, token ou biblioteca foi tocado.
- Nenhum mockup visual. Design vem **depois** da estrutura ser aceita.
- Nomes de rótulos são de trabalho (`Visão`, `A casa`, `Aprender`) — a redação
  final é trabalho de UX writing, não de arquitetura.
- As rotas `-legacy` continuam onde estão; retirá-las é decisão à parte.

## 10. Se Model C for aceito

Ordem sugerida — cada passo entrega valor sozinho e é reversível:

1. **Encolher a barra para 5** (Família · Preparação · MUNDO · Comms · Mais) e
   criar `/mais` absorvendo o ☰. Ganho imediato, risco mínimo.
2. **Absorver Círculos em Família** e EDU + Plano em Preparação, com
   redirecionamentos. Mata A4, A5, A8.
3. **Criar a navegação local** (chips com rota real) nos cinco domínios.
   Mata A7 — Preparação deixa de ser 1611 linhas numa rolagem.
4. **Descer `/weather` para dentro de MUNDO.** Mata A3.
5. **Cenário vira modo.** Mata A6.
6. Atualizar `scripts/bottom-nav-test.mjs` (5 ícones + L2 por rota),
   `docs/34` (15.6) e registrar decisão em `docs/08-decisions-log.md`.

**Nada disso começa sem decisão registrada** — Regra 6 e Regra 7 do `AGENTS.md`.

---

## 11. Execução — o que já aconteceu

A ordem sugerida acima foi **invertida na prática**, e por um motivo que só
apareceu ao executar: encolher a barra primeiro deixaria Círculos, Plano, Ficha
e EDU sem casa por um release inteiro. As absorções vieram antes porque são
elas que **liberam os slots**.

| Fase | Tarefa | Estado |
| --- | --- | --- |
| 1 | Plano e Aprender entram na Preparação | ✅ NAV-T04 · D-177 |
| 2 | Círculos e Ficha entram em Família | ✅ NAV-T05 · D-178 |
| 3 | **Barra encolhe para 5; `/mais` absorve o ☰** | ✅ **NAV-T06 · D-180** |
| 4 | `/weather` desce para dentro do MUNDO | ◧ NAV-T07 · D-182 — fase 1 de 2 (falta Abrigos e Camadas) |
| 5 | Cenário vira MODO | ✅ NAV-T08 · D-184 |

**Modelo C completo em 2026-08-14.** Cinco fases em três dias, mais três
correções nascidas delas: D-179 (duas telas, a mesma palavra), D-181 (a porta
do Clima era condicional) e D-183 (`/mais` fora da allow-list de rotas
protegidas). As três seguem o mesmo padrão — o teste cobria o caminho **com**
dado, e o defeito morava no caminho **sem**.

Divergências assumidas em relação ao que este documento propôs:

- **A forma visual pós-D-189 é pílula expansível.** D-180 decidiu a arquitetura
  dos cinco destinos; D-189 mudou só o comportamento visual: rótulo aparece no
  item ativo, ativo vem da rota e MUNDO fica verde sempre.
- **`/family/casa` ficou `/family/cadastro`.** O endereço já existia e já estava
  em links; renomear custaria mais do que informa.
- **`/mais` ainda não tem faixa de domínio.** Conta, plano, notificações e
  idioma continuam seções de uma página só. Dividir em `/mais/conta`,
  `/mais/plano`… é trabalho próprio, e a barra não dependia dele.
- **O eixo da Preparação não é "Em casa × Mochilas"**, como §36 chegou a propor
  — é **Requirement × Holding** (`docs/37` §29.2). Localização e kit são
  dimensões independentes e viraram FILTROS, não subtópicos.
