# SPEC — CONTENT-001: Pipeline de conteúdo (uma pauta, três saídas)
Version: 0.2 | Status: **Draft** (D-P1…D-P5 fechadas pelo dono em 2026-11-05) | Author: Paulo Neto | Depende de: SIGNAL-001 (Ready), docs/22 (EDU), docs/32 (Knowledge)

> Regra 1: nenhum código antes de Ready. Este spec está **Draft**.
> Regra 3: os edge cases ficam escritos aqui (§7) e não são descobertos no código.
> Regra 4: se a implementação revelar algo que este spec não cobre, **pare** e atualize o spec antes de continuar.
> Regra 5: critérios binários.
> Rule 7 (spine-first): a migração da §4 atualiza `docs/06` e `docs/37` §18 no mesmo PR, antes do código.

---

## 1. Objetivo

O dono produz o conteúdo do EOS **uma vez** e ele chega a três lugares:

1. **YouTube**: o vídeo do dono (roteiro, título, descrição, fontes).
2. **EDU / RAG**: a lição permanente entra no `edu_content` e, depois de
   aprovada, no `knowledge_base` que o Pilot consulta.
3. **Sinais**: o acontecimento, com fonte, nível, "o que é / o que não é" e o
   protocolo em degraus, aparece em `/sinais` (SIGNAL-001).

O pipeline em si (onde o roteiro é escrito, gravado, editado e postado) é do
dono e **fica fora do EOS**. Este spec define:

- o **contrato** da pauta: o pacote JSON que o pipeline entrega;
- a **porta de entrada** no EOS: uma rota que valida, grava e distribui;
- o **ciclo de vida**: rascunho, revisão, publicação, atualização e arquivo;
- a **migração** que tira o FORTRESS do código (SIGNAL-001 §12) e o coloca no
  banco, já com a versão curada.

Este spec substitui SIGNAL-T01 (tabelas) e SIGNAL-T03 (autoria no admin), como
previsto em SIGNAL-001 §12.2.

---

## 2. Contexto

### 2.1 O que já existe e é reusado

| Peça | Onde | Reuso |
|---|---|---|
| Tipo `Signal`, `Protocol`, `ProtocolItem`, `Bilingual` | `lib/signals.ts` | É a forma do bloco `signal` da pauta. Não muda. |
| Validação `signalProblems()` | `lib/signals.ts` | Roda na entrada. Pauta com problema não grava nada. |
| `edu_content` + `POST /api/admin/edu/ingest` | docs/22 §3–§4, `lib/edu-rag.ts` | O bloco `lesson` vira uma linha de `edu_content`; a ingestão no RAG é a mesma função, com a mesma regra dos 160 caracteres. |
| Autenticação de máquina | `CRON_SECRET` em `app/api/cron/*` | Mesmo padrão: `Authorization: Bearer <segredo>`, segredo próprio. |
| Telas `/sinais` e `/sinais/<slug>` | SIGNAL-001 Marco 1 | Passam a ler do banco; a tela não muda. |

### 2.2 Regras herdadas que este spec não pode quebrar

- **YouTube não vira verdade sozinho** (docs/22 §5.2, docs/32 §2.3): vídeo só
  com link não entra no RAG.
- **"O que não é" e fonte são obrigatórios** (SIGNAL-001 §5.3–§5.4).
- **`AGIR` exige alerta oficial** (SIGNAL-001 §5.5).
- **Sistema propõe, família decide** (SIGNAL-001 §5.2): nada do pipeline cria
  requisito `needed` nem holding.
- **Arquivar não apaga preparo** (SIGNAL-001 §5.7).
- **RAG por ação explícita** (docs/22 §5.9): `rag_enabled` não é ingestão.

---

## 3. Comportamento

### 3.1 O pipeline entrega uma pauta

O pipeline faz `PUT /api/content/packages/<slug>` com o pacote da §4.1.
O EOS:

