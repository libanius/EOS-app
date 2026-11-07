# SPEC — INVENTORY-001: Estoque único da casa
Version: 1.3 | Status: **Ready** (revisado pelo dono em 2026-11-07, §2) | Author: Paulo Neto
Depende de: docs/37 §13–§19 (Holding × Requirement), PREP-T04 (tabelas `holdings` e `locations`, aplicadas), SIGNAL-002 (Done)

> Regra 3: os edge cases estão aqui (§7) e não devem ser descobertos no código.
> Regra 4: se a implementação revelar algo que este spec não cobre, **pare** e atualize o spec antes de continuar.
> Rule 7 (spine-first): a migração da §4.1 atualiza `docs/06` e `docs/37` §15–§16 no mesmo PR, antes do código.

---

## 1. Objetivo

A essência do EOS é o Pilot opinar e sugerir. Para isso, **o que a casa tem
precisa ser uma coisa só, em todas as telas**. São muitas telas, mas poucos
produtos: se a casa diz que tem água, o Sinal, a Preparação, o Pilot, a análise
e a Família leem o mesmo número.

Hoje isso não acontece. A verdade está em dois lugares:

- `resource_inventory`: uma linha por conta, com 7 números (litros de água,
  dias de comida, "tem kit médico" etc.). É o que **todas** as telas leem.
- `requirements` com `status = met`: o "tenho" respondido no Sinal ou no
  checklist. Não diz marca, quantidade nem onde está.

`holdings` e `locations` existem desde PREP-T04, mas só recebem uma cópia dos
7 números (backfill de agosto, 17 linhas). Ninguém escreve nelas.

Este spec vira a chave:

1. **`holdings` passa a ser a verdade do que a casa tem**, item a item, como o
   estoque de uma loja muito organizada: nome, marca, modelo, quantidade,
   unidade, onde está e validade.
2. **Os 7 números viram a soma do estoque.** Toda escrita no estoque recalcula
   o `resource_inventory` da conta. Painel, Pilot, análise e Família continuam
   lendo o mesmo lugar e passam a ver o estoque, sem mudar uma linha deles.
3. **"Tenho" no Sinal cria o item no estoque** com um toque. A marca e o modelo
   se completam depois.
4. **Mochila é um item e é um lugar.** A mochila vermelha está na garagem; a
   lanterna está dentro da mochila vermelha.
5. **Validade** é opcional por item. O que vence em até 30 dias aparece em
   "precisa de atenção", e o Pilot sabe.

---

## 2. Decisões do dono (2026-11-07)

| # | Pergunta | Decisão |
|---|---|---|
| D-I1 | O que "Tenho" no Sinal faz | **Grava já, detalha depois.** Um toque cria 1 unidade com o nome do item do Sinal; a folha oferece "Adicionar marca e modelo". |
| D-I2 | Água e comida | **Viram itens.** "Galão 5 gal × 4, na garagem"; "Arroz, 40 refeições". Os litros e os dias da casa são **calculados** do estoque. |
| D-I3 | Mochilas | **Mochila é um lugar.** Cada mochila é um item **e** um lugar; itens entram nela. |
| D-I4 | Validade | **Campo opcional + aviso.** Ninguém é obrigado a preencher. Quando preenchida e vence em ≤ 30 dias → "precisa de atenção" e fato do Pilot. |
| D-I5 | A casa edita junto | **A casa toda edita, guardando quem mexeu.** Qualquer conta confirmada da casa cria, edita, move e remove qualquer item. Cada item guarda quem criou e quem mexeu por último. |
| D-I6 | Comida | **O app estima.** A pessoa digita o peso (g ou kg; lb e oz também aceitos) e escolhe o tipo; o EOS estima as refeições pelas calorias do tipo (§3.3). A estimativa aparece como tal e pode ser corrigida à mão. |

---

## 3. Comportamento

### 3.1 O estoque (tela "O que eu tenho")

`/preparedness/o-que-tenho` deixa de ser os 6 editores de números e vira a
lista do estoque da casa.

- **Agrupada por lugar.** Casa primeiro; dentro dela, os sublugares
  (Garagem, Despensa) e as mochilas. Lugar sem item não aparece, exceto mochila.
