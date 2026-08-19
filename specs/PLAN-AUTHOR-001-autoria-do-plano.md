# SPEC — PLAN-AUTHOR-001: Autoria do Plano (integridade do rascunho)
Version: 1.0 | Status: **Ready** | Author: Paulo Neto

> Regra 1: nenhum código antes de Ready. Este spec está Ready.
> Regra 4: se a implementação revelar algo não coberto, **pare** e atualize o spec.
> Regra 5: critérios binários. Sem "parcialmente implementado".

---

## 1. Objetivo

Fazer a superfície de autoria do plano — `/preparedness/plano`, `PlanPage.tsx` —
cumprir a tese que a própria feature declara: **o plano precisa funcionar
exatamente quando o EOS não funciona** (`docs/18` §2).

Hoje ela é o único lugar da feature onde nada sobrevive a nada. Este spec fecha
dois P0 e dois P1 identificados na crítica de 2026-08-19. O AUTHOR-T02 é
**correção de defeito vivo**, não portão de trabalho futuro — ver §2.1.

---

## 2. Contexto

Origem: `.impeccable/critique/2026-08-19T15-17-30Z__components-world-v2-planpage-tsx.md`.
Design Health 22/40. A varredura determinística deu zero achados e foi validada
com controles positivos — nenhum dos problemas abaixo é do tipo que um detector
pega.

### 2.1 O dano já ocorreu — isto é conserto, não prevenção

A primeira versão deste spec tratava a EXEC-T01 como trabalho futuro a
sequenciar. Está errado, e a correção muda a urgência do AUTHOR-T02.

`20260819045025_exec_t01_circle_places.sql` foi **aplicada pelo dono em
2026-08-19** (`docs/09-build-status.md`), e EXEC-T02 a EXEC-T06 foram construídas
em cima dela. A migração marca **todo** waypoint legado como
`precision: 'unknown'` (PLAN-EXEC-001 §5.2). A UI de autoria desabilita
`Confirmar` enquanto a precisão for `unknown` — `PlanPage.tsx` inicializa o
picker com `existing?.precision ?? 'unknown'` e desabilita o botão nesse estado.

Somando: o acervo inteiro de pontos legados do usuário **já está** no estado que
a tela se recusa a confirmar, e a própria tela oferece `Confirmar no mapa`
justamente para esses pontos. O caminho que ela indica termina num botão cinza.

Não é intransponível — o select "Confiança da coordenada", mais abaixo na folha,
destrava. É silenciosamente bloqueado, que é pior de diagnosticar. Por isso o
AUTHOR-T02 vem **primeiro** no faseamento, à frente do rascunho persistente:
custa uma linha e uma frase, e está doendo agora.

### 2.2 A cena

23h, véspera, cansado, cônjuge ouvindo pela metade, vinte minutos antes de
dormir. Possivelmente offline, possivelmente com 8% de bateria. Os princípios de
autoria estão em PLAN-EXEC-001 §4.0.1.

---

## 3. Comportamento Esperado

### 3.1 O rascunho sobrevive (P0)

Toda alteração no rascunho é persistida localmente, com debounce, chaveada por
`(circleId, planId)`. O rascunho sobrevive a: navegação pela `PreparednessNav`,
troca de plano, troca de círculo, `+ Novo plano`, recarga da página e fechamento
do app.

Ao reabrir um plano com rascunho local mais novo que o servidor, a tela declara
o estado — *"você tem alterações não salvas desde <hora>"* — e oferece **continuar
editando** ou **descartar**. Descartar é sempre explícito e nunca automático.

O cabeçalho passa a mostrar um estado de rascunho: `salvo` · `alterações não
salvas` · `salvando`.

### 3.2 O ponto marcado no mapa é confirmável (P0)

`onPick` vindo do mapa grava `precision: 'address'`.

**Não `'gps'`.** `precisionLabel` renderiza `'gps'` como *"marcado no local"*
(`lib/family-plan.ts`), e quem solta um pino no mapa do sofá não estava no local.
Gravar `'gps'` faria a carta do ponto de encontro afirmar presença física que não
houve — exatamente o tipo de procedência falsa que §5.2 da PLAN-EXEC-001 existe
para impedir, e que leva uma família a concluir que pode ir a pé até onde não
pode. `'address'` confirma a coordenada sem inventar a presença.

Regra geral, acima do caso: **nenhum estado de precisão bloqueia a confirmação de
uma coordenada que existe.** `Confirmar` só fica desabilitado por ausência de
coordenada. Quando desabilitado, a tela diz o motivo — nunca fica cinza em
silêncio.

Ponto com `precision: 'unknown'` é usável: rumo e distância são calculados e
exibidos, e a tela o marca como não confirmado, oferecendo `Confirmar no mapa`.

### 3.3 A faixa de "o plano mudou" não some ao digitar (P1)

