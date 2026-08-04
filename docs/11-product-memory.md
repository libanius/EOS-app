# 11 — Product Memory

> Non-obvious facts that don't belong in code comments but must survive across sessions.
> Last updated: 2026-08-03

---

## EOS Platform: quatro camadas, não quatro produtos (2026-08-03)

D-084 resolveu a pergunta de plataforma: levar EOS para Web, App Store, Google
Play, CarPlay/Android Auto e Mesh não significa abrir produtos paralelos.
Significa manter um **core operacional único** e adaptar somente as bordas.

As quatro camadas são:

1. Product Core — Pilot, Risk Engine, Family, Plans, Weather, Shelters, Routes,
   Simulation, Preparedness, EDU e Comms.
2. Domain Core — regras, decisão, risco, consentimento, offline, autoridade da
   fonte, freshness e ordem de execução.
3. Shared UI — design system, HUD, sheets, mapa, status, família, plano e
   preparação.
4. Platform Adapters — push nativo, background location, secure storage, loja,
   widgets, Automotive, BLE e LoRa.

Regra: **não abrir quatro produtos; estruturar quatro camadas**. Web/PWA continua
sendo a superfície primária de validação. iOS/Android só começam depois de G-03.
CarPlay/Android Auto só depois de G-06 e como companion mode restrito. Mesh/LoRa
continua bloqueado por G-05.

`/mobile/` contém template/código conceitual e experimentos LoRa/BLE. Não existe
app React Native inicializado, nem Expo, nem Capacitor, nem pipeline de App
Store/Google Play.

Preparedness, EDU, Comms e onboarding por simulação pertencem primeiro ao Web/PWA
core; não são justificativa para iniciar mobile.

---

## Preparedness Engine: conhecimento precisa virar ação confirmada (2026-08-03)

D-085 define o próximo eixo do produto: EOS não é só monitoramento de hazard e
weather. O core precisa ajudar a família a se preparar antes da crise.

Regra: **conteúdo educativo, Pilot e simulação só entram no Preparedness Engine
quando podem virar ação concreta** — tarefa, material, aquisição, papel, revisão
de plano, treino ou melhoria de comunicação.

Checklist e Recursos deixam de ser tratados como abas separadas no produto
futuro; viram uma superfície de **Preparação**. Comms nasce como app-level core:
chat do círculo, guia de rádio, frequências e referência rápida. Isso não libera
Mesh/LoRa hardware; G-05 continua bloqueando BLE/LoRa.

YouTube do dono pode alimentar EDU/RAG, mas não como busca genérica. O fluxo
precisa capturar transcript, classificar por cenário, aprovar/versionar e manter
fonte visível. Pilot/EDU/Simulação podem propor tarefas e recursos, mas escrita
persistente exige confirmação explícita.

Spec canônica: `docs/20-preparedness-engine.md`.

---

## Preparação substitui Recursos + Checklist na navegação (2026-08-03)

D-086 fez a unificação prática do PREP-T01: `/preparedness` é a superfície única
para prontidão, recursos reais, gaps, briefing OpenAI e checklist/tarefas.
`/inventory` e `/checklist` redirecionam para ela.

Regra de continuidade: não recriar duas abas. Se uma tela precisa mandar o
usuário ajustar estoque, tarefa, checklist ou aquisição, o destino é
`/preparedness`.

A aba Comms existe na navegação e abre `/comms`.

---

## Comms v1 é chat do círculo, não canal de emergência garantido (2026-08-03)

D-087 / COMMS-T01 cria Comms como uma superfície app-level do Web/PWA: chat do
círculo, guia rápido de rádio e status de Mesh como referência. O contrato de
dados é `circle_messages`, acessado só por `/api/comms/messages` depois de
checar membership em `circle_members`.

Regra: mensagem de Comms **não é alerta**, **não é SMS**, **não é dispatch** e
**não é transmissão por rádio**. Alertas familiares, push e execução de plano
continuam fluxos separados. Se no futuro o chat gerar push, isso precisa virar
decisão e política própria, porque push de toda mensagem muda ruído, privacidade
e expectativa de entrega.

Mesh/LoRa continua bloqueado por G-05. A UI pode explicar como operar canais
combinados no plano, mas não pode prometer rede mesh/off-grid enquanto não houver
hardware, adapter e gate de prioridade aprovados.

Migration `20260803000000_circle_messages.sql` aplicada pelo dono em 2026-08-03
e verificada via service-role. A tela ainda deve degradar com estado
indisponível se o endpoint falhar, porque Comms não pode fingir entrega.

D-088 adicionou na própria `/comms` a referência familiar owner-provided de
rádio: canais VHF/UHF 1-6, NOAA, chamadas nacionais, marítima, serviços para
escuta, MURS/GMRS/FRS e guia rápido de Baofeng UV-5R. Isto é conteúdo
operacional estático, não editor de frequências e não fonte legal definitiva.

D-089 criou `circle_radio_profiles`: frequências configuráveis por círculo,
editáveis por Admin/Editor e lidas por todos os membros. Não enfiar isso em
`circle_messages`. A próxima evolução, se priorizada, é histórico/versionamento
e perfis por cenário.

Migration `20260803001000_circle_radio_profiles.sql` aplicada pelo dono em
2026-08-03 e verificada via service-role. A edição de rádio agora tem tabela
persistente em produção.

D-109 / COMMS-T04 adiciona uma camada social persistente ao Comms:
`circle_notifications`. O badge vermelho do ícone Comms vem da contagem não lida
dessa tabela, e `/comms?view=notifications` abre a timeline das interações. Os
eventos iniciais são mensagem de círculo, pedido de entrada aceito, novo membro
no círculo, convite de Família íntima, e aceite/recusa de Família íntima. Isso
continua sendo app-level timeline; não é push garantido, SMS, dispatch, nem
alerta de emergência. Migration `20260804012000_circle_notifications.sql`
precisa estar aplicada para persistir badge/timeline.

D-110 / COMMS-T05 corrige a percepção de atraso: Comms deve ser realtime-first
no Web/PWA. O polling existe apenas como fallback. Para isso, `circle_messages`
e `circle_notifications` precisam estar na publicação realtime com RLS de SELECT
controlada: membro autenticado recebe mensagens do próprio círculo; usuário
autenticado recebe apenas notificações destinadas a ele. Escrita continua pelas
APIs, não pelo cliente direto. Migration necessária:
`20260804013000_comms_realtime.sql`.

---

## EDU é catálogo aprovado antes de virar RAG (2026-08-03)

D-090 / EDU-T01 criou o caminho correto para conteúdo educativo do dono: primeiro
entra em `edu_content`, com fonte, URL, tags de cenário, resumo, transcript/notas,
status, versão e `rag_enabled`. Usuários veem conteúdo aprovado em `/edu`; o dono
alimenta e edita em `/admin/edu`.

Regra: **YouTube não entra direto no RAG**. O vídeo precisa virar item aprovado,
versionado e com transcript/summary antes de qualquer embedding. `rag_enabled`
significa elegível para ingestão futura, não ingestão feita. A próxima etapa
correta é um job que leia `edu_content` aprovado e grave `knowledge_base`
mantendo `edu_content.id` + `version` como proveniência.

Migration `20260803002000_edu_content.sql` aplicada pelo dono em 2026-08-03 e
verificada via service-role (`edu_content` responde 200; count=0). `/edu` e
`/admin/edu` podem persistir catálogo educativo; se a tabela ficar indisponível,
o fallback de conteúdo padrão continua sendo apenas degradação operacional.

D-101 / EDU-T02 adicionou consumo de vídeo no app: se um conteúdo aprovado tiver
`source_type='youtube'` e `source_url` reconhecida, `/edu` renderiza um player
embutido usando `youtube-nocookie.com` e mantém o link de fonte visível. Isso
não captura transcript, não marca progresso, não cria tarefas e não escreve no
RAG.

D-103 / EDU-T03 permite ingestão explícita no RAG pelo Admin EDU. O item precisa
estar `approved` e `rag_enabled=true`; o dono clica "Ingerir RAG". A rota
`POST /api/admin/edu/ingest` gera embeddings OpenAI `text-embedding-3-small`,
remove chunks antigos de `knowledge_base.source='edu:<id>'`, insere os novos e
marca `rag_ingested_at`. A proveniência é `source='edu:<edu_content.id>'` e
`source_version='v<edu_content.version>'`. Não há YouTube API nem transcript
automático.

