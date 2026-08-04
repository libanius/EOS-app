# 08 — Decisions Log

> Decisions made. Not up for re-discussion without a new entry.

---

## D-113 — O agendador sai da Vercel para não pagar Pro, e o segredo que nunca existiu

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O `vercel.json` pedia `*/15 * * * *`. O plano Hobby só aceita uma
execução diária, e o efeito não era degradação — era **bloqueio total de
deploy**: nenhuma publicação passava, de ninguém.

E ao investigar apareceu algo pior: **`CRON_SECRET` não existia** — nem na
Vercel, nem localmente. A rota `/api/cron/weather-notifications` exige
`Bearer CRON_SECRET` e devolvia **401 sempre**. As notificações de clima nunca
dispararam uma única vez, e nada na tela dizia isso.

**Decision**:

1. **`CRON_SECRET` gerado e configurado** na Vercel. Verificado: sem segredo
   401, com segredo `{"ok":true,"checked":43}`.
2. **Cron da Vercel vira diário**, o que o Hobby aceita — e desbloqueia os
   deploys.
3. **A cadência real de 15 minutos vem do GitHub Actions**, de graça. A rota já
   era protegida por segredo, então o agendador externo não abre nada novo.
4. **O cron diário fica como rede de segurança.** Se o workflow for desativado ou
   o repositório sair do ar, sobra uma passada por dia em vez de nenhuma.
5. **O workflow falha ALTO** quando o segredo falta: `exit 1` com mensagem, nunca
   um "ok" silencioso. Foi exatamente o silêncio que deixou esta rota devolvendo
   401 por meses.

**Consequences**: verificado ponta a ponta em 2026-08-04 — segredo configurado
nos dois lados e execução manual do workflow **verde** (`ping` 7 s).

Fica um risco de operação que não existia antes desta decisão: o GitHub
**desativa workflows agendados após 60 dias sem commits** no repositório. Se o
projeto ficar parado, as notificações de clima param junto e **nada avisa** — a
mesma classe de falha silenciosa que motivou este trabalho, agora por um caminho
de infraestrutura. É o preço de não pagar Pro, e está anotado no build status
para ser reavaliado, não esquecido.

---
## D-112 — Convite por link, e o que um link nunca pode fazer

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Convidar alguém exigia ditar um código de seis letras e torcer para
a pessoa digitar certo, achar a tela e colar. É o gesto mais frágil do produto:
três chances de o convite morrer no caminho. E a Família íntima exigia uma
SEGUNDA conversa, dias depois da aprovação.

**Decision**:

1. **`/convite/[code]`**, compartilhável por WhatsApp, em Círculos e na Família.
   Rota **protegida**: quem clica sem conta cai no login com `redirectTo` e volta
   já autenticado. A alternativa — página pública — revelaria o nome do círculo a
   qualquer um que recebesse o link encaminhado.
2. **O convite mora também na Família**, junto da frase "sem conta no EOS · não
   aparece no mapa". É ali que a ausência aparece; a ação de resolvê-la tem de
   estar do lado do problema, não noutra tela.
3. **`?intima=1` carrega a intenção de Família íntima** através da aprovação
   (`circle_join_requests.wants_family_access`). Ao aprovar, o membro nasce com
   `family_access_status = 'requested'`.

**A trava que define esta decisão**: um link pode **fazer a pergunta** sobre a
ficha médica de alguém; nunca **respondê-la**. O status nasce `requested` e só a
própria pessoa, na conta dela, muda para `approved` — regra que já existia em
`/api/circles/[id]/family-access` e que este caminho não podia furar. Se algum
dia isso virar `approved`, a ficha de uma pessoa passa a ser aberta por quem
encaminhou um link num grupo de WhatsApp.

Por isso a caixa "incluir na Família íntima" **nasce desmarcada**: mesmo sem
conceder nada, é uma pergunta sobre o dado mais sensível do produto, e uma caixa
pré-marcada seria o app decidindo por quem convida.

**Consequences**: `npm run test:invite` — 6/6, com uma asserção dedicada só a
provar que o link **não** concede acesso à ficha. `test:circle` 5/5 e
`test:family` 5/5 sem regressão.

O `POST /api/circles/join` degrada sozinho: sem a coluna da migration, o convite
ao CÍRCULO continua funcionando e a tela avisa que a parte de Família íntima
ficará para depois — o convite principal nunca falha por causa do extra.

---
## D-099 — Afiliados usam Stripe Promotion Codes e tracker próprio

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono quer criar códigos/links de afiliado pelo admin, começando
por `EOSPARTNER`, com 100% off uma vez e comissão de 70% sobre o primeiro valor
real pago. Isso não é gift code: gift code dá acesso sem Stripe; afiliado precisa
passar por Checkout e preservar atribuição financeira.

**Decision**:

1. Criar `/admin/affiliates` owner-only.
2. Criar tabelas `affiliate_codes`, `affiliate_referrals` e
   `affiliate_conversions`.
3. Criar Stripe coupon `100% off once` e promotion code por afiliado.
4. Capturar `?ref=CODE` em cookie/local storage.
5. Enviar o código para `/api/billing/checkout` e preaplicar o promotion code no
   Checkout quando válido.
6. Registrar referral no `checkout.session.completed`.
7. Registrar conversão/commission owed apenas em invoice paga com
   `amount_paid > 0`.

**Consequences**:

- LA-T06 fica implementada; ainda exige aplicar a nova migration no Supabase e
  ter Stripe Live configurado para criar promotion codes reais.
- A comissão é calculada sobre dados reais do Stripe, sem hardcode de preço.
- O app não realiza payout automático; o admin mostra quanto deve ser pago.

---

## D-098 — WV2-T07 foi absorvida por entregas específicas da v2

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: WV2-T07 existia para reconstruir, sob demanda, features úteis do
HWD v1 sobre a World v2. As demandas explícitas eram camadas ao vivo, toggle de
base e notificar círculo. Durante as fases seguintes, essas capacidades deixaram
de ser uma única tarefa genérica e foram absorvidas por entregas mais
específicas.

**Decision**:

1. Camadas ao vivo e toggle de base são parte da World v2 atual:
   `WorldV2.tsx` controla radar, alertas, vento, ciclone, flood, surge,
   wind impact, tornado e base dark/satellite.
2. Notificar círculo deixou de ser ação genérica do HUD e virou ação contextual:
   `MemberSheet` envia pings/presets e o executor de plano alerta o círculo ao
   iniciar/cancelar plano.
3. Marcadores de família foram tratados na trilha FAM, não em WV2-T07.
4. O HWD v1 permanece referência histórica; a v2 é a superfície canônica.

**Consequences**:

- WV2-T07 fecha sem código novo.
- Futuras features de mapa entram como tarefas específicas, não como "copiar HWD
  v1".
- O próximo item PENDING é LA-T06, mas depende de parâmetros do dono/Stripe.

---

## D-097 — World v2 tem validação reproduzível de produção

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: WV2-T05 herdou os gates de HWD-06: E2E de navegador, a11y/perf,
custo de provider e privacidade/proveniência. O rollout para `/dashboard` já
tinha ocorrido por decisão do dono (D-063), então faltava transformar a revisão
em evidência repetível.

**Decision**:

1. Criar `scripts/world-v2-validation.mjs`.
2. Adicionar `npm run test:world-v2`.
3. Auditar `/dashboard` em mobile e desktop com Playwright real.
4. Medir tempo de navegação, recursos e bytes transferidos.
5. Validar existência de equivalente textual, proveniência, nomes acessíveis e
   tamanho mínimo dos controles EOS.
6. Registrar postura de custo por provider sem congelar preços.

**Consequences**:

- WV2-T05 fica concluído com relatório em
  `docs/29-world-v2-production-validation.md`.
- A validação atual passou com 0 console errors, 0 controles sem nome e 0 alvos
  pequenos em controles EOS.
- O script cria e remove usuário de teste via Supabase service role, como os
  outros testes de navegador do projeto.

---

## D-096 — Pilot revisa planos como propostas confirmáveis

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: PLAN-T07 estava bloqueado até UPP-03 porque o Pilot só poderia
propor ou revisar planos se a arquitetura já impedisse escrita silenciosa. O
plano da família é dado sensível e operacional: uma alteração invisível em ponto,
papel, rota ou gatilho pode fazer membros executarem versões diferentes.

**Decision**:

1. `/plan` ganha uma seção "Revisão do Pilot".
2. O Pilot propõe elementos pequenos, não substitui o documento inteiro.
3. A proposta pode virar apenas rascunho local depois do clique do usuário.
4. Persistência continua exclusiva do botão "Salvar plano", com versionamento,
   push ao círculo e reconhecimento explícito.
5. A implementação inicial é determinística para não inventar coordenadas,
   rotas, membros ou autoridade externa.
6. Qualquer evolução com modelo deve usar OpenAI como provider de AI e manter a
   mesma confirmação elemento a elemento.

**Consequences**:

- PLAN-T07 fica concluído sem nova migration.
- O Pilot pode revisar gatilhos e papéis sem gravar nada sozinho.
- Rotas e pontos continuam autorais; o Pilot não cria coordenadas fictícias.

---

## D-095 — Memória do Pilot só muda com confirmação e auditoria atômica

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: `pilot_memory_md` existia desde D-059, mas sem fluxo próprio para o
Pilot propor uma memória e o usuário confirmar. PLAN-T07 depende desta trava:
sem confirmação/auditoria, qualquer escrita do Pilot em estado persistente vira
mutação silenciosa.

**Decision**:

1. Criar `pilot_memory_events` como trilha de auditoria por perfil.
2. Criar RPC `confirm_pilot_memory(...)` para atualizar `pilot_memory_md` e
   inserir o evento na mesma transação.
3. Criar `POST /api/profile/personalization/memory` como rota autenticada de
   confirmação.
4. `/api/pilot/chat` pode retornar propostas `memory[]`, mas não grava.
5. A UI do Pilot mostra título, motivo e Markdown exato antes do botão de salvar.
6. O QR público continua sem expor memória do Pilot.

**Consequences**:

- UPP-03 desbloqueia trabalhos futuros em que Pilot propõe revisão de plano sem
  escrita silenciosa.
- Nova migration `20260803003000_pilot_memory_events.sql` precisa ser aplicada.
- Se a migration não existir, a rota retorna 503 e não atualiza memória.

---

## D-094 — Texto livre do simulador preenche painéis revisáveis

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: A spec do simulador dizia que linguagem natural é válida, mas que a
inferência precisa ser revisável antes de rodar. A tela já tinha textarea, porém
o texto só ficava como descrição; ele não configurava ameaça, severidade,
falhas, fontes ou leituras simuladas.

**Decision**:

1. Criar `POST /api/simulation/parse` autenticado.
2. Usar OpenAI para converter texto livre em patch validado de
   `SimulationConfig`.
3. Validar enums, booleanos e faixas numéricas no servidor.
4. Aplicar o patch aos painéis existentes, mantendo o texto original.
5. Mostrar notas de inferência para revisão.
6. Não iniciar simulação automaticamente e não gravar dados.

**Consequences**:

- "Furacão categoria 3 chegando em 12 horas, sem luz e minha filha machucou o
  joelho" passa a preencher os painéis correspondentes.
- O usuário continua no cockpit e pode ajustar qualquer campo antes de iniciar.
- OpenAI é usado como provider de AI desta inferência; o output do modelo não é
  autoridade direta.