`needsAck` deixa de depender de `!dirty`. A faixa permanece visível enquanto o
ack não for dado, mesmo com o rascunho sujo, e `acknowledge()` continua
alcançável.

`save()` passa a enviar a versão esperada. Se o servidor estiver à frente, a
gravação é **recusada** com conflito, e a tela mostra o que mudou antes de
oferecer qualquer caminho. `docs/18` §6.5: *divergência nunca é resolvida
silenciosamente.*

### 3.4 Erro de gravação diz o que aconteceu (P1)

`save()` para de colapsar 403/404/409/500 em "Verifique a conexão". Cada classe
tem mensagem própria — sem permissão, plano removido, conflito de versão, falha
do servidor — e o texto real retornado pela API não é descartado.

---

## 4. Data Contract

Nenhuma alteração de schema. Apenas armazenamento local:

```
IndexedDB · store 'plan_drafts'
  key: `${circleId}:${planId}`
  value: { document, baseVersion, updatedAt }
```

`baseVersion` é a versão do servidor sobre a qual o rascunho foi construído. É
ela que `save()` envia como versão esperada (§3.3).

---

## 5. Regras de Negócio

1. **Nenhum controle da página descarta trabalho em silêncio.**
2. **Descartar rascunho é sempre ato explícito do usuário.**
3. **Precisão nunca bloqueia confirmação** de coordenada existente (§3.2).
4. **Controle desabilitado declara o motivo.** Nenhum estado cinza mudo.
5. **Gravação com versão desatualizada é recusada**, nunca mesclada em silêncio.
6. **A mensagem de erro do servidor é preservada**, nunca substituída por um
   genérico de conectividade.

---

## 6. Critérios de Aceitação

**AUTHOR-T01 — rascunho persistente**
- [ ] Editar, navegar pela `PreparednessNav` e voltar preserva 100% do rascunho.
- [ ] Trocar de plano, trocar de círculo e `+ Novo plano` preservam o rascunho anterior.
- [ ] Recarregar a página preserva o rascunho.
- [ ] Reabrir com rascunho mais novo que o servidor exibe a escolha continuar/descartar.
- [ ] O cabeçalho distingue `salvo` de `alterações não salvas`.

**AUTHOR-T02 — confirmar ponto**
- [ ] Marcar no mapa e voltar deixa `Confirmar` habilitado.
- [ ] Ponto marcado no mapa grava `precision: 'address'`, nunca `'gps'`.
- [ ] Nenhum valor de `precision` desabilita `Confirmar` quando há coordenada.
- [ ] `Confirmar` desabilitado sempre exibe o motivo.

**AUTHOR-T03 — ack e conflito**
- [ ] A faixa de "o plano mudou" permanece visível com o rascunho sujo.
- [ ] `acknowledge()` é alcançável depois de digitar.
- [ ] Salvar sobre versão desatualizada é recusado e mostra o que mudou.

**AUTHOR-T04 — erro**
- [ ] 403, 404, 409 e 500 produzem quatro mensagens distintas.
- [ ] A mensagem do servidor aparece quando existe.

---

## 7. Fora do Escopo

Registrado, não esquecido — a crítica levantou e fica para spec própria:

- Reestruturar as ~14 cartas em progressão por estado do plano (§4.0.1 princípio 2).
- Ação de salvar fixa, alcançável sem rolar (princípio 4).
- Suprimir sugestões do Pilot em rascunho vazio (princípio 3).
- Acessibilidade dos três diálogos: `aria-modal`, foco preso, `Escape`, e o scrim
  que hoje é um `<button>` do tamanho da viewport antes do diálogo no DOM.
- Correção dos rótulos acessíveis dos selects de papel.
- Substituir a semântica de "Salvar plano" por "Combinar com a família"
  (publicar em vez de persistir). **Depende de AUTHOR-T01**: sem camada de
  rascunho, semântica de publicação piora a perda de trabalho.
- Medição de viewport a 390 px: overflow, sobreposição e alvos de toque
  continuam **não medidos** — a crítica não obteve evidência de browser.

---

## 8. Faseamento

| Fase | Entrega |
|---|---|
| **AUTHOR-T02** | Confirmação de ponto desbloqueada — **primeiro: defeito vivo** (§2.1) |
| **AUTHOR-T01** | Rascunho persistente em IndexedDB + estado no cabeçalho |
| **AUTHOR-T03** | Ack persistente + guarda de versão no save |
| **AUTHOR-T04** | Taxonomia de erro de gravação |

A numeração das fases é a de origem e não muda; a ordem de execução, sim. O
AUTHOR-T02 custa uma linha e conserta o acervo inteiro de pontos legados; o
AUTHOR-T01 é a peça grande. Trocar a ordem entrega o alívio antes do esforço.