1. confere o segredo (`CONTENT_PIPELINE_SECRET`);
2. valida o pacote inteiro (formato, `signalProblems()`, regras da §5);
3. se houver qualquer problema, responde **422** com a lista e **não grava
   nada**;
4. se estiver válido, grava tudo numa transação (§4.3) e responde com o estado
   resultante de cada saída.

A mesma chamada com o mesmo conteúdo não muda nada (idempotente pelo `hash`).

### 3.2 Status da pauta

| Status enviado | O que acontece no EOS |
|---|---|
| `draft` | Grava. Não aparece para ninguém além do dono. |
| `review` | Grava e mostra ao dono, em `/admin/content`, uma prévia exatamente como a família verá. |
| `archived` | O cartão sai de `/sinais`; o link direto abre em modo leitura com "Sinal arquivado em <data>" (SIGNAL-001 E8). Arquivar só tira do ar, por isso o pipeline pode pedir. |

**O pipeline nunca publica (D-P2 = b).** Publicar é um toque do dono em
`/admin/content`, sobre uma versão específica que ele viu na prévia. O status
`published` enviado pelo pipeline é rejeitado (422).

**Versão no ar e versão recebida são coisas diferentes.** Quando um Sinal já
está publicado e chega uma versão nova, a família continua vendo a versão
aprovada até o dono aprovar a nova. Nada que o pipeline mande muda o que está
no ar sem esse toque, exceto arquivar.

### 3.3 Vídeo do YouTube

O vídeo é postado **pelo pipeline**, não pelo EOS. **Um vídeo por idioma**
(D-P5 = b): `video.pt` e `video.en`, cada um opcional. Depois de postado, o
pipeline manda a pauta com o ID preenchido (nova versão, §3.5, que passa pela
aprovação como qualquer outra).

- A família com o app em português vê o vídeo `pt`; em inglês, o vídeo `en`.
- Se o vídeo do idioma da pessoa ainda não existe, a página **não mostra
  vídeo** (não mostra o do outro idioma): uma tela, um idioma (D-225).
- `edu_content.source_type` vira `youtube` e `source_url` aponta para o vídeo
  `pt` (ou `en`, se só houver esse).

O vídeo é **apresentação**. Ele não substitui o texto: a página continua
inteira sem o vídeo (rede fraca, vídeo removido).

### 3.4 Lição no EDU e no RAG

O bloco `lesson` (texto permanente: o que fazer e por quê, sem datas de notícia)
vira uma linha de `edu_content`, ligada ao Sinal por `signals.edu_content_id`
(o `edu_content` não ganha coluna nova). O `transcript` recebe `body.pt`, depois
`body.en`, separados por título de idioma.

- Ao publicar, a linha fica `approved` com `rag_enabled=true`, e a ingestão no
  `knowledge_base` roda **automaticamente, logo após o toque de publicar**
  (D-P4 = a), pela função
  que já existe, com `source='edu:<id>'` e `source_version='v<versão>'`.
- O texto do Sinal (a notícia, com data) **não** vai para o RAG enquanto o
  Sinal estiver ativo: o Pilot o recebe como fato fixo (SIGNAL-001 D4).
- Ao arquivar, o resumo do Sinal entra no RAG como contexto histórico, com a
  data de arquivo no texto (SIGNAL-001 D4, parte "a").

### 3.5 Atualização

Toda mudança é uma nova versão da mesma pauta (`version` maior). O EOS guarda
todas as versões recebidas (`content_packages`) e aplica a última.

- Versão menor ou igual à aplicada: **409**, nada muda.
- Lição alterada: o EDU sobe de versão e o RAG é reingerido (substitui os
  pedaços da mesma fonte, docs/22 §5.10).
- Item removido do protocolo: some do checklist da página. Requisitos que a
  família já adotou **continuam** (§5.7 do SIGNAL-001); a adoção chega no
  Marco 2, mas a regra vale desde já.

### 3.6 Revisão do dono no app

