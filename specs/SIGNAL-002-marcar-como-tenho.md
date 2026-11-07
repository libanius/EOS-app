# SPEC — SIGNAL-002: Marcar como tenho (o item do Sinal grava na casa)
Version: 1.0 | Status: **Ready** (decisões do dono em 2026-11-07, §9) | Author: Paulo Neto
Depende de: SIGNAL-001 (Ready), CONTENT-001 (Ready), docs/37 §15–§19 e §26

> Regra 3: os edge cases estão aqui (§7) e não devem ser descobertos no código.
> Regra 4: se a implementação revelar algo que este spec não cobre, **pare** e atualize o spec antes de continuar.
> Rule 7 (spine-first): a migração da §4.1 atualiza `docs/06` e `docs/37` §18 no mesmo PR, antes do código.

---

## 1. Objetivo

Hoje a lista do Sinal só **lê** o que a casa tem. O dono testou no iPhone e
esperava o contrário: tocar no item e registrar a aquisição, uma vez só, para o
app inteiro.

Este spec faz do item do protocolo um **ponto de registro**:

- tocar abre três respostas: **Tenho**, **Ainda não tenho** e **Não se aplica
  à minha casa**;
- a resposta grava no motor que já existe (`requirements` e
  `resource_inventory`), e não numa tabela nova dos Sinais;
- vale para a **casa toda**: qualquer conta confirmada da casa vê o item como
  a casa respondeu;
- todo Sinal que pede o mesmo recurso enxerga a resposta. A lanterna marcada
  no FORTRESS já conta no protocolo de furacão.

Este spec **substitui** a "adoção em bloco" do SIGNAL-001 §3.5 e §3.6: a
família adota item a item, no momento em que tem a coisa na mão.

---

## 2. O que já existe e é reusado

| Peça | Onde | Papel aqui |
|---|---|---|
| `requirements` (linha de base: `kit_id` e `scenario_id` nulos) | docs/37 §17, `lib/requirements.ts` | Onde "tenho / não tenho / não se aplica" fica gravado para itens de ter ou não ter. Chave natural `(profile_id, resource_key, kit, cenário)`. |
| Transições de estado | `lib/acquisition.ts` | O usuário pode ir a `met`, `needed` e `not_applicable` (§5.3). |
| `resource_inventory` | `POST /api/inventory` | Água (`water_liters`) e comida (`food_days`) da conta, mais as duas marcas antigas `has_medical_kit` e `has_communication_device`. |
| Casa | `lib/household.ts` | Quem mora junto (contas com `household_status = 'confirmed'`). A água e a comida da casa já são a soma das contas. |
| Leitura do Sinal | `protocolView()` em `lib/signals.ts` | Continua a mesma: recebe a casa e as chaves `met` / `not_applicable`. Muda só **de onde** vêm essas chaves. |

---

## 3. Comportamento

### 3.1 O toque

Tocar no **círculo** ou no **nome** de um item do protocolo abre uma folha que
sobe da parte de baixo da tela. A folha tem:

- o nome do item e a dica;
- o estado da casa hoje, em palavras: "A casa tem", "A casa ainda não tem",
  "Não se aplica à casa" ou "Ainda sem resposta";
- quem respondeu por último, quando foi outra conta: "Marcado por Daniela, há 2
  dias";
- os botões descritos em §3.2 ou §3.3;
- **Fechar**, que não grava nada.

A explicação das cores (o tooltip atual do círculo) sai do círculo e vai para o
título da lista, porque o toque agora tem outra função.

### 3.2 Itens de ter ou não ter (`kind = PRESENCE`)

Três botões grandes, um embaixo do outro:

| Botão | Grava (na linha de base da **minha** conta) |
|---|---|
| **Tenho** | `status = 'met'` |
| **Ainda não tenho** | `status = 'needed'` |
| **Não se aplica à minha casa** | `status = 'not_applicable'` |

- Sem linha de base para o `resource_key`: cria uma com
  `provenance = 'PROTOCOL'` e `provenance_ref = '<slug do Sinal>'`.
- Com linha existente: atualiza só `status` e `updated_at`, e **preserva**
  `provenance` e `provenance_ref` (D-161: duas fontes atualizam, não duplicam).
- Itens com marca antiga no inventário: `kit-medico` grava também
  `has_medical_kit`, e `radio-comunicacao` grava `has_communication_device`, na
  minha conta. Tenho = `true`; as outras duas respostas = `false`. Assim o
  Painel e o Pilot, que ainda leem essas marcas, enxergam a mesma coisa.

