# 19 — Cenário: o Simulador do EOS

> Status: **IMPLEMENTADO E EM PRODUÇÃO** (SIM-T00→T11, exceto extensões futuras)
> Date: 2026-07-27 · última atualização 2026-08-03
> Decisões: **D-067** (simulador), **D-071** (treino compartilhado), **D-072** (escolher círculos + link de convite).
> Planos da família: **D-066** / doc 18. Pilot: **D-046** / doc 15.
> SIM-T09 concluído em D-094: texto livre preenche painéis revisáveis via OpenAI.

---

## 1. Origem

A aba Cenário existe hoje como um analisador de pergunta única: descreva uma
situação, receba um plano. É útil, mas é consulta — não treino.

O dono definiu o que ela deve ser: **um simulador**, no sentido aeronáutico
estrito. Um aluno de aviação não lê sobre pane de motor; ele entra na cabine,
configura o cenário, e o avião inteiro passa a se comportar como se fosse
verdade. Os instrumentos não sabem que é mentira.

> **"O usuário digita que está chegando um furacão categoria 3, e o app inteiro
> responde de acordo com o ambiente selecionado."**

---

## 2. O princípio

> **Mesmos instrumentos. Entradas injetadas.**

O EOS não ganha uma tela de simulação. O EOS **inteiro** entra em modo simulado:
o índice de risco, o Pilot, a autonomia, os alertas, o mapa. Se a simulação
vivesse só dentro da aba Cenário, seria uma demonstração — e o valor de um
simulador está justamente em treinar nos instrumentos reais, sob a interface
real, com a família real.

---

## 3. Arquitetura: injetar no provider, não nas telas

O `RiskProvider` já é o ponto único por onde toda tela lê estado: dashboard,
Pilot, ilha de risco, autonomia. Isso resolve a arquitetura quase de graça.

```
                    ┌── REAL: weather-intelligence, /api/monitor, hazards
   useRisk()  ◄── RiskProvider ──┤
                    └── SIMULADO: cenário configurado pelo usuário
```

**Consequência**: um único ponto de indireção coloca o app inteiro em simulação.
Nenhuma tela precisa saber que a simulação existe — exatamente como nenhum
instrumento do avião sabe que está no simulador.

O que a simulação sobrepõe: `snapshot` (clima, alertas, terremotos), `score`,
`state`, e — quando o painel de recursos é usado — os números de autonomia.

---

## 4. Painéis de configuração

Como um briefing de simulador. Nada é obrigatório; o que não for configurado usa
o valor real da família.

| Painel | Injeta |
|---|---|
| **Ameaça** | Tipo, categoria/severidade, distância, chegada em X horas |
| **Clima** | Vento sustentado, rajada, chuva, visibilidade, maré |
| **Recursos** | "E se tivéssemos só 1 dia de água?" — sobrepõe o inventário |
| **Saúde** | Membro ferido, medicação acabando, mobilidade reduzida |
| **Infraestrutura** | Luz cortada, sem rede, estrada bloqueada, sem combustível |
| **Posição** | "E se estivéssemos na casa da praia?" |
| **Instrumentos** | Cada fonte de dados: **ao vivo**, **simulada** ou **fora do ar** |

### 4.1 O painel de instrumentos

Toda fonte que o EOS consome — clima, alertas oficiais, radar, qualidade do ar,
sismos, abrigos e posição da família — pode ser voada em três modos:

| Modo | O que acontece |
|---|---|
| **Ao vivo** | O dado real continua passando, mesmo com o cenário rodando |
| **Simulado** | O valor configurado substitui o real |
| **Fora do ar** | A fonte some, e o app fica genuinamente cego para ela |

**"Fora do ar" é o motivo deste painel existir.** O EOS é um produto de operação
degradada; o treino que mais importa não é "vem um furacão", é **"vem um furacão
e o feed de clima morreu"**. Um simulador de voo deixa você falhar um
instrumento — este também.

Quando uma fonte cai, o Pilot recebe a lista de instrumentos mortos e é
instruído a **nomear a cegueira** e orientar sem ela (rádio a pilha, vizinhos,
sinais físicos), nunca a inventar o que a fonte diria.

