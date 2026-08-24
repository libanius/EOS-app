---
target: a página Plano (/preparedness/plano)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-19T15-17-30Z
slug: components-world-v2-planpage-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

Target: `/preparedness/plano` → `components/world-v2/PlanPage.tsx` (1732 linhas na leitura).
Mode: **Operate** — o visitante completa uma tarefa. Todas as 10 heurísticas se aplicam.

## Design Health Score — 22/40 (Needs work)

| # | Heurística | Nota | Achado |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | Versão + idade sempre no cabeçalho e o offline se declara offline. Mas o loading é um `…` literal, não há indicador persistente de rascunho não salvo, e salvar nunca conta que um push saiu para o círculo. |
| 2 | Sistema ↔ mundo real | 4 | "Quem busca quem", "Ninguém ficou encarregado de Avó Ana", "1,2 km de casa · NE · ~15 min a pé". Gatilhos são condições observáveis, nunca julgamentos. Só perde por "Armar sessão" e "Confiança da coordenada". |
| 3 | Controle e liberdade | 1 | Nenhum undo. Nenhuma guarda de rascunho não salvo. Quatro controles da própria página destroem o rascunho em silêncio. |
| 4 | Consistência e padrões | 2 | Dois `×` idênticos: um remove do rascunho, o outro faz DELETE no servidor. Três `role="dialog"` sem `aria-modal`, sem focus trap, sem Escape. Dois design systems no mesmo cabeçalho. |
| 5 | Prevenção de erro | 2 | `planGaps` bloqueia salvar e `planWarnings` deliberadamente não — bem pensado. Desfeito pela colisão de `destination_kind` e pela ausência de guarda de versão no PUT. |
| 6 | Reconhecer em vez de lembrar | 2 | Catálogo, sugestões prontas e dicas da escada são bons. Mas os três campos que carregam o plano de fato só têm placeholder, e o portão de precisão é recall puro. |
| 7 | Flexibilidade e eficiência | 2 | Salvar nunca é alcançável sem rolar as ~14 cartas. Não existe duplicar plano, embora doc 18 §3 espere vários planos compartilhando os mesmos pontos. |
| 8 | Estético e minimalista | 1 | ~14 cartas do mesmo material, mesmo raio, mesmo gap. Até quatro cartas de alarme empilham antes de qualquer conteúdo. A carta do Pilot repete as mesmas três sugestões que aparecem 400px abaixo. |
| 9 | Recuperação de erro | 2 | A taxonomia de erro de geolocalização é excelente. Então `save()` colapsa 403/404/409/500 em "Verifique a conexão" — captura a mensagem real e a joga fora. |
| 10 | Ajuda e documentação | 3 | Toda seção tem uma frase de porquê, bem acima da média. Mas a camada inteira de ajuda renderiza a 13px com ~3:1 de contraste, e não há orientação de primeira vez. |
| **Total** | | **22/40** | **Needs work** |

## Design Specificity Verdict

**Veredicto dividido: o vocabulário é irrepetível, a composição é de prateleira.**

**Específico deste produto:** a escada de encontro nomeada pelo caso que resolve, não pelo nível ("No bairro, a pé / A casa ficou inacessível, mas a região está bem"); a procedência da coordenada como atributo visível de primeira classe ("centro da cidade — impreciso" vs "marcado no local"); a ausência com causa — quando a casa não está definida, cada carta imprime *por que* a distância falta em vez de omitir a linha.

**Genérico:** troque o objeto `COPY` e nove das dez seções são qualquer página de configurações B2B — `SectionLabel` → `Card` → linhas → `+ Adicionar` → `×`. O editor de gatilhos é uma linha de planilha com 8 controles.

**A lacuna:** `specs/PLAN-EXEC-001` §4.1 assume princípios de design reais — uma ação por vez no primeiro nível, a próxima ação ocupa o topo inteiro, secundário por posição e não por tamanho de fonte. Esses princípios governam a superfície de **execução**. A superfície de **autoria** não obedece a nenhum deles, e não há razão declarada para isso.

**Varredura determinística:** `detect.mjs` → `[]`, exit 0. **Zero achados.** O agente validou o resultado com controles positivos antes de aceitá-lo (um CSS e um TSX plantados dispararam 2 achados cada), confirmou que não há `config.json` nem regras suprimidas, e repetiu de cwd neutro. O resultado é genuíno. Uma limitação medida: o detector não pega `style={{ fontFamily: 'Inter' }}` em objeto JSX camelCase, só a forma string-CSS — irrelevante aqui, porque o arquivo tem **zero cores hardcoded** e zero objetos de estilo inline.