`/admin/content` (só `ADMIN_EMAILS`) lista as pautas por status, mostra a
prévia de cada uma em PT e EN (com o vídeo de cada idioma), o resultado da
validação e, quando houver, a diferença entre a versão no ar e a recebida.
O dono não escreve no app (SIGNAL-001 §12.2). Os botões são:

- **Publicar versão N**: publica exatamente a versão mostrada. Se chegar uma
  versão mais nova enquanto a tela está aberta, o botão recusa com "chegou a
  versão N+1, revise de novo".
- **Arquivar**: tira do ar.

---

## 4. Data Contract

### 4.1 A pauta (JSON que o pipeline envia)

```jsonc
{
  "schema": "eos.content/1",
  "slug": "fortress-90-dias",          // único, minúsculas e hífen, igual à rota
  "version": 2,                         // inteiro, cresce a cada envio
  "status": "review",                   // draft | review | archived (publicar é no EOS)
  "signal": { /* exatamente o tipo Signal de lib/signals.ts, sem slug e status */ },
  "lesson": {
    "title":   { "pt": "...", "en": "..." },
    "summary": { "pt": "...", "en": "..." },
    "body":    { "pt": "...", "en": "..." },   // a lição permanente; vai para o RAG
    "scenarioTags": ["blackout", "general"]
  },
  "video": {                            // opcional; cada idioma só depois de postado
    "pt": { "youtubeId": "dQw4w9WgXcQ", "durationSec": 540 },
    "en": { "youtubeId": "a1B2c3D4e5F", "durationSec": 510 }
  }
}
```

O `hash` é calculado pelo EOS sobre o corpo normalizado, não enviado.

### 4.2 Tabelas novas

| `content_packages` | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| slug | text | |
| version | integer | único junto com `slug` |
| status | text | o status enviado |
| payload | jsonb | a pauta como chegou |
| hash | text | sha256 do corpo normalizado |
| problems | jsonb | lista de problemas; vazia quando aceita |
| applied_at | timestamptz | nulo se rejeitada |
| received_at | timestamptz | |

| `signals` | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| slug | text | único |
| status | text | `draft`, `review`, `published`, `archived` |
| version | integer | versão **no ar** (a aprovada); a última recebida está em `content_packages` |
| approved_by | uuid | FK → profiles.id, quem tocou em Publicar |
| level | text | `MONITORAR`, `PREPARAR`, `AGIR`, `CONTEXTO` |
| occurred_on, published_on | date | |
| region | jsonb | `{scope:'national'}` no início |
| official_alert | boolean | |
| reviewed_by_curator | boolean | `true` quando publicado pelo botão |
| content | jsonb | os textos bilíngues (title, summary, whatItIs, whatItIsNot, curatorNote, sourceLine) |
| sources | jsonb | `[{title,url}]`, mínimo 1 |
| protocol | jsonb | `Protocol` inteiro (degraus, recomendado, itens) |
| video | jsonb | `{pt?:{youtubeId,durationSec}, en?:{…}}` |
| edu_content_id | uuid | FK → `edu_content.id` |
| published_at, archived_at | timestamptz | |
| updated_at | timestamptz | |

**Decisão de forma (D-P3):** `content` e `protocol` ficam em `jsonb` bilíngue
numa linha só, em vez de uma linha por idioma e das tabelas `protocols` /
`protocol_items` do SIGNAL-001 §4.1–§4.2. Motivo: a pauta já chega bilíngue, o
tipo `Signal` do Marco 1 já é bilíngue, e a adoção (Marco 2) lê o protocolo
inteiro de uma vez. Se o Marco 2 precisar consultar item por item no banco, a
tabela `protocol_items` entra lá. SIGNAL-001 §4.1–§4.2 é atualizado para
apontar para cá.

RLS ligado, sem política direta: leitura por rota (`/api/signals`), escrita só
pela rota da pauta, com service role.

### 4.3 Escrita atômica