---

## D-093 — Pilot educador usa propostas confirmáveis de preparação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono quer que o Pilot seja educador/host situacional, guiando a
família nas decisões em vez de apenas responder como chat. Depois de SIM-T11, o
produto passou a ter um contrato claro para transformar orientação em preparação:
tipo, fonte, destino e confirmação explícita.

**Decision**:

1. `/api/pilot/chat` passa a pedir e normalizar `kind` em cada task:
   `resource`, `task`, `plan_review` ou `comms_setup`.
2. A fonte e o destino da proposta são definidos pelo servidor, não pelo modelo.
3. A UI do Pilot mostra tipo, fonte e destino antes do botão de confirmação.
4. Itens confirmados pelo Pilot usam `kit_type=PILOT_RECOMMENDATION`.
5. Preparação mostra "Fonte: Recomendação do Pilot" para esses itens.
6. O provider de AI segue sendo OpenAI para Pilot/RAG.

**Consequences**:

- Pilot passa a ser educador acionável: instrui, pergunta quando falta contexto
  essencial e converte orientação em trabalho confirmado.
- Não há escrita silenciosa em checklist, inventário, plano, Comms ou memória.
- Um modelo dedicado de Preparedness Items continua fora desta task.

---

## D-092 — Debrief de simulação vira proposta confirmável de preparação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: SIM-T05/SIM-T06 já calculavam lacunas do treino e permitiam salvar
alguns itens no checklist. Para o Preparedness Engine, isso precisava virar um
contrato mais explícito: o usuário deve ver o que está sendo proposto, de onde
veio, qual tipo de ação é, e só então confirmar a escrita.

**Decision**:

1. Cada lacuna acionável do debrief passa a carregar tipo: recurso, tarefa,
   revisão de plano ou setup de Comms.
2. A UI mostra fonte e destino antes da confirmação.
3. A escrita continua item a item, nunca silenciosa e sem "aceitar tudo".
4. Itens confirmados usam o contrato existente de checklist com
   `kit_type=SIMULATION_DEBRIEF`.
5. Preparação mostra a origem "Debrief da simulação" nos itens salvos.
6. Não criar nova tabela em SIM-T11; um modelo persistente próprio de
   Preparedness Items fica para decisão futura se o checklist não bastar.

**Consequences**:

- O debrief vira ponte real entre treino e preparação.
- A origem persiste de forma simples via `kit_type`.
- PILOT-T08 deve seguir o mesmo padrão: propor, mostrar fonte e confirmar antes
  de escrever.

---

## D-091 — Onboarding preserva o contexto do convite de simulação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: A principal aquisição imaginada pelo dono é rodar um cenário
simulado e convidar pessoas para participar. O fluxo antigo tratava `/sim/[token]`
como rota protegida; usuário não logado ia para login, o login ignorava
`redirectTo`, e o onboarding não sabia qual cenário trouxe a pessoa.

**Decision**:

1. `/sim/[token]` deixa de depender do middleware para carregar contexto.
2. O link de simulação continua não sendo autoridade: só registra o usuário como
   `invited` depois de autenticação.
3. Login/signup preservam `redirectTo`.
4. `/onboarding` mostra o cenário do convite quando veio de `/sim/[token]`.
5. Depois de salvar perfil, onboarding devolve o usuário ao convite para entrar
   pelo mesmo pop-up de aceitação.
6. Nenhuma tabela nova é necessária.

**Consequences**:

- Novo `GET /api/simulation/join/[token]` para consultar contexto do convite.
- `/sim/[token]` funciona como ponte pública de contexto + doorbell autenticado.
- O próximo passo pode transformar esse contexto em tarefas/preparação, mas
  escrita persistente continua fora de ONB-T01.

---

## D-120 — O `main` ganha um portão

**Contexto.** Até aqui, a única verificação antes de um deploy era o que eu
lembrasse de rodar na minha máquina. O histórico mostra o custo disso: uma tela
preta em **todo** o app, 64 arquivos de lixo entrando no precache e um `sw.js`
que nunca registrava — os três chegaram a produção, e os três eram pegáveis por
`type-check` ou `build`. Faltava alguém rodando **sempre**, não alguém rodando
melhor.

**Decisão.** `.github/workflows/ci.yml` roda tipos, lint, testes unitários e
build a cada push e a cada PR no `main`. Nessa ordem, de propósito: o que falha
rápido falha primeiro, para quem quebrou um tipo não esperar o build inteiro.

**O que o CI NÃO roda, e por quê.** Os testes de navegador ficam de fora.
Todos criam contas no Supabase de **produção** — é o único projeto que existe.
Rodá-los a cada push despejaria dado de teste no banco dos usuários reais várias
vezes por dia, e exigiria a chave service-role como segredo do GitHub. Eles
continuam sendo rodados à mão, com a limpeza garantida pelo D-114/D-119.

**Ambiente falso de propósito.** O build não precisa de banco de verdade, e
segredo que não está no CI é segredo que não vaza. Verificado localmente com o
`.env.local` fora do caminho: compila.

**Varredura do repositório, feita porque ele é PÚBLICO.** Nenhum `.env` real
jamais foi versionado, e cruzando cada valor do `.env.local` com o histórico
inteiro, os únicos que aparecem são `NEXT_PUBLIC_SITE_URL` e `VAPID_SUBJECT` —
uma URL e um `mailto:`, públicos por definição. Chave de serviço, OpenAI, VAPID
privada e `CRON_SECRET` nunca entraram em commit nenhum.

Isso **não** anula a pendência de rotação: os segredos foram expostos em
conversa, não no repositório. Mas separa as duas coisas, que estavam
misturadas.

**Primeira execução: verde.**

---

## D-119 — Erro na tela do usuário vira linha, e o dono fica sabendo

**Contexto.** O D-118 tornou visível o erro do **servidor**. Faltavam as duas
metades que sobraram: o erro de JavaScript no navegador da pessoa continuava
morrendo ali mesmo, e o `error_log` dependia de alguém lembrar de consultar. Um
registro que depende de memória humana ainda é meio invisível.

**Decisão.** Nenhuma conta nova, nenhum fornecedor.

*Captura.* `ClientErrorReporter` escuta `error` e `unhandledrejection` no layout
**raiz** — não no autenticado. A tela de entrada é onde uma falha dói mais:
quem não consegue entrar não consegue reportar nada.

*Aviso.* `avisarErrosNovos()` pega carona no cron que já roda de quinze em
quinze minutos e já tem o segredo. Nenhum agendador novo para configurar e para
esquecer.

**A marca d'água é a própria notificação anterior.** Guardar "até onde já
avisei" pediria coluna nova e outra migration; a última notificação enviada já
responde exatamente essa pergunta. Se o envio falhar, a marca não avança e a
próxima rodada tenta de novo — nada se perde em silêncio.

**Um reportador de erro mal-feito vira o próximo incidente.** Três travas: ele
nunca reporta a própria falha de envio (senão o `fetch` que reporta erro gera
erro, que gera erro); teto de cinco por sessão, porque uma tela quebrada dentro
de um `requestAnimationFrame` dispara centenas de vezes por segundo; e a mesma
mensagem viaja uma vez só.

**A rota aceita anônimo, e por isso é tratada como hostil.** Teto por IP no
Postgres, corpo limitado a 8 KB, e **query e hash removidos da URL antes de
gravar** — um link de convite ou de recuperação de senha carrega token na query,
e ele não pode virar log. O teste prova isso com um token de verdade na URL.

**Bug encontrado no caminho, e ele é da mesma família.** `guardrails-test.mjs`
terminava com `process.exit()`, e **`process.exit()` não dispara `beforeExit`** —
o gancho onde mora a limpeza do D-114. O teste passou por fora da rede de
proteção sem avisar nada e deixou **7 contas no banco de produção**. Corrigido
com `finish(fail)` em `scripts/lib/test-cleanup.mjs`; todo script de teste passa
a terminar por ali. As 7 contas foram removidas; restaram 0 de teste e 9 reais.

**Prova.** `scripts/client-error-test.mjs`, 6/6, com **três controles
negativos** — ruído conhecido não grava, 30 disparos da mesma falha gravam uma
linha só, token na URL não aparece no log. Provar que grava é metade do
trabalho; a outra metade é provar que não grava o que não deve. O push do
passo 5 foi enviado de verdade (`enviados=1`).

**O que continua fora.** Sem Sentry, não há agrupamento automático, nem *source
map* (a pilha vem minificada), nem histórico por versão. É a diferença entre bom
diagnóstico e nenhum diagnóstico que estava em jogo, e essa está resolvida.

---

## D-118 — Guardrails de custo e visibilidade operacional

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O roadmap mantinha `LA-T04` em DRAFT porque o rate limit dependia
de Upstash Redis, mas o app caía para um `Map` em memória quando Upstash não
estava configurado. Em serverless, esse fallback não é limite distribuído: cada
instância tem o próprio contador. Ao mesmo tempo, rotas caras de IA podiam
consumir OpenAI sem orçamento diário robusto, e erros de produção ficavam
invisíveis enquanto Sentry não tivesse DSN.

**Decision**:

1. Não bloquear `LA-T04` em Upstash. Supabase/Postgres passa a ser o guardrail
   distribuído v1, usando a função atômica `consume_rate_limit`.
2. `lib/rate-limit.ts` mantém a ordem: Upstash se existir, Postgres distribuído,
   memória apenas como fallback de degradação.
3. Rotas de IA caras passam a usar orçamento por minuto e por dia:
   `/api/pilot/chat` e `/api/weather-intelligence/custom-activity`.
4. `custom-activity` passa a exigir autenticação para que exista identidade a
   limitar.
5. Enquanto Sentry estiver sem DSN, `error_log` no Postgres guarda erro
   sanitizado por `scope`, `message`, `stack`, `user_id` e contexto escalar.
6. `/api/health` expõe o estado operacional de rate limit, error log, Sentry,
   OpenAI, push e cron sem expor segredo.

**Consequences**:

- Requer migration `20260804180000_rate_limit_and_error_log.sql`.
- Sem migration, o app degrada para memória e `/api/health` mostra
  `migration_pending`.
- Não registra conteúdo de conversa, ficha médica, coordenadas, tokens, cookies
  ou chaves.

---

## D-118 — Limite de uso é do banco, e erro de produção deixa de ser invisível

**Contexto.** A varredura do roteiro achou dois buracos que nenhum teste pegava
porque nenhum teste olhava para eles.

O primeiro custa dinheiro: `/api/pilot/chat` é o endpoint mais caro do produto —
gpt-4.1, mais embedding, mais tradução da pergunta, mais busca no RAG — e não
tinha limite **nenhum**. O cadastro é aberto. Uma conta criada em trinta segundos
podia queimar a conta da OpenAI do dono num laço de `fetch`. Pior:
`/api/weather-intelligence/custom-activity` chamava o modelo **sem exigir
sequer login**.

O segundo custa tempo: erro de servidor em produção não era registrado em lugar
nenhum. O Sentry está no código desde o começo, e **sem DSN**. Foi assim que o
push ficou meses quebrado sem ninguém saber, e assim que a rota do cron passou
meses devolvendo 401 em silêncio.