**Isso é o achado mais importante do relatório determinístico: a higiene mecânica desta página é genuinamente boa. Nenhum dos problemas reais é do tipo que um detector pega.**

**Evidência de browser: não obtida.** A rota é auth-gated (`307 → /auth/login`). O único caminho de autenticação que este repo tem cria contas via service-role no Supabase **de produção** (`scripts/plan-editor-test.mjs` avisa isso no próprio cabeçalho). O classificador de permissão bloqueou o script, corretamente. Os dois screenshots capturados são da tela de login em branco e **não são imagens do PlanPage**. Portanto: overflow horizontal a 390px, sobreposições, texto cortado, alvos abaixo de 44px e erros de console **não foram medidos na página alvo**. Sem overlay visual no browser.

## Overall Impression

Esta página foi escrita por alguém que entende o problema profundamente e nunca teve licença para desenhar a solução. As frases são de um produto que sabe o que está em jogo; a estrutura é o modelo de dados renderizado de cima para baixo. As dez seções não são dez decisões do usuário — são dez tabelas.

A maior oportunidade é uma só: **`planGaps` já sabe que um plano precisa de exatamente duas coisas** — um ponto de encontro na porta de casa e um papel. O produto calcula isso e então renderiza como *aviso amarelo* em vez de renderizar como *interface*.

## What's Working

**1. A escada de encontro é design de verdade, não uma seção de formulário.** Funciona porque três decisões se alinham: o degrau numerado torna o escalonamento espacial; a linha `solves` nomeia o *cenário* em vez do *nível*, para que uma pessoa assustada não precise traduzir "secundário"; e a linha de alcance imprime distância, rumo e minutos a pé juntos. Tire qualquer uma das três e vira uma lista de endereços.

**2. Procedência é propriedade visível de toda coordenada.** A maioria dos produtos guardaria lat/lng e apresentaria tudo igual. Este se recusa a deixar "centro da cidade" usar a mesma roupa que "marcado no local" — porque apresentar as duas igual é como uma família conclui que pode ir a pé até onde não pode. O movimento gêmeo — imprimir *por que* a distância falta em vez de omitir a linha — é mais raro e mais difícil.

**3. A aquisição de geolocalização é feita em cima da cena de uso real.** Duas requisições em estágio: uma rápida de baixa precisão que aceita um fix de 2 minutos, e um `watchPosition` de alta precisão que só substitui o pino se genuinamente melhorar. Falha só é reportada se as duas pernas falharem, e cada um dos quatro modos de falha tem mensagem própria apontando o mapa como saída. O comentário documenta a versão anterior que exigia `enableHighAccuracy + maximumAge: 0` e estourava o timeout dentro de casa. É uma decisão tomada a partir de uma falha observada, na cozinha, no wifi.

## Priority Issues

### [P0] O ponto marcado no mapa nunca pode ser confirmado
`PointPicker` inicializa `precision = 'unknown'`. O botão Confirmar fica desabilitado enquanto `precision === 'unknown'`. `useMyPosition` grava `'gps'`, um resultado de busca grava `'address'` — mas **`onPick` vindo do `MapPointPicker` não grava nada**. Então: toca "Escolher no mapa" → solta o pino → volta → o pino aparece, "Ponto marcado · -23.55, -46.63" sai em verde — **e Confirmar continua cinza, sem nenhuma mensagem dizendo por quê.** A única saída é rolar até um select chamado "Confiança da coordenada".

**Por que importa:** é o caminho que o produto manda o usuário tomar. As quatro mensagens de falha de GPS terminam apontando para o mapa. O comentário no próprio código argumenta que marcar no mapa é "a parte PRECISA do fluxo" e que travar isso atrás de digitar era "o obstáculo no lugar errado" — o portão do nome foi removido e o portão da precisão ficou exatamente na mesma posição. Todo ponto de encontro passa por essa folha, e `planGaps` não deixa salvar sem o degrau 1. **O caminho mais comum até o único campo obrigatório termina em beco sem saída silencioso.**

**Correção:** `MapPointPicker` retorna `precision: 'address'` e `onPick` grava. Remover a cláusula `precision === 'unknown'` do disabled. Se o portão tiver que ficar, precisa de motivo visível ligado por `aria-describedby` — exatamente como o portão do salvar já foi corrigido nesta mesma página.

**Comando:** `/impeccable harden`