Uma função SQL (`apply_content_package(payload jsonb)`) faz, numa transação:
grava `content_packages`, faz upsert em `signals` e em `edu_content`, e marca
`applied_at`. A ingestão no RAG (rede, OpenAI) roda **depois** do commit; se
falhar, a pauta fica publicada e a resposta diz `rag: "pending"`, com nova
tentativa no próximo envio ou por `POST /api/admin/edu/ingest` (§7 E6).

### 4.4 Rotas

| Rota | Quem | O quê |
|---|---|---|
| `PUT /api/content/packages/[slug]` | `CONTENT_PIPELINE_SECRET` | Recebe a pauta. 200 com o estado, 401 sem segredo, 409 versão velha, 422 com problemas. |
| `GET /api/content/packages/[slug]` | `CONTENT_PIPELINE_SECRET` | Versão aplicada, status e estado de cada saída (sinal, edu, rag, vídeo). Para o pipeline saber onde parou. |
| `POST /api/admin/content/[slug]/publish` | `ADMIN_EMAILS` | Body `{version}`. Publica essa versão; 409 se não for a última recebida. Dispara a ingestão no RAG. |
| `POST /api/admin/content/[slug]/archive` | `ADMIN_EMAILS` | Arquiva. |
| `GET /api/signals` | autenticado | Sinais `published`, por nível e data (SIGNAL-001 §4.4). |
| `GET /api/signals/[slug]` | autenticado | O Sinal publicado ou arquivado. `draft`/`review` só para `ADMIN_EMAILS`. |
| `GET /admin/content` | `ADMIN_EMAILS` | Tela de revisão (§3.6). |

Resposta 200:

```json
{ "slug": "fortress-90-dias", "version": 2, "status": "published",
  "signal": "published", "edu": "approved", "rag": "ingested", "video": "embedded" }
```

### 4.5 Funções puras (testáveis sem banco)

- `packageProblems(pkg)` → lista de problemas: formato, `signalProblems()`,
  regras da §5. Vazia = válida.
- `packageHash(pkg)` → sha256 estável (chaves ordenadas, espaços normalizados).
- `lessonToEdu(pkg)` → a linha de `edu_content` (título, resumo, transcript,
  tags, source_type, source_url).
- `rowToSignal(row)` → o tipo `Signal` que as telas já usam. As telas não
  mudam.

---

## 5. Regras de Negócio

1. **Uma pauta, uma verdade.** O que aparece em `/sinais`, no EDU e no RAG vem
   da mesma versão aplicada. Não existe edição de Sinal fora da pauta.
2. **Tudo ou nada.** Pauta com qualquer problema não grava nada (422).
3. **Os dois idiomas são obrigatórios** em todos os textos (`pt` e `en` não
   vazios). Tradução automática segue fora (SIGNAL-001 §10).
4. **Só o dono publica** (D-P2 = b), pelo botão, numa versão que ele viu.
   `published` vindo do pipeline vira 422.
5. **A lição precisa ensinar.** `lesson.body` com menos de 160 caracteres
   instrucionais em cada idioma é rejeitado (mesma régua de
   `MIN_EDU_RAG_INSTRUCTION_CHARS`).
6. **A lição não carrega notícia.** A regra é editorial e fica na revisão do
   dono; o EOS só confere o tamanho. (Datas de notícia no RAG envelhecem e o
   Pilot as repetiria como atuais.)
7. **Vídeo por idioma, só com ID válido** do YouTube (11 caracteres `[A-Za-z0-9_-]`). URL
   inteira é rejeitada, para não aceitar outro domínio.
8. **Versão só sobe.** Igual ou menor: 409.
9. **Slug é permanente.** Uma vez publicado, o slug não muda (links
   compartilhados). Renomear = arquivar e criar outra pauta.
10. **Segredo próprio.** `CONTENT_PIPELINE_SECRET` não é o `CRON_SECRET`; vazado,
    troca só ele.
11. **O código deixa de ter conteúdo.** Depois da migração, `lib/signals-content.ts`
    sai; os testes de conteúdo passam a validar pautas de exemplo em
    `lib/__tests__/fixtures/`.