**Decisão.** Nenhum fornecedor novo: o Postgres que já paga a conta resolve os
dois. `consume_rate_limit()` incrementa e decide numa única declaração —
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` — sob o lock da linha. E
`error_log` guarda onde, quando, qual mensagem e qual pilha.

**Por que atômico, e não ler-depois-escrever.** Ler o contador e gravar em
seguida deixa duas requisições simultâneas lerem 9 e passarem as duas. O limite
vira decorativo justamente sob a carga em que ele importa.

**Por que no banco, e não em memória.** O limitador já existia e caía para um
`Map` de processo quando o Upstash não está configurado — que é o caso aqui.
Em serverless, isso significa N instâncias vezes o limite. Isso não é teoria:
com o fallback ativo, **as 14 chamadas seguidas ao Pilot passaram todas** no
teste. É a medição que justifica a migration.

**O que o log NUNCA guarda.** Conteúdo de conversa com o Pilot, ficha médica,
posição da família, chaves. Um log existe para achar o defeito, não para ler a
vida de ninguém — e um log com dado sensível é um vazamento esperando o primeiro
acesso indevido. `lib/error-log.ts` filtra por nome de campo e só aceita
escalares, porque um objeto aninhado carrega qualquer coisa dentro.

**Falso verde encontrado no próprio verificador.** A primeira versão de
`/api/health` consultava `error_log` com `select(head: true)` e respondeu **`ok`
para uma tabela que não existia** — o PostgREST devolve PGRST205, e o código só
tratava 42P01. Um verificador de saúde que dá verde no que está quebrado é pior
que não ter verificador: cria confiança falsa. Agora faz leitura real e trata os
dois códigos.

**Prova.** `scripts/guardrails-test.mjs`, com navegador de verdade contra o
servidor de produção compilado. Enquanto a migration não estiver aplicada, o
teste **falha de propósito** e diz exatamente por quê — em vez de passar
descrevendo um limite que não existe.

---

## D-117 — Badges de notificação são separados por surface do app

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono decidiu separar as notificações por ícone/página. Tudo que é
Comms deve aparecer no ícone Comms; Weather no ícone Clima; Preparação no ícone
Preparação; Família no ícone Família; e Cenário no ícone Cenário. O badge
global em Comms misturava sinais diferentes demais.

**Decision**:

1. A tabela única de notificações permanece, sem migration nova.
2. Cada notificação recebe uma `surface` canônica derivada de `metadata.surface`,
   `scope` e `kind`.
3. Surfaces v1: `weather`, `family`, `comms`, `preparedness`, `scenario`,
   `system`.
4. `/api/comms/notifications` retorna `unread_by_surface`.
5. BottomNav mostra badges separados em Clima, Família, Preparação, Comms e
   Cenário.
6. Clicar em um ícone com badge abre o Inbox filtrado por aquela surface; clicar
   em um item continua levando ao `href` correto.

**Mapping v1**:

- `weather_alert` / `scope=weather` → `weather`.
- `message` → `comms`.
- `edu_content_approved` / `scope=edu` → `preparedness`.
- `simulation_invite` / `scope=simulation` → `scenario`.
- `join_request_approved`, `member_joined`, `family_invite`,
  `family_invite_accepted`, `family_invite_denied` → `family`.

**Consequences**:

- Notificações antigas continuam funcionando porque a surface é derivada.
- Novas notificações passam a gravar `metadata.surface` pelo helper.
- `system` fica disponível para notificações futuras fora do BottomNav.

---

## D-116 — BottomNav prioriza Clima no primeiro item

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu para trocar as posições de Clima e Cenário no
BottomNav. A preferência operacional é que Clima seja o primeiro ícone da
esquerda para a direita, e Cenário seja o último ícone da esquerda para a
direita.

**Decision**:

1. `nav.weather` passa a abrir a sequência do BottomNav.
2. `nav.scenario` passa para o último item do BottomNav.
3. O item central World/Dashboard permanece no mesmo lugar.
4. Comms mantém a regra de Inbox quando houver badge.

**Consequences**:

- Não requer migration.
- A ordem visual fica: Clima, Família, Preparação, World, Comms, Círculos,
  Cenário.

---

## D-115 — Notificação de mensagem também atualiza o chat

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: No teste real do dono, a notificação de nova mensagem chegava, mas
o chat nem sempre recebia a mensagem, e clicar no resumo podia parecer não fazer
nada. O teste local com duas sessões confirmou que API e banco gravam a mensagem
e criam o `href`, mas a UI dependia demais do realtime direto de
`circle_messages` e de navegação client-side suave.

**Decision**:

1. O realtime de `circle_notifications` passa a ser fallback ativo do chat:
   quando chegar uma notificação `kind='message'` do círculo aberto, `/comms`
   recarrega as mensagens daquele círculo.
2. O clique no Inbox usa navegação hard (`window.location.assign`) depois de
   disparar `mark_read` com `keepalive`, para funcionar mesmo quando o App
   Router/PWA estiver em estado intermediário.
3. O realtime direto de `circle_messages` continua como caminho primário; polling
   continua fallback lento.

**Consequences**:

- Não requer migration.
- O sintoma "badge/notificação chega, mas conversa não atualiza" fica coberto
  porque a própria notificação agora acorda o chat.

---

## D-114 — Inbox deve navegar sem bloquear e `/comms` deve reagir à query

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Em teste real, a notificação aparecia, mas clicar no resumo não
levava de forma confiável para a mensagem, e o chat parecia parar de receber a
conversa. A causa operacional é que o Inbox aguardava marcação como lida antes
de navegar, e `/comms` lia `circleId`/`messageId` apenas no mount.

**Decision**:

1. Clique em item do Inbox navega imediatamente para o `href`; marcar como lido
   roda em paralelo.
2. `/comms` passa a observar `useSearchParams`, para reagir a mudanças de
   `view`, `circleId` e `messageId` sem depender de reload completo.
3. Scroll de mensagem focada usa o container do chat, não a página inteira.
4. O foco visual da mensagem expira depois de alguns segundos, para novas
   mensagens voltarem a auto-enquadrar no fim da conversa.

**Consequences**:

- Não requer migration.
- O Inbox fica mais parecido com apps sociais: toque primeiro transporta; estado
  de leitura atualiza em seguida.

---

## D-113 — Inbox EOS segue padrão social Today / Last 7 days

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono esclareceu que o clique no ícone Comms com badge não deve
levar para a timeline interna do Comms. A experiência esperada é mais próxima do
Instagram: clicar no ícone de notificações abre uma tela/lista social com
seções como Today e Last 7 days; clicar em "EOS off grid enviou uma msg" leva
direto para a mensagem.

**Decision**:

1. Comms com badge sempre abre o Inbox EOS global, nunca `/comms?view=timeline`.
2. Inbox mostra notificações recentes lidas e não lidas, agrupadas em Today,
   Last 7 days e Earlier.
3. O badge continua contando apenas não lidas.
4. Clicar em um item marca aquele grupo como lido e navega para o `href`.
5. O chat do círculo usa scroll do container para enquadrar a última mensagem,
   porque `scrollIntoView` sozinho pode rolar a página, não a caixa do chat.

**Consequences**:

- Não requer migration.
- A timeline interna de `/comms` permanece acessível, mas deixa de ser o destino
  do ícone Comms quando há badge.

---

## D-112 — Inbox/EDU polish e notificações operacionais verificáveis

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O teste real confirmou que mensagens no Comms ficaram
instantâneas, mas revelou ajustes de experiência: chat precisa permanecer
enquadrado na última mensagem, timeline precisa colapsar histórico antigo, EDU
precisa mostrar menos metadados por padrão, e notificações de EDU/simulação
precisam aparecer de forma verificável.

**Decision**:

1. O chat do círculo mantém scroll automático para a última mensagem quando o
   usuário está no chat.
2. A timeline do Comms mostra 4 notificações por padrão e permite expandir para
   consultar as antigas.
3. EDU mostra título e vídeo por padrão; resumo/metadados/transcript ficam
   recolhidos atrás de "Mais".
4. O vídeo mais clicado no EOS fica em destaque; os demais começam como títulos,
   expandem para thumbnail/vídeo e depois para detalhes.
5. EDU aprovado notifica também o usuário admin que publicou, para teste e
   auditoria do próprio dono.
6. Convite de simulação permanece com pop-up, mas também precisa entrar no
   Inbox EOS como histórico acionável.

**Consequences**:

- Requer migration `20260804015000_edu_view_count.sql`.
- `edu_content.view_count` é métrica simples de destaque v1, não analytics
  completo.
- O Inbox segue app-level; não muda push/SMS/dispatch.

---

## D-111 — Comms vira Inbox EOS global

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de D-109/D-110, o badge do Comms já indicava interações,
mas a experiência ainda tratava notificações como uma aba dentro de Comms. O
dono pediu uma janela expandida com resumos acionáveis e destinos por tipo:
mensagem abre chat, alerta meteorológico abre Weather, material EDU abre EDU e
convite de simulação abre o fluxo de simulação.

**Decision**:

1. O ícone Comms passa a representar o **Inbox EOS**.
2. Se houver notificações não lidas, clicar Comms abre uma janela global sobre a
   tela atual; se não houver, navega para o chat.
3. Abrir o Inbox não marca notificações como lidas.
4. Clicar em um item marca somente aquele item como lido e navega para `href`.
5. `circle_notifications` evolui para notificações app-level com `scope`,
   `severity`, `source_key` e `metadata`; `circle_id` passa a ser opcional.
6. Novas fontes iniciais:
   - chat e interações de círculo/Família íntima;
   - conteúdo EDU aprovado;
   - convite para simulação;
   - alerta meteorológico pessoal por cron servidor.

**Consequences**:

- Requer migration `20260804014000_inbox_eos_notifications.sql`.
- Weather v1 roda por Vercel Cron a cada 15 minutos com `CRON_SECRET`.
- Inbox EOS continua sendo app-level persistente; não é SMS, dispatch ou push
  garantido.

---

## D-110 — Comms precisa ser realtime-first no Web/PWA

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: No teste real do dono, mensagens e números de notificação
apareceram apenas depois de alguns minutos. D-109 criou a timeline persistente,
mas o cliente ainda dependia de polling para perceber novidades, o que não é
compatível com a expectativa de chat/social apps.

**Decision**:

1. Comms usa realtime como caminho primário no Web/PWA.
2. `circle_messages` publica inserts para membros do círculo ativo.
3. `circle_notifications` publica inserts/updates para o destinatário.
4. Badge vermelho atualiza assim que uma notificação chega.
5. `/comms` recarrega o chat quando chega uma mensagem no círculo ativo.
6. Polling continua apenas como fallback de reconciliação.
7. Realtime não muda a natureza do produto: continua app-level, não push
   garantido, SMS, dispatch ou alerta de emergência.

**Consequences**:

- Requer policies RLS de leitura controlada para realtime:
  membros leem mensagens do próprio círculo; usuários leem notificações
  destinadas a eles.
- Escrita continua pelas APIs do app.
- Requer migration `20260804013000_comms_realtime.sql`.

---

## D-109 — Comms vira timeline social de notificações

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu que Comms mostre um número vermelho ao lado do ícone,
como apps Apple/social, sempre que houver mensagem, convite aceito ou alguém
entrar no círculo. Ao clicar, o usuário precisa ver uma timeline das interações,
não apenas o chat.

**Decision**:

1. Criar `circle_notifications` como feed durável por usuário/círculo.
2. A badge vermelha no ícone Comms usa a contagem de notificações não lidas.
3. `/comms` passa a ter uma timeline de notificações com eventos recentes.
4. Eventos iniciais:
   - nova mensagem de círculo para os demais membros;
   - pedido de entrada aprovado para o usuário aprovado;
   - novo membro entrou para os membros existentes;
   - convite de Família íntima enviado;
   - convite de Família íntima aceito/recusado.
5. Abrir a timeline marca as notificações como lidas via API explícita.
6. Isto é app-level notification/timeline, não push garantido, SMS, alerta de
   emergência ou dispatch.

**Consequences**:

- Comms deixa de ser só chat/rádio e passa a registrar interações sociais do
  círculo.
- Badge e timeline sobrevivem reload porque vêm do banco.
- Migration necessária: `20260804012000_circle_notifications.sql`.

---

## D-108 — Família íntima é convite aceito pelo dono da ficha

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de D-107, a UI ainda mostrava "Pedir Família íntima" na
linha do próprio usuário. Isso era confuso e errado: Paulo, como criador do
círculo `Libanio's Family`, não precisa pedir a si mesmo para entrar na própria
família. O caso real é: Paulo quer pedir para Daniela aceitar entrar na Família
íntima, porque a ficha master pertence a Daniela.