D-104 adicionou o guardrail contra RAG vazio: título, URL e tags entram como
metadados/proveniência, mas não contam para liberar ingestão. O admin precisa de
pelo menos 160 caracteres instrucionais em `summary + transcript`; `/admin/edu`
mostra essa contagem e a API bloqueia link-only mesmo se chamada manualmente.

---

## Memória do Pilot exige confirmação e evento de auditoria (2026-08-03)

D-105 corrigiu uma lacuna importante: o Pilot conversacional não lia a ficha
master; recebia só agregados do cliente (`people`, bebê, condição médica,
mobilidade). Agora `/api/pilot/chat` busca server-side a ficha do usuário
autenticado (`profiles`: alergias, medicamentos, tipo sanguíneo, contato,
notas, local) e seus `family_members` detalhados antes de montar o prompt. Se um
campo estiver vazio, o prompt diz "não consta" e manda não inventar.

D-106 corrigiu a segunda metade da lacuna: membros reais do círculo não podem
ser tratados como inexistentes pelo Pilot. D-107 refinou isso imediatamente:
**membro do círculo não é membro da família íntima**. Círculo é coordenação ampla
(chat, plano, simulação, recursos, localização consentida). Família íntima é uma
camada dentro do círculo, registrada por
`circle_members.family_access_status`.

Regra D-107: o Pilot só lê ficha master médica/contato de outro usuário do
círculo quando `family_access_status='approved'`. `shared_fields.medical` voltou
a significar compartilhamento de recurso médico/estoque, não ficha master.
`location` segue separado e explícito. Se Daniela está no círculo, mas ainda não
foi aprovada como Família íntima, o Pilot deve dizer que ela está no círculo mas
a ficha master dela não está autorizada para o Pilot da família.

D-108 corrige a direção do fluxo: Paulo/Admin não "aprova" a ficha de Daniela.
Paulo convida Daniela para a Família íntima na linha dela; Daniela aceita ou
recusa na própria conta. O botão nunca deve aparecer como "Pedir Família íntima"
na linha do próprio Paulo, porque isso sugere pedir autorização a si mesmo. Na
linha do usuário logado, a UI deve comunicar controle da própria ficha; na linha
do outro membro, Admin pode enviar convite; no login do convidado, o convite vira
aceitar/recusar. Migration `20260804011000_circle_family_access_requested_by.sql`
registra quem iniciou o convite.

D-095 / UPP-03 criou o fluxo confirmado de memória. `/api/pilot/chat` pode
retornar propostas `memory[]`; a UI mostra título, motivo e Markdown exato. Só
depois do toque em "Salvar memória" a rota
`POST /api/profile/personalization/memory` chama a RPC
`confirm_pilot_memory(...)`.

A RPC atualiza `profile_personalization.pilot_memory_md` e insere
`pilot_memory_events` na mesma transação. Migration
`20260803003000_pilot_memory_events.sql` aplicada pelo dono em 2026-08-03 e
verificada via service-role (`pilot_memory_events` responde 200; count=0). Se a
tabela ou RPC ficarem indisponíveis em outro ambiente, a rota retorna 503 e não
altera a memória.

---

## Pilot revisa planos sem escrita silenciosa (2026-08-03)

D-096 / PLAN-T07 implementou a Revisão do Pilot em `/plan`. O Pilot gera
propostas pequenas de `trigger` e `role`, mostra motivo e conteúdo, e cada item
precisa ser aplicado ao rascunho individualmente. Nada persiste nesse clique; o
salvamento continua sendo o botão "Salvar plano", com versionamento, push e
acknowledgement. A lógica vive em `lib/plan-pilot-review.ts` e é determinística
para não inventar coordenadas, rotas ou membros. Se uma evolução usar modelo, o
provider de AI permanece OpenAI e a confirmação elemento a elemento continua
obrigatória.

---

## World v2 tem gate de produção reproduzível (2026-08-04)

D-097 / WV2-T05 criou `scripts/world-v2-validation.mjs` e `npm run
test:world-v2`. O teste sobe contra um app em execução, cria usuário Supabase
temporário, audita `/dashboard` em mobile 390x844 e desktop 1440x960, mede
load/recursos/bytes, valida equivalente textual, proveniência, `aria-hidden` do
mapa visual, nomes acessíveis e target size dos controles EOS, depois remove o
usuário. Última execução local: mobile 494ms/665KB, desktop 166ms/708KB, 0
console errors, 0 controles sem nome e 0 alvos pequenos em controles EOS.

Postura de custo registrada: dashboard load não chama OpenAI; OpenAI segue como
único provider de AI em fluxos submit-driven. Sem `NEXT_PUBLIC_MAPTILER_KEY`, a
base padrão é CARTO keyless e satélite usa ESRI com atribuição; weather/hazard
atual usa fontes keyless, enquanto adapters pagos permanecem `not_configured`.

---

## WV2-T07 foi absorvida por tarefas específicas (2026-08-04)

D-098 fechou WV2-T07 sem código novo. As features HWD v1 que ainda importavam já
estão na World v2 ou migraram para fluxos mais precisos: camadas ao vivo e base
dark/satellite vivem em `WorldV2.tsx`; notificar círculo não é mais botão
genérico do HUD, mas ação contextual em `MemberSheet` e no executor de plano;
marcadores de família pertencem à trilha FAM. Daqui para frente, não usar
"copiar HWD v1" como tarefa aberta: cada necessidade de mapa deve virar tarefa
específica no roadmap.

O próximo item PENDING virou bloqueio operacional até o dono definir parâmetros
de afiliado; isso foi resolvido em D-099.

---

## Afiliados são Stripe promotion codes + tracker (2026-08-04)

D-099 / LA-T06 implementou os parâmetros do dono: primeiro código
`EOSPARTNER`, tag `Teste Afiliado app`, válido para Family e Premium, limite
ilimitado por padrão mas customizável no admin, 100% off uma vez e comissão de
70% sobre o primeiro valor real pago. Gift code e afiliado não são a mesma
coisa: gift code dá acesso sem Stripe; afiliado passa por Checkout, usa Stripe
promotion code e só vira comissão quando o webhook recebe invoice com
`amount_paid > 0`. O admin não faz payout automático; apenas calcula o valor
owed para repasse manual. Migration `20260804000000_affiliate_codes.sql` precisa
foi aplicada pelo dono em 2026-08-04 e verificada via service-role: as três
tabelas respondem 200 e o seed `EOSPARTNER` está ativo. O próximo passo é o
dono abrir `/admin/affiliates` e sincronizar/criar `EOSPARTNER` para gravar os
IDs reais de Stripe coupon/promotion code.

Admin default: `ADMIN_EMAILS` permite override por env var, mas o fallback do
código inclui `eosoffgrid@gmail.com` e `paulolibanionetousa@gmail.com`.
Settings consulta `/api/admin/status`; quando `isAdmin=true`, mostra links para
`/admin/affiliates`, `/admin/gift-codes` e `/admin/edu`.
D-102 endureceu isso no middleware: `/admin` e `/admin/*` exigem usuário logado
e `isAdminEmail(user.email)`. Usuário autenticado comum é redirecionado para
`/dashboard` antes de carregar a página admin. As APIs admin continuam mantendo
403 próprio.

---

## Texto livre do simulador preenche painéis, não roda sozinho (2026-08-03)

D-094 / SIM-T09 adicionou `POST /api/simulation/parse`. A rota usa OpenAI para
converter a descrição livre em um patch validado de `SimulationConfig`.

Regra: inferência de texto livre é **pré-configuração revisável**, não comando
de execução. A tela aplica o patch nos painéis existentes, mostra notas de
inferência e o usuário ainda precisa revisar e tocar em iniciar.

Não usar output bruto do modelo como autoridade: o servidor valida threat,
severidade, horários, booleanos, fontes e faixas numéricas antes de devolver.

---

## Pilot educador também usa preparação confirmável (2026-08-03)

D-093 / PILOT-T08 aplicou ao Pilot o mesmo contrato de SIM-T11. As tasks vindas
de `/api/pilot/chat` agora têm tipo (`resource`, `task`, `plan_review`,
`comms_setup`), fonte definida pelo servidor e destino visível. A UI mostra isso
antes do toque de confirmação.

Persistência atual: `checklists.kit_type = PILOT_RECOMMENDATION`. A aba
Preparação mostra "Fonte: Recomendação do Pilot" para esses itens. O provider de
AI segue sendo OpenAI para Pilot/RAG.

Não transformar resposta do Pilot em escrita automática. Ele pode educar,
sequenciar, perguntar e propor; quem confirma é o usuário.