---

## 6. Migração do FORTRESS

1. A migração cria as tabelas e a função, sem dados.
2. O pipeline (ou um script único do repo) envia o FORTRESS como pauta
   `version: 1`, `status: review`, com o texto atual de `lib/signals-content.ts`.
3. O dono revisa em `/admin/content`, ajusta no pipeline, que envia `version: 2`
   em `review`, e toca "Publicar versão 2". `reviewed_by_curator` vira `true`.
4. Só então as telas passam a ler do banco e `lib/signals-content.ts` é
   removido, no mesmo PR.

Entre os passos 1 e 4 a produção continua lendo do código: nada some para a
família.

---

## 7. Edge cases

| # | Situação | Comportamento |
|---|---|---|
| E1 | Pipeline envia a mesma pauta duas vezes (retry) | Mesmo `hash` e mesma versão: 200 com o estado atual, nada é regravado. |
| E2 | Mesma versão, conteúdo diferente | 409 "versão já aplicada com outro conteúdo". |
| E3 | Falta `whatItIsNot` ou fonte em um idioma | 422; nada gravado. |
| E4 | `AGIR` sem `officialAlert` | 422 (SIGNAL-001 §5.5). |
| E5 | Pipeline envia `published` | 422 "publicar é no EOS". |
| E6 | OpenAI fora no momento da publicação | Sinal publicado, EDU `approved`, `rag: "pending"`. O próximo `GET` mostra pendente; reenviar a mesma pauta tenta de novo. |
| E7 | Vídeo removido ou privado no YouTube | O embutido falha sozinho; a página mostra o texto inteiro. O pipeline manda nova versão sem `video`. |
| E8 | Só existe o vídeo `pt` e a família usa o app em EN | Sem vídeo; o texto em EN aparece inteiro. Quando o `en` chegar e for aprovado, aparece. |
| E9 | Item removido do protocolo numa nova versão | Some da página; requisitos já adotados ficam (§3.5). |
| E10 | Pauta arquivada recebe nova versão | Fica em revisão; se o dono publicar, o Sinal volta à lista com `published_on` novo. |
| E10b | Sinal publicado recebe nova versão | A família continua vendo a versão aprovada; a nova fica em revisão até o toque. |
| E10c | Dono toca "Publicar v3" e a v4 chegou nesse meio-tempo | 409; a tela recarrega mostrando a v4. |
| E11 | Slug de pauta nova colide com um existente | É a mesma pauta: aplica as regras de versão (E1/E2/§5.8). |
| E12 | Segredo ausente no servidor | Rota responde 503 "pipeline desligado" (mesmo padrão do cron). |
| E13 | Pauta muito grande | Limite de 256 KB no corpo; acima disso, 413. |
| E14 | `lesson.body` com markdown, timestamps ou citações | Aceito no EDU; os nomes de item do checklist continuam vindo de `protocol.items[].label` (docs/22 §5.14). |
| E15 | Lição alterada depois de ingerida | Reingestão substitui os pedaços da mesma fonte; o RAG nunca tem duas versões da mesma lição. |
| E16 | Arquivar | Resumo do Sinal vai para o RAG com "arquivado em <data>"; a lição continua lá. |

---

## 8. Critérios de Aceitação