**Decision**:

1. O pedido de Família íntima é iniciado por Admin/head do círculo para outro
   membro.
2. O aceite/recusa só pode ser feito pelo próprio dono da ficha, na conta dele.
3. Admin não pode aprovar ficha master de outro adulto sem aceite desse adulto.
4. Admin pode remover/revogar alguém da Família íntima.
5. O próprio usuário, quando vê um pedido pendente na sua linha, pode aceitar,
   recusar ou sair da Família íntima.
6. `family_access_requested_by` registra quem iniciou o pedido.

**Consequences**:

- Na conta de Paulo, a linha de Paulo não mostra mais "Pedir Família íntima".
- Na conta de Paulo, a linha de Daniela mostra "Convidar Família íntima" quando
  ainda não há pedido/aprovação.
- Na conta de Daniela, a linha dela mostra "Aceitar Família íntima" ou "Recusar"
  quando Paulo tiver convidado.
- O Pilot só lê ficha master de Daniela depois de Daniela aceitar.
- Migration necessária: `20260804011000_circle_family_access_requested_by.sql`.

---

## D-107 — Círculo não é Família íntima

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: D-106 corrigiu o Pilot para reconhecer membros reais do círculo,
mas ainda confundia dois níveis de confiança. Entrar em um círculo permite
coordenação, chat, simulação, plano e compartilhamentos limitados. Isso não deve
equivaler a entrar na família íntima nem autorizar automaticamente leitura de
ficha master de outra pessoa pelo Pilot.

**Decision**:

1. Círculo e Família íntima passam a ser conceitos separados.
2. Um usuário pode ser membro do círculo sem ser membro da Família íntima.
3. Entrar na Família íntima exige pedido/autorizaçao própria dentro do círculo.
4. `circle_members.family_access_status` registra `none`, `requested`,
   `approved` ou `denied`.
5. Apenas `family_access_status='approved'` autoriza o Pilot a ler ficha master
   médica/contato de outro usuário do círculo.
6. `shared_fields.medical` volta a significar compartilhamento operacional do
   item médico/estoque do círculo, não acesso íntimo à ficha master.
7. Localização continua independente: `location` em `shared_fields` segue sendo
   o consentimento explícito para mapa/Pilot citar posição.

**Consequences**:

- O Pilot não lê ficha master de um conhecido/vizinho do círculo só porque essa
  pessoa participa do círculo.
- O painel de Círculos passa a mostrar o estado Família íntima por membro e
  permitir pedido, cancelamento, aprovação e negação.
- Migration necessária: `20260804010000_circle_family_access.sql`.
- D-106 fica refinada por D-107: "ficha visível do círculo" significa
  identificação e permissões operacionais; ficha master íntima exige aprovação
  de Família.

---

## D-106 — Pilot lê fichas visíveis do círculo

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono perguntou pela ficha master de Daniela Oliveira pelo Pilot.
Depois de D-105, o Pilot já lia a ficha master do usuário autenticado e seus
dependentes cadastrados em `family_members`, mas não lia os perfis dos outros
usuários que participam do mesmo círculo. Isso fazia o Pilot responder que a
pessoa não existia no sistema, mesmo quando ela estava no círculo.

**Decision**:

1. `/api/pilot/chat` passa a montar, no servidor, um bloco de contexto com os
   membros dos círculos do usuário autenticado.
2. O Pilot só pode usar campos de outro usuário quando a participação desse
   usuário no círculo autorizar o compartilhamento.
3. O campo `medical` em `circle_members.shared_fields` também libera a ficha
   médica visível ao Pilot: tipo sanguíneo, alergias, medicamentos e notas
   médicas. A semântica anterior de `medical` para pool de recursos continua.
4. `emergency_contact` libera nome/telefone do contato de emergência.
5. `location` continua exigindo consentimento explícito e não entra no legado
   "array vazio = compartilhar tudo".
6. Se a ficha existir mas o campo não estiver compartilhado, o Pilot deve dizer
   que o dado não está compartilhado no círculo. Se estiver compartilhado mas
   vazio, deve dizer que não consta.

**Consequences**:

- O Pilot deixa de tratar membros reais do círculo como inexistentes.
- Perguntas como "o que diz a ficha master da Daniela?" podem ser respondidas
  com os campos compartilhados por Daniela no círculo.
- Não há migration: o compartilhamento usa `shared_fields` existente.
- O uso de service-role fica restrito à rota server-side depois de confirmar que
  o usuário autenticado pertence aos círculos consultados.

---

## D-105 — Pilot lê ficha master e membros familiares no servidor

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono perguntou por que o Pilot não estava lendo a ficha da
família. O código enviava ao Pilot apenas agregados (`people`, bebê, condições
médicas e mobilidade), calculados no cliente a partir de `/api/family-members`.
A ficha master (`/api/profile/ficha`) com alergias, medicamentos, tipo sanguíneo,
contato de emergência e notas médicas não entrava no prompt conversacional.

**Decision**:

1. `/api/pilot/chat` passa a buscar a ficha master do usuário autenticado no
   servidor antes de chamar o modelo.
2. A mesma rota também busca os membros familiares do usuário com idade,
   condições, medicamentos, notas, bebê e mobilidade reduzida.
3. Esses dados entram no prompt como "FICHA DA FAMÍLIA / FAMILY RECORD".
4. O cliente continua podendo enviar agregados para cálculos rápidos, mas o
   servidor é a fonte para a ficha detalhada usada pelo Pilot conversacional.
5. O Pilot deve dizer "não consta na ficha" quando um dado sensível não estiver
   preenchido, em vez de inventar.

**Consequences**:

- Perguntas sobre alergias, medicamentos, contato de emergência, tipo sanguíneo
  e necessidades de membros podem ser respondidas pelo Pilot.
- Não expõe ficha de outros usuários/círculo: a rota lê apenas o usuário
  autenticado e seus `family_members`.
- O motor local/offline continua usando agregados; ficha detalhada é enriquecida
  pela rota online do Pilot.

---

## D-104 — EDU bloqueia ingestão RAG sem texto instrucional suficiente

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de EDU-T03, o dono perguntou o que acontece se um vídeo for
ingerido sem `Transcript / notas`. A resposta correta é que EOS só teria título,
resumo, URL e tags; isso cria risco de falso RAG, em que um link parece conteúdo
ingerido mas não contém instrução suficiente para o Pilot responder com fonte.

**Decision**:

1. EDU-T04 adiciona um guardrail de qualidade antes da ingestão RAG.
2. O texto instrucional contado para ingestão vem apenas de `summary` e
   `transcript/notas`.
3. `title`, `source_url` e tags continuam entrando como metadados no chunk, mas
   não bastam para liberar a ingestão.
4. A ingestão exige no mínimo 160 caracteres de texto instrucional.
5. O Admin EDU mostra a contagem de caracteres instrucionais por item e desabilita
   "Ingerir RAG" quando o conteúdo é insuficiente.

**Consequences**:

- Um vídeo só com URL não entra no RAG.
- O dono precisa adicionar resumo/notas antes de ingerir.
- YouTube API/transcript automático continuam fora; esta fase só impede ingestão
  vazia ou enganosa.

---

## D-103 — EDU aprovado pode ser ingerido para o RAG com proveniência

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: EDU-T01 criou o catálogo aprovado e `rag_enabled`; EDU-T02 tornou
o vídeo consumível no app. O próximo passo é permitir que conteúdo aprovado do
dono alimente o RAG sem virar busca genérica nem escrita silenciosa em
`knowledge_base`.

**Decision**:

1. EDU-T03 cria ingestão admin-only de conteúdo `edu_content` para
   `knowledge_base`.
2. Só conteúdo `status='approved'` e `rag_enabled=true` pode ser ingerido.
3. O texto ingerido vem de `title`, `summary`, `transcript/notas`,
   `source_url` e tags. Não há YouTube API nem transcript automático.
4. A proveniência fica em `knowledge_base.source = 'edu:<edu_content.id>'` e
   `knowledge_base.source_version = 'v<edu_content.version>'`.
5. Reingerir um item apaga os chunks anteriores daquele `source` e grava chunks
   novos com embeddings OpenAI `text-embedding-3-small`.
6. Depois de inserir, `edu_content.rag_ingested_at` é atualizado.

**Consequences**:

- O Pilot/RAG passa a poder recuperar conteúdo aprovado do dono quando
  semanticamente relevante.
- Não há nova migration nesta fase; o schema atual de `knowledge_base` já tem
  `source_version`.
- Captura automática de transcript, scraping de YouTube e criação de tarefas a
  partir de EDU continuam fora até decisão própria.

---

## D-102 — Rotas admin exigem privilégio no middleware

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: As APIs admin já validam `ADMIN_EMAILS`, e `/edu` só mostra o botão
Admin EDU quando `/api/edu` retorna `canAdmin=true`. Mesmo assim, uma rota
`/admin/*` carregada por usuário autenticado comum dependeria da tela cliente
para mostrar 403. Para superfícies administrativas, a autorização deve acontecer
antes de renderizar a página.

**Decision**:

1. Todo pathname `/admin` ou `/admin/*` exige usuário autenticado e
   `isAdminEmail(user.email)` no middleware.
2. Usuário autenticado não-admin é redirecionado para `/dashboard` antes de
   carregar a UI admin.
3. As APIs admin continuam mantendo seus próprios 403 server-side; middleware é
   defesa adicional, não substituição.
4. O botão Admin EDU em `/edu` continua condicionado a `canAdmin=true` vindo de
   `/api/edu`.

**Consequences**:

- Usuários comuns não veem o botão Admin EDU e não carregam páginas `/admin/*`.
- Links admin em Settings e EDU podem existir para admins sem expor superfície
  administrativa a usuários comuns.

---

## D-101 — EDU exibe vídeo aprovado dentro do EOS

**Date**: 2026-08-04
**Status**: DECIDED / IMPLEMENTADO