---

## Debrief vira preparação, mas só com confirmação (2026-08-03)

D-092 / SIM-T11 criou o contrato v1 para transformar resultado de simulação em
preparação persistente. O debrief classifica cada lacuna acionável como recurso,
tarefa, revisão de plano ou setup de Comms, mostra a fonte do cenário e só salva
quando o usuário confirma item a item.

Persistência atual: `checklists.kit_type = SIMULATION_DEBRIEF`. Não existe tabela
nova de Preparedness Items ainda. A aba Preparação mostra essa origem para que o
item salvo não pareça um checklist genérico.

Regra para próximas evoluções: Pilot/EDU/simulação podem propor, mas não podem
escrever em checklist, inventário, plano ou Comms sem confirmação explícita e
fonte visível.

---

## Onboarding por simulação preserva o motivo da chegada (2026-08-03)

D-091 / ONB-T01 corrige a aquisição por cenário simulado. `/sim/[token]` agora
carrega contexto antes de autenticar, salva o convite localmente e manda para
login/signup com `redirectTo`. Login e confirmação de signup preservam esse
destino. `/onboarding` mostra o cenário que trouxe a pessoa e, depois de salvar
perfil, devolve para `/sim/[token]`.

Regra: **convite é contexto, não autoridade**. O link nunca coloca ninguém em
simulação sozinho. Depois do onboarding, `/sim/[token]` só registra o usuário
como `invited`; o pop-up da simulação continua sendo a decisão explícita de
participar.

Não recolocar `/sim` no middleware protegido sem substituir essa ponte, senão o
fluxo volta a perder o motivo da aquisição no login.

---

## Rota EOS é compromisso; Google Maps é navegador por ruas (2026-07-31)

PLAN-T10 adicionou handoff multi-stop: a rota desenhada no plano (`LineString`)
vira um Google Maps URL com `origin`, `destination` e `waypoints` na ordem do
traçado. Isso resolve o caso "ponto 1 → ponto 2 → ponto 3" sem o EOS fingir que
tem um motor de ruas.

Regra: **o EOS guarda a intenção operacional e a sequência offline; o app de
mapas calcula ruas quando houver rede.** O Google pode pedir o toque final em
"Iniciar" e pode otimizar/ajustar ruas conforme trânsito/fechamentos. O EOS não
deve prometer auto-start silencioso nem que cada vértice desenhado será uma rua
exata.