- **Cada linha:** nome, quantidade com unidade, marca/modelo (se houver),
  validade (se houver), e "de Daniela" quando outra conta criou.
- **Busca e filtro** por categoria (Água, Comida, Saúde, Energia, Comunicação,
  Documentos, Casa, Outros). O filtro por lugar só aparece com mais de um lugar
  (regra já vigente, D-165).
- **Totais no topo**, calculados do estoque: água da casa (gal e L), comida em
  refeições e em dias para a casa, e quantos itens vencem em 30 dias.
- **Adicionar item:** nome (com sugestões do catálogo, §4.4), quantidade,
  unidade, lugar, e opcionais marca, modelo, observação e validade.
- **Tocar num item** abre a ficha: editar, mover de lugar, mudar quantidade
  (+1 / −1 / número) e remover.
- **Remover pede confirmação** e diz o que acontece com o Sinal ("A casa vai
  ficar sem rádio no FORTRESS").

### 3.2 Lugares e mochilas

- Toda conta tem o lugar padrão **Casa** (já existe, PREP-T04: um por conta).
  Uma família comum nunca precisa criar lugar.
- **Casa com várias contas:** as "Casa" padrão das contas confirmadas são a
  mesma casa. A tela mostra **uma** Casa, com os sublugares e itens de todas
  as contas dentro dela. Sublugar novo vai para a Casa da conta que o criou.
  "Sob a Casa" = sob qualquer uma das Casas padrão da casa.
- **Criar sublugar** dentro da Casa: Garagem, Despensa, Quarto etc.
- **Criar mochila:** cria um item `mochila` (DURABLE, 1 unidade) **e** um
  lugar ligado a ele (`locations.holding_id`). O nome é o mesmo ("Mochila
  vermelha").
- **Mover a mochila** (da garagem para o carro) move o lugar junto: tudo dentro
  dela vai com ela.
- **Autonomia da casa = consumíveis sob a Casa**, inclusive dentro de mochila
  guardada em casa (D-156). Mochila no carro (lugar `VEHICLE` fora da Casa)
  sai da conta, sozinha.
- Remover uma mochila com itens dentro pede um destino para os itens
  (padrão: o lugar onde a mochila estava). Nunca apaga item em cascata.

### 3.3 Água e comida como itens

- **Água:** unidade `gal` ou `L`. Ex.: "Galão 5 gal" × 4 = 20 gal. Total da
  casa = soma em litros (`gallonsToLiters`), exibido em gal e L.
- **Comida:** a pessoa digita o **peso** e escolhe o **tipo**. O EOS estima
  as refeições pelas calorias do tipo (tabela abaixo) e mostra
  "≈ 27 refeições (estimativa)". Ex.: "Arroz, 5 kg" ≈ 27 refeições.
  - Peso guardado em gramas (`unit = 'g'`); kg, lb e oz são convertidos na entrada.
    A tela mostra em gramas/quilos (PT) e em lb/oz junto (EN).
  - Uma refeição = 2.000 kcal ÷ 3 (≈ 666,7 kcal) (`KCAL_PER_PERSON_DAY = 2000`,
    `MEALS_PER_PERSON_DAY = 3`).
  - Refeições = peso (kg) × kcal/kg do tipo ÷ (2.000 ÷ 3), arredondado para baixo.
  - A pessoa pode **corrigir as refeições à mão** (`meals_override`): o número
    dela vale, e a etiqueta "estimativa" some.
  - Dias-pessoa = refeições ÷ 3.

  | Tipo (`food_type`) | kcal por kg | Observação |
  |---|---|---|
  | arroz | 3.600 | seco |
  | feijao | 3.400 | seco |
  | macarrao | 3.700 | seco |
  | aveia | 3.900 | |
  | farinha | 3.600 | trigo, milho, mandioca |
  | acucar | 3.900 | açúcar, mel |
  | leite-po | 4.900 | |
  | castanhas | 5.800 | castanhas, amendoim, pasta de amendoim |
  | enlatado | 900 | peso **com** o líquido: feijão, carne, legumes, sopa |
  | pronta | 4.000 | refeição liofilizada, ração de emergência, barra |
  | outro | 1.500 | conservador de propósito: na dúvida, o EOS estima para menos |

  Os valores são médias de referência (USDA FoodData Central) arredondadas
  para baixo. Estimar para menos é a escolha segura: autonomia superestimada
  num app de emergência é pior que subestimada.
- **A quantidade gravada é o total** (20 gal, não "4 galões"). A tela aceita
  "embalagens × tamanho" (4 × 5 gal) e grava a multiplicação; o rótulo pode
  dizer "Galão 5 gal".
- **Combustível:** `gal` ou `L`. **Dinheiro:** `USD` (o backfill de agosto
  gravou `BRL`; a soma de `cash_amount` não converte moeda, como hoje).
- Na folha do Sinal, água e comida mostram a lista dos itens da casa e
  "+ Adicionar", no lugar de "quanto tem agora" (que substitui o SIGNAL-002
  §3.3 para estes dois itens).

### 3.4 Sinal → estoque

Para itens de ter ou não ter (`PRESENCE`):

| Toque | O que grava |
|---|---|
| **Tenho**, a casa ainda não tem o item | Cria 1 unidade (`label` = nome do item do Sinal, lugar = Casa, origem `PROTOCOL` + slug). A linha de base em `requirements` vai para `met`. A folha mostra "Adicionar marca e modelo". |
| **Tenho**, a casa já tem o item | Não cria nada. Mostra os itens que cobrem ("Rádio Midland ER310 · Mochila vermelha"). |
| **Ainda não tenho**, a casa tem itens | Lista os itens e pergunta: "Remover do estoque?" Só remove com confirmação. Sem remoção, o Sinal continua "tem". |
| **Ainda não tenho**, a casa não tem | Grava `needed` (SIGNAL-002, como hoje). |
| **Não se aplica** | Grava `not_applicable` (SIGNAL-002, como hoje). Não mexe no estoque. |

**"Tem" passa a ser derivado do estoque** (docs/37 §19: `met` derivado). Um
item do Sinal está coberto quando a casa tem ao menos um item com o mesmo
`resource_key` e quantidade > 0. `not_applicable` continua sendo resposta.

### 3.5 Todas as telas leem o mesmo

| Tela / motor | Lê de | Muda neste spec? |
|---|---|---|
| Sinais (folha e "% pronto") | estoque (itens) + `requirements` (só `needed`/`not_applicable`) | Sim (§3.4) |
| Preparação → O que eu tenho | estoque | Sim (§3.1) |
| Preparação → O que falta | `requirements`; `met` mostra o item que cobre | Sim: linha coberta mostra "Coberto por: …" |
| Preparação → Visão / precisa de atenção | `resource_inventory` (soma) + validade | Só ganha o aviso de validade |
| Pilot (fatos) | `resource_inventory` (soma) + lista curta de itens | Ganha itens, lugares e validade (§3.6) |
| `/api/analyze`, rules-engine, Família, Círculos | `resource_inventory` (soma) | Não. Passam a ver o estoque pela soma |
| Telas legacy (`dashboard-legacy`, `WorldDashboard`) | `resource_inventory` | Não |

### 3.6 Validade e Pilot

- **Validade** (`expires_on`, data, opcional) em qualquer item.
- "Precisa de atenção" ganha o tipo `expiring`: itens da casa que vencem em
  ≤ 30 dias, ou já vencidos (vencido é crítico, a vencer é baixo).
- **Item vencido continua contando** nos totais, com a etiqueta "vencido". O
  EOS não decide sozinho que a água de 2 anos não serve; ele avisa.
- **Pilot** recebe, além dos totais: até 40 itens da casa (nome, marca/modelo,
  quantidade, lugar) e a lista de vencidos e a vencer. Assim ele responde
  "onde está o rádio?" e "o que vence este mês?" (docs/37 stress test C).

---

## 4. Data Contract

### 4.1 Migração (aditiva, idempotente)

```sql
-- holdings ganha os campos de estoque
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS brand      text,
  ADD COLUMN IF NOT EXISTS model      text,
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS expires_on date,
  ADD COLUMN IF NOT EXISTS category   text,     -- §4.4
  ADD COLUMN IF NOT EXISTS food_type  text,     -- §3.3, só comida
  ADD COLUMN IF NOT EXISTS meals_override numeric CHECK (meals_override IS NULL OR meals_override >= 0),
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS provenance_ref text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- o mesmo enum de requirements.provenance, mais BACKFILL (linhas de agosto)
ALTER TABLE public.holdings ADD CONSTRAINT holdings_provenance_check
  CHECK (provenance IN ('MANUAL','PILOT','EDU','SIMULATION','OFFICIAL_ALERT','PLAN_GAP','PROTOCOL','BACKFILL'));

-- mochila: o lugar aponta para o item que ele é
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS holding_id uuid UNIQUE REFERENCES public.holdings(id) ON DELETE SET NULL;

-- Achado na implementação (Regra 4): PREP-T04 criou "um recurso por lugar".
-- Isso impede duas mochilas na mesma garagem e dois rádios em casa (E1, E4).
-- No estoque, cada linha é um item; a soma é feita na leitura.
DROP INDEX IF EXISTS public.holdings_uniq_resource_per_location;
CREATE INDEX IF NOT EXISTS holdings_expires_idx ON public.holdings (expires_on) WHERE expires_on IS NOT NULL;
```

(As `ADD CONSTRAINT` usam `DROP CONSTRAINT IF EXISTS` antes, como no
SIGNAL-002, para rodar duas vezes. `holdings_resource_idx (profile_id,
resource_key)` já existe desde PREP-T04 e serve à busca por chave.)

**Apagar em cascata continua no banco** (`holdings.location_id` e
`locations.parent_id` são `ON DELETE CASCADE` desde PREP-T04). A regra
"nunca apaga item junto com o lugar" (E14, E21) é da API: ela move os itens
antes de apagar o lugar, ou recusa. RLS segue `profile_id = auth.uid()`. A
escrita da casa passa pelo servidor (§4.3), que confere se as duas contas são
da mesma casa.

### 4.2 Projeção: estoque → `resource_inventory`

Função pura `projectInventory(holdings, locations, homeId, coverage)` →
os escalares de **uma conta**:

| Campo | Regra |
|---|---|
| `water_liters` | soma de `agua` sob a Casa, convertida para L |
| `food_days` | (soma das refeições de `comida` sob a Casa — `meals_override` quando houver, senão a estimativa — ÷ 3) ÷ cobertura da conta (ela + dependentes, a mesma de `lib/household.ts`) |
| `fuel_liters` | soma de `combustivel` sob a Casa, em L |
| `cash_amount` | soma de `dinheiro` sob a Casa |
| `has_medical_kit` | existe `kit-medico` com quantidade > 0 sob a Casa |
| `has_communication_device` | existe `radio-comunicacao` com quantidade > 0 sob a Casa |
| `battery_percent` | **não muda** (não é item) |

Toda escrita de item recalcula e grava (upsert) o `resource_inventory` da
conta dona do item, na mesma requisição.

**A cobertura também muda o `food_days`** (achado do Codex no PR #17). A casa
lê comida como `food_days × cobertura`; se a cobertura muda e o `food_days`
não, a comida da casa incha ou encolhe sem ninguém mexer no estoque. Por isso
o recálculo roda também quando a cobertura de uma conta muda: criar ou remover
dependente, mudar de quem um dependente depende, e uma conta entrar ou sair da
casa (E23).

**Antes do primeiro recálculo, reconcilia** (E10–E11, achado do Codex no PR
#17). Se a projeção do estoque da conta não bate com o `resource_inventory`
atual dela, o item `BACKFILL` de cada chave é ajustado (ou criado) para que a
soma bata com o número atual. Só depois a projeção grava. Assim o primeiro
toque no estoque nunca troca o número de hoje pelo de agosto.

### 4.3 API

| Rota | O que faz |
|---|---|
| `GET /api/holdings` | Itens e lugares de todas as contas confirmadas da casa, com nome de quem criou; totais da casa. |
| `POST /api/holdings` | Cria item `{ label, resourceKey, quantity, unit, locationId?, brand?, model?, notes?, expiresOn?, foodType?, mealsOverride?, provenance?, provenanceRef? }`. Sem `locationId` = Casa. Comida exige `foodType` (padrão `outro`). |
| `PATCH /api/holdings/[id]` | Edita, muda quantidade ou move de lugar. |
| `DELETE /api/holdings/[id]` | Remove. Se o item é uma mochila com itens, exige `{ moveTo }` (no corpo ou em `?moveTo=`). |
| `DELETE /api/locations/[id]` | Remove sublugar. Com itens ou sublugares dentro, exige `{ moveTo }`. Casa padrão: 422. |
| `POST /api/locations` | Cria sublugar `{ name, parentId, kind }` ou mochila `{ name, bag: true, parentId }` (cria item + lugar). |
| `PATCH /api/locations/[id]` | Renomeia ou move (muda `parent_id`). Recusa ciclo. |
| `POST /api/signals/items` | Passa a criar item no "Tenho" (§3.4). Mesmo contrato do SIGNAL-002, mais `holdings` na resposta. **Na INV-T02** (achado da implementação, Regra 4): a marca de kit médico e rádio deixa de gravar direto em `resource_inventory` e passa pelo estoque como "estoque informado" — era o último escritor direto, e deixá-lo até a INV-T04 abriria a janela que a virada atômica fecha. "Ainda não tenho" com item detalhado não apaga nada. |
| `POST /api/inventory` | **Continua aceitando** os números (telas legacy, Pilot). Grava um item "Estoque informado" por chave e recalcula; nunca apaga itens detalhados. Ver E9. |

Todas: 401 sem sessão; 403 se o item ou lugar é de outra casa; 422 em
quantidade negativa, unidade incompatível com a chave, ou validade inválida.

### 4.4 Catálogo de chaves e categorias

`lib/resource-catalog.ts`: as chaves conhecidas (as 6 do inventário antigo +
as dos protocolos dos Sinais + as de `requirements` em uso), cada uma com
nome PT/EN, categoria, `kind` (CONSUMABLE/DURABLE) e unidades aceitas.
Item com nome livre que não casa com o catálogo recebe chave
`custom:<slug>` e categoria Outros. Ele aparece no estoque e no Pilot, mas não
cobre nenhum Sinal.

---

## 5. Regras de Negócio

1. **Uma verdade.** O que a casa tem é `holdings`. `resource_inventory` é
   projeção, nunca editado à mão por uma tela nova.
2. **A casa é a soma das contas confirmadas** (D-123/D-174). Item tem dono
   (`profile_id`), mas a casa vê e edita tudo (D-I5).
3. **Coberto = existe item com a chave e quantidade > 0** sob o escopo. Mochila
   no carro não cobre a casa.
4. **Consumível conta uma vez** (docs/37 §15.1). Água dentro da mochila em casa
   conta para a casa; não conta de novo para a mochila.
5. **Remover é sempre explícito.** Nenhuma resposta do Sinal apaga item sem
   confirmação.
6. **Origem preservada.** O item guarda de onde veio (`PROTOCOL` + slug,
   `MANUAL`, `PILOT`...). Editar não troca a origem.
7. **Unidade é dado** (D-158): quantidade + unidade no item; conversão uma vez,
   na projeção.
8. **Validade avisa, não decide.** Item vencido continua contando, com aviso.

---

## 6. Interface

- Mesmos padrões das telas da Preparação e da folha do Sinal (bottom sheet,
  `aria-modal`, Esc fecha, botões ≥ 44 px, 320 px sem corte).
- Números em gal **e** L para água; refeições **e** dias para comida.
- Ação destrutiva sempre com confirmação e com o efeito dito em palavras.

---

## 7. Edge cases

| # | Situação | Comportamento |
|---|---|---|
| E1 | Duas mochilas, preta e vermelha | Dois itens `mochila`, dois lugares. Cada uma com seu conteúdo. |
| E2 | Lanterna dentro da mochila vermelha, mochila na garagem | Lanterna aparece em Casa › Garagem › Mochila vermelha. Cobre o Sinal. |
| E3 | Mochila vermelha vai para o carro | O lugar muda de pai. Água dentro dela sai da autonomia da casa na hora. |
| E4 | "Tenho" no rádio, e já existe "Rádio Midland" de Daniela | Nada é criado; a folha mostra o rádio dela. |
| E5 | "Ainda não tenho" no rádio, com 2 rádios no estoque | Folha lista os 2 e pergunta quais remover. Sem escolha, nada muda. |
| E6 | Galão de 5 gal × 4 + 10 L soltos | Água da casa = 75,7 + 10 = 85,7 L (22,6 gal). |
| E7 | Comida de uma conta que cobre 3 pessoas: 90 refeições | `food_days` da conta = 90 ÷ 3 ÷ 3 = 10. A casa lê 30 pessoa-dias. Igual a hoje. |
| E7a | "Arroz, 5 kg" | 5 × 3.600 ÷ (2.000 ÷ 3) = **27 refeições** (arredonda para baixo), com "estimativa". |
| E7b | "Feijão em lata, 12 × 425 g" (5,1 kg, tipo enlatado) | 5,1 × 900 ÷ (2.000 ÷ 3) = 6,88 → **6 refeições**. |
| E7c | A pessoa corrige o arroz para 30 refeições | `meals_override = 30`; a conta usa 30 e a etiqueta "estimativa" some. |
| E7d | Peso digitado em lb (EN) | 11 lb → 4.989,5 g gravados; a tela mostra 5,0 kg (11 lb). |
| E7e | Comida sem tipo (pelo Pilot ou pela tela legacy) | Tipo `outro` (1.500 kcal/kg): estima para menos. |
| E8 | Item sem chave do catálogo ("Faca Leatherman") | `custom:faca-leatherman`; aparece no estoque e no Pilot; não cobre Sinal. |
| E9 | Tela legacy grava `water_liters = 40` pelo `/api/inventory` | Ajusta o item "Água (estoque informado)" para que a soma dê 40 L. Se os itens detalhados já somam mais que 40, recusa com 409 e diz por quê. |
| E10 | Linhas do backfill de agosto (17) | Viram itens com origem `BACKFILL` e nome "Água (estoque informado)" etc. Ninguém perde número. |
| E11 | `resource_inventory` mudou depois do backfill (ex.: água salva hoje no Sinal) | Reconciliação na virada (§8, T06): o item `BACKFILL` é ajustado para bater com o número atual antes de a projeção assumir. |
| E12 | Item vencido | Conta, aparece com "vencido", vira atenção crítica e fato do Pilot. |
| E13 | Validade no passado ao criar | Aceita (a pessoa está registrando o que tem), com aviso. |
| E13a | Item sem validade | Normal. Nenhum aviso, nenhum lembrete para preencher. O campo é opcional de verdade. |
| E14 | Remover mochila com itens | Pede destino; padrão: lugar onde a mochila estava. Nunca cascata. |
| E15 | Mover lugar para dentro dele mesmo ou de um filho | 422, nada muda. |
| E16 | Conta sai da casa | Os itens dela saem da soma da casa (são dela). Ninguém perde dado. |
| E17 | Quantidade chega a 0 pelo −1 | O item fica com 0 e "acabou"; não cobre o Sinal. Remover é outra ação. |
| E18 | Casa com uma conta só | Sem "de Fulano"; nada muda no resto. |
| E19 | Sem rede ao salvar | Nada muda na tela; "Não foi possível gravar. Tente de novo." |
| E20 | Paulo e Daniela, cada um com a sua Casa padrão; ela põe a lanterna na Garagem que ele criou | Uma Casa só na tela. A lanterna é dela (`profile_id`), no lugar dele; conta para a casa e para o `resource_inventory` dela. |
| E21 | Apagar sublugar com itens ou sublugares dentro | Mesma regra da mochila (E14): pede destino, padrão o lugar pai. Apagar a Casa padrão: 422. |
| E22 | Dois rádios no mesmo lugar | Duas linhas. Possível porque a migração remove o índice "um recurso por lugar". |
| E23 | Conta com 90 refeições, sozinha (30 dias); cadastra um dependente | O recálculo roda na criação do dependente: `food_days` vira 15. A casa continua lendo 30 pessoa-dias. Sem isso, leria 60. |
| E24 | Primeiro toque no estoque de uma conta cujo `resource_inventory` diz 40 L e o backfill diz 20 L | Reconcilia antes: o item "Água (estoque informado)" vai para 40 L; depois aplica a edição. |

---

## 8. Tarefas (uma de cada vez, Rule 4)

| Tarefa | Escopo |
|---|---|
| INV-T01 | Migração §4.1 + `docs/06` e `docs/37` §15–§16 + catálogo §4.4 + projeção pura §4.2 com testes |
| INV-T02 | **Virada atômica**: API §4.3 (holdings, locations) com escrita da casa; reconciliação antes do primeiro recálculo (E10, E11, E24); `/api/inventory` passa a escrever itens (E9); recálculo também quando a cobertura muda (E23). Tudo no mesmo deploy, para não existir janela em que a projeção grava sem reconciliar ou o legado escreve sem passar pelo estoque. |
| INV-T03 | Tela do estoque §3.1–§3.3 (lista, adicionar, ficha, lugares, mochilas) |
| INV-T04 | Sinais §3.4 (folha e "% pronto" lendo o estoque; água e comida como lista) |
| INV-T05 | Validade e Pilot §3.6 (atenção `expiring`, fatos do Pilot, "Coberto por" no O que falta) |
| INV-T06 | ~~Virada~~ — incorporada à INV-T02 (achado do Codex no PR #17: sem isso, a primeira edição trocaria o número de hoje pelo de agosto). |

---

## 9. Critérios de Aceitação

1. A migração roda duas vezes sem erro. Na primeira, a única mudança em linhas existentes é marcar as linhas do backfill de agosto com origem `BACKFILL` (E10); na segunda, nenhuma linha muda.
2. Criar "Galão 5 gal × 4" na Garagem grava 4 × 5 gal e `water_liters` da conta passa a ser a soma de água sob a Casa (± 0,01 L).
3. Duas mochilas criadas aparecem como dois itens e dois lugares; um item movido para a vermelha aparece dentro dela.
4. Mover a mochila com 10 L de água para um lugar `VEHICLE` fora da Casa reduz a água da casa em 10 L na mesma resposta.
5. "Tenho" num item do Sinal sem item na casa cria 1 unidade com origem `PROTOCOL` e `provenance_ref` = slug; o círculo fica verde sem recarregar.
6. "Tenho" com item já existente na casa não cria item.
7. "Ainda não tenho" com itens na casa não remove nada sem confirmação; com confirmação, remove só os escolhidos.
8. Um item criado por uma conta aparece, editável, para outra conta confirmada da mesma casa, com o nome de quem criou; depois que a outra conta edita, `updated_by` é ela.
9. `GET /api/household` devolve os mesmos totais que a soma do estoque (água, comida em pessoa-dia, kit médico, rádio).
10. Remover o único rádio da casa faz `has_communication_device` = false e o Sinal mostrar o item como faltando.
11. Item que vence em ≤ 30 dias aparece em "precisa de atenção"; vencido aparece como crítico.
12. Os fatos do Pilot incluem nome, marca, lugar e validade dos itens da casa.
13. Item de outra casa: `PATCH`/`DELETE` respondem 403 e nada muda.
14. Remover mochila com itens sem `moveTo` responde 422; com `moveTo`, os itens mudam de lugar e nenhum é apagado.
15. Depois da virada, nenhuma conta tem `resource_inventory` diferente da projeção do seu estoque.
19. Criar ou remover um dependente não muda a comida da casa em pessoa-dia (E23).
20. A primeira escrita no estoque de uma conta não muda nenhum dos 6 números dela, exceto o que a própria escrita mudou (E24).
16. A tela do estoque cabe em 320 px sem corte.
17. "Arroz, 5 kg" grava 5.000 g e é contado como 27 refeições; com `meals_override = 30`, como 30.
18. Criar e editar item sem validade funciona e não gera aviso.

---

## 10. Fora do Escopo

- Código de barras, foto do item, preço, loja, lista de compras e reposição automática.
- Estoque mínimo por item ("avise quando tiver menos de 2 pilhas").
- Kits como lista de exigências por mochila (o que a mochila **deveria** ter). Fica com `kits`/`requirements`, em outro spec.
- Compartilhar estoque com Círculo (fora da casa). Continua sendo a soma de água e comida (D-174).
- Bateria como item. `battery_percent` continua como está.
- Histórico de aquisições (o porquê, o evento, a trajetória da autonomia): continua no **HOLDING-HISTORY-001**, que passa a se apoiar neste estoque item a item.
- Aposentar `resource_inventory` (PREP-T10e). Ele continua existindo como projeção.

---

## 11. Revisão do dono (2026-11-07)

1. A casa toda edita, guardando quem mexeu → D-I5.
2. Comida: o app estima a partir do peso → D-I6, §3.3.
3. Aviso de validade em 30 dias, com a data sempre opcional → D-I4, E13a.