**Context**: EDU-T01 permite ao dono cadastrar vídeo do YouTube como conteúdo
aprovado, mas o usuário ainda sai do app pelo link da fonte para assistir. Para
o Preparedness Engine funcionar como experiência guiada, o conteúdo aprovado
precisa ser consumível dentro do `/edu` sem confundir isso com ingestão RAG.

**Decision**:

1. EDU-T02 adiciona consumo de vídeo aprovado dentro do `/edu`.
2. Quando `source_type='youtube'` e `source_url` for reconhecida, o app renderiza
   um player embutido com domínio `youtube-nocookie.com`.
3. A fonte continua visível como link externo; o player não substitui
   proveniência.
4. Sem YouTube API, transcript automático, embeddings ou escrita em
   `knowledge_base` nesta tarefa.
5. URLs não reconhecidas continuam degradando para o link de fonte.

**Consequences**:

- `/edu` passa a permitir assistir conteúdo YouTube aprovado no app.
- `edu_content` não muda; a URL existente é suficiente.
- A próxima evolução continua sendo ingestão aprovada para RAG com
  `edu_content.id/version` como proveniência, ou uma experiência de aula com
  progresso/checklists se for priorizada explicitamente.

---

## D-090 — EDU vira catálogo aprovado antes de alimentar RAG

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono quer usar o próprio canal do YouTube como fonte para EDU e
RAG do EOS. O risco é ligar YouTube/RAG direto sem catálogo, aprovação,
versionamento ou fonte visível, fazendo o Pilot responder com conteúdo sem
proveniência operacional.

**Decision**:

1. EDU-T01 cria um catálogo oficial `edu_content`.
2. Usuários autenticados veem apenas conteúdo `approved` em `/edu`.
3. O dono/admin (`ADMIN_EMAILS`) alimenta e edita o catálogo em `/admin/edu`.
4. Cada item guarda tipo de fonte, URL, tags de cenário, resumo, transcript/notas,
   status, versão e `rag_enabled`.
5. `rag_enabled` não escreve embeddings e não altera `knowledge_base`; é apenas
   a intenção de ingestão futura.
6. YouTube entra por URL/transcript/summary aprovados. Integração com YouTube API
   e ingestão automática ficam fora desta tarefa.

**Consequences**:

- Nova migration `20260803002000_edu_content.sql`.
- Novo endpoint `/api/edu`.
- Novas superfícies `/edu` e `/admin/edu`.
- Próxima evolução correta é um job de ingestão aprovado que leia `edu_content`
  e grave chunks em `knowledge_base` mantendo `edu_content.id/version` como
  proveniência.

---

## D-089 — Frequências de rádio são editáveis por círculo

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: A referência de frequências familiares inserida em D-088 não pode
ficar congelada no código. Cada família/círculo precisa ajustar canais, usos,
notas, serviços para escuta e guia rápido conforme seus rádios, região e plano.

**Decision**:

1. Criar `circle_radio_profiles` como documento JSON por círculo.
2. Todos os membros autenticados do círculo podem ler a referência.
3. Somente membros `Admin` ou `Editor` podem salvar alterações.
4. A referência padrão D-088 continua como fallback quando o círculo ainda não
   salvou um perfil próprio ou quando a migration não está aplicada.
5. A edição não altera a regra legal: EOS armazena referência operacional, não
   valida licença, autorização FCC, scanner, despacho, SMS ou transmissão real.
6. Não usar `circle_messages` para guardar configuração; chat e perfil de rádio
   são contratos separados.

**Consequences**:

- Nova migration `20260803001000_circle_radio_profiles.sql`.
- Novo endpoint `/api/comms/radio`.
- `/comms` ganha modo leitura/edição inline para canais VHF/UHF, referências
  nacionais, opções úteis, guia rápido e aviso legal.
- Próxima evolução possível: histórico/versionamento e perfis por cenário.

---

## D-088 — Comms inclui referência de frequências familiares pré-programadas

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois do chat do círculo entrar em COMMS-T01, o dono forneceu uma
referência visual com canais VHF/UHF da família, frequências nacionais, serviços
para escuta, opções MURS/GMRS/FRS e guia rápido de Baofeng UV-5R. O objetivo é
que a aba Comms tenha utilidade real antes de qualquer Mesh/LoRa.

**Decision**:

1. `/comms` passa a mostrar uma referência estática owner-provided de rádio:
   canais familiares VHF/UHF, frequências nacionais, NOAA, marítima, serviços
   de emergência para escuta, MURS/GMRS/FRS e guia rápido de uso.
2. Essa referência é conteúdo operacional do EOS, não fonte legal definitiva.
3. A tela deve manter aviso explícito: transmissão VHF/UHF de radioamador nos
   EUA exige licença apropriada em operação normal; em risco imediato, priorizar
   911/autoridades quando disponíveis e confirmar regras FCC/locais antes de
   transmitir.
4. Não há migration nesta etapa. Frequências editáveis por círculo ficam para
   evolução futura.
5. Mesh/LoRa continua bloqueado por G-05.

**Consequences**:

- `/comms` deixa de ter apenas um guia genérico de rádio e passa a carregar a
  tabela operacional inicial da família.
- O próximo passo natural em Comms, se priorizado, é tornar frequências
  configuráveis por círculo com permissões de Admin/Editor.
- A presença das frequências no app não transforma o EOS em rádio, SMS,
  dispatch, scanner garantido ou rede off-grid.

---

## D-087 — Comms começa como chat do círculo + guia de rádio, sem Mesh hardware

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: Depois de PREP-T01 liberar a antiga aba Checklist, o dono quer uma
aba Comms para comunicação do círculo, referência de rádio amador e futuro mesh.
O risco é misturar três coisas diferentes: chat app-level, alerta/dispatch e
hardware off-grid.

**Decision**:

1. COMMS-T01 começa no Web/PWA core com chat de texto por círculo.
2. Mensagens são `circle_messages`, escopadas ao círculo, com RLS deny-all e
   acesso apenas via API autenticada que checa membership.
3. Rádio/frequências entram como guia rápido e referência operacional na UI,
   sem transmissão real.
4. Mesh/LoRa fica visível como status/futuro canal, mas hardware continua
   bloqueado por G-05.
5. Chat não é alerta, SMS, dispatch, WhatsApp nem garantia de entrega fora do
   EOS.

**Consequences**:

- `docs/21-comms.md` passa a ser a spec canônica.
- Migration `20260803000000_circle_messages.sql` adiciona a tabela.
- `/api/comms/messages` é o contrato v1 para leitura/escrita.
- Próximas evoluções devem decidir retenção, push por mensagem, delete/edit,
  anexos e eventual alerta escalável separadamente.

---

## D-086 — Checklist e Recursos viram Preparação; Comms entra na navegação

**Date**: 2026-08-03
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu que Checklist e Recursos fossem unificados em uma
mesma aba, liberando o espaço da navegação para uma nova aba Comms. A página de
Recursos já continha o comportamento correto para PREP-T01: resumo de prontidão,
recursos reais, briefing OpenAI e checklist embutido com sincronização
checklist → inventário quando um item é marcado como adquirido.

Manter `/inventory` e `/checklist` como abas separadas preservaria a confusão de
fluxo que o Preparedness Engine existe para resolver.

**Decision**:

1. Criar `/preparedness` como a superfície única de Preparação.
2. Redirecionar `/inventory` e `/checklist` para `/preparedness`.
3. A aba antiga Recursos passa a abrir Preparação.
4. A aba antiga Checklist passa a abrir Comms.
5. Comms recebe uma primeira superfície navegável, mas sem backend de chat,
   retenção, permissões ou Mesh/LoRa. Isso continua para COMMS-T01.
6. Nenhuma migration é necessária: os contratos `/api/inventory` e
   `/api/checklist` continuam sendo as fontes atuais.

**Consequences**:

- O usuário vê uma única aba para recursos, tarefas, gaps e checklist.
- Links antigos para `/inventory` e `/checklist` não quebram, mas convergem para
  Preparação.
- O Pilot e o dashboard passam a apontar para `/preparedness`.
- COMMS-T01 permanece como próximo passo para especificar chat do círculo,
  rádio/frequências, permissões, retenção e relação com alertas.

---

## D-085 — Preparedness Engine transforma monitoramento em preparação acionável

**Date**: 2026-08-03
**Status**: DECIDED / DOCUMENTADO

**Context**: O dono definiu que o EOS não pode ser apenas um app que monitora
weather, hazards e sistemas externos. A maior solução de produto é ajudar a
família a se preparar: aprender, comprar/adquirir materiais, treinar, revisar
planos, convidar pessoas para simulações e melhorar comunicação antes da crise.

Também ficou claro que Checklist e Recursos estão artificialmente separados, e
que a nova aba Comms deve nascer no espaço liberado por essa unificação. EDU
deve poder ser alimentado por conteúdo aprovado do canal do dono no YouTube,
mas esse conteúdo só pode virar RAG/ação depois de ingestão, transcript,
classificação, aprovação e versionamento.

**Decision**:

1. Criar o **Preparedness Engine** como core Web/PWA, não como feature mobile.
2. Unificar Checklist + Recursos em **Preparação**, uma superfície para tarefas,
   materiais, gaps de aquisição, itens possuídos e prontidão por cenário.
3. Criar **Comms app-level** como lane própria: chat do círculo, guia rápido de
   rádio, frequências, referência de radioamador e status de canais. Mesh/LoRa
   hardware continua separado e bloqueado por G-05.
4. Criar **EDU** como fonte editorial aprovada do EOS. O canal do dono no
   YouTube pode alimentar EDU/RAG, mas só por fluxo especificado de ingestão,
   transcript, classificação por cenário, aprovação e versionamento.
5. Criar **onboarding contextual por simulação**: convidado entra pelo cenário
   que o trouxe e o Pilot guia até estar coberto pelo círculo/plano.
6. O Pilot passa a ter um papel explícito de **educador situacional**: instrui,
   pergunta, valida e conduz preparação, mas não escreve estado persistente sem
   confirmação.

**Consequences**:

- `docs/20-preparedness-engine.md` passa a ser a spec canônica.
- PREP-T00 fica completo; PREP-T01 é o próximo task de produto.
- Nenhuma migration, UI, YouTube API, chat, mobile, Automotive ou LoRa é
  autorizada por esta decisão.
- Toda recomendação de Pilot/EDU/Simulação que virar tarefa/recurso deve ter
  fonte visível e confirmação explícita do usuário.

---

## D-084 — EOS passa a ser plataforma multi-superfície, não quatro produtos

**Date**: 2026-08-03
**Status**: DECIDED / DOCUMENTADO

**Context**: O dono trouxe a intenção de levar o EOS para App Store, Google
Play, CarPlay, Web e futuras superfícies, junto com a evolução de EDU,
Preparação e Comms. O relatório externo `EOS-PHASE0-FOUNDATION-ALIGNMENT_1.md`
mostrou que o App Spine ainda descrevia uma estratégia antiga: Web PWA ativo,
React Native planejado e LoRa longo prazo, mas sem uma camada formal de
plataforma.

O risco seria abrir frentes paralelas — Web, iOS, Android, Automotive e Mesh —
como produtos separados, duplicando lógica de decisão, UI, regras de segurança,
consentimento e plano.

**Decision**:

1. **EOS será tratado como plataforma multi-superfície com um único core
   operacional.** Web/PWA permanece a superfície primária de validação.