A folha fecha, o círculo muda na hora e a mensagem "Registrado para a casa"
aparece por alguns segundos.

### 3.3 Água e comida (`ENGINE_WATER`, `ENGINE_FOOD`)

Não há "Não se aplica": água e comida são a base da autonomia (D-129).

**Água.** A folha mostra:

- "Casa hoje: **X L** (Y galões)", a soma de todas as contas;
- "O seu registro", um campo numérico com a quantidade **que você tem agora**,
  com a escolha **litros / galões** (padrão: galões, com a conversão para
  litros embaixo);
- **Salvar**, que grava `water_liters` da minha conta, sempre em litros
  (D-158). Substitui o valor anterior, nunca soma.

**Comida.** A folha mostra:

- "Casa hoje: **N refeições**";
- "Para quantos dias a comida que você guarda alimenta quem você cobre?", em
  dias, com a equivalência em refeições logo abaixo ("= 36 refeições");
- **Salvar**, que grava `food_days` da minha conta, com a mesma unidade da tela
  O que tenho.

Numa casa de uma conta só, "a sua parte" e "a casa" são o mesmo número, e a
folha mostra uma linha só.

### 3.4 Leitura da casa

A página do Sinal deixa de ler `/api/checklist` (só a minha conta) e passa a
ler **`GET /api/signals/house-state`**, que devolve o estado da casa por
`resource_key`:

- considera as linhas de base de **todas as contas confirmadas da casa**;
- para cada `resource_key`, **vale a resposta mais recente** (`updated_at`),
  de qualquer conta: "a última palavra da casa vale";
- devolve também quem respondeu (nome e se sou eu) e quando.

`protocolView()` recebe as chaves `met` e `not_applicable` calculadas assim. A
conta de autonomia não muda: água e comida já são da casa.

### 3.5 Onde a resposta aparece

| Lugar | O que vê |
|---|---|
| Todos os Sinais | A resposta da casa (§3.4). |
| O que falta / checklist da conta que marcou | A linha gravada, com o selo "via Sinal" quando ela nasceu do Sinal. |
| Painel, autonomia, Pilot | Água, comida e as duas marcas antigas, que já são da casa. |
| Pilot | As linhas de `requirements` da conta que conversa, como hoje. |

As outras contas da casa **não** passam a ver as linhas umas das outras no "O
que falta" nem no Pilot: isso é mudar a leitura de `requirements` no app
inteiro, e fica fora deste spec (§10).

### 3.6 Desfazer

A mesma folha. "Tenho" errado se corrige com "Ainda não tenho". Não há botão
separado de desfazer.

### 3.7 Onde o toque não grava

- **Prévia do admin** (`/admin/content`): a folha abre só para leitura, com o
  aviso "Prévia: respostas não são gravadas".
- **Sinal arquivado**: a folha abre só para leitura, com "Sinal arquivado em
  <data>" (SIGNAL-001 E8).
- **Casa desconhecida** (sem pessoas cadastradas): a folha de água e comida
  mostra "Conte quem mora na casa primeiro" e o link para Família.

---

## 4. Data Contract

### 4.1 Migração

```sql
-- requirements.provenance ganha PROTOCOL (SIGNAL-001 §4.3, docs/37 §18)
ALTER TABLE requirements DROP CONSTRAINT <check atual de provenance>;
ALTER TABLE requirements ADD CONSTRAINT requirements_provenance_check
  CHECK (provenance IN ('MANUAL','PILOT','EDU','SIMULATION','OFFICIAL_ALERT','PLAN_GAP','PROTOCOL'));
```

Aditiva: nenhum valor existente muda. `lib/requirements.ts` ganha `PROTOCOL` no
tipo de origem.

### 4.2 `GET /api/signals/house-state`

Autenticado. Usa o cliente service-role **só** para ler as linhas das contas
confirmadas da casa (mesma regra de `lib/household.ts`, D-123).

```json
{
  "accounts": 2,
  "items": {
    "lanterna": {
      "status": "met",
      "updatedAt": "2026-11-07T15:02:11Z",
      "by": { "name": "Daniela", "isMe": false },
      "provenance": "PROTOCOL"
    }
  }
}
```

Só linhas de base (`kit_id` e `scenario_id` nulos). `proposed` não entra: é
sugestão, não resposta da casa.

### 4.3 `POST /api/signals/items`

Autenticado.