Para não transformar todo clique do desenho em parada e não estourar URL em
mobile, o helper limita pontos intermediários e preserva a ordem. Se algum dia
quisermos paradas nomeadas explícitas ("buscar esposa", "escola", "casa da
tia"), isso deve virar modelo próprio de rota/etapas, não abuso dos vértices da
polilinha.

---

## Direção de tornado só com movimento oficial, nunca por geometria (2026-07-31)

WV2-T12 separou as camadas do mapa em Flood, Surge, Vento impacto e Tornado.
Flood/surge usam os polígonos oficiais de alerta que já chegam do NWS por
`/api/hazards`; impacto de vento é derivado do grid Open-Meteo existente e fica
rotulado como leitura EOS, não como aviso oficial.

A regra que importa: **não inferir direção provável de tornado pelo formato do
polígono, centroide, IA ou extrapolação visual.** O mapa só desenha seta quando
o próprio texto oficial do NWS traz movimento ("moving northeast at 40 mph").
Sem esse texto, mostrar nada é a resposta correta. Uma seta inventada num aviso
de tornado parece autoridade e pode colocar uma família indo para o lado errado.

NFHL/FEMA e Potential Storm Surge/NHC continuam como evolução de camada estática
de risco pré-evento. A primeira versão resolveu alertas ativos, que é o que
responde a pergunta operacional nos primeiros minutos.

---

## Executar Plano não é chat — é orquestração da versão aprovada (2026-07-31)

O dono colocou a lacuna correta: o Plano da Família só vira produto quando existe
um botão de **executar**. Em crise, a pessoa não quer reler o documento nem
conversar genericamente; quer que o EOS conduza a família, um passo por vez.

Regra que fica: **o Pilot host lê o plano aprovado; ele não inventa plano no
meio do evento.** A sequência do MVP é determinística: trava de segurança e
autoridade → alertar círculo → gatilhos → papéis → pontos de encontro → rotas →
encerramento com estado claro.

Active shooting perto da escola é o caso que fixa a cautela: o EOS coordena
comunicação, localização e responsabilidades, mas não improvisa instrução tática
nem manda familiar se aproximar da zona de risco. A fala padrão é seguir
escola/autoridades/emergência e bloquear deslocamento impulsivo.

MVP entregue sem tabela nova: execução local no painel da própria foto no mapa,
derivada de `/api/plans`, com push preset ao círculo. Próxima evolução real é
`family_plan_executions` + `family_plan_execution_events`, para timeline
compartilhada e retomada em outro aparelho. Antes disso, não fingir auditoria
multiusuário.

Correção D-080: a primeira versão colocou "Pare e confirme a fonte" como etapa
1, mas isso não vinha do plano editável. Isso é errado. Aviso fixo do EOS pode
existir, mas rotulado como aviso do sistema, fora da sequência numerada. A lista
de passos executáveis precisa vir do que a família consegue editar: gatilhos,
papéis, pontos, rotas e notas.

Também ficou claro que **um círculo tem vários planos**. "Sem luz", "sem
celular", "evento aglomerado" e "escola" são cenários diferentes, não seções de
um único documento. A migration `20260731000000_multiple_family_plans.sql`
remove o índice antigo de plano ativo único.

---

## Geolocalização: `maximumAge: 0` + alta precisão é pedir para expirar (2026-07-31)

Essa combinação recusa **qualquer** posição que o aparelho já tenha e exige uma trava de GPS nova. Dentro de casa, ou em laptop sem GPS, ela expira — foi exatamente o que o dono viu no seletor de endereço.

A referência certa estava no próprio repo: `RiskProvider` usa `enableHighAccuracy: false, timeout: 10000, maximumAge: 120000` e sempre funcionou.

O padrão que ficou, em dois estágios: **rápido primeiro** (aceita fix recente, sem exigir precisão) para colocar um ponto na tela em segundos, e **refino em paralelo** com `watchPosition` de alta precisão que só substitui o ponto quando a leitura melhora. Falha só se os dois falharem — e a mensagem sempre aponta uma saída que não depende de GPS.

## Erro calado esconde o bug de quem escreveu o código (2026-07-31)

O botão "Usar minha posição" tinha `() => {}` como tratador de erro. Ao trocar isso por uma mensagem de verdade, o dono viu um timeout **em minutos** — e o timeout era um segundo defeito, meu, na configuração do GPS.

Ou seja: engolir a falha não estava só escondendo o problema do usuário; estava escondendo de mim. Vale lembrar sempre que a tentação for silenciar um erro "para não poluir a tela".

## "Mapa offline" quase nunca é sobre baixar tiles (2026-07-30)

Baixar tiles de basemap parece o caminho óbvio e esbarra em duas paredes: o CARTO keyless (nosso padrão) não autoriza cache em massa nos termos, e o MapTiler, que tem oferta offline explícita, precisa de uma chave que não está configurada. Entregar um cache que viola o provedor seria pior que não entregar.

O que resolve o caso de uso é mais simples e mais robusto: **desenhar o próprio plano** a partir das coordenadas que já estão no aparelho — `PlanChart.tsx`, SVG puro, sem rede, sem chave, sem WebGL, sem biblioteca de mapa.

E a regra que ficou junto: **a carta não finge ser um mapa**. Sem ruas, sem prédios, sem rótulo de bairro. Tem norte, barra de escala e as distâncias escritas. Uma carta que insinuasse detalhe que não tem seria pior que nenhuma — a família seguiria um contorno inventado. É a mesma disciplina de [[Ausência de número parece "está tudo bem"]], do outro lado: não inventar o que não se sabe.

O envelope (`lib/plan-envelope.ts`) fica pronto para recortar um download no dia em que houver provedor com direito a cache.

## O endereço que o app tem é a CIDADE, não a casa (2026-07-30)

`profiles.location` é texto livre com placeholder "Cidade, Estado", e `geocodeLocation` devolve o **centroide**. O do dono é `"Parkland, FL"` → `26.3101, -80.2373`, que é o centro de Parkland e não a casa dele.

Isso serve para alerta meteorológico e para o mapa saber onde centralizar. **Não serve** para nada que afirme distância: "1,2 km até o ponto de encontro", "~16 min a pé". Apresentar as duas coisas com a mesma cara é como uma família conclui que chega num lugar aonde não chega — e é a mesma raiz de [[o centroide da cidade empilha todo mundo]].

Por isso o plano tem endereço de casa próprio, marcado por GPS ou busca de endereço, e a UI que oferece o endereço do perfil diz na mesma frase que é o centro da cidade.

## Ausência de número parece "está tudo bem" (2026-07-30)

O dono perguntou como o app sabia onde ele mora — e a resposta era que não sabia. Pior: quando não sabia, a linha de distância **simplesmente não era renderizada**. Nenhum erro, nenhuma pergunta, nenhuma pista. Dava para montar um plano inteiro sem nunca ver uma distância e sem descobrir por quê.

A regra que fica: **quando um cálculo não pode ser feito, a tela diz por que**, no lugar onde o número apareceria. Vale para o `plan-drill` também, que pula a checagem de alcance sem casa definida — o silêncio dele agora tem causa visível na tela do plano.

Isto é o mesmo princípio de [[Cache de API não pode servir dado cuja idade a tela afirma]], por outro caminho: o que a UI não diz, o usuário preenche com otimismo.

## `next-pwa` com `register: true` não registra nada no App Router (2026-07-30)

Essa opção injeta o script de registro no `_app` do **Pages Router**. Num app App Router, ela não faz absolutamente nada — e a configuração passa a impressão contrária.

Medido em navegador: `getRegistrations()` devolvia **0** em `/dashboard`, `/plan`, `/checklist`. O service worker só existia para quem tivesse aberto `/settings`, a única tela que registrava por conta própria (para o push). O app parecia PWA e não tinha cache offline nenhum, para ninguém.

Hoje quem registra é `components/ServiceWorkerRegistrar.tsx`, montado no layout autenticado. Ver [[D-075]].

## Cache de API não pode servir dado cuja idade a tela afirma (2026-07-30)

Com o service worker finalmente ativo, o cache genérico de API (`NetworkFirst`, 2 min) passou a responder `GET /api/plans` mesmo offline. `response.ok` vinha `true`, o código nunca caía no fallback, e a tela mostrava um plano velho **sem dizer que era velho** — a falha exata que o doc 18 §6 existe para evitar.

A regra que ficou: **sempre que a UI declarar frescor — posição da família, abrigos, plano — o dado tem que vir de um cache nosso, com carimbo, ou de uma rede que falhe de forma visível.** `/api/plans` é `NetworkOnly` de propósito; a cópia offline é a nossa, em IndexedDB, com versão e instante da sincronização, e rotulada na tela.

Isto vale como aviso ao adicionar qualquer regra de `runtimeCaching` nova: um cache silencioso é indistinguível de dado ao vivo para o código que o consome.

## Precache do Workbox é atômico: um 404 desliga o service worker inteiro (2026-07-29)

O `next-pwa` varre `.next/` e coloca **todo** arquivo que encontra no manifesto de precache — inclusive metadados de build que o Next **não serve por HTTP**. Como o precache é atômico, um único 404 rejeita a promessa do `install`, o worker vira `redundant`, e o navegador tenta de novo para sempre.

Efeito prático: `/_next/app-build-manifest.json` retornando 404 fez **todo o push do produto** nunca funcionar. Nada disso aparece como erro de push. Aparece como um botão em Ajustes que não muda de estado.

Duas coisas para lembrar:

1. **`buildExcludes` não é otimização, é correção.** Todo metadado de build tem que sair do precache. Ao subir a versão do Next ou do next-pwa, rodar `npm run test:push` — arquivos novos de metadado aparecem entre versões.
2. **Bug de service worker não se depura pelo console da página.** O erro de install não aparece lá. Só apareceu com `ServiceWorker.workerErrorReported` do CDP num Chrome real. Eu errei três hipóteses antes de instrumentar.

## `redundant` é estado normal de service worker — não é falha (2026-07-29)

O helper de Ajustes vigiava `installing`/`waiting` e **rejeitava ao ver `redundant`**, mostrando "Service Worker ficou redundante". Mas `redundant` só significa *substituído*, em geral por um worker bom; e o worker que se está vigiando não é necessariamente o que vai servir a página. Havia portanto um segundo bug, reportando falha por cima de um worker saudável — que mascarou o primeiro.

**Não escreva essa espera à mão.** `navigator.serviceWorker.ready` resolve com um registro que tem worker ativo, qualquer que seja a confusão no caminho. Ver [[D-074]].

## Web push não é automatizável contra o FCM (2026-07-29)

`pushManager.subscribe()` falha com `AbortError: Registration failed - permission denied` em **qualquer** Chrome ou Chromium automatizado — com permissão concedida e service worker ativo. No Chromium empacotado do Playwright é pior: `Notification.permission` fica `denied` mesmo com `grantPermissions`. Por isso `scripts/push-test.mjs` exige o **Google Chrome** instalado.

O contorno que mantém o teste real: fabricar a inscrição com as mesmas primitivas do navegador (ECDH P-256 + 16 bytes de auth), apontar o endpoint para um serviço de push local, e entregar ao worker com `ServiceWorker.deliverPushMessage` do CDP. Duas armadilhas dentro disso:

- O `web-push` **só fala HTTPS** — endpoint `http://` morre com `EPROTO`. O serviço falso precisa de TLS de verdade; o teste faz o `next start` confiar no CA por `NODE_EXTRA_CA_CERTS`, sem desligar verificação de certificado.
- O teste sobe o próprio servidor justamente por causa disso, na porta 3010.

## Um teste de regressão precisa do controle negativo (2026-07-29)

Depois de o `push-test.mjs` passar 6/6, reverti o `buildExcludes`, reconstruí e rodei de novo: falhou apontando `404 /_next/app-build-manifest.json`. Só então o teste valia algo. Um teste escrito depois da correção passa por construção; o que ele precisa provar é que **falharia com o bug de volta**.

## iOS Safari não responde `navigator.permissions` para geolocation (2026-07-29)

O `LocationReporter` exigia `permissions.query({name:'geolocation'}).state === 'granted'` antes de enviar. No iPhone isso lança ou devolve nada, e o `catch` fazia `return` — **a localização ao vivo ficava desligada em todo iPhone, em silêncio**. O mapa então caía no ponto de perfil, quilômetros longe.

Hoje o `RiskProvider` grava `localStorage['eos-geo-ok']` na primeira posição recebida, e o reporter aceita esse indício. A regra "nunca pedir permissão a partir do background" continua valendo: o flag só existe porque uma concessão já aconteceu.

## Ponto de perfil precisa PARECER aproximado (2026-07-29)

O dono viu a esposa 2 km fora do lugar. Estava correto: sem ponto ao vivo, o mapa mostra o endereço geocodificado, e o centroide da cidade fica longe da casa. O rótulo dizia "perfil", mas o marcador era **idêntico** a um ponto real.

Um ponto aproximado desenhado com a confiança de um ponto real é como uma família acredita que alguém está onde não está. Agora ele é tracejado, apagado e sem preenchimento sólido — a imprecisão está na forma, não só na legenda.

---

## Localização familiar: o centroide da cidade empilha todo mundo (2026-07-28)

Quando dois membros cadastram só o nome da cidade ("Parkland, Florida"), o geocoding devolve **o mesmo centroide** para os dois. Os marcadores caem no mesmo pixel e um esconde o outro — o mapa passa a mentir sobre quantas pessoas ele conhece, e o usuário conclui que a feature não funciona.

 agora agrupa por coordenada arredondada e espalha os co-locados num anel, em **pixels** (para o espalhamento sobreviver ao zoom). Se voltar a empilhar, é aqui.

Consequência de produto: enquanto o ponto for de perfil, todo mundo da mesma cidade fica no mesmo lugar. Só o ponto **ao vivo** distingue de verdade — mais um motivo para o GPS consentido importar.

---

## Onde as coisas moram agora (2026-07-29)

Depois da reconstrução, o mapa mental do app mudou. Para quem retomar:

| Superfície | Código | Rota |
|---|---|---|
| Dashboard (porta de entrada) | `components/world-v2/WorldV2.tsx` | `/dashboard` |
| Design system da v2 | `components/world-v2/world-v2.css` + `primitives.tsx` | — |
| Física de movimento | `components/world-v2/motion.ts` | — |
| Pilot (conversa) | `components/world-v2/Pilot.tsx` + `app/api/pilot/chat` | orbe na PilotBar |
| Pilot (motor local) | `components/world-v2/pilot-engine.ts` | — |
| Simulador | `components/world-v2/SimulatorPage.tsx` + `lib/simulation.ts` | `/scenario` |
| Estado global da simulação | `components/SimulationProvider.tsx` | montado no layout `(app)` |
| Debrief | `lib/simulation-debrief.ts` | modal pós-encerramento |
| Checklist | `components/world-v2/ChecklistPage.tsx` | `/checklist` |
| Plano da família | `components/world-v2/PlanPage.tsx` + `lib/family-plan.ts` | `/plan` |
| Registro do service worker | `components/ServiceWorkerRegistrar.tsx` | layout `(app)` |
| Mapa (compartilhado) | `components/world-dashboard/WorldMap.tsx` | usado por `/dashboard` e `/dashboard-world` |

Telas antigas preservadas: `/dashboard-legacy`, `/scenario-legacy`,
`/checklist-legacy`, `/dashboard-world`. Nenhuma está no nav; existem para
comparação e rollback.

**A simulação injeta no `RiskProvider`**, não nas telas. Se uma tela nova precisa
responder ao cenário, basta ela ler `useRisk()` — não há nada a ligar.

---

## Navegação client-side não remonta o layout (2026-07-28)

O convidado que entrava por link ficava até **20 segundos** olhando o dashboard sem o pop-up. Causa: o poller de convites vive no layout `(app)`, e `router.replace()` é navegação client-side — o layout não remonta, então o efeito não roda de novo e só o intervalo salvava. A página de convite agora usa `window.location.assign()` de propósito.

**Regra**: quando um fluxo depende de um efeito que mora no layout, uma navegação client-side não o dispara. Ou force navegação completa, ou exponha um gatilho no provider.

Também: `circles.invite_code` é `character(6)` — gerar 7 caracteres estoura com `22001`.

---

## Armadilha recorrente: estender só um lado (2026-07-28)

Cinco bugs desta sessão são o **mesmo erro**: adicionar um campo em uma ponta e esquecer a outra.

1. O Pilot respondia "não tenho acesso a dados em tempo real" — eu não mandava o clima no `context`.
2. **`shared_fields` aceitava `location` na UI e no gate de leitura, mas o `VALID_FIELDS` do `PATCH /api/circles/[id]/share` filtrava a string fora.** Resultado: ninguém num círculo conseguia ver ninguém. O toggle ligava, o servidor descartava, e voltava desligado no reload — uma feature que parecia funcionar e era no-op.
3. O campo de conversa do Pilot ficava sob o BottomNav (`fixed`, z-index 100).
4. `.w-mapmarker` tinha estilo só em `world-dashboard.css`, que a v2 nunca importa.
5. **Três endpoints de push liam `push_subscriptions.profile_id`; a coluna é `user_id`.** O `select` voltava vazio, o código concluía "nenhum dispositivo" e respondia `ok:false` sem erro nenhum no log. Escrevi o nome errado três vezes seguidas, em três arquivos.

**Antes de dar por pronta qualquer feature com whitelist, gate ou contexto: procure TODAS as listas que mencionam os irmãos do campo novo.** `grep` pelo nome de um campo vizinho (ex.: `emergency_contact`) encontra as listas que precisam do novo.

Teste de regressão: `scripts/circle-location-test.mjs` — dois navegadores, um círculo, prova que o toggle persiste e que o outro vê o pino. Para o caso 5: `scripts/push-test.mjs`, que lê a inscrição de volta do banco pelo mesmo caminho que os senders usam.

---

## Pilot conversacional (2026-07-28)

- **O Pilot só sabe o que o cliente envia em `context`.** Ele não lê o banco nem chama provedores. Quando perguntado a temperatura, respondeu "não tenho acesso a dados em tempo real" — não era alucinação nem fase faltante: eu simplesmente não estava mandando o snapshot de clima. Ao adicionar campo novo ao app, lembrar de estendê-lo em `app/api/pilot/chat/route.ts` **e** no `Pilot.tsx`, senão o especialista fica cego para ele.
- O system prompt agora contém uma instrução explícita **proibindo** o disclaimer padrão de "sem acesso em tempo real" e mandando responder com os números do bloco DADOS AO VIVO.
- **Posições da família VÃO ao modelo desde D-068**, mas apenas as que `/api/circles` já liberou pelo consentimento de D-064. O gate é único: quem não ativou o toggle não aparece nem no mapa nem para a IA.
- **O fallback do parser NUNCA pode mostrar JSON.** Uma resposta truncada pelo teto de tokens fez `JSON.parse` falhar e o fallback despejou `{"reply":...}` na conversa do usuário. Hoje: `response_format: json_object`, teto de 1400 tokens e `salvageReply()` que resgata o campo ou limpa o texto — nunca imprime a fonte.
- **O Pilot busca lugares reais antes de responder** (`findPlaces` com Nominatim, uma chamada por mensagem, limitada à área do usuário). Sem isso ele só conhecia abrigos e família, e respondia "não há Home Depot nos dados" — honesto e inútil.
- **O modelo nunca calcula geometria.** Distância e rumo são computados no aparelho (`lib/world/shelters.ts`) e enviados prontos; o prompt proíbe o modelo de calcular. Rumo errado em emergência aponta a família para o lado errado.

---

## Abrigos, rotas e planos (2026-07-27)

- **FEMA National Shelter System é público e sem chave**: `https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0`. Geometria WGS84 direto no MapLibre; `shelter_status` confiável. **Mas** `evacuation_capacity`, `total_population` e `org_name` vêm frequentemente nulos e acessibilidade vem `UNK` — nunca prometer vaga nem acessibilidade a partir daí.
- **Zero abrigo aberto é o estado normal.** Verificado em 2026-07-27: 20 abertos no país inteiro (OR, WA, GU, MP, WI, CA, TX), nenhum na Flórida. Abrigo só abre em desastre ativo. A UI tem de dizer "nenhum aberto" sem inventar candidato.
- **OSM/Overpass não serve para abrigo de emergência.** `amenity=shelter` na prática são abrigos de ônibus e quiosques: perto de Parkland vieram 15, todos sem nome e sem `shelter_type`. Não repetir essa avaliação.
- **OpenFEMA (`fema.gov/api/open`) não tem dataset de abrigos** — 48 datasets, zero. Não confundir com o NSS.
- **Navegação turn-by-turn offline não é viável em PWA.** Exibir mapa offline é (PMTiles + MapLibre + Cache API); rodar motor de rotas com grafo empacotado no navegador não é. Navegação offline real depende do app nativo (fase M) com Valhalla/GraphHopper embarcados. Não prometer isso na web.
- **O plano da família é o que torna o download de mapas offline finito** (doc 18 §10): baixa-se o envelope do plano, não "o mundo". Por isso PLAN vem antes dos mapas offline.
- **Versão do plano é problema de segurança, não de UX** (doc 18 §6): duas pessoas executando versões diferentes vão para lugares diferentes. `family_plan_acks` existe por isso e não pode ser cortado do MVP.

---

## World v2 / entrada do app (2026-07-27)

- **A entrada real do app não é só `app/page.tsx`.** `signIn` e `updatePassword` em `lib/auth/actions.ts` fazem `redirect()` próprio depois de autenticar. Mudar apenas o redirect de `/` não muda onde o usuário cai ao logar — foi exatamente o que aconteceu ao promover o dashboard. Ao trocar a tela inicial, os três pontos precisam ser alterados juntos.
- **`AppActions` é `position: fixed`, canto superior direito, `z-index: 200`**, e é montado pelo layout `(app)` em todas as telas. Qualquer superfície full-screen que coloque controles nesse canto fica **por baixo** dele. Foi assim que o botão de GPS do World v2 sumiu — não estava quebrado, estava oculto.
- **O Pilot é local-first por decisão, não por limitação** (D-062.1). `pilot-engine.ts` é puro e síncrono de propósito: a premissa do produto é responder quando a rede caiu. Se algum dia um modelo entrar ali, tem de ser camada aditiva — nunca no caminho crítico da resposta.
- **O Pilot nunca infere evacuação.** Só repassa ordem oficial presente no alerta. E declara explicitamente quando a ficha da família ou o inventário não carregaram, em vez de assumir ausência de vulnerabilidade. Não "simplifique" isso depois.
- `WorldMap` (`components/world-dashboard/`) é compartilhado entre `/dashboard` (v2) e `/dashboard-world` (v1). Alterá-lo afeta as duas telas.
- **`next dev` e `next build` compartilham `.next/`.** Rodar o build de produção com o dev server ligado corrompe os chunks do dev (`Cannot find module './XXXX.js'`). Parar o dev antes, ou apagar `.next/` depois.

---

## North Star

The product exists for one moment: a family head in the first 15 minutes of a crisis.
Every feature decision must answer: "does this help in the next 15 minutes?"

## Ficha Master

- `profiles` is the only identity record; there is no separate Master Profile table.
- `/ficha` is the unified editor for identity, location, medical information, emergency contact, and public QR.
- Completion is a UI calculation over seven signals defined in `docs/13-ficha-master.md`; it is not persisted in the database.
- D-059 extends the authenticated Ficha Master with `profile_personalization` for avatar URL, user-authored Markdown preferences, Pilot memory, decision style, and risk tolerance. These fields are private/authenticated context and are **not** returned by public QR endpoints.
- `pilot_memory_md` is explicit/user-controlled in the MVP. Do not let Pilot silently mutate long-term memory until a confirmed-write/audit flow is specified.
- UPP-02 uses private Supabase Storage bucket `profile-photos`; canonical storage path lives in `profile_personalization.avatar_path`, and authenticated APIs return temporary signed URLs as `avatar_url`. Public QR endpoints must never expose the avatar path or signed URL.
- UPP-02 code is deployed through migration `20260721021000_profile_photo_storage.sql`; production upload will fail cleanly until that migration is applied in Supabase.
- Production persistence is active: the owner applied `supabase/migrations/20260721020000_profile_personalization.sql` on 2026-07-21 and service-role REST verification returned 200 for `profile_personalization`. `/api/profile/personalization` remains authenticated-only and returns 401 without a session.

---

## Intelligence Modes

There are three intelligence modes, not two. They are a **fallback chain**, not a feature toggle:

1. **CONNECTED** — OpenAI API + RAG from knowledge_base. Requires internet + auth.
2. **LOCAL_AI** — on-device model. Planned, blocked by native mobile readiness.
3. **SURVIVAL** — Rules Engine only. Always available. Cannot be disabled.

The Rules Engine runs **before** the LLM on every request. The LLM **cannot downgrade** the urgency level set by the Rules Engine. This is a safety guarantee, not a UX choice.

---

## Auth Pattern

The app uses `@supabase/ssr` with **SSR cookies**, not localStorage tokens.
- API routes must use `createClient()` from `@/lib/supabase/server` (async, reads cookies)
- Never use `createClient(url, anonKey)` with a Bearer token in API routes
- Never read `localStorage.getItem('supabase_token')` — it will always be empty
- Same-origin fetch calls do not need an Authorization header — cookies are automatic

---

## Knowledge Base

- **3850 chunks** stored in `knowledge_base` table (as of 2026-06-23)
- **14 source PDFs** covering: CDC, FEMA, IASC, John Seymour, Military FM, Navy SEAL, NCTSN, Red Cross, SAMHSA (3), SAS, WHO
- **Embedding model**: `text-embedding-3-small` (1536 dimensions), HNSW index, cosine similarity, threshold 0.78
- **Scenario type**: inferred from filename — all current PDFs map to `GENERAL` except CDC files (`PANDEMIC`)

### Ingest pipeline (two steps — order matters):

```
python3 scripts/pdf_to_text.py   # PDFs → docs/text/*.txt  (PyMuPDF)
npm run ingest                    # docs/text/*.txt → knowledge_base (native fetch)
```

**Why two steps**: Node.js OOM crashed on large PDFs (SAS 34MB, John Seymour 26MB) when using `pdf-parse`. PyMuPDF handles them trivially. The Node script uses zero heavy dependencies (no openai SDK, no supabase-js) — openai v6 alone is 13MB of JS that V8 can't compile without exhausting heap.

**Known skip**: 20 chunks from SAMHSA_Tips_for_Survivors_Managing_Stress skipped due to `\u0000` null bytes in extracted text (Postgres rejects them). Non-critical — 49/69 chunks stored.

To add new sources: drop PDF in `docs/`, re-run both commands.
PyMuPDF dependency: `pip install pymupdf`

---

## Supabase Free Tier

Supabase free tier projects **auto-pause after ~1 week of inactivity**. When paused:
- DNS still resolves but HTTP returns errors
- Actually: DNS may stop resolving entirely (ENOTFOUND)

Before any session involving Supabase (ingest, backend testing, schema changes):
1. Go to supabase.com → your project
2. Check status — if paused, click "Resume project"
3. Wait ~30 seconds for healthy status

---

## chunkText Bug (fixed 2026-06-23)

The `chunkText` function in `scripts/ingest.mjs` had an infinite loop:
when `breakAt >= clean.length` (last chunk of file), `nextStart = breakAt - CHUNK_OVERLAP`
was always less than `clean.length`, so the while loop never terminated.

Fix: `if (breakAt >= clean.length) break` after creating the last chunk.
Also: `if (nextStart <= start) break` as a safety guard against any future regression.

This bug existed in all previous versions of the ingest script and is the root cause of all historical OOM crashes (the heap filled with millions of duplicate chunks, not the PDF size).

---

## UI / Styling

- CSS custom properties (no Tailwind)
- No design system — raw CSS variables in globals.css
- PWA PNG icons are derived from the canonical `public/icon.svg`; update the SVG first if the app mark changes, then regenerate both PNG sizes.
- UI language is explicitly selected in `/settings`; `lib/i18n.tsx` is the canonical client-side PT/EN dictionary and persists the preference under `eos-language`.
- P1-T05 completed: authenticated screens, auth, landing, and the public Emergency Card support PT/EN. Client surfaces use `lib/i18n.tsx`; server-rendered public surfaces read the `eos-language` cookie.

---

## Platform Status

- **Web PWA**: active, deployed on Vercel, auto-deploys on push to main
- **Native mobile**: blocked by G-03; `/mobile/` has template/conceptual React Native files but no initialized app
- **Automotive**: blocked by G-06; future restricted companion mode only
- **LoRa firmware**: prototype exists, long-horizon, blocked by G-05 and mobile readiness

---

## Sentry

Sentry is wired up (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) but requires `SENTRY_DSN` environment variable to be set in Vercel. Without it, errors are silently dropped.

---

## Vercel Deployment

- Auto-deploys on every push to `main`
- No staging environment — `main` is production
- Environment variables must be set in Vercel dashboard (not just `.env.local`)

---

## Círculos

- Roles: `Admin` / `Editor` / `Viewer` (migrado de `LEADER`/`MEMBER` em 2026-06-30)
- Admin pode: alterar roles, remover membros, enviar push, criar/editar planos de ação
- Editor pode: criar/editar planos de ação
- Viewer: só leitura
- `circle_members.shared_fields: text[]` — campos de inventário compartilhados por campo (`water`, `food`, `medical`, `comms`, `emergency_contact`)
- `circle_members.share_inventory: bool` — toggle geral de compartilhamento (pré-requisito para shared_fields ter efeito)
- Criador do círculo é inserido automaticamente com role `Admin`
- Novos membros (join por código) entram com role `Viewer`

---

## Sync Cross-Device

- Estratégia: 3 camadas (ver D-029)
- Snapshot cache: `sessionStorage` com prefixo `eos:snap:` — carregado imediatamente ao abrir a página, antes do fetch
- Fila offline: `localStorage['eos:offline_queue']` — escrita enfileirada quando `navigator.onLine === false`, flush automático no evento `online`
- Realtime: `useRealtimeSync(tables, cb)` — inscreve em `postgres_changes` para as tabelas especificadas; chama `cb(table)` em qualquer INSERT/UPDATE/DELETE
- Proteção de formulário: `isDirtyRef` impede Realtime de sobrescrever formulário com mudanças pendentes

---

## Feature Gates

- `lib/feature-gates.ts` — `canAccess(feature, userPlan)` retorna `boolean`
- `profiles.plan: 'free' | 'family' | 'premium'`
- Hierarquia: free < family < premium
- Free: análise IA básica, monitoramento clima+terremoto
- Família: círculos, monitoramento multi-local, QR emergência, AQI, FEMA, FIRMS
- Premium: CDC, FDA, push notifications, histórico 30 dias, múltiplos círculos, exportar ficha
- Ao adicionar feature nova, cadastrar em `FEATURE_GATES` antes de implementar a UI

---

## Service Role Key & rotas que dependem dela (D-035)

- Três lugares usam `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS): `app/ficha/[id]/page.tsx` (ficha pública/QR), `app/api/profile/ficha/route.ts` (POST leitura por socorristas), `lib/knowledge.ts` (RAG).
- **Se a chave faltar no ambiente**: página e rota POST agora degradam limpo (notFound / 503) em vez de 500 vazio; RAG retorna `[]` (Motor de Decisão degrada para modo sem base de conhecimento).
- Esta chave **estava ausente no Vercel** até 2026-07-05 — adicionada em Production + Preview. Ao reconfigurar o projeto Vercel, **sempre confirmar as 3 chaves não-públicas**: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY` (todas ✅ setadas em 2026-07-05).
- Verificar com `npx vercel env ls production`.
- **Pegadinha ao setar via CLI**: o valor no `.env.local` está entre aspas duplas e no formato novo `sb_secret_...` (41 chars). Grave SEM as aspas: `grep ... | cut -d= -f2- | tr -d '"' | tr -d '[:space:]'`, senão o Vercel armazena a chave com aspas literais → RLS aplicada → 404. Vars "Sensitive" não são lidas de volta por `vercel env pull` (validar pelo comportamento em produção). Após alterar env var, **é preciso um novo deploy** (`vercel --prod --yes`) — não afeta deploys já existentes.
- A **mesma classe de bug** atingiu `OPENAI_MODEL` (estava `"gpt-5\n"` no Vercel — aspas + newline). Para valores curtos/manuais, gravar via `printf 'valor' > /tmp/f; vercel env add NOME env < /tmp/f`. `getOpenAIModel()` faz `.trim()` defensivo (D-036).

## Push notifications / VAPID (D-036)

- Env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client subscribe + server send, **inlined em build-time** → mudar exige redeploy), `VAPID_PRIVATE_KEY` (server send), `VAPID_SUBJECT` (mailto).
- Público e privado **devem ser um par** gerado junto (`npx web-push generate-vapid-keys`). Setar só um quebra o envio. O par atual foi gerado em 2026-07-05 e está no `.env.local` (gitignored) + Vercel Prod+Preview.
- Rotas: `app/api/push/subscribe` (salva subscription), `app/api/circles/[id]/push` (admin do círculo envia via `web-push`), toggle em `/settings`.
- Client subscribe must not await `navigator.serviceWorker.ready` without a timeout; if SW registration stalls, the Settings button can remain in loading. Settings should explicitly register `/sw.js` with scope `/` when no registration exists, wait for activation without losing already-fired state transitions, convert `NEXT_PUBLIC_VAPID_PUBLIC_KEY` from URL-safe base64 to `Uint8Array` before `pushManager.subscribe`, request `Notification` permission explicitly, and surface API errors in the UI.
- Do not cache authenticated pages like `/settings` with Service Worker `CacheFirst`. A stale cached Settings bundle can keep old push-registration code after a production deploy. Use `NetworkFirst` for authenticated app pages and keep API persistence tests separate from browser Push API tests.