2. **Não iniciar mobile agora.** G-03 continua aberto; `/mobile/` contém
   template/código conceitual e não é um app React Native inicializado.
3. **iOS e Android serão adapters nativos futuros**, usados para capacidades que
   a PWA não deve prometer sozinha: push nativo, background location, secure
   storage, câmera/QR, empacotamento e release nas lojas.
4. **CarPlay/Android Auto serão companion modes restritos**, não EOS completo no
   carro. Sem chat longo, edição de plano, vídeos ou simulador.
5. **Comms e Mesh não são a mesma coisa.** Comms app-level pode nascer no Web
   core; Mesh/LoRa hardware continua bloqueado por G-05.
6. O App Spine ganha **PHASE 0B — Foundation Alignment**, uma etapa documental
   curta para reconciliar plataforma, roadmap, gates e próxima fase de produto
   antes de novas features grandes.

**Consequences**:

- `docs/05-platform-strategy.md` passa a falar em Product Core, Domain Core,
  Shared UI e Platform Adapters.
- `docs/07-roadmap.md` registra PHASE 0B e a próxima fase de produto:
  Preparedness Engine.
- `docs/10-decision-gates.md` mantém G-03 e G-05 abertos e adiciona G-06 para
  Automotive.
- Nenhum código mobile, Capacitor, Expo, React Native init ou integração de loja
  é autorizado por esta decisão.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — Rota autoral do EOS pode abrir Google Maps com múltiplas paradas

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu que uma rota criada no EOS como ponto 1 → ponto 2 →
ponto 3 possa iniciar navegação no Google Maps já com a sequência inteira, não
apenas com um destino final. Isso é diferente de pedir que o EOS calcule ruas
como o Google: o plano carrega a intenção e a ordem; o app de mapas calcula as
ruas.

**Decision**:

1. A rota do plano continua sendo **autoral e offline**: a família desenha o
   caminho/ordem que quer seguir e o EOS guarda a `LineString`.
2. Quando houver handoff, o EOS monta um Google Maps URL com `origin`,
   `destination` e `waypoints` na ordem do traçado. O Google Maps calcula a rota
   por ruas e pode pedir o toque final em "Iniciar".
3. O EOS não promete que o Google obedecerá cada vértice desenhado como rua
   exata. Para não estourar URL nem transformar todo clique em parada, o handoff
   usa uma sequência limitada de pontos intermediários, preservando a ordem.
4. O fallback antigo de um destino continua existindo para ações simples
   ("rota até ela", "como chegar ao abrigo").

**Consequences**: sem migration. `lib/world/navigation.ts` vira o lugar único de
construção de links de navegação, incluindo rotas multi-stop. A UI do plano passa
a oferecer "Google Maps" em cada rota desenhada.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos por círculo, e o servidor nunca adivinha qual

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: A migration `20260731000000_multiple_family_plans.sql` derrubou o
índice de plano-ativo-único: uma família precisa de planos separados para
situações separadas — queda de energia, sem sinal, incidente na escola. Um
documento só forçava tudo junto e deixava a execução ambígua.

Só que o `PUT /api/plans` pegava **o plano mais recente do círculo** e
sobrescrevia. Enquanto havia um só, isso era equivalente a "o plano". Com a
migration aplicada em produção, virou **destruir o outro plano em silêncio** —
provado em teste antes da correção: dois `PUT` devolveram o mesmo `planId` e o
ponto de encontro do primeiro plano apareceu dentro do segundo.

**Decision**:

1. **`planId` seleciona; `createNew` cria.** O editor já mandava os dois.
2. **Sem `planId` e com mais de um plano no círculo, o servidor RECUSA** com
   `409 ambiguous_plan`. Adivinhar qual sobrescrever é a operação errada: perder
   o plano que a família combinou é a pior falha que este código pode ter. Com
   zero ou um plano não há ambiguidade e o comportamento antigo continua.
3. **Id de outro círculo é 403, não silêncio.** A busca por id deixou de filtrar
   por círculo justamente para que a checagem de posse decida — antes, um id
   estrangeiro simplesmente não casava e caía no fallback perigoso.
4. **O GET devolve a lista de planos** junto com o documento escolhido, para a
   escolha ficar na tela e não escondida no servidor.

**Consequences**: `scripts/multi-plan-test.mjs` (`npm run test:multiplan`) — 4/4,
todas lendo o BANCO depois da operação. Foi ele que provou o defeito antes de eu
corrigir, e é ele que impede a volta.

---

## D-081 — Camadas hidrológicas, vento de impacto e direção oficial de tornado

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono pediu novas camadas na base do mapa: flood area, storm
surge, wind impact e modelos/forecast para saber a provável direção de um
tornado. O EOS já desenha radar, alertas genéricos, vento em grade e ciclones,
mas isso ainda mistura ameaças diferentes na mesma camada "Alertas".

**Decision**:

1. **Flood area** e **storm surge** entram como camadas próprias a partir dos
   polígonos oficiais de alerta do NWS já normalizados por `/api/hazards`.
   NFHL/FEMA e mapas de risco NHC ficam como evolução estática, mas não bloqueiam
   a leitura operacional de alertas ativos.
2. **Wind impact** é uma camada derivada do grid de vento já existente: rajadas
   e vento sustentado viram células de impacto com thresholds explícitos. Ela é
   análise visual do EOS/Open-Meteo, não aviso oficial.
3. **Tornado direction** nunca será inferida por geometria ou pelo modelo. O mapa
   só desenha uma seta quando o texto oficial do NWS traz movimento, como
   "moving northeast at 40 mph". Sem isso, a camada fica silenciosa e a UI deve
   dizer que não há direção oficial disponível.
4. O mapa separa visualmente `Alertas`, `Flood`, `Surge`, `Vento impacto` e
   `Tornado`, para o usuário limpar a tela sem desligar o dado que o Pilot
   recebe.

**Consequences**: WV2-T12 entra no roadmap. A primeira versão resolve o uso
operacional com alertas ativos oficiais e vento derivado. Providers estáticos de
NFHL/FEMA e SLOSH/NHC podem ser adicionados depois como camadas de risco
pré-evento, com legenda própria para não confundir risco histórico com alerta
ativo.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos, execução cancelável e passos editáveis

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: Ao testar PLAN-T08, o dono encontrou três problemas de produto:

1. uma família precisa de **vários planos** por situação ("sem luz", "sem
   celular", "evento aglomerado", "escola");
2. o passo "Pare e confirme a fonte" aparecia como etapa 1, mas não vinha do
   plano editável — era uma trava fixa do EOS;
3. executar plano precisa ter **cancelar / falso alarme**.

**Decision**:

1. O EOS passa a aceitar múltiplos planos ativos por círculo. O nome do plano é
   o seletor operacional, até existir um campo estruturado de cenário.
2. O executor mostra somente passos derivados do plano editável: gatilhos,
   papéis, pontos, rotas e encerramento. Avisos fixos do EOS podem existir, mas
   precisam ser rotulados como **aviso do sistema**, não como passo do plano.
3. Execução local tem cancelamento explícito. Cancelar não apaga nem altera o
   plano; apenas encerra aquela execução e pode avisar o círculo de falso alarme.

**Consequences**: a migration remove o índice que obrigava um único plano ativo
por círculo. A próxima camada ainda deve persistir execuções compartilhadas, mas
o modelo de plano já não bloqueia múltiplos cenários.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos por círculo, e o servidor nunca adivinha qual

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: A migration `20260731000000_multiple_family_plans.sql` derrubou o
índice de plano-ativo-único: uma família precisa de planos separados para
situações separadas — queda de energia, sem sinal, incidente na escola. Um
documento só forçava tudo junto e deixava a execução ambígua.

Só que o `PUT /api/plans` pegava **o plano mais recente do círculo** e
sobrescrevia. Enquanto havia um só, isso era equivalente a "o plano". Com a
migration aplicada em produção, virou **destruir o outro plano em silêncio** —
provado em teste antes da correção: dois `PUT` devolveram o mesmo `planId` e o
ponto de encontro do primeiro plano apareceu dentro do segundo.

**Decision**:

1. **`planId` seleciona; `createNew` cria.** O editor já mandava os dois.
2. **Sem `planId` e com mais de um plano no círculo, o servidor RECUSA** com
   `409 ambiguous_plan`. Adivinhar qual sobrescrever é a operação errada: perder
   o plano que a família combinou é a pior falha que este código pode ter. Com
   zero ou um plano não há ambiguidade e o comportamento antigo continua.
3. **Id de outro círculo é 403, não silêncio.** A busca por id deixou de filtrar
   por círculo justamente para que a checagem de posse decida — antes, um id
   estrangeiro simplesmente não casava e caía no fallback perigoso.
4. **O GET devolve a lista de planos** junto com o documento escolhido, para a
   escolha ficar na tela e não escondida no servidor.

**Consequences**: `scripts/multi-plan-test.mjs` (`npm run test:multiplan`) — 4/4,
todas lendo o BANCO depois da operação. Foi ele que provou o defeito antes de eu
corrigir, e é ele que impede a volta.

---

## D-081 — Um marcador que pisca é um marcador sendo recriado

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono relatou o pino com a foto piscando no mapa. Duas causas,
independentes, e as duas confirmadas antes de qualquer correção:

1. **`/api/circles` assina as fotos a cada requisição.** A URL muda a cada
   consulta apontando para o MESMO arquivo, e o mapa consulta a cada 15 s. O
   `src` da imagem mudava sozinho e o navegador rebaixava a foto.
2. **`placeOverlays` destruía e recriava TODOS os marcadores** a cada
   atualização. Um `<img>` remontado é um `<img>` que recarrega.

**Decision**:

1. **A URL assinada não conta como mudança.** O hook compara pela parte estável
   da URL (sem a query) e, quando o arquivo é o mesmo, **preserva a URL
   anterior** — o `src` literalmente não muda.
2. **Marcadores de PESSOAS são reconciliados, não recriados.** Guardados num
   mapa por id: posição nova move o pino; só uma mudança de forma (foto, nome,
   freshness) cria elemento novo. Abrigos e destino seguem recriados — são
   poucos, sem imagem, e não se movem; ali reconciliar não se paga.

**Consequences**: "não pisca" não se mede olhando. `scripts/marker-stability-test.mjs`
(`npm run test:marker`) carimba os nós no DOM e confere que o carimbo sobreviveu
a duas rodadas de atualização — se o marcador tivesse sido recriado, o carimbo
teria ido embora com o nó antigo.

O teste **sobe uma foto real** para a conta de teste. Sem isso a asserção da URL
comparava duas listas vazias e passava sem medir nada — a mesma válvula de escape
que já deixou dois outros testes desta suíte reportarem verde sem testar. Hoje
"nenhuma foto no mapa" é reportado como FALHA do teste, não como sucesso.

Controle negativo executado: revertendo as duas correções, o teste acusa
`preservados=0 de 2` e a troca da URL.

---

## D-079 — Executar plano: Pilot vira host situacional, não só chat

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO MVP

**Context**: O dono apontou a falha certa: o Plano da Família recebeu muito
investimento, mas ainda se comportava como documento. Durante um evento real
("active shooting" perto da escola da filha, por exemplo), a pergunta não é
"onde está escrito o plano?", é **"como eu aciono a família e o que acontece
agora, passo a passo?"**

O Pilot também estava limitado por forma: respondia perguntas, mas não conduzia
uma sessão. Num evento, a pessoa não quer um chat aberto; quer um host
situacional dizendo a próxima ação, quem falta responder e o que não fazer.

**Decision**:

1. **Executar Plano vira modo do produto.** O plano deixa de ser só documento e
   passa a ser um playbook executável: alertar círculo, pedir/compartilhar
   localização, seguir papéis, pontos, rotas e gatilhos na ordem lógica.
2. **O Pilot vira host situacional.** O tom é de onboarding operacional: uma
   instrução por vez, linguagem curta, próxima ação clara, confirmação visível.
   Ele lê o plano aprovado e o estado do EOS; não inventa um plano durante a
   crise.
3. **A entrada fica no painel da pessoa/foto.** Tocar no próprio rosto no mapa
   abre ferramentas de presença e comando: estou seguro, enviar/pedir
   localização, alertar família e executar o plano atual.
4. **Active shooting exige trava explícita.** O EOS pode coordenar comunicação,
   localização e responsabilidades. Ele não deve improvisar instrução tática,
   nem mandar familiar se aproximar de área perigosa. A orientação padrão é:
   seguir escola/autoridades, chamar emergência quando apropriado, não dirigir
   para a área se a autoridade mandou evitar.
5. **MVP sem nova tabela.** A primeira execução é local e derivada da versão
   atual do plano: o aparelho monta os passos, permite marcar progresso e envia
   push preset ao círculo. Persistência multiusuário, timeline auditável e
   estado compartilhado viram a próxima migration (`family_plan_executions`).

**Consequences**: PLAN-T08 fica criado no roadmap. PLAN-T07 (Pilot propõe/revisa
planos) continua existindo, mas a prioridade operacional muda: antes de a IA
escrever planos melhores, o EOS precisa **executar** o plano que a família já
aprovou.

---

## D-083 — O RAG estava desligado na prática, e o Pilot rodava no modelo mais fraco

**Date**: 2026-08-02
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono testou o índice com "Como estocar alimentos". No limiar de
produção (0,7) ele devolveu **zero trechos**. Medido em oito perguntas reais em
português:

| Limiar | Perguntas sem resposta (cru) | Traduzido |
|---|---|---|
| **0,70 (produção)** | **8 de 8** | 7 de 8 |
| 0,50 | 4 de 8 | 1 de 8 |
| **0,45** | 2 de 8 | **0 de 8** |

Ou seja: o acervo do EOS — FEMA, Cruz Vermelha, WHO, SAS, Navy SEAL, 3.887
trechos — **não era usado**. O Pilot respondia do próprio modelo.

Duas causas somadas:

1. **O acervo é todo em inglês e o dono pergunta em português.** A distância
   entre idiomas come a margem de similaridade: "Como estocar alimentos" pontuou
   0,598; "how to store food", o mesmo assunto, 0,708.
2. **0,7 era alto demais até para inglês**: "food storage stockpile" fez 0,658.

**Decision**:

1. **Traduzir a CONSULTA, não o acervo.** Uma chamada curta e barata antes do
   embedding, contra reindexar 3.887 trechos. Falha de tradução não cala a busca:
   segue com o texto original, porque pior recall é melhor que recall nenhum.
2. **Limiar 0,45 e 8 trechos.** Um trecho fracamente relacionado entra como
   CONTEXTO, não como verdade — o risco de um trecho a mais é baixo; o de nenhum
   é responder sem fonte.
3. **Modelo padrão sobe de `gpt-4o-mini` para `gpt-4.1`.** Medido na mesma
   pergunta real ("Tenho 2 dias até a tempestade chegar, o que faço primeiro?",
   casa com filha asmática):

   | Modelo | Tempo | Resultado |
   |---|---|---|
   | gpt-4o-mini | 4,1 s | genérico; **não citou a asma da filha** |
   | **gpt-4.1** | **3,6 s** | citou a asma, inalador com espaçador e receita; 5 tarefas concretas |
   | gpt-5 | 45,7 s | **queimou 4.200 tokens raciocinando e não respondeu** |

   `gpt-4.1` é mais rápido **e** mais específico que o modelo que estava em
   produção. E fica o aviso: **gpt-5 é inadequado para o Pilot** — 45 s é
   inaceitável para quem está numa emergência, e o orçamento inteiro vira
   raciocínio antes de sair uma letra.
4. **Parâmetros por família de modelo** (`generationParams`). Os modelos de
   raciocínio recusam `max_tokens` e ignoram `temperature`; trocar `OPENAI_MODEL`
   passa a ser decisão de produto, não um bug.

**Consequences**: `npm run bench:rag` mede recall com perguntas reais em
português, cru contra traduzido, em cinco limiares. Ajustar limiar no olho troca
um problema por outro — em recuperação de informação isso se mede.

`npm run test:pilot` — 8/8, agora citando a hora da leitura e devolvendo
"Pode, mas com cuidado" com os números, onde antes vinha um "Não faça" seco.

---

## D-082 — A Família deixa de ser cadastro e passa a responder três perguntas

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono disse que a aba parecia "sobrando, ou custando caro manter".
Ele estava certo: 1896 linhas de formulário, tags sugeridas e leitura de ficha —
todos os dados certos, e **nenhuma pergunta respondida**. Cadastrar não é uma
função de emergência.

Pior: a mesma pessoa aparecia em três lugares e em nenhum deles completa —
registro no roster, membro do círculo, papel no plano.

**Decision**:

1. **Cada pessoa é UMA linha**, costurada pelo `linked_user_id`: cadastro +
   conta + papel no plano no mesmo cartão. Quem tem conta e não está no cadastro
   entra do mesmo jeito — a família real é a união dos dois.
2. **A tela responde, nesta ordem:** onde está cada um (e há quanto tempo isso é
   verdade), o que cada um precisa que muda a decisão (medicação, mobilidade,
   bebê), e quem faz o quê quando o plano começar.
3. **Quem não está coberto aparece, com o motivo.** Sem conta no EOS: "não
   aparece no mapa e não recebe mensagem". Com conta e sem compartilhar: "ela
   precisa ligar em Círculos, no aparelho dela". **Omitir a pessoa faria a
   família acreditar que está toda coberta** — é o oposto do que esta tela existe
   para fazer.
4. **Ação onde a informação está**: rota até a pessoa e mensagens prontas no
   próprio cartão. Antes era preciso ir ao mapa, achar o pino e tocar nele.
5. **O cadastro não foi jogado fora.** Vive em `/family-legacy`, alcançável em
   dois lugares da tela nova. Ele deixou de ser a primeira coisa que a família
   vê, e só isso.

**Consequences**: `scripts/family-page-test.mjs` (`npm run test:family`) — 5/5,
com um círculo de duas contas, uma filha SEM conta e um papel no plano. É o
cenário real do dono.

O teste também errou de um jeito instrutivo: procurar "Isadora" em qualquer lugar
do cartão casava também o da mãe, cujo papel é "pega a Isadora na escola" — dois
elementos, e o Playwright recusa. Ele reportava "a pessoa sumiu" enquanto ela
estava na tela. **Localizador de teste mira no título, não no texto inteiro.**

---

## D-080 — Vários planos por círculo, e o servidor nunca adivinha qual

**Date**: 2026-08-01
**Status**: DECIDED / IMPLEMENTADO

**Context**: A migration `20260731000000_multiple_family_plans.sql` derrubou o
índice de plano-ativo-único: uma família precisa de planos separados para
situações separadas — queda de energia, sem sinal, incidente na escola. Um
documento só forçava tudo junto e deixava a execução ambígua.

Só que o `PUT /api/plans` pegava **o plano mais recente do círculo** e
sobrescrevia. Enquanto havia um só, isso era equivalente a "o plano". Com a
migration aplicada em produção, virou **destruir o outro plano em silêncio** —
provado em teste antes da correção: dois `PUT` devolveram o mesmo `planId` e o
ponto de encontro do primeiro plano apareceu dentro do segundo.

**Decision**:

1. **`planId` seleciona; `createNew` cria.** O editor já mandava os dois.
2. **Sem `planId` e com mais de um plano no círculo, o servidor RECUSA** com
   `409 ambiguous_plan`. Adivinhar qual sobrescrever é a operação errada: perder
   o plano que a família combinou é a pior falha que este código pode ter. Com
   zero ou um plano não há ambiguidade e o comportamento antigo continua.
3. **Id de outro círculo é 403, não silêncio.** A busca por id deixou de filtrar
   por círculo justamente para que a checagem de posse decida — antes, um id
   estrangeiro simplesmente não casava e caía no fallback perigoso.
4. **O GET devolve a lista de planos** junto com o documento escolhido, para a
   escolha ficar na tela e não escondida no servidor.

**Consequences**: `scripts/multi-plan-test.mjs` (`npm run test:multiplan`) — 4/4,
todas lendo o BANCO depois da operação. Foi ele que provou o defeito antes de eu
corrigir, e é ele que impede a volta.

---

## D-081 — Um marcador que pisca é um marcador sendo recriado

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: O dono relatou o pino com a foto piscando no mapa. Duas causas,
independentes, e as duas confirmadas antes de qualquer correção:

1. **`/api/circles` assina as fotos a cada requisição.** A URL muda a cada
   consulta apontando para o MESMO arquivo, e o mapa consulta a cada 15 s. O
   `src` da imagem mudava sozinho e o navegador rebaixava a foto.
2. **`placeOverlays` destruía e recriava TODOS os marcadores** a cada
   atualização. Um `<img>` remontado é um `<img>` que recarrega.

**Decision**:

1. **A URL assinada não conta como mudança.** O hook compara pela parte estável
   da URL (sem a query) e, quando o arquivo é o mesmo, **preserva a URL
   anterior** — o `src` literalmente não muda.
2. **Marcadores de PESSOAS são reconciliados, não recriados.** Guardados num
   mapa por id: posição nova move o pino; só uma mudança de forma (foto, nome,
   freshness) cria elemento novo. Abrigos e destino seguem recriados — são
   poucos, sem imagem, e não se movem; ali reconciliar não se paga.

**Consequences**: "não pisca" não se mede olhando. `scripts/marker-stability-test.mjs`
(`npm run test:marker`) carimba os nós no DOM e confere que o carimbo sobreviveu
a duas rodadas de atualização — se o marcador tivesse sido recriado, o carimbo
teria ido embora com o nó antigo.

O teste **sobe uma foto real** para a conta de teste. Sem isso a asserção da URL
comparava duas listas vazias e passava sem medir nada — a mesma válvula de escape
que já deixou dois outros testes desta suíte reportarem verde sem testar. Hoje
"nenhuma foto no mapa" é reportado como FALHA do teste, não como sucesso.

Controle negativo executado: revertendo as duas correções, o teste acusa
`preservados=0 de 2` e a troca da URL.

---

## D-079 — O Pilot deixa de morar numa tela, enxerga o clima ao vivo e analisa atividades

**Date**: 2026-07-31
**Status**: DECIDED / IMPLEMENTADO

**Context**: Três coisas do dono, todas sobre o mesmo produto:

1. o orbe do Pilot só existia no dashboard — para perguntar era preciso voltar
   para casa, o oposto de um copiloto;
2. perguntado sobre um evento climático **em andamento**, ele dizia que não
   enxergava — enquanto o mapa ao lado desenhava o cone da tempestade;
3. o assistente da aba Clima analisava atividades ("vou trabalhar no telhado") e
   o Pilot, que sabe muito mais, não.

**Decision**:

1. **O risco virou estado do APP.** `RiskProvider` subiu para o layout
   autenticado; `PilotDock` põe o orbe em qualquer tela. No dashboard o dock
   some, porque lá a entrada é a PilotBar (D-070) — dois orbes seriam dois
   caminhos para a mesma coisa.
2. **O contexto do dock é montado SOB DEMANDA.** Inventário, ficha, checklist,
   ciclones e vento só são buscados ao abrir. Um app de emergência não pode
   cobrar cinco requisições de rede e bateria em toda tela por uma conversa que
   talvez não aconteça.
3. **O Pilot recebe ciclones e vento medido.** O dado existia desde D-078 e
   simplesmente não era enviado — a mesma armadilha de estender uma ponta e
   esquecer a outra que já custou cinco bugs neste projeto.
4. **Ciclone citado é ciclone qualificado.** Regra explícita: dizer na mesma
   frase se aquela tempestade pode ou não afetar a pessoa, com o rumo em ponto
   cardeal e não em graus. Sem isso o modelo anunciava "tempestade tropical
   Genevieve, ventos de 93 km/h, a 5.051 km, direção 285°" — verdadeiro, e lido
   como ameaça pelo dono de uma casa na Flórida.
5. **Análise de atividade absorvida e melhorada.** O endpoint da aba Clima tinha
   prompt próprio e não sabia nada da casa. O Pilot já tem família, reservas,
   alertas oficiais, ciclone e plano, então a mesma pergunta rende mais. O
   formato estruturado (veredito, motivo com números, janela do dia, o que muda a
   resposta) foi copiado de lá porque funciona: quem pergunta se pode subir no
   telhado quer um sim/não com hora, não três parágrafos.
6. **Atividade não se julga pelo estoque.** Regra explícita depois do teste vetar
   trabalho no telhado com rajada de 13 km/h: o veredito depende das condições
   que afetam AQUELA atividade — rajada, chuva, raio, UV, visibilidade, alerta.
   Água e checklist não entram; ninguém deixa de subir no telhado porque tem
   pouca água guardada. E não se veta sem um número que justifique.

**O orbe é o mesmo, e é do usuário.** Mesma estrela da PilotBar — duas formas
diferentes para a mesma coisa fariam aprender o produto duas vezes. E ele é
**arrastável**: um canto fixo atrapalha alguém (canhoto, tela grande, lista cujo
conteúdo importante mora ali), e não existe canto certo para eu escolher. A
posição é guardada em fração da tela, não em pixels, senão girar o aparelho
jogaria o orbe para fora da vista. Histerese de 8 px separa toque de arrasto, e
o arrasto respeita onde o dedo pegou.

**Regressão que eu causei e que foi para produção**: envolvi o Pilot num `.wv2`
só para herdar as cores. `.wv2` é a CASCA do dashboard — fixed, inset 0, fundo
preto —, então o app inteiro ficou preto menos o dashboard e a Família, que já
têm casca própria. `wv2-portal` mantém os tokens e devolve o layout. Ver
[[.wv2 é a CASCA do dashboard]].

**Consequences**: `scripts/pilot-abilities-test.mjs` (`npm run test:pilot`)
exercita o MODELO de verdade — o defeito relatado não é reproduzível sem ele. O
teste custa tokens e é mais lento, e vale: foi ele que pegou os itens 4 e 6.

Ele também mostrou, pela terceira vez nesta sequência, como um teste passa sem
testar: a primeira versão lia o fluxo inteiro do chat, que já contém o briefing
local com rajada e chuva — então "responde com números" passava **antes** de o
modelo dizer qualquer coisa. Hoje ele espera a resposta HTTP e lê **apenas a
última bolha**.

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

**A tempestade é um botão, e a distância é qualificada.** O dono tocou em
"Genevieve" e nada aconteceu — com razão: era texto com cara de link. Agora cada
tempestade leva a câmera até ela, e a linha diz se aquilo é **assunto seu** ou
contexto distante. Um ciclone a 5.000 km, noutra bacia, exibido com o mesmo
destaque de um a 300 km, insinua uma ameaça que não existe — e um app que grita
quando não é para gritar ensina a pessoa a ignorar quando for. Acima de 1.500 km
a linha fica apagada e diz "longe demais para te afetar agora".

Viajar milhares de quilômetros acende o caminho de volta ("← Voltar para a minha
área"): tirar alguém da própria área sem forma óbvia de retornar é abandoná-la
longe de casa numa tela que ela abriu para se orientar.

**A câmera ENQUADRA o cone, não mergulha no olho.** Primeira versão usava `flyTo`
com zoom fixo e o cone estourava para fora da tela. A pergunta que o cone responde
— "minha casa está dentro?" — só existe se ele couber no enquadramento. Hoje o
`focus` aceita uma caixa, calculada a partir do cone e da trajetória **daquela**
tempestade (as camadas do NHC trazem todas as ativas juntas; sem filtrar por
nome, enquadrar uma no Pacífico e outra no Atlântico daria uma caixa
atravessando o continente e mostrando nenhuma). O padding desconta a folha
inferior, senão metade do cone fica embaixo dela.

**Consequences**: dois defeitos que só um teste de RENDERIZAÇÃO pega:

- a primeira versão das setas usava o caractere `➤` num `text-field`. Os dados
  chegavam, a camada ficava visível, e **nada aparecia**: a fonte do estilo não
  tem esse glifo. `querySourceFeatures` devolvia features e
  `queryRenderedFeatures` devolvia zero. Hoje a seta é um ícone desenhado em
  canvas, que não depende de fonte;
- a grade era de 0,5° (≈55 km) e a câmera padrão enquadra poucos quilômetros: o
  usuário via **uma** seta. Uma seta só não mostra direção. Passou a 0,15°.

E um terceiro, achado depois: o provider cacheava a resposta das camadas do NHC
por cinco minutos **inclusive quando ela vinha vazia**. Uma falha momentânea do
serviço congelava a ausência do cone, e a tela mostrava a tempestade sem o cone
enquanto o NHC o publicava normalmente. **Cachear ausência é pior que não
cachear: congela um erro.** Hoje a busca de camada é `no-store` — o cache que
vale é o da rota, que guarda a resposta já montada — com uma repetição, e o que
falhou é declarado em `missing` para a UI avisar que o desenho está incompleto.

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
## D-119 — EDU aprovado vira ação confirmável de Preparação

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: EDU-T05

**Context**: EDU já permite assistir conteúdo aprovado, ingerir no RAG com
proveniência e destacar o vídeo mais clicado. Ainda faltava o elo de produto
mais importante do Preparedness Engine: o usuário sair de uma aula/vídeo com
ações concretas de preparação, sem o EOS escrever nada automaticamente.

**Decision**:
1. Conteúdo EDU aprovado pode gerar propostas determinísticas de preparação a
   partir de `summary + transcript`.
2. A primeira versão não usa IA nem nova tabela: identifica linhas numeradas,
   bullets ou comandos operacionais e as apresenta como itens revisáveis.
3. O usuário precisa clicar para salvar. A persistência usa o contrato v1
   existente de `checklists`, com `kit_type='EDU_CONTENT'`.
4. Preparação deve mostrar a origem como "Fonte: EDU" para esses itens.
5. Itens EDU não viram inventário automaticamente; só entram no checklist de
   preparação. O sync checklist→inventário existente continua valendo apenas
   quando o usuário marca um item adquirido/concluído.

**Consequence**: EDU deixa de ser só catálogo/vídeo e passa a alimentar a rotina
de preparação do usuário, mantendo confirmação explícita e sem abrir nova
migration antes da decisão de uma tabela dedicada de Preparedness Items.

---

## D-120 — Curadoria semântica das ações EDU antes de salvar

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: EDU-T06

**Context**: O teste real mostrou que extrair ações diretamente do transcript
salvava lixo de mídia no checklist: markdown (`**`), minutagem de vídeo
(`3:30`), títulos entre aspas/ênfases e descrições longas em inglês. Isso
quebra a promessa do Preparedness Engine: o usuário precisa ver uma tarefa limpa
e acionável, no idioma em que usa o app.

**Decision**:
1. Ações EDU passam por curadoria antes de aparecer/salvar.
2. A curadoria remove markdown, aspas decorativas, timestamps, minutagem e
   ruído de transcript.
3. Se o idioma preferido do usuário for diferente do conteúdo, as ações devem
   ser traduzidas para o idioma da UI.
4. OpenAI é o provider de curadoria/tradução, mantendo a decisão do dono de usar
   OpenAI como provider de AI do EOS.
5. A curadoria retorna frases curtas de checklist, sem explicação longa. Se a IA
   falhar, o fallback determinístico ainda remove markdown/timestamps e impede
   salvar texto cru demais.

**Consequence**: EDU continua sem escrita automática, mas as propostas ficam
prontas para execução: verbos claros, sem minutagem, sem asteriscos, sem aspas e
no idioma correto do usuário.

---
## D-121 — Checklist de Preparação editável e removível

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: PREP-T02

**Context**: EDU, Pilot e Simulação agora podem propor itens para Preparação.
Isso torna obrigatório o usuário poder limpar o checklist: apagar itens que não
fazem sentido e editar nome, quantidade, unidade e tier. Sem isso, o checklist
vira acúmulo de sugestões e perde confiança.

**Decision**:
1. `/preparedness` deve permitir editar e excluir itens do checklist.
2. Exclusão é por linha (`checklists.id`), não por `canonical_key`, para não
   apagar o mesmo item em outros kits/fontes por acidente.
3. Edição altera `item_name`, `quantity`, `unit` e `tier`.
4. Quando `item_name` muda, a API recalcula `canonical_key` para manter dedupe,
   toggle e futuras inserções coerentes.
5. Não há nova migration; usa `PATCH/DELETE /api/checklist/[id]`.

**Consequence**: Preparação deixa de ser só uma tela de consumo de sugestões e
passa a ser uma lista operacional controlada pelo usuário.

---
## D-122 — Salvar conteúdo EDU também gera notificação para o admin

**Date**: 2026-08-04
**Status**: DECIDED
**Roadmap**: EDU-T07

**Context**: O fluxo existente notificava `Novo EDU` apenas quando o conteúdo
estava `approved`. Em teste real, o dono esperava feedback também ao salvar um
conteúdo EDU como rascunho ou nova versão, porque o Admin EDU é uma ação de
publicação/curadoria que precisa deixar rastro no Inbox.

**Decision**:
1. Todo save bem-sucedido em `/api/edu` cria uma notificação `edu_content_saved`
   para o admin/ator que salvou.
2. Se o status salvo for `approved`, continua existindo a notificação
   `edu_content_approved` para os usuários elegíveis, incluindo o admin para
   teste do fluxo.
3. `edu_content_saved` pertence à surface `preparedness`, porque EDU é parte da
   Preparação no Web/PWA core.
4. O destino da notificação de save é `/admin/edu?contentId=<id>`; o destino de
   aprovado continua `/edu?contentId=<id>`.

**Consequence**: Salvar rascunho, versão ou conteúdo aprovado deixa feedback
visível no Inbox/Preparação. A notificação pública de conteúdo aprovado continua
separada da notificação administrativa de save.

---