### [P0] O rascunho é destruído por navegação comum e por quatro botões da própria página
Todas as edições vivem só em estado React. Não existe `beforeunload` em lugar nenhum do repositório, não há guarda de troca de rota, e `saveFamilyPlan` persiste só o que o *servidor* devolveu — nunca o rascunho local. Cinco caminhos descartam trabalho sem aviso: o `PreparednessNav` (cinco `<Link>`, `position: sticky`, permanentemente acima da dobra), trocar de plano, trocar de círculo, `+ Novo plano`, e — o pior — `confirmCirclePlace`: **um pai que arruma os papéis e depois volta para ajustar o pino da escola perde os papéis.**

**Por que importa:** `docs/18` §2 declara o princípio que governa a feature: *"O plano precisa funcionar exatamente quando o EOS não funciona."* A superfície de autoria é o único lugar desta feature onde nada sobrevive a nada. Falha de salvamento também é irrecuperável: mostra "Verifique a conexão" e o rascunho fica em memória volátil num celular com 8% de bateria.

**Correção:** persistir o rascunho em IndexedDB a cada `setDirty(true)`, chaveado por `circleId:planId`, e reidratar na montagem com faixa de "rascunho não salvo deste aparelho". A camada de storage já existe. Guardar todo caminho que chama `load()`/`clearDocument()`/`setCircleId` enquanto `dirty`.

**Comando:** `/impeccable harden`

### [P1] A faixa de "o plano mudou" some no instante em que você toca em qualquer coisa
`needsAck` inclui `&& !dirty`. A carta de ack desmonta no primeiro caractere digitado e `acknowledge()` fica inalcançável. Somado a isso, `save()` não envia versão esperada e o servidor faz `version = existing.version + 1` incondicionalmente — sem 409, sem merge, último write vence.

**Por que importa:** `docs/18` §6.5 diz *"Divergência nunca é resolvida silenciosamente."* Cenário concreto: o pai move o degrau 3 na terça (v7). A mãe abre na quarta, vê "O plano mudou", começa a corrigir um typo antes de ler — a faixa some, ela nunca confirma a v7, salva a v8, e a mudança do pai fica enterrada numa versão que ela não leu. Os dois aparelhos mostram "sincronizado agora".

**Correção:** manter a carta de ack montada enquanto `myAck !== version`, independente de `dirty` — rebaixar, não deletar. Bloquear `save()` até a versão recebida ser reconhecida, ou enviar `expectedVersion` e devolver 409 com diff.

**Comando:** `/impeccable harden`

### [P1] `destination_kind` é uma categoria fingindo ser identidade
O select de destino do gatilho lista waypoints **por nome** mas grava `point.kind` como valor. `PLACE_KINDS` permite ilimitados `custom`. Então um plano com "Casa da vovó" e "Praça do Cruzeiro" — ambos `kind: 'custom'` — produz duas opções com o valor idêntico `"custom"`. O select só resolve para a primeira.

**Por que importa:** `docs/18` §9.1 e `specs/PLAN-EXEC-001` §3.4 derivam o destino ativo do playbook de execução a partir de `destination_kind`. É um defeito invisível em tempo de autoria que aparece como **o playbook de emergência mandando a família para a esquina errada**, no momento exato em que ninguém está conferindo.

**Correção:** guardar id de waypoint como referência de destino e migrar. Mitigação imediata: desambiguar entradas de mesmo `kind` no select e avisar em tempo de autoria.

**Comando:** `/impeccable harden`

### [P1] Contraste: a camada inteira de explicação falha WCAG AA
`--ink-3` é `rgba(235,235,245,0.38)` ≈ **3.0:1 sobre preto**, e carrega `t-foot` (13px) e `t-caps` (11px). Isso significa que **todo rótulo de seção, toda frase explicativa, todo rótulo de precisão, toda linha de distância/rumo/minutos** falha AA. A navegação de topo também: `--mu` a 13px ≈ 4.1:1.

**Por que importa:** `specs/PLAN-EXEC-001` §4.3 já sinaliza `--mu` como "o token mais frágil sob sol" e o proíbe em texto essencial no modo de execução. Essa proibição para na superfície de autoria — mas a pessoa que preenche isso às 23h, cansada, é a mesma pessoa. O detector determinístico **não pega isso**: contraste de token não é uma das suas regras.

**Correção:** promover `--ink-3` para ≥4.5:1 em texto de 13px, ou mover a camada de explicação para `--ink-2`.

**Comando:** `/impeccable audit`

## Persona Red Flags

