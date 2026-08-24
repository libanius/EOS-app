# Preparação — arquitetura de informação interna

> **Status: PROPOSTA. Nada foi implementado.**
> Nenhum código, rota, componente, redirecionamento ou token foi tocado.
> A navegação global (MUNDO, FAMÍLIA, COMMS, barra inferior) **não é assunto
> deste documento** e permanece exatamente como está.
> Escopo: **somente `/preparedness`**.
> Método: Intent `/organize` (IA, taxonomia, rotulagem, wayfinding), aplicado
> sobre `components/world-v2/PreparednessPage.tsx` lido integralmente.
> Complementa `docs/35-arquitetura-de-navegacao.md`, que trata do nível global.

---

## 1. CURRENT PREPAREDNESS INVENTORY

`/preparedness` → `components/world-v2/PreparednessPage.tsx` — **1611 linhas**,
uma única rolagem, sem nenhuma navegação interna.

### 1.1 Na ordem em que o usuário encontra

| # | Bloco | Linhas | O que é | Dado |
| --- | --- | --- | --- | --- |
| 1 | Cabeçalho + estado de salvamento | 653-671 | Título, sobrelinha, ponto "salvando" / "✓ salvo" | local |
| 2 | Faixa de erro | 673-675 | `saveError` | local |
| 3 | **Resumo de prontidão** | 677-687 | Nota 0-100, nível, barra, chip de nº de bocas, autonomia em dias | `calcReadiness()` + `/api/household` |
| 4 | **Card EDU** | 680-690 | `<a href="/edu">` — "Conteúdo educativo aprovado" | estático |
| 5 | **Briefing de IA** | 692-744 | Botão gerar/atualizar, badge de risco, visão geral, prioridades, forças, próximos passos | `/api/ai/readiness` |
| 6 | Recurso — Água | 746-781 | Valor grande, L/pessoa, stepper, estado crítico/baixo | `/api/inventory` |
| 7 | Recurso — Comida | 783-803 | Dias, stepper | idem |
| 8 | Recurso — Combustível | 805-826 | Opcional, stepper | idem |
| 9 | Recurso — Bateria | 828-858 | Barra + stepper | idem |
| 10 | Recurso — Equipamentos | 860-896 | Dois interruptores: kit médico, comunicação | idem |
| 11 | Recurso — Dinheiro | 898-914 | Stepper | idem |
| 12 | **Checklist** | 917-1053 | Botão "gerar" (só quando vazio); agrupado por *tier* com barra e "~Nd"; item com caixa, nome, "Fonte: <kit>", quantidade, Editar, Excluir | `/api/checklist` |
| 13 | Modal editar item | 1080-1151 | Nome, quantidade, unidade, tier | `/api/checklist/[id]` |
| 14 | Modal excluir item | 1153-1188 | Confirmação destrutiva | idem |

### 1.2 Comportamentos que atravessam a tela