```json
{ "slug": "fortress", "resourceKey": "lanterna", "answer": "have" }
```

`answer`: `have` → `met`, `need` → `needed`, `not_applicable` →
`not_applicable`.

| Resposta | Quando |
|---|---|
| 200 + o novo estado da casa para a chave | gravado |
| 400 | corpo inválido |
| 401 | sem login |
| 404 | Sinal não publicado, ou chave fora do protocolo dele |
| 409 | Sinal arquivado |
| 422 | a chave é de água ou comida (essas usam §4.4) |

### 4.4 Água e comida

Sem rota nova: `POST /api/inventory` com `{ water_liters }` ou `{ food_days }`,
como a tela O que tenho já faz.

### 4.5 Funções puras

- `houseItemStates(rows, me)`: das linhas de base de várias contas, a mais
  recente por `resource_key`, sem `proposed`.
- `answerToStatus(answer)` e o inverso.
- Conversão de galões: `gallonsToLiters` / `litersToGallons` de `lib/units.ts`
  (fator `LITERS_PER_GALLON`, D-158). Nenhuma conversão nova.

---

## 5. Regras de Negócio

1. **Uma resposta, um lugar.** A resposta grava no `requirements` e no
   `resource_inventory` que o app já usa. Nenhuma tabela própria dos Sinais.
2. **A casa responde junto.** A leitura dos Sinais considera todas as contas
   confirmadas, e a resposta mais recente vale.
3. **Grava sempre na minha conta.** Nenhuma conta escreve na linha de outra
   (RLS). A casa enxerga junto porque a **leitura** soma, não porque a escrita
   cruza contas.
4. **Transições.** Toda resposta do usuário é permitida pela tabela de
   `lib/acquisition.ts`, passando por `needed` quando o caminho direto não
   existe (`met` → `needed` → `not_applicable`). A gravação é uma só, com o
   estado final.
5. **A origem se preserva.** Linha criada pelo Sinal: `PROTOCOL` +
   slug. Linha que já existia: mantém a origem dela.
6. **Água e comida substituem, nunca somam** ("quanto tem agora", decisão do
   dono).
7. **Galão é unidade de tela.** O banco guarda litros (D-158).
8. **Prévia e arquivo não gravam.**

---

## 6. Interface

- Folha com cantos arredondados no topo, fundo `--sg-surface2` e linguagem dos
  Sinais (D2).
- Botões com 56 px de altura no mínimo e texto de 17 px ou mais
  ("precisa respirar").
- Foco vai para o título da folha ao abrir; `Esc` e o fundo escuro fecham;
  `aria-modal`.
- Toque na linha inteira do item abre a folha, não só no círculo.
- Ao gravar: o círculo anima para o novo estado (sem animação com
  `prefers-reduced-motion`).

---

## 7. Edge cases

| # | Situação | Comportamento |
|---|---|---|
| E1 | Eu marco "Tenho" e a Daniela, depois, "Ainda não tenho" | A casa lê "ainda não tem", "marcado por Daniela". A última palavra vale. |
| E2 | Marco "Tenho" e já existe a linha da lanterna vinda do Pilot | Atualiza o status; a origem continua `PILOT`. |
| E3 | Item com marca antiga (kit médico) registrado em O que tenho por outra conta, e eu marco "Ainda não tenho" | Minha marca vira `false`, a dela continua `true`, e o Sinal mostra **tenho**, com a dica "registrado no inventário da casa". Quem tem a coisa física decide. |
| E4 | Toque duplo rápido | Se a resposta atual da casa já é a mesma, a segunda gravação não muda nada (idempotente). |
| E5 | Sem rede ao gravar | O círculo volta ao estado anterior e aparece "Não foi possível gravar. Tente de novo." |
| E6 | Sinal arquivado | Folha só leitura (§3.7). |
| E7 | Chave que não está no protocolo (requisição forjada) | 404, nada gravado. |
| E8 | Água: digita 10 galões | Grava 37,85 L; a tela mostra "10 gal (37,9 L)". |
| E9 | Água ou comida vazia ou negativa | Salvar fica desabilitado; o servidor recusa negativos (já recusa). |
| E10 | Casa com uma conta só | Folha mostra uma linha só: "Você tem". |
| E11 | A mesma lanterna aparece em dois Sinais | Os dois mostram a mesma resposta: a chave é o `resource_key`, não o Sinal. |
| E12 | Linha em `proposed` (sugestão do Pilot) e eu respondo "Tenho" | `proposed` → `needed` → `met`, uma gravação; a origem continua a do Pilot. |
| E13 | Prévia do admin | Folha abre; botões desabilitados com o aviso. |
| E14 | Tela de 320 px | A folha cabe; os botões quebram linha sem cortar texto. |
| E15 | Eu marquei "Tenho", a Daniela depois "Ainda não tenho", e eu marco "Tenho" de novo | Minha linha já está em `met`, mas a casa lê `needed`: a gravação acontece e renova o `updated_at` da minha linha, e a casa volta a ler "tem", marcado por mim. |
| E16 | Kit médico ou rádio: a resposta muda a marca antiga do inventário | A página relê o inventário da casa logo depois; o círculo e o "% pronto" refletem a marca nova sem recarregar. |