**Jordan (primeira vez).** O primeiro campo é um nome de arquivo — "Nome do plano", placeholder *"Ex.: Sem celular na escola"* — pedido a quem ainda não tem modelo do que um plano é. Dez seções vazias sem ponto de partida. A carta do Pilot oferece três sugestões a um rascunho que não existe, com a mesma frase de motivo repetida três vezes, e Jordan lê "Revisão do Pilot · 3" num plano vazio e conclui que algo já está errado. As mesmas quatro sugestões aparecem duas vezes, em dois tratamentos, com dois mecanismos diferentes de aplicar. E o Confirmar desabilitado (P0-1) encerra a sessão dele sem erro, sem dica, sem vermelho.

**Sam (leitor de tela / só teclado / baixa visão).** Nenhum dos três `role="dialog"` tem `aria-modal`, move foco na abertura, prende foco, restaura no fechamento ou trata Escape. O scrim é um `<button>` do tamanho da viewport rotulado "Cancelar", **antes** do diálogo na ordem do DOM — a primeira parada de tab ao abrir a folha é um "Cancelar" invisível de página inteira. Três campos que carregam o plano só têm placeholder. E o `aria-label` está no select errado: o "quem age" não tem nenhum, e o "quem é buscado" carrega o nome da *seção*. **O agente determinístico confirmou isso independentemente: 6 de 15 controles de formulário sem nome acessível, e um select sem nenhuma pista textual.** Os dois métodos chegaram no mesmo lugar por caminhos diferentes.

**O pai armando isso às 23h na véspera do furacão.** Catorze cartas para rolar antes do Salvar, toda vez, sem commit fixo. A barra de navegação sticky fica a um deslize do polegar da perda total: cinco `<Link>` permanentemente na tela, sem guarda de dirty. Quatro cartas de alarme podem empilhar antes de qualquer conteúdo — o que treina esse pai a rolar por cima de todas, inclusive de "Ninguém ficou encarregado de Avó Ana", que é a única que importa. "Armar sessão" aparece **acima** do conteúdo do plano, com campos `datetime-local`, para uma feature que o spec diz explicitamente ser *"Nunca obrigatório"*. E se o salvamento falhar — offline às 23h, a condição mais provável para essa pessoa — tudo se perde. A recompensa por terminar é: "Plano salvo" e, logo abaixo, "Nada mudou desde o último salvamento", com o botão ficando cinza.

## Minor Observations

- `setPlanName` chamado duas vezes com o mesmo valor — linha morta.
- `setAckedBy(list => (list.includes('me') ? list : list))` é no-op nos dois ramos: a atualização otimista nunca acontece.
- `message` nunca limpa. "Plano salvo" persiste pela sessão de edição seguinte.
- Depois de salvar, "Plano salvo" e "Nada mudou desde o último salvamento" renderizam juntos e se contradizem.
- O estado de loading é um único caractere `…`, sem `aria-live`, sem skeleton.
- `notify_circle` é true por padrão e o rótulo nunca diz que isso manda push para todo mundo.
- `escalation_minutes` é limitado a 5–120 no handler mas o input não mostra a faixa: digitar 200 vira 120 em silêncio.
- O `aria-label` do gráfico anuncia contagens e extensão, mas nenhum nome de lugar.
- As chips de plano e as de círculo usam a mesma classe em duas linhas adjacentes sem rótulo; o `aria-label` está num `div` sem role, que a maioria dos leitores de tela ignora.
- `PlanPage` é uma função de 1090 linhas com 26 `useState` — o que corrobora mecanicamente o achado de que nada é revelado progressivamente: tudo monta de uma vez.

## Questions to Consider

**1. `planGaps` diz que um plano precisa de exatamente duas coisas. Por que a primeira tela mostra dez seções em vez de duas?** O andaime já existe: `gaps` está calculando isso e renderizando como aviso em vez de como interface.

**2. A tese da feature inteira é "funciona quando o EOS não funciona". Por que o rascunho é o único artefato que só existe em RAM?** O IndexedDB está ali, usado só para respostas do servidor. E se "Salvar plano" virasse "Combinar com a família" — um publish, não um persist — e a versão passasse a significar *"nós concordamos"* em vez de *"alguém digitou"*?

**3. `destination_kind` é uma categoria no lugar de uma identidade. O que mais nesta página está fazendo isso?** `kind` é simultaneamente o tipo do lugar, a identidade do ponto de encontro e uma chave estrangeira nos gatilhos. Três trabalhos, um campo.

**4. A superfície de execução tem filosofia de design e a de autoria não tem nenhuma. Isso é distinção real ou acidente de quem escreveu o quê e quando?** A cena de autoria também é uma cena: 23h, cansado, cônjuge ouvindo pela metade, vinte minutos antes de dormir. E uma versão mais afiada: se a autoria fosse um ensaio da execução — se o pai visse o playbook tomando forma enquanto preenche — ele precisaria do formulário de dez seções?
