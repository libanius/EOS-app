# Notas da auditoria — agosto de 2026

> Para ler com calma, longe do código. É a síntese de três dias de auditoria:
> o que o EOS tem, o que ele diz que tem, e o que fazer com a diferença.
>
> Os dois documentos de referência, se quiser conferir alguma linha:
> - [34-lista-de-features.md](34-lista-de-features.md) — as 137 features enumeradas, com prova
> - [33-inventario-de-verdade.md](33-inventario-de-verdade.md) — a leitura crítica, o que vale vender
>
> Contexto: **zero clientes**. Nada aqui é urgência de reembolso. É material
> para decidir posicionamento antes da primeira campanha.

---

## 1. A foto em números

**137 features.** Enumeradas do código — 34 telas, 70 rotas de API, 37 tabelas,
17 portões de plano — não da documentação.

| | |
| --- | --- |
| Com teste automatizado nomeado | **71** |
| No código, sem teste dedicado | **59** |
| Anunciadas e **não implementadas** | **7** |

O EOS é maior do que parece. A primeira coisa que me surpreendeu não foi o que
falta: foi o quanto existe e não é comunicado.

---

## 2. As sete que não existem

Todas estão na tabela de planos que o cliente vê hoje.

| Anunciada | Plano |
| --- | --- |
| Exportar ficha como PDF | Premium |
| Vigilância de surtos (CDC) | Premium |
| Recalls de medicamentos (FDA) | Premium |
| Histórico de alertas (30 dias) | Premium |
| Incêndios via satélite (NASA) | Família |
| Declarações de desastre (FEMA) | Família |
| Pertencer a múltiplos círculos | Premium — **sem limite no código: todos já podem** |

Sobre o PDF vale um detalhe: o projeto tem `pdf-parse` instalado, o que dá a
impressão de que a feature existe. Ele **lê** PDFs — é o que ingere a base FEMA,
Cruz Vermelha, OMS. Não gera nenhum.

---

## 3. As cinco meias-verdades

Existem, mas não como estão descritas.

- **"Qualidade do ar (AirNow)"** — o índice existe e funciona, mas vem do
  **Open-Meteo**. E não está bloqueado: todo usuário já vê. Vendido como
  Família, entregue a todos.
- **"Desastres e abrigos (FEMA)"** — os abrigos são reais e vêm da fonte certa.
  As declarações de desastre não existem. Metade da promessa.
- **"Notificações push críticas" (Premium)** — funcionam, mas o cron não checa
  plano. Manda para todo inscrito.
- **"Múltiplos círculos" (Premium)** — não há limite nenhum.
- **A base de conhecimento** contém Navy SEAL Bug-In Guide, SAS Survival
  Handbook e Military FM 21-76. Isso é linguagem de prepper, e a visão do
  produto diz explicitamente que o comprador **não é** prepper. Voltarei nisso.

---

## 4. O problema real: o Premium

Não é problema de texto. É de produto.

Dos sete diferenciais do Premium: **cinco não são entregues como exclusivos**
(CDC, FDA, histórico, PDF, múltiplos círculos), **um é entregue a todos na
prática** (push), e **um é real e exclusivo**: a camada de vento animada.

Ela é boa — partículas com `requestAnimationFrame`, campo escalar próprio,
controles de densidade e rastro, e o usuário sem Premium nem inicia o
carregamento. Mas é **uma feature de mapa sustentando um plano inteiro**.

**Antes de qualquer campanha que venda Premium, ele precisa ser repensado.**

---

## 5. O que eu errei nesta auditoria

Classifiquei o vento animado como "existe só numa tela legada não alcançável".
Estava errado: o `WorldV2` **importa** o mapa de `components/world-dashboard/` —
é o mesmo mapa, e a camada está viva em produção.

Deduzi pelo nome do diretório em vez de seguir o import. Registro aqui porque um
inventário de verdade que erra é pior do que não existir, e porque a correção
mudou a conclusão sobre o Premium: ele não está oco, tem um diferencial real.

---

## 6. A comparação com a visão fundadora

Não existe press release no repositório — procurei nos arquivos e no histórico
do git. O documento que cumpre esse papel é
[01-product-vision.md](01-product-vision.md), escrito antes do código.

### O que a visão acertou

> *"The Rules Engine always runs first. The LLM cannot downgrade its urgency
> output."*

Escrito antes do produto existir. É exatamente o que o guard determinístico faz
hoje. Houve um intervalo longo em que o código **não** fazia isso — pegava o
texto do modelo e devolvia. A visão estava certa e o código tinha se afastado.
Hoje está alinhado e testado.

A consciência de família — bebês, mobilidade, medicação — também foi honrada, e
além do que o texto pedia.

### Onde os dois se afastaram

**A North Star não é o que construímos.** A visão diz:

> *"The next 15 minutes." Every feature must answer: does this help the family
> head in the next 15 minutes of a crisis?*

Olhando as 137 features com honestidade: a maioria serve o **tempo de calma**.
Cadastrar a casa, montar inventário, desenhar rotas, treinar cenários, ler a
base de conhecimento — tudo isso se faz num domingo, não durante um furacão.