1. `PUT /api/content/packages/<slug>` sem o segredo responde 401; com o segredo ausente no servidor, 503.
2. Uma pauta com um problema qualquer responde 422 com a lista, e nenhuma tabela muda (verificado por contagem antes e depois).
3. Uma pauta válida em `review` aparece em `/admin/content` e não aparece em `/sinais` nem em `GET /api/signals`.
4. Depois do toque em "Publicar versão N", o Sinal aparece em `/sinais` com o mesmo texto da prévia, nos dois idiomas.
5. Uma pauta enviada pelo pipeline com `status: published` responde 422.
5b. Com um Sinal publicado na v2, enviar a v3 não muda o que `/sinais/<slug>` mostra até o dono publicar a v3.
5c. Publicar uma versão que não é a última recebida responde 409.
5d. `POST /api/admin/content/*` sem e-mail em `ADMIN_EMAILS` responde 403.
6. Reenviar a mesma pauta (mesma versão, mesmo conteúdo) responde 200 e não altera `updated_at`.
7. Mesma versão com conteúdo diferente responde 409.
8. A publicação cria ou atualiza uma linha em `edu_content` com `source_type` e `source_url` corretos e `status='approved'`.
9. Logo após o toque de publicar, sem outra ação, o `knowledge_base` tem pedaços com `source='edu:<id>'` e `source_version` igual à versão do EDU.
10. Uma nova versão da lição substitui os pedaços anteriores (nenhum pedaço da versão anterior fica).
11. Com OpenAI indisponível, o Sinal publica e o `GET` da pauta mostra `rag: "pending"`.
12. Com o app em PT, a página mostra o vídeo `pt`; em EN, o vídeo `en`. Sem vídeo no idioma da pessoa, a página não mostra vídeo e é idêntica à do Marco 1.
13. Um `youtubeId` com URL inteira ou caracteres fora do padrão responde 422.
14. Arquivar tira o cartão de `/sinais`, o link direto mostra o aviso de arquivado, e o resumo do Sinal entra no RAG.
15. O teste de verdade única do SIGNAL-001 continua passando com o Sinal lido do banco.
16. Depois da migração do FORTRESS, `lib/signals-content.ts` não existe e `reviewedByCurator` do FORTRESS é `true`.
17. `docs/06` e `docs/37` §18 descrevem as tabelas novas no mesmo PR da migração.

---

## 9. Decisões (fechadas pelo dono em 2026-11-05)

| # | Pergunta | Decisão |
|---|---|---|
| D-P1 | Como o pipeline se autentica | **Segredo** `CONTENT_PIPELINE_SECRET` no header, como o cron. |
| D-P2 | Onde fica a aprovação para publicar | **Botão no EOS** (`/admin/content`). O pipeline entrega para revisão e nunca publica sozinho; uma versão nova de um Sinal no ar também espera o toque. |
| D-P3 | Forma no banco | **Uma linha bilíngue** com `jsonb` (§4.2). SIGNAL-001 §4.1–§4.2 passa a apontar para cá. |
| D-P4 | Quando a lição entra no RAG | **Automática** logo após o toque de publicar. |
| D-P5 | Vídeo por idioma | **Um vídeo por idioma.** App em EN abre o vídeo em inglês; em PT, o vídeo em português. Sem vídeo no idioma da pessoa, não mostra vídeo. |

---

## 10. Fora do Escopo

- O pipeline em si: roteiro, gravação, edição, upload e agenda no YouTube.
- Upload para o YouTube a partir do EOS ou leitura da API do YouTube.
- Transcrição automática do vídeo.
- Tradução automática.
- Adoção do protocolo, push e Pilot com Sinais (Marco 2 do SIGNAL-001).
- Edição de conteúdo dentro do app.
- Região por estado ou condado (o `region` nasce `national`).
- Métricas de visualização do vídeo.

---

## 11. Sequência proposta

| Task | Entrega | Depende de |
|---|---|---|
| CONTENT-T00 | Decisões D-P1…D-P5 e spec Ready | Dono |
| CONTENT-T01 | Migração: `content_packages`, `signals`, `apply_content_package()`; docs 06 e 37 §18 | T00 |
| CONTENT-T02 | Funções puras da §4.5 + testes com pautas de exemplo | T00 |
| CONTENT-T03 | `PUT`/`GET /api/content/packages/[slug]` + ingestão no RAG | T01, T02 |
| CONTENT-T04 | `/admin/content` (prévia e validação) | T03 |
| CONTENT-T05 | Vídeo embutido em `/sinais/<slug>` | T03 |
| CONTENT-T06 | Migração do FORTRESS (§6) e remoção de `lib/signals-content.ts` | T03, T04, aprovação do dono |