---

## Hybrid World Dashboard (D-047 / D-050)

- **Rota isolada** `app/(app)/dashboard-world/page.tsx` (protegida no `middleware.ts`). **Não** substitui `/dashboard` (produção); reversível (doc 16 §26). Spec: `docs/16-hybrid-world-dashboard.md`.
- **Renderer = MapLibre GL** (`maplibre-gl`, lazy-loaded via `await import` para não pesar o bundle inicial). Config **provider-neutra** em `lib/world/providers.ts`: sem chave → **CARTO dark** (keyless, `basemaps.cartocdn.com`); com `NEXT_PUBLIC_MAPTILER_KEY` → **MapTiler hybrid (satélite) + terreno 3D** (raster-dem). Trocar de provider = mexer só nesse arquivo.
- **MapTiler key**: env var **pública** `NEXT_PUBLIC_MAPTILER_KEY` (inlined em build-time → mudar exige **redeploy fresco**, não só env var). A key em produção é **protegida por origem** (`eos-app-fawn.vercel.app`) no painel MapTiler → **não funciona em localhost nem em preview** (origem diferente) e **não dá para curl-testar** server-side (sem header `Origin`). Formato de origin no MapTiler é **só domínio** (sem `https://`, sem porta).
- **Base visual do mapa (D-052)**: `/dashboard-world` tem toggle local **Híbrido/Dark** no painel "Camadas ao vivo". Híbrido usa MapTiler hybrid + terreno quando configurado; Dark força CARTO dark keyless para recuperar o visual operacional anterior. A escolha persiste em `localStorage['eos-world-map-base']`; ao alternar, o MapLibre é remontado e reanexa rota, radar, hazards e marcadores.
- **Placas de fundo** em `public/world/parkland{,-safe,-storm}.webp` foram **geradas via Higgsfield MCP** (aerials limpos de Parkland, sem HUD embutido) e trocam por estado de risco. Servem de fallback quando o MapLibre/WebGL falha (§28). Nota: o modelo `nano_banana_2` às vezes é coagido para `nano_banana_flash` pelo servidor e a 1ª tentativa pode falhar — repetir.
- **HUD = componentes React reais** (`components/world-dashboard/`), nunca dados assados na imagem (§8.2). Cores de risco **reusam os tokens v2** (safe verde / watch violeta / warning âmbar / critical vermelho), não a prosa do §19.3.
- **RiskProvider** (`components/v2/RiskProvider.tsx`) agora expõe `coords` (além de `hasCoords`) — o World Dashboard centraliza o mapa na localização real. Suporta forçar estado via URL: `?risk=safe|watch|warning|critical` e `?esc=3:warning`.
- **HWD-03 entregue**: `/api/world/radar` normaliza o frame de radar mais recente do RainViewer keyless (`weather-maps.json`) e devolve um template raster MapLibre (`/256/{z}/{x}/{y}/2/1_1.png`, max zoom nativo 7). `WorldMap` adiciona essa camada como overlay raster com opacidade controlada. Se RainViewer falhar, o mapa continua sem radar.
- **Hazards no mapa**: `WorldMap` consome `/api/hazards?lat&lng`, renderiza eventos reais como fonte GeoJSON (`eos-hazard-polygons` e `eos-hazard-points`) e cria até 5 tags DOM geo-ancoradas. Tags usam `textContent` para texto vindo de provider; sem `innerHTML`. Falhas de hazard são aditivas e não afetam Risk Index/HUD/textual a11y.
- **Visibilidade de camadas**: radar RainViewer pode parecer invisível quando não há precipitação no viewport. `WorldDashboard` exibe uma faixa "Camadas ao vivo" com provider do radar, frame UTC, contagem de hazards e preview de alertas para tornar a integração verificável na tela.
- **HWD-04 prototype (D-051)**: família no mapa usa pontos exatos vindos de dados EOS/círculo quando disponíveis; sem histórico, apenas último ponto conhecido. Freshness visual no MVP é "agora" para o usuário atual via GPS/RiskProvider e "perfil" para coordenadas de perfil dos co-membros. `/api/world/guidance` usa OpenAI como inferência temporária para shelter/rota candidata, mas isso **não é fonte oficial** e deve ser revisado antes de qualquer rollout da `/dashboard-world` para `/dashboard`.
- **Map interaction**: `.world-hud` is full-screen above MapLibre but must have `pointer-events: none`; only concrete controls/panels re-enable pointer events. Otherwise click-drag on the map is blocked even when MapLibre `interactive: true`.
- **Pilot Capsule / HWD-05 (D-053)**: implementa estados determinísticos `GO/LIMITED/WAIT/AVOID/PRIORITY OVERRIDE` no `/dashboard-world` após escolha de atividade. `PRIORITY OVERRIDE` vence sempre quando `state==='critical'` ou alerta CRITICAL. Ações reais disponíveis: abrir `/scenario`, abrir `/checklist`, notificar família via `/api/circles/[id]/push` quando o usuário é Admin de círculo elegível, e focar rota/shelter candidata no MapLibre. Ainda não há persistência/aprendizado de preferências do Pilot.
- **Responsive HUD / HWD-06 pass (D-054)**: no mobile, não posicionar Status Rail, layers, alerts e ticker como painéis absolutos concorrentes; eles vivem em um bottom sheet com snap states `peek`/`half`/`full`, alça e scroll interno. O padrão foi inspirado no Drawer do 21st.dev, mas implementado com CSS/React locais sem dependência nova. Interações do MapLibre recolhem o sheet; no desktop, scroll/gesto de mapa colapsa rail/sensors/ticker e hover/foco reabre.
- **Status Rail / readiness card (D-055)**: o card esquerdo deve parecer um instrumento de "casa pronta", não uma lista administrativa. Hierarquia: conexão/estado, Risk Index grande, diagrama de casa, autonomia, barras de água/comida/energia/combustível, família e comms. A casa é SVG local no React para continuar dinâmica; energia vem de `battery_percent` e combustível de `fuel_liters` até refinarmos o modelo.
- **Center map text (D-056)**: não renderizar "Your Area/Sua área" no centro do `/dashboard-world`; o mapa deve ficar visualmente limpo entre o readiness card, Pilot e overlays. O resumo textual continua apenas para screen readers.
- **Alert counter + rail scroll (D-057)**: o contador de alertas não deve ficar no topo direito porque colide com controles globais e fica ilegível; manter no rodapé direito acima da bottom nav. O Status Rail desktop deve terminar acima da nav fixa (`bottom: calc(88px + safe-area)`) e ter scroll interno até o C/W/R.
- **HWD-06 validation status (D-058)**: `/dashboard-world` passou validação objetiva em 2026-07-21 (`type-check`, lint, Jest 45/45, build, full production journey 31/31, members/circles E2E 19/19, route protection, RainViewer, hazards). Ainda **não** substituir `/dashboard`: faltam aprovação visual/device do dono, browser UI E2E, a11y/perf, custos/providers, privacidade/proveniência e decisão explícita. Relatório: `docs/17-hwd-06-validation.md`.