---

## 8. Critérios de Aceitação

1. Tocar no círculo **ou** no nome de um item abre a folha com o estado da casa.
2. Em item de ter ou não ter, "Tenho" grava `met` numa linha de base da minha conta e o círculo fica verde sem recarregar a página.
3. "Ainda não tenho" grava `needed`; "Não se aplica" grava `not_applicable`; o círculo e o "% pronto" mudam na hora.
4. Sem linha anterior, a linha criada tem `provenance = 'PROTOCOL'` e `provenance_ref` = slug do Sinal.
5. Com linha anterior de outra origem, a origem e o `provenance_ref` continuam iguais depois da resposta.
6. Com duas contas confirmadas na casa, a resposta de uma aparece na página do Sinal da outra, com o nome de quem respondeu.
7. Entre duas respostas diferentes da casa para a mesma chave, vale a mais recente — inclusive quando quem responde por último já tinha essa mesma resposta na própria linha (E15).
8. "Tenho" no kit médico liga `has_medical_kit` da minha conta; "Ainda não tenho" desliga; a página mostra o novo estado da casa sem recarregar (E16).
9. Água: salvar 10 galões grava 37,85 L em `water_liters` da minha conta (±0,01) e a autonomia da página muda na hora.
10. Comida: salvar N dias grava `food_days = N` da minha conta, e a casa passa a ler o novo total.
11. A mesma chave respondida no FORTRESS aparece igual em outro Sinal que tenha o mesmo `resource_key`.
12. `POST /api/signals/items` responde 404 para uma chave fora do protocolo, 409 para Sinal arquivado e 422 para água/comida, sem gravar nada.
13. Na prévia do admin, nenhuma resposta grava (nenhuma chamada de escrita sai).
14. A explicação das cores fica legível no título da lista, em 390 px e em 320 px.
15. A migração roda duas vezes sem erro e não altera nenhuma linha existente.
16. `docs/06` e `docs/37` §18 citam `PROTOCOL` no mesmo PR da migração.

---

## 9. Decisões do dono (2026-11-07)

| # | Pergunta | Decisão |
|---|---|---|
| D-M1 | Quem vê o item marcado | **A casa toda** (contas confirmadas). A resposta mais recente vale. |
| D-M2 | O que o toque faz | **Abre três opções**: Tenho / Ainda não tenho / Não se aplica à minha casa. |
| D-M3 | Água e comida | **Quanto tem agora**: o valor substitui, nunca soma. |

---

## 10. Fora do Escopo

- Contas da casa enxergarem as linhas umas das outras fora dos Sinais (O que
  falta, checklist, Pilot): mudar a leitura de `requirements` no app inteiro é
  um spec próprio.
- Histórico de aquisições com data e porquê na linha do tempo da Base
  (HOLDING-HISTORY-001).
- Quantidade para itens de ter ou não ter ("3 lanternas"): o protocolo pede
  presença.
- Local físico do item (casa, carro, mochila): `location_scope` continua nulo.
- Adoção em bloco do protocolo (SIGNAL-001 §3.5), substituída por este spec.
- Notificar as outras contas quando alguém responde.

---

## 11. Tarefas

| Task | Entrega |
|---|---|
| SIGNAL-002-T01 | Migração `PROTOCOL` + docs 06 e 37 §18 |
| SIGNAL-002-T02 | Funções puras (§4.5) com testes |
| SIGNAL-002-T03 | `GET /api/signals/house-state` e `POST /api/signals/items` com testes |
| SIGNAL-002-T04 | Folha do item na página do Sinal (§3, §6) e leitura pela casa |
| SIGNAL-002-T05 | Conferência em 390 e 320 px; critérios 1–16 |