O que serve os 15 minutos: o veredito do Pilot, a carta do plano offline, os
alertas, os abrigos. É real, e é a minoria.

Isso não é defeito. É achado de posicionamento. **O EOS virou um produto de
preparação continuada com um modo de crise** — e a visão dizia o inverso. Uma
campanha escrita a partir da North Star original venderia urgência e entregaria
organização: a pessoa que compra no susto abre o app e encontra formulários.

**"Under 60 seconds" nunca foi medido.** A visão promete plano acionável em
menos de 60 segundos. Agora existe telemetria que mede a espera real — dá para
**verificar** essa promessa em vez de repeti-la. Eu mediria antes de usá-la.

**Dos três modos de inteligência, dois existem.** CONNECTED e SURVIVAL
funcionam. LOCAL_AI depende do app nativo, que está bloqueado. A visão já diz
"planned; blocked" — é honesta. Mas nenhum material de venda pode citar os três.

---

## 7. A pergunta de posicionamento — e a resposta que já estava escrita

Eu tinha perguntado se o comprador do EOS chega por **medo** (evento próximo,
temporada de furacão, um susto) ou por **identidade** (prepper, pai recente,
quem cuida de um idoso). São públicos, canais, momentos e preços diferentes.

A visão já respondeu, e eu não tinha visto:

> *"Not a prepper — just a responsible adult who wants to be ready"*

É uma decisão forte e boa. E é **incompatível com metade do material que
existe**: a base de conhecimento tem manual de sobrevivência militar e guia de
Navy SEAL. O pai de 38 anos que a visão descreve — o que não se considera
prepper — se sente deslocado ao ver isso.

Ou o conteúdo muda de tom, ou o público muda. Não dá para manter os dois.

---

## 8. As três coisas que eu levaria para a campanha

Verdadeiras hoje, verificáveis, e difíceis de copiar.

1. **"O EOS conta a sua casa, não a sua conta."**
   Somar a despensa de quem mora junto e dividir pelas bocas reais. Onze
   features com teste sustentam isso. Não conheço concorrente que faça.

2. **"Ele não te tranquiliza sem base."**
   Casa desconhecida vira *espere*, nunca *pode ir*. É promessa de caráter, não
   de tecnologia — e vale mais que dizer "com IA".

3. **"Responde com a rede caída."**
   Motor local, plano em cópia offline, carta do plano desenhada sem rede. No
   aparelho. **Não** entre pessoas — isso é a malha LoRa, que não existe.

E um cuidado que quero deixar por escrito: *"funciona sem rede"* e *"comunica
sem rede entre pessoas"* parecem frases irmãs. A distância entre elas é a
distância entre uma promessa honesta e um processo. Num app de emergência, essa
é a linha que eu não cruzaria.

---

## 9. Duas coisas que a enumeração revelou

**Metade das features não tem teste.** 59 de 137. Não estão quebradas — é que
não sei afirmá-las com a mesma confiança. Para campanha, a distinção importa: 71
eu defendo com nome de teste, 59 com menos especificidade.

**A área mais forte é a mais silenciosa.** O plano da família tem 12 features e
**11 com teste** — a área mais bem provada do produto inteiro. E é a que menos
aparece no material de venda.

---

## 10. O que está na sua mão

Em ordem de precedência — as duas primeiras mudam tudo o que vem depois.

1. **Decidir a North Star.** Voltar o produto para "os próximos 15 minutos", ou
   assumir que o EOS é preparação continuada e reescrever a visão. Eu me inclino
   pela segunda, porque é o que o código já é e o que tem prova. Mas é sua
   decisão.
2. **Decidir o que o Premium vai ser.** Hoje ele tem um diferencial só.
3. Limpar as sete inexistentes da tabela de planos e da landing.
4. Corrigir as cinco descrições parciais.
5. Decidir o tom da base de conhecimento (militar × responsável comum).

**Sobre o agente de marketing:** minha recomendação continua sendo montar um
skill específico do EOS em vez de instalar um genérico do GitHub. Os frameworks
de posicionamento são públicos; o que falta a um agente genérico é justamente o
que estes documentos são — a base de fatos que impede alguém de escrever uma
campanha vendendo vigilância do CDC. O skill leria o 34 como fonte e exigiria que
toda afirmação apontasse para uma linha dele.

Mas ele só faz sentido depois das decisões 1 e 2.

---

## Pendências operacionais, à parte

Não têm relação com marketing, mas continuam abertas:

- **Bug de navegação:** do dashboard, tocar nos itens da barra inferior não
  navega. Já falhava antes das mudanças recentes para `/preparedness` e
  `/comms`; agora atinge `/circles` também. **É bloqueador de lançamento** e eu
  parei no meio do diagnóstico.
- **Rotação dos segredos** expostos em conversa (token Vercel, PAT Supabase,
  chaves Stripe, MapTiler, CRON_SECRET).
- **Play Store:** criar o app no Play Console e colar duas variáveis na Vercel.
  Custo total novo: US$ 25.
- **Política de billing do Play × Stripe:** verificar antes de investir tempo no
  resto. É a única incógnita capaz de mudar o plano inteiro.