- **Auto-save com debounce** e transição pendente ([:494](../components/world-v2/PreparednessPage.tsx#L494))
- **Sincronização em tempo real** de 3 tabelas: `resource_inventory`, `family_members`, `checklists` ([:470](../components/world-v2/PreparednessPage.tsx#L470))
- **Snapshot offline** (`loadSnapshot`/`saveSnapshot`) — a tela pinta antes da rede
- **Ponte silenciosa checklist → estoque**: `getInventoryDelta()` ([:301](../components/world-v2/PreparednessPage.tsx#L301)) mapeia `canonical_key` por regex e escreve nos campos numéricos. Marcar "Água 4 L" no checklist altera `water_liters`
- **Nota e autonomia olham a CASA; o editor continua pessoal** ([:382](../components/world-v2/PreparednessPage.tsx#L382), D-123)

### 1.3 Entradas de fora

| Entrada | Origem |
| --- | --- |
| Atalho do PWA "Preparação" | `public/manifest.json` |
| `/inventory` → `/preparedness` | redirecionamento existente |
| `/checklist` → `/preparedness` | redirecionamento existente |
| Veredito da casa no MUNDO | `WorldV2` — "entrar em Preparação para corrigir estoque/checklist" |
| Pilot salvando itens | `/api/checklist/save-items` (`kit_type: PILOT_RECOMMENDATION`) |
| Debrief da simulação | `kit_type: SIMULATION_DEBRIEF` |
| EDU virando tarefa | `kit_type: EDU_CONTENT` |
| Recomendação de atividade em `/weather` | salva com `kit_type: BUG_OUT` |

### 1.4 Vizinhança — o que existe fora, mas é do mesmo assunto

| Artefato | Linhas | Estado |
| --- | --- | --- |
| `/plan` → `PlanPage` | 1409 | Rota própria; alcançável só pelo ☰ e pelo atalho do PWA |
| `/edu` | 345 | Rota própria; **um único link em todo o app** — o card #4 acima |
| `components/world-v2/ChecklistPage.tsx` | 323 | **Existe e não está montado.** Já implementa filtro por kit |
| `/checklist-legacy` | 528 | Título: **"Mochilas & Kits"**. Tinha seletor de kit |
| `lib/checklist.ts` | — | `KITS`: Geral 🏠, Bug Out 🎒, Acampamento 🏕, Pesca 🎣, Caça 🦌 |

---

## 2. CURRENT ARCHITECTURAL PROBLEMS

**P1 — Três tempos de uso na mesma rolagem.**
Diagnóstico (nota, briefing) é **leitura**, feita em minutos de dúvida ou no
meio de um evento. Estoque (6 editores numéricos) é **manutenção**, feita uma
vez por mês. Checklist é **execução**, feita numa sessão de compra. Empilhados,
a tarefa mais lenta fica fisicamente entre o usuário e a mais urgente.

**P2 — O diagnóstico está no topo; o que ele diagnostica, 400px abaixo.**
A nota diz "37/100 · crítico". A correção (água) exige rolagem e uma inferência.
Não existe caminho do problema até a ação — é uma lista, não um fluxo. Em
termos de wayfinding: a tela responde *"onde estou"* e não responde *"para onde
eu vou"*.

**P3 — A dimensão KIT foi perdida, e o banco discorda.**
A chave única é `(profile_id, canonical_key, kit_type)`
([save-items:45](../app/api/checklist/save-items/route.ts#L45)) — ou seja,
"Água 4 L" **existe separadamente** em cada kit, por desenho. A tela atual
agrupa **só por tier** e rebaixa o kit a um rótulo de texto: `Fonte: Bug Out`
([:1011](../components/world-v2/PreparednessPage.tsx#L1011)).

Consequência concreta: dois itens com o mesmo nome, um embaixo do outro, e
nada indica qual mochila está sendo editada. E `ChecklistPage.tsx` — 323 linhas
**com o filtro por kit já escrito** — está no repositório, desmontado. A
solução foi construída e desligada.

**P4 — Duas taxonomias concorrentes para "o que eu tenho".**
Os 6 cards de recurso (7 campos numéricos) e o checklist (itens com quantidade
e unidade) descrevem o mesmo mundo por caminhos diferentes. `getInventoryDelta()`
faz a ponte por **expressão regular sobre o nome do item**. É uma sincronização
invisível entre duas listas que o usuário vê como não relacionadas — e um
casamento por regex é o sintoma, não a causa.

**P5 — EDU é um card de passagem no meio de uma tela de edição.**
O único link do app inteiro para `/edu` está entre a nota e o briefing — no
exato ponto em que a pessoa está diagnosticando, não estudando.

**P6 — O briefing de IA ocupa o segundo lugar mais valioso e costuma estar vazio.**
É opt-in: só existe depois de tocar em "gerar". Na maioria das visitas, o melhor
espaço acima da dobra é um *placeholder*.

**P7 — Nenhum estado interno é endereçável.**
Modal aberto, item em foco, kit em uso: tudo em memória. O Pilot salva itens
(`/api/checklist/save-items`) e **não tem como levar a pessoa até eles** —
o melhor que consegue é apontar para o topo de uma página de 1611 linhas.

**P8 — Um assunto, três vocabulários.**
O i18n chama tudo de `inventory.*` (inclusive o título da tela), o produto
chama de "Preparação", e a rota `/inventory` redireciona para cá. Rotular é
metade da IA; hoje o app não tem uma palavra só para esta superfície.

---

## 3. RECOMMENDED SUBTOPICS

### 3.1 Antes: sua hipótese, testada

```text
Overview · Resources · Checklist · Plan · Learn
```

| Teste | Resultado |
| --- | --- |
| **MECE** (categorias mutuamente exclusivas) | ❌ **Falha entre Resources e Checklist.** Ambas respondem "o que eu tenho / o que me falta". O próprio sistema não consegue separá-las — precisa de `getInventoryDelta()` por regex para mantê-las coerentes. Se o código não separa, o usuário também não vai |
| **Teste dos 5 segundos** nos rótulos | ❌ "Recursos" e "Checklist" não permitem prever o conteúdo. Os dois soam como "suprimentos" |
| **Resolve P3 (kit perdido)** | ❌ Não. "Checklist" continua sendo uma lista plana por tier |
| **Escala** | ⚠️ Um kit novo (Carro, Escritório, Pet) não tem onde entrar |
| **Overview / Plan / Learn** | ✅ Corretos. Mantidos na recomendação |

Três dos cinco estão certos. O problema está no par `Resources`/`Checklist`.

### 3.2 Recomendação — o eixo certo já está no banco de dados

O produto já tem uma taxonomia limpa e a desligou: **`kit_type`**.
`GERAL` é a casa; os outros são mochilas. `/checklist-legacy` chamava isso pelo
nome certo — **"Mochilas & Kits"**.

Isso resolve P3 e P4 **na mesma decisão**: os 7 campos numéricos deixam de ser
uma segunda taxonomia e passam a ser o **resumo grosso do kit GERAL**, no mesmo
lugar que os itens detalhados dele.

```text
PREPARAÇÃO
│
├── Visão          ← /preparedness (permanece a porta de entrada)
├── Em casa        ← o que está guardado em casa
├── Mochilas       ← o que sai de casa com você
├── Plano          ← futuro dono de /plan   (não migrar agora)
└── Aprender       ← futuro dono de /edu    (não migrar agora)
```

---

#### SUBTÓPICO 1 — **Visão**

```text
Propósito: dizer em quanto tempo a casa quebra e o que fazer a respeito.
Pergunta do usuário: "Estamos prontos? E se não, o que eu faço agora?"
Cadência: alta — toda dúvida, todo evento.
```

Contém: resumo de prontidão (nota, nível, autonomia, bocas) · **o que precisa
de atenção** (novo, derivado) · briefing de IA recolhido · portas para os
subtópicos com estado. Detalhado em §4.

---

#### SUBTÓPICO 2 — **Em casa**

```text
Propósito: manter o estoque doméstico — o que sustenta a casa parada.
Pergunta do usuário: "O que eu tenho guardado, e quanto tempo isso dura?"
Cadência: baixa — manutenção mensal, ou depois de comprar.
```

Contém:
- Água, Comida, Combustível, Bateria (4 cards com stepper)
- Equipamentos (kit médico, comunicação)
- Dinheiro
- **Itens do checklist com `kit_type = GERAL`**, agrupados por tier

> **Por que os dois juntos:** são a mesma coisa em duas granularidades. Os 7
> campos são a declaração grossa que alimenta a nota; os itens são a camada
> detalhada. Hoje elas vivem em telas diferentes e se sincronizam por regex
> escondida (P4). Na mesma tela, a relação passa a ser visível — e a regex vira
> uma conveniência, não um remendo.

---

#### SUBTÓPICO 3 — **Mochilas**

```text
Propósito: preparar os kits que saem de casa.
Pergunta do usuário: "A mochila de evacuação está pronta?"
Cadência: por sessão — arruma-se um kit de cada vez, até fechar.
```

Contém: um kit por vez — Bug Out 🎒 · Acampamento 🏕 · Pesca 🎣 · Caça 🦌 —
com itens por tier (Essencial 3d / Moderado 7d / Excelente 30d), progresso por
tier, gerar checklist, editar e excluir item.
Os kits de origem automática (`PILOT_RECOMMENDATION`, `EDU_CONTENT`,
`SIMULATION_DEBRIEF`) aparecem como **caixa de entrada** — ver §10, questão 3.

> **Por que "Mochilas" e não "Checklist":** o rótulo passa no teste dos 5
> segundos (dá para prever o conteúdo), devolve um conceito que o produto já
> teve, e transforma o kit de rótulo passivo em eixo de navegação — que é
> exatamente o que o banco de dados sempre modelou.

---

#### SUBTÓPICO 4 — **Plano** *(propriedade futura; não migrar agora)*

```text
Propósito: o que a família faz quando acontece.
Pergunta do usuário: "Para onde a gente vai e quem busca quem?"
Cadência: rara para escrever, urgente para ler.
```

Contém hoje, em `/plan`: pontos de encontro · rotas desenhadas · papéis ·
gatilhos · confirmação de leitura por membro · carta offline · revisão pelo Pilot.

---

#### SUBTÓPICO 5 — **Aprender** *(propriedade futura; não migrar agora)*

```text
Propósito: aprender a fazer o que a preparação exige.
Pergunta do usuário: "Como se faz isso?"
Cadência: baixa, exploratória.
```

Contém hoje, em `/edu`: base curada (FEMA, Cruz Vermelha, OMS, SAS, SAMHSA,
NCTSN, CDC…) · filtro por cenário · busca semântica · conteúdo virando tarefa.

---

### 3.3 Teste MECE da grade proposta

| Pergunta do usuário | Vai para | Ambíguo? |
| --- | --- | --- |
| "Tenho água suficiente?" | Em casa | Não |
| "Minha bolsa de fuga está pronta?" | Mochilas | Não |
| "Quanto tempo a casa aguenta?" | Visão | Não |
| "Para onde a gente corre?" | Plano | Não |
| "Como purificar água?" | Aprender | Não |
| "Cadê a água da mochila?" | Mochilas | Não — **é outra água**, e o banco já as separa |

Sem sobreposição, sem órfãos. O único ponto que exige cuidado de redação é o
último — resolvido pelos rótulos: *em casa* × *na mochila*.

---

## 4. PREPAREDNESS OVERVIEW

`/preparedness` continua sendo a porta. Deixa de ser uma tela de edição e passa
a ser **uma tela de decisão**. Quatro blocos, nesta ordem:

```text
┌──────────────────────────────────────────────┐
│  1. PRONTIDÃO                                │
│     37/100 · crítico                         │
│     ▓▓▓▓░░░░░░░░░░░░░░░░░░                   │
│     Autonomia 2 dias · 4 pessoas             │
├──────────────────────────────────────────────┤
│  2. PRECISA DE ATENÇÃO            (3)        │
│     ⚠ Água — 1,2 L/pessoa      → Em casa     │
│     ▲ Sem kit médico            → Em casa    │
│     ▲ Bug Out 40% do essencial  → Mochilas   │
├──────────────────────────────────────────────┤
│  3. Analisar com IA                    ›     │
├──────────────────────────────────────────────┤
│  4. Em casa      4 lacunas             ›     │
│     Mochilas     2 de 4 kits           ›     │
│     Plano        pendente de leitura   ›     │
│     Aprender     12 guias              ›     │
└──────────────────────────────────────────────┘
```

**Bloco 2 é o coração da proposta e não exige dado novo.** Os estados já são
calculados: `getResourceState()` ([:104](../components/world-v2/PreparednessPage.tsx#L104))
devolve `critical`/`high` para cada recurso, e o checklist já computa
`done/total` por tier ([:950](../components/world-v2/PreparednessPage.tsx#L950)).
Hoje esses sinais ficam presos dentro de cada card, espalhados por 400px de
rolagem. Reunidos no topo, **cada problema vira uma linha tocável que leva ao
lugar onde se conserta** — que é a correção de P2.

**Bloco 3** resolve P6: o briefing sai de card permanente vazio para uma linha
que se abre.

**O que NÃO fica na Visão:** nenhum stepper, nenhum interruptor, nenhuma lista
de itens, nenhum modal. Se dá para editar, não é visão geral.

---

## 5. FEATURE OWNERSHIP

### 5.1 Classificação de cada bloco atual

| Bloco atual | Classificação | Por quê |
| --- | --- | --- |
| Resumo de prontidão | **KEEP ON OVERVIEW** | É a resposta à pergunta central do domínio |
| Nota e autonomia da casa | **KEEP ON OVERVIEW** | Dado derivado, leitura pura, sem edição |
| Estado crítico/baixo de cada recurso | **KEEP ON OVERVIEW** (como resumo) + **MOVE TO SUBTOPIC** (como card) | O *sinal* pertence à Visão; o *editor* pertence a Em casa |
| Briefing de IA | **CARD / WIDGET recolhido** | Diagnóstico, mas opt-in e lento. Linha que expande, não card permanente |
| Card EDU | **CTA / SHORTCUT ONLY** → depois **FULL PAGE** | Hoje é o único link para `/edu` (P5). Vira porta na Visão e, no futuro, subtópico |
| Água · Comida · Combustível · Bateria | **MOVE TO SUBTOPIC — Em casa** | Manutenção, cadência mensal. Não pertence a uma tela de decisão |
| Equipamentos (2 interruptores) | **MOVE TO SUBTOPIC — Em casa** | Idem |
| Dinheiro | **MOVE TO SUBTOPIC — Em casa** | Idem |
| Checklist — itens `GERAL` | **MOVE TO SUBTOPIC — Em casa** | É o detalhe do mesmo estoque. Junta-se aos campos numéricos, encerrando P4 |
| Checklist — demais kits | **MOVE TO SUBTOPIC — Mochilas** | Restaura o eixo `kit_type` (P3) |
| Agrupamento por tier | **CARD / WIDGET** dentro dos dois subtópicos | É sub-faceta de progresso, não nível de navegação |
| Botão "gerar checklist" | **MOVE TO SUBTOPIC** | Ação local do kit em que se está |
| Modais editar / excluir item | **CARD / WIDGET** (overlay) | Corretos como estão. Devem herdar a rota do subtópico (P7) |
| `getInventoryDelta()` (regex) | **DUPLICATE / MERGE** | Sintoma de P4. Com Em casa unificado, deixa de ser ponte entre telas |
| Rótulo "Fonte: Bug Out" | **REMOVE CANDIDATE** | Substituído pelo kit como eixo de navegação. Vira redundante |
| Chave i18n `inventory.*` para a tela toda | **REMOVE CANDIDATE** (renomear) | P8 — um assunto precisa de uma palavra |
| `ChecklistPage.tsx` (desmontado) | **REAPROVEITAR** | Já implementa o filtro por kit que Mochilas precisa |

### 5.2 Mapa de propriedade

| Feature | Subtópico primário | Tela primária | Entradas secundárias | Intenção |
| --- | --- | --- | --- | --- |
| Nota de prontidão | Visão | `/preparedness` | Veredito da casa no MUNDO | "Estamos prontos?" |
| Autonomia em dias | Visão | `/preparedness` | Pilot; MUNDO | "Quanto tempo aguentamos?" |
| Lista "precisa de atenção" | Visão | `/preparedness` | — | "O que faço primeiro?" |
| Briefing de IA | Visão | `/preparedness` | — | "Me explica meu estado" |
| Água, comida, combustível, bateria | Em casa | `/preparedness/em-casa` | Pilot ("o que falta") | "O que eu tenho guardado?" |
| Kit médico, comunicação | Em casa | `/preparedness/em-casa` | Nota (15 e 10 pontos) | idem |
| Dinheiro | Em casa | `/preparedness/em-casa` | — | idem |
| Itens gerais do checklist | Em casa | `/preparedness/em-casa` | Pilot; EDU | "O que ainda falta comprar?" |
| Kits Bug Out / Acampamento / Pesca / Caça | Mochilas | `/preparedness/mochilas` | Recomendação de atividade em `/weather` | "A mochila está pronta?" |
| Itens vindos do Pilot / EDU / debrief | Mochilas (entrada) | `/preparedness/mochilas` | Pilot; debrief da simulação | "O que me sugeriram?" |
| Gerar checklist por cenário | Mochilas / Em casa | contexto do kit | Simulador | "Monta a lista para mim" |
| Plano da família | Plano *(futuro)* | `/plan` hoje | Atalho PWA; Família; ☰ | "Para onde a gente vai?" |
| Conteúdo educativo | Aprender *(futuro)* | `/edu` hoje | Card na Visão; checklist | "Como se faz isso?" |

> **Princípio do dono único, aplicado:** a nota aparece em três lugares (Visão,
> MUNDO, Pilot) — correto, porque só a Visão a **explica**; os outros dois a
> **citam**. Já "o que eu tenho" tem hoje **dois donos que se editam por regex**
> — isso é o que precisa acabar.

---

## 6. LOCAL NAVIGATION

### 6.1 Recomendação

**Visão como hub + faixa de chips persistente, com rota real em cada chip.**
É a opção "combinação" — e a escolha é deliberada, não conciliatória.

```text
┌──────────────────────────────────────────────┐
│  PREPARAÇÃO                                  │  ← cabeçalho
│  ( Visão ) ( Em casa ) ( Mochilas ) ( … )    │  ← chips, grudados no topo
├──────────────────────────────────────────────┤
│                                              │
│   conteúdo do subtópico                      │
│                                              │
└──────────────────────────────────────────────┘
                                       ▼
        [ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ … ]
                    ↑ barra global — INTOCADA
```

**Por que chips, e não as alternativas:**

| Alternativa | Por que não |
| --- | --- |
| Só cards de categoria na Visão (hub-and-spoke interno) | Trocar de subtópico custaria uma volta à Visão. Quem está comprando alterna entre *Em casa* e *Mochilas* o tempo todo — o pedágio se paga muitas vezes por sessão |
| Abas com painéis em memória (`role="tablist"`) | Mata o endereçamento (P7). O Pilot precisa poder apontar para um kit |
| Navegação empurrada (push + voltar) | Mesmo pedágio do hub, com mais animação |
| Segunda barra inferior | Duas barras empilhadas embaixo. Descartado sem discussão |

**Por que a combinação, e não só chips:** os chips ficam no topo, fora do arco
do polegar. Na primeira visita e no uso de uma mão, o caminho principal são as
**portas da Visão** (bloco 4 do §4), que estão no fluxo de rolagem e ao alcance
do dedo. Os chips são o caminho de repetição, para quem já sabe onde vai. Duas
rotas para o mesmo lugar, cada uma boa num momento diferente — e essa é uma
troca honesta, não um acidente.

**Reaproveitamento, não invenção:** `/comms` já usa exatamente esse padrão
(`wv2-chip` com estado `on`, `app/(app)/comms/page.tsx:483`), e a classe já
existe em `world-v2.css`. A faixa de chips de Preparação deve ser **o mesmo
componente**, não um segundo dialeto.

### 6.2 Comportamento mobile

| Aspecto | Decisão |
| --- | --- |
| Quantidade | 3 na fase 1, 5 no destino. Cinco é o teto — acima disso, a faixa vira uma gaveta disfarçada |
| Estouro horizontal | Cinco rótulos curtos (Visão · Em casa · Mochilas · Plano · Aprender) **estouram a 360px**. Contêiner rolável com `scroll-snap`, chip ativo rolado para dentro na entrada, e o chip ativo **nunca** pode nascer fora da vista |
| Fixo no topo | Sim, grudado abaixo do cabeçalho. Trocar de subtópico depois de rolar é o movimento mais comum, e não pode exigir voltar ao topo |
| Alvo de toque | Mínimo 44×44 — os chips precisam de folga vertical; hoje `wv2-chip` é dimensionado para linha de texto |
| Uma mão | Caminho primário = portas da Visão (dentro da rolagem, ao alcance). Chips = caminho de repetição |
| Estado selecionado | Cor **e** peso — nunca só cor. O verde de acento já tem dono no app (D-131) |
| Semântica | Rotas reais ⇒ `<nav>` + `<a>` + `aria-current="page"`. **Não** usar `role="tab"`: sem painéis em memória, `tablist` mente para o leitor de tela. É o mesmo padrão que `BottomNav` já aplica |
| Voltar | De subtópico → Visão. Com rota real, o voltar do navegador já faz isso de graça, e o Android se comporta sozinho |
| Rolagem | Cada subtópico tem posição de rolagem própria. Voltar para *Em casa* deve devolver onde parou |
| Deep link | Todo subtópico endereçável; kit como parâmetro (`?kit=BUG_OUT`) para o Pilot apontar item salvo |
| Rótulos | Testar antes de fixar — ver §10 e o plano de teste em §6.3 |

### 6.3 Como validar os rótulos antes de escrever código

Dois testes baratos, sem instrumentação:

1. **Teste dos 5 segundos** — mostrar só a faixa de chips por 5 segundos e
   perguntar o que a pessoa espera encontrar em cada um. "Em casa" e "Mochilas"
   passam se as respostas descreverem estoque doméstico e kits portáteis.
2. **Teste de árvore (primeiro clique)** — 6 tarefas, texto puro, sem visual:
   *"Onde você registra que comprou 20 L de água?"* · *"Onde confere se a
   mochila de evacuação está pronta?"* · *"Onde vê quanto tempo a casa aguenta?"*
   · *"Onde aprende a purificar água?"* · *"Onde define o ponto de encontro?"* ·
   *"Onde vê o que está faltando?"*
   Sucesso = acerto no primeiro clique. Abaixo de ~80% num item, o rótulo está
   errado — não a estrutura.

Dez pessoas bastam para pegar rótulo ruim. Não é pesquisa estatística; é rede
de proteção contra vocabulário interno.

---

## 7. FUTURE ROUTE TREE

```text
/preparedness                      Visão — porta do domínio, sem edição
│
├── /preparedness/em-casa          Água · Comida · Combustível · Bateria
│                                  Equipamentos · Dinheiro · itens GERAL
│
├── /preparedness/mochilas         ?kit=BUG_OUT | ACAMPAMENTO | PESCA | CACA
│                                  itens por tier · gerar · editar · excluir
│
├── /preparedness/plano            ← futuro dono de /plan     (não agora)
│
└── /preparedness/aprender         ← futuro dono de /edu      (não agora)
```

Estado dos chips em cada rota:

```text
/preparedness              (•Visão) ( Em casa ) ( Mochilas ) ( Plano ) ( Aprender )
/preparedness/em-casa      ( Visão ) (•Em casa) ( Mochilas ) ( Plano ) ( Aprender )
/preparedness/mochilas     ( Visão ) ( Em casa ) (•Mochilas) ( Plano ) ( Aprender )
```

A barra global permanece idêntica em todas elas — PREPARAÇÃO segue aceso,
porque `BottomNav.isActive` já casa por prefixo de rota
(`pathname.startsWith(href + '/')`, [BottomNav.tsx:114](../components/BottomNav.tsx#L114)).
**Nenhuma sub-rota exige mudança na navegação global.** Isso não é sorte: é a
propriedade que o `docs/35` recomendou preservar.

---

## 8. EXISTING ROUTES THAT SHOULD EVENTUALLY MOVE UNDER PREPAREDNESS

**Não migrar agora.** Registro de propriedade futura apenas.

| Rota | Deveria pertencer a | Por quê | O que trava a migração |
| --- | --- | --- | --- |
| `/plan` | Preparação → Plano | Preparação em tempo de calma, lida em tempo de evento. Mesmo domínio de intenção | É atalho do `manifest.json`. Migrar exige redirecionamento **e** decisão sobre atualizar o manifesto (§10, questão 4) |
| `/edu` | Preparação → Aprender | Só existe para virar tarefa de preparação (`/api/edu/actions`) | Nada trava. É a migração mais barata das duas |
| `/inventory` | — | Já redireciona para `/preparedness`. Deveria passar a apontar para `/preparedness/em-casa` | Nada |
| `/checklist` | — | Já redireciona para `/preparedness`. Deveria apontar para `/preparedness/mochilas` | Nada |
| `/checklist-legacy` | — | Fonte histórica do conceito "Mochilas & Kits". **Ler antes de implementar Mochilas**; retirar depois | Decisão à parte |
| `ChecklistPage.tsx` | Mochilas | Componente desmontado com filtro por kit já implementado | Nada — é ponto de partida, não obstáculo |

---

## 9. FIRST SMALL MIGRATION

### Fase 1 — Extrair Mochilas e criar a faixa de chips

```text
1. Criar /preparedness/mochilas  — checklist com kit como eixo
2. Criar a faixa de chips        — dois chips: Visão · Mochilas
3. Retirar o bloco de checklist  — sai de PreparednessPage
4. Apontar /checklist            — passa a redirecionar para /preparedness/mochilas
```

**Por que este recorte é o primeiro:**

- **É o bloco mais autônomo.** Dados próprios (`/api/checklist`), APIs próprias,
  modais próprios. Não compartilha estado com os cards de recurso, exceto a
  regex de `getInventoryDelta()` — que continua funcionando sem alteração
- **Remove de uma vez ~140 linhas de render** e o bloco mais alto da rolagem
- **Restaura um conceito, não inventa um.** "Mochilas & Kits" já existiu em
  `/checklist-legacy`; dá para comparar comportamento com algo que rodou
- **O componente já está escrito.** `ChecklistPage.tsx`, 323 linhas, com filtro
  por kit, desmontado no repositório
- **A URL já existiu.** `/checklist` é um redirecionamento hoje; reapontá-lo é
  uma linha, e devolve um endereço que já esteve no ar
- **Risco zero para o resto do EOS.** Nada de barra global, MUNDO, FAMÍLIA,
  COMMS, tokens ou bibliotecas
- **Valida a hipótese completa com o menor custo.** Se a faixa de chips
  funcionar com dois chips, funciona com cinco. Se não funcionar, o desfazer é
  reverter um arquivo

### Fases seguintes — cada uma entrega sozinha e é reversível

| Fase | O que faz | Fecha |
| --- | --- | --- |
| **2** | Extrair *Em casa* (6 editores + itens GERAL); terceiro chip | P1, P4 |
| **3** | Transformar a Visão: lista "precisa de atenção" + portas; briefing recolhido | P2, P6 |
| **4** | Endereçar kits e modais (`?kit=`, item em foco) | P7 |
| **5** | Trazer `/edu` para *Aprender*; quarto chip | P5 |
| **6** | Trazer `/plan` para *Plano*; quinto chip — **depende da questão 4 do §10** | — |
| **7** | Renomear `inventory.*` para o vocabulário de Preparação | P8 |

**Nenhuma fase começa sem decisão registrada** em `docs/08-decisions-log.md`
— Regras 6 e 7 do `AGENTS.md`.

---

## 10. OPEN QUESTIONS

Só o que precisa de decisão de produto — nada que dê para resolver lendo código.

**1. Os 7 campos numéricos e os itens `GERAL` são o mesmo objeto?**
Hoje `getInventoryDelta()` ([:301](../components/world-v2/PreparednessPage.tsx#L301))
faz o item do checklist **escrever** no campo numérico. Marcar "Água 4 L" define
`water_liters = 4` — sobrescrevendo, não somando. Se a pessoa tem 20 L em casa e
marca um item de 4 L, o estoque **cai para 4**.
Decidir: os campos são o resumo dos itens (e devem ser derivados), ou são uma
declaração independente (e a escrita automática precisa acabar)? A resposta
define se *Em casa* é uma tela ou duas.

**2. O plano entra na nota de prontidão?**
Hoje a nota é 100% suprimentos (água 30, comida 25, bateria 20, kit 15, comms 10).
Se Plano vira subtópico de Preparação, "ter um plano lido e confirmado" deveria
valer pontos? `lib/plan-*.ts` já calcula lacunas — o dado existe. É decisão de
produto, não de arquitetura.

**3. Os kits automáticos são um kit ou uma caixa de entrada?**
`PILOT_RECOMMENDATION`, `EDU_CONTENT` e `SIMULATION_DEBRIEF` são valores de
`kit_type` que **não são mochilas** — são procedências. Viram um chip "Sugestões"
dentro de Mochilas, ou o item deve escolher um kit de verdade no momento em que
é salvo?

**4. Pesca, Caça e Acampamento são preparação ou lazer?**
Estão no `KITS` e são alimentados pelas recomendações de atividade de `/weather`.
Se são lazer, "Mochilas" carrega dois propósitos e talvez precise separar
*kits de emergência* de *kits de atividade*. Se são preparação (o argumento é
que o equipamento é o mesmo), ficam juntos. Isso muda a redação, não a estrutura.

**5. Migrar `/plan` custa um atalho do PWA?**
`manifest.json` aponta para `/plan`. Um redirecionamento resolve para todo mundo,
mas mantém um endereço antigo vivo para sempre; atualizar o manifesto é mais
limpo e pode exigir reinstalação para parte dos usuários já instalados.
Aceitável, ou `/plan` deve manter o endereço definitivamente?

---

## Anexo — o que este documento não decide

- **Layout de tela.** Onde cada bloco fica, tamanho, espaçamento: é desenho de
  tela, não arquitetura de informação
- **Redação final dos rótulos.** "Em casa" e "Mochilas" são recomendações
  testáveis (§6.3), não texto aprovado
- **Visual.** Nenhum token, cor ou tipografia foi proposto
- **Qualquer coisa fora de `/preparedness`.** MUNDO, FAMÍLIA, COMMS e a barra
  global seguem intocados, como pedido