Entrada em **linguagem natural também é válida** ("furacão categoria 3 chegando
em 12 horas") — o Pilot traduz para os painéis, e o usuário vê e ajusta o que foi
inferido antes de rodar. Inferência que ninguém revisa não é configuração.

---

## 5. Segurança — as travas inegociáveis

Esta é a feature mais perigosa que o EOS pode ter. Uma família que esquece que
está simulando, ou um alerta real chegando por trás de um furacão fictício, é a
falha que mata. Simulador de voo resolve isso com disciplina brutal, e aqui é
igual.

1. **Alerta real crítico encerra a simulação na hora (D-067).** A sessão é
   abortada, o app volta ao estado real, o alerta ocupa a tela. É abrupto de
   propósito: ameaça real nunca disputa atenção com ficção.
2. **Cromo impossível de ignorar.** Faixa persistente em todas as telas enquanto
   a simulação roda — não um badge discreto. O usuário nunca deve precisar
   lembrar em que modo está.
3. **Expiração automática.** A sessão morre ao recarregar o app e por
   inatividade. Modo simulado nunca é um estado que se herda sem saber.
4. **Zero escrita em dado real durante a sessão.** Sem alterar inventário, sem
   push para o círculo, sem gravar localização, sem tocar no checklist.
5. **Saída sempre a um toque**, de qualquer tela.

---

## 6. O Pilot em simulação

Aqui está a reconciliação com **D-062.1**, que fez o Pilot local, síncrono e
offline de propósito.

| | Emergência real | Simulação |
|---|---|---|
| Motor | `pilot-engine.ts` local e determinístico | Modelo + RAG sobre a base completa |
| Por quê | A rede é a primeira coisa a cair | Você treina em calmaria, com rede |
| Otimiza | Latência e disponibilidade | Profundidade e fundamentação |

**O simulador é o único lugar do EOS onde um modelo pertence ao caminho
principal.** `/api/analyze` já faz isso: `getRelevantChunks` sobre os 3850 chunks
de FEMA, Cruz Vermelha, OMS e SAS, mais o RulesEngine. O simulador reusa esse
pipeline em vez de criar outro.

Regra herdada: **regra crítica sempre vence o modelo.** Se o RulesEngine diz
`CRITICAL`, nenhuma resposta gerada pode suavizar isso.

---

## 7. Ciclo de uma sessão

```
BRIEFING → CONFIGURAR → RODAR → INJETAR EVENTOS → DEBRIEF
```

- **Briefing**: o Pilot enquadra a situação a partir da base de conhecimento.
- **Configurar**: painéis (§4), por linguagem natural ou manualmente.
- **Rodar**: o app inteiro entra em modo simulado. A família navega o EOS normal
  e age.
- **Injetar eventos**: avanço no tempo ("+6 horas"), agravamentos ("a energia
  caiu"), curvas. É o que separa um simulador de um cenário estático.
- **Debrief**: o que funcionou, o que faltou, o que teria falhado.

---

## 8. Debrief e escrita confirmada

O valor de um simulador está no debrief, não na corrida.

O debrief produz **lacunas concretas e quantificadas** — "faltaram 40 L de água
para cobrir 3 dias com 4 pessoas", "seu ponto de encontro terciário fica a 14 km:
a pé, com uma criança de 3 anos, são 4 horas".

Cada lacuna pode virar item do checklist real, **com confirmação explícita item a
item** (D-067). Mesma trava do Pilot e de UPP-03: nada muda sozinho. O usuário
perde o controle do próprio plano se a lista muda sem ele perceber.

---

## 9. O simulador testa o plano da família

Conexão direta com **doc 18**: o Plano de Emergência é um compromisso que ninguém
nunca exercitou. O simulador é **como se testa o plano**.

Rodar um cenário com o plano ativo permite ao debrief responder perguntas que
nenhuma outra tela pode:

- O ponto de encontro é alcançável nas condições simuladas?
- Os papéis cobrem todo mundo, ou alguém ficou sem quem o buscasse?
- A rota desenhada atravessa a área de alagamento do cenário?

**Simulado sem plano** é treino individual. **Simulado com plano** é ensaio de
família — e é aí que o EOS deixa de ser informação e vira preparo.

---

## 10. O que já existe vs. o que é novo

| Peça | Estado |
|---|---|
| RAG sobre a base de conhecimento (`lib/knowledge.ts`) | ✅ existe |
| `/api/analyze` com RulesEngine + família + inventário | ✅ existe |
| Tipos de cenário, texto livre, streaming | ✅ existe |
| Painel de monitoramento ao vivo | ✅ existe |
| **Estado de simulação global e injeção no RiskProvider** | 🔴 novo — é o coração |
| **Cromo de simulação + travas de segurança (§5)** | 🔴 novo |
| **Injeção de eventos e avanço de tempo** | 🔴 novo |
| **Debrief com escrita confirmada** | 🔴 novo |
| **Execução contra o plano da família** | 🔴 novo, depende de PLAN-T01 |

---

## 11. Faseamento

| Task | Entrega |
|---|---|
| **SIM-T00** | ✅ Esta spec + decisão (D-067) |
| **SIM-T01** | ✅ `SimulationProvider` + injeção no `RiskProvider` + cromo persistente + travas de segurança (§5) |
| **SIM-T02** | ✅ Painéis de configuração (§4) |
| **SIM-T03** | ✅ Briefing pelo Pilot com RAG, rodar, sair a um toque |
| **SIM-T04** | ✅ Injeção de eventos e avanço de tempo (+3h, +6h, Impacto, cortar luz/rede/vias) |
| **SIM-T05** | ✅ Debrief com lacunas quantificadas + escrita confirmada no checklist |
| **SIM-T06** | ✅ Execução contra o plano da família (`lib/plan-drill.ts`, 2026-07-30). O debrief cobra a decisão e não só o estoque |
| **SIM-T07** | ✅ Drills compartilhados no círculo (D-071) |
| **SIM-T08** | ✅ Painel de instrumentos: cada fonte ao vivo / simulada / fora do ar (§4.1) |
| **SIM-T09** | ✅ Traduzir o texto livre para os painéis, revisável antes de rodar (D-094) |
| **SIM-T10** | ✅ Escolher círculos e convidar de fora por link (D-072) |
| **ONB-T01** | ✅ Convite de simulação preserva contexto no login/signup/onboarding (D-091) |
| **SIM-T11** | ✅ Debrief gera propostas confirmáveis de preparação, com fonte visível e `kit_type=SIMULATION_DEBRIEF` (D-092) |

SIM-T01 primeiro e sozinho: as travas de segurança precisam existir **antes** de
a simulação alcançar o app inteiro, não depois.

---

## 12. Critérios de aceitação

1. Com a simulação ativa, o dashboard, o Pilot e a autonomia refletem o cenário —
   não a realidade.
2. Em nenhum momento o usuário consegue olhar para o app e não saber que está
   simulando.
3. Um alerta real crítico durante a sessão a encerra e mostra o alerta real.
4. Ao recarregar o app, a simulação não existe mais.
5. Nenhum dado real da família foi alterado sem um toque de confirmação.
6. O debrief cita números, não conselhos genéricos.