## Gift codes + Admin (D-061)

- **Códigos-presente sem Stripe**: tabela `gift_codes` (RLS ON, **sem policies** → deny-all; só service-role). Resgate `POST /api/billing/redeem` (usuário logado, 1 uso via claim atômico `.is('redeemed_by', null)`, seta `plan`+`plan_status='gift'`+`plan_current_period_end`). **Expiração lazy** em `lib/plan.ts:reconcileGiftPlan`, chamada no `/api/profile/plan` (downgrade→free persiste). UI de resgate em Settings.
- **Criação = owner-only**: `lib/admin.ts:isAdminEmail` com allowlist `ADMIN_EMAILS` (default `eosoffgrid@gmail.com`). `GET/POST /api/admin/gift-codes` + tela `/admin/gift-codes` respondem 403 a não-admin. Rota `/admin` protegida no middleware. Obs: o e-mail admin precisa ser um usuário real do app.
- **Código A (afiliado Stripe)** ainda não feito: cupom "100% off · once" + promotion codes (checkout já tem `allow_promotion_codes: true`).

## Billing / Stripe (D-042)

- **Provedor**: Stripe. Self-serve: Checkout hospedado + Billing Portal + webhook como **fonte de verdade** de `profiles.plan`.
- **Preços NÃO são hardcoded**: `STRIPE_PRICE_FAMILY` / `STRIPE_PRICE_PREMIUM` (Price IDs) em env var. `lib/stripe.ts` faz o mapa preço↔plano nos dois sentidos. Trocar preço = trocar env var, sem deploy de código.
- **Fluxo**: `/api/billing/checkout` (POST `{plan}`) cria/reusa customer e abre Checkout → usuário paga → Stripe chama `/api/billing/webhook` → webhook escreve `profiles.plan` via service-role. `/api/billing/portal` abre o portal (gerenciar/cancelar). Downgrade → `free` em `customer.subscription.deleted` ou status não-ativo.
- **Webhook**: usa `req.text()` (raw body) + `stripe.webhooks.constructEvent` com `STRIPE_WEBHOOK_SECRET`. `runtime = 'nodejs'`. Resolve o perfil por `metadata.user_id` (preferido) ou `stripe_customer_id`.
- **Degrada limpo**: sem `STRIPE_SECRET_KEY`/secret, todas as rotas respondem **503** (não crasham) — a UI mantém o estado atual. Verificado local.
- **Ativação test mode (2026-07-20)**: migration Stripe aplicada; produtos/preços test criados; 4 env vars Stripe Production setadas; webhook test registrado e ACKando eventos reais. Pagamento teste logado validado: `BrightScale Group` ficou `plan=family`, `plan_status=active`, `stripe_subscription_id=sub_...`.
- **Live cutover (LA-T02, 2026-07-21)**: conta Live `acct_1TuL40IaCSStSVaq` (EOS, US, ativada); produtos/preços Live ($9.90/$19.90), webhook Live e 4 env vars Vercel Production trocadas para Live; deploy fresco em `0981f15`. IDs sandbox obsoletos limpos dos profiles para checkout/portal recriarem customer/subscription em Live. Statement descriptor: `EOS BRIGHTSCALE`. Dono deve rotacionar chaves expostas durante a operação.
- **Pegadinha de conta Stripe (2026-07-21)**: o Stripe CLI local pode ficar autenticado em outra conta Live (`acct_1SajtUIM02ulsUHv`, BrightScale Group LLC) e mostrar 0 produtos EOS ou webhook Supabase antigo. Antes de qualquer verificação/alteração Stripe, confirmar que a conta é `acct_1TuL40IaCSStSVaq` (EOS).
- **Env URL pegadinha (2026-07-19)**: o Checkout falhou com 500 porque Stripe recebeu `success_url` inválida (`url_invalid / Not a valid URL`) por formatação ruim de env URL. `lib/site-url.ts` agora normaliza aspas simples/duplas, whitespace, `\n` literal, barras finais e domínios sem protocolo; checkout/portal/auth usam esse helper. Ainda assim, grave env vars sem aspas/newline sempre que possível.
- **`profiles.plan`** continua sendo o único campo que o resto do app lê (gates via `lib/feature-gates.ts`). As colunas novas (`stripe_customer_id` etc.) são só para reconciliação/portal.

## App Spine status alignment (2026-07-20)

- Roadmap/build-status/gates were realigned after Stripe Checkout reached Live mode.
- Current phase is **Production Experience — EOS Pilot**, not Launch Activation. Phase 2 and LA-T02 are complete.
- Current actionable task is **PILOT-T01**: Dashboard complication prototype ("What's the plan?").
- **G-02 Landing Page** and **G-04 Monetization** are cleared. Landing v3 remains deferred (D-045); monetization business model is decided (D-042).
- **G-03 Mobile Readiness** and **G-05 LoRa Mesh Priority** remain open and block their respective phases.

## EOS Pilot (D-046)

- EOS Pilot is the daily-use contextual decision layer of EOS, documented in `docs/15-eos-pilot.md`.
- It starts with **"What's the plan?"** and learns through progressive options, not generic chat.
- First implementation should be a Dashboard complication/module, not a new permanent tab.
- Pilot recommendation states: `GO`, `LIMITED`, `WAIT`, `AVOID`, `PRIORITY OVERRIDE`.
- Critical rules and official alerts always override recreation and learned preferences.
- Sequencing: Pilot prototype is now unblocked because **LA-T02 Stripe Live cutover is complete**.

---

## Contratos de API (fáceis de errar em testes)

- `POST /api/checklist/generate` → `{ok:true, count:N}` (NÃO retorna os items; buscar via `GET /api/checklist`)
- `POST /api/checklist/toggle` → body `{canonicalKey, acquired}` (NÃO `{id}`)
- `GET /api/weather-intelligence?lat&lng` e `GET /api/ai/readiness` são **GET**
- `GET /api/monitor?lat&lng` exige lat/lng
- Teste E2E de referência: `scripts/full-journey.mjs` (jornada completa) e `scripts/e2e-agent.mjs` (endpoints core)

---

## Migrações — auditoria de produção (atualizada 2026-07-19)

Verificado por existência de tabela/coluna via service-role REST (`scripts/` ad-hoc):
- ✅ `20260630000100_circle_action_plans.sql` — tabela `circle_action_plans` **APLICADA**
- ✅ `20260630000200_push_subscriptions.sql` — tabela `push_subscriptions` **APLICADA**
- ✅ `20260630000300_family_member_link.sql` — coluna `family_members.linked_user_id` **APLICADA**
- ✅ `20260705000100` — tabela `circle_join_requests` (D-040) **APLICADA**
- ✅ `20260710000000_stripe_billing.sql` — colunas Stripe em `profiles` **APLICADA** (2026-07-17)
- ✅ `20260710010000_hazard_tables.sql` — tabelas de hazard **APLICADAS** (2026-07-17)
- ✅ `20260705000000_auto_create_profile.sql` — trigger `handle_new_user` **APLICADO** (2026-07-17; 0 usuários sem perfil)

Verificar via Supabase Dashboard → SQL Editor: `SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 5;`
