# Inventário de verdade do EOS

> **Para que serve este documento.** É a base de fatos de qualquer campanha,
> landing page, ficha de loja ou material de venda do EOS. A regra é uma só:
>
> **Nada é afirmado ao cliente sem apontar aqui para o arquivo e o teste que
> provam.** Uma tabela de planos escrita a partir de intenção — e não de código
> — foi exatamente o que produziu, em agosto de 2026, quatro features Premium
> anunciadas que não existiam.
>
> Auditado em 2026-08-11 lendo o código, não a documentação.
> Base de prova: 28 testes de navegador contra o Supabase de produção e
> 23 suítes unitárias (202 testes).

---

## Como ler os níveis

| Nível | O que significa | Pode ir para campanha? |
| --- | --- | --- |
| **PROVADO** | Existe e é exercitado por um teste automatizado nomeado abaixo | Sim, sem ressalva |
| **EXISTE** | Existe no código e funciona, sem teste dedicado | Sim, com cautela na especificidade |
| **PARCIAL** | Parte da promessa existe, parte não | Só reescrevendo a promessa |
| **NÃO EXISTE** | Anunciado e não construído | **Não.** Remover do material |
| **ROADMAP** | Planejado, bloqueado ou não iniciado | Só como "em breve", nunca no presente |

---

## 1. PROVADO — o núcleo defensável

Estas são as afirmações mais fortes que o EOS pode fazer hoje. Cada uma tem um
teste que roda contra dados reais.

### A casa e quem mora nela
- **Uma casa somada, não uma conta isolada.** Quando duas pessoas confirmam
  morar juntas, o EOS soma a despensa das duas e divide pelo número real de
  bocas. `household-test` (9), `household-consistency-test` (8).
- **Consentimento em duas camadas.** Morar junto NÃO dá acesso à ficha médica —
  são duas permissões separadas. `household-consent-test`.
- **A mesma pessoa cadastrada duas vezes é detectada e apontada**, nunca fundida
  sozinha. `duplicate-person-test` (8).
- **Endereço estruturado por país** que vira ponto no mapa e dispara "quem mais
  mora aqui". `address-flow-test` (9), `address` (unit).

> **Ângulo de marketing:** este é o diferencial técnico real e ninguém o
> comunica. "Seu app de preparação conta a sua despensa. O EOS conta a da sua
> casa" é uma frase verdadeira e difícil de copiar.

### O Pilot (assistente)
- **Motor determinístico local** que responde sem rede, com veredito
  (`ready/watch/hold/act`). `pilot-abilities-test` (8), `rules-engine` (unit).
- **A regra crítica sobrepõe a IA.** O veredito é calculado por regra, não pelo
  modelo — o modelo não pode dizer "pode ir" quando a regra diz que não.
  `pilot-guard` (unit), `guardrails-test`.
- **Casa desconhecida vira WAIT, nunca GO.** Falha de leitura não produz
  tranquilização inventada. `pilot-guard` (unit).
- **Os mesmos números em toda tela**, e a conversa sobrevive à navegação.
  `pilot-one-truth-test` (7), `pilot-orb-test` (6).

> **Ângulo de marketing:** "o Pilot não te tranquiliza sem base" é uma promessa
> de segurança, não de tecnologia. Vale mais que "com IA".

### O plano da família
- **Plano com pontos de encontro, rotas desenhadas à mão, papéis e gatilhos**,
  com carta offline. `plan-editor-test` (14), `multi-plan-test`.
- **Rotas são autorais, nunca calculadas por motor de roteamento** — o valor
  está no acordo da família e no conhecimento local.
- **"Quem busca quem" alcança dependentes sem conta** (a criança, a avó).
  `plan-gaps-dependents` (unit, 9).
- **Ninguém fica para trás:** quem não sai sozinho e não tem responsável vira
  aviso. Avisa sem travar o salvamento.

### Círculos
- **Papéis (Admin/Editor/Viewer), convite por link e por QR**, pedido de
  entrada com aprovação. `circles-page-test`, `circle-admin-test`,
  `invite-link-test`.
- **Um convite nunca concede acesso à ficha sozinho** — só marca "solicitado".
- **Localização compartilhada do círculo** com marcador estável.
  `circle-location-test`, `marker-stability-test`.

### Clima e mapa
- **Alertas severos (NWS), terremotos (USGS), furacões (NHC), chuva
  (Open-Meteo)** — todos gratuitos e sem chave. `weather-layers-test` (8),
  `hazards` (unit).
- **O provedor diz quando não sabe** em vez de inventar (sem ciclone ativo, ele
  afirma que não há).
- **Camadas de mapa: escuro, satélite, chuva, alertas, vento, ciclone, flood,
  surge, impacto de vento, tornado**, e a escolha sobrevive ao reload.

### Simulação / treino
- **Cenários compartilhados com convite**, e um debrief que cobra o plano de
  verdade. `simulation-share-test`.

### Notificações
- **Push funcionando** com registro de service worker. `push-test`,
  `notification-surface` (unit).

### Offline
- **Service worker, plano em cópia local, carta do plano desenhada sem rede.**
  Provado dentro de `plan-editor-test`.

### Vento animado (Premium)
- **Camada de partículas animada com `requestAnimationFrame`**, campo escalar
  próprio e controles de densidade, rastro, opacidade e tom.
  `lib/world/WindParticleLayer.ts`, montada por
  `components/world-dashboard/WorldMap.tsx`, que é o mapa que o dashboard atual
  usa. Bloqueada por `canAccess('animated_wind')`.
- Decidido em D-141..D-144: usuário sem Premium não inicia fetch amplo, canvas
  nem loop de frames.

> **CORREÇÃO DE AUDITORIA (2026-08-11).** A primeira versão deste documento
> classificou o vento animado como PARCIAL, afirmando que ele vivia numa "tela
> legada não alcançável". Estava errado: o `WorldV2` **importa** o `WorldMap` de
> `components/world-dashboard/` — é o mesmo mapa, e a camada está viva no
> dashboard de produção. O erro veio de eu ter deduzido pelo nome do diretório
> em vez de seguir o import. Um inventário de verdade que erra é pior que
> nenhum, e por isso a correção fica registrada em vez de ser apagada.

### Educação (EDU)
- **Base de conhecimento com FEMA, Cruz Vermelha, OMS, SAS, SAMHSA, NCTSN** e
  busca semântica. `edu`, `edu-rag`, `edu-actions` (unit).

---

## 2. EXISTE — funciona, sem teste dedicado

Usar em campanha com menos especificidade, ou pedir um teste antes.

- Ficha de emergência pessoal com QR público (`/ficha/[id]`)
- Inventário de recursos (água, comida, combustível, bateria, kit, comunicação)
- Checklist gerado e por cenário
- Comms: mensagens do círculo, perfis de rádio
- Programa de afiliados e códigos-presente (`affiliate` unit)
- Cobrança Stripe: checkout, portal, webhook, resgate
- Telemetria do Pilot sem conteúdo de conversa (D-132)
- Preparo para Play Store: manifest TWA, ícone maskable, assetlinks
  (`twa-manifest` unit)

---

## 3. PARCIAL — a promessa precisa ser reescrita

| Anunciado hoje | O que é verdade |
| --- | --- |
| "Qualidade do ar **(AirNow)**" | O AQI existe e funciona, mas vem do **Open-Meteo**. E não está bloqueado: todo usuário já vê. Reescrever como "Qualidade do ar" e decidir se é grátis mesmo |
| "Desastres **e abrigos** (FEMA)" | **Abrigos: reais** (FEMA National Shelter System, e o código se recusa a prometer vaga ou acessibilidade a partir de um feed que não tem esse dado). **Declarações de desastre: não existem.** Reescrever como "Abrigos ativos (FEMA)" |
| "Múltiplos círculos" (Premium) | Não há limite nenhum no código: **todos já podem**. Não é falha de entrega, mas o Premium não está dando nada aqui |
| "Notificações push críticas" (Premium) | Funciona, mas o cron **não checa plano** — manda para todo inscrito |

---

## 4. NÃO EXISTE — remover de todo material

Anunciado na tabela de planos e/ou na landing page, sem uma linha de código:

- **"Incêndios via satélite (NASA)"** — sem NASA FIRMS em lugar nenhum
- **"Vigilância de surtos (CDC)"** — inexistente
- **"Recalls de medicamentos (FDA)"** — sem openFDA
- **"Histórico de alertas (30 dias)"** — sem tabela, sem tela, sem rota
- **"Exportar ficha como PDF"** — o `pdf-parse` do projeto **lê** PDFs (a base
  de conhecimento), não gera

**Consequência para o produto, não só para o texto:** dos seis diferenciais do
Premium, **três não existem** (CDC, FDA, histórico), o PDF também não, e dois
são entregues a todos na prática (push, múltiplos círculos). Sobra **um
exclusivo real: a camada de vento animada** — que é boa, é técnica e é
defensável, mas é uma feature de mapa sustentando um plano inteiro.

**O Premium precisa ser repensado antes de qualquer campanha que o venda.** Não
é problema de texto: é um plano com um diferencial só.

---

## 5. ROADMAP — só como "em breve"

Do roadmap: 141 tarefas completas, 16 bloqueadas. As bloqueadas são um bloco
coerente e é material de visão, nunca de presente:

- **App nativo** (M-T01..T08): IA local no aparelho com llama.rn, modo
  sobrevivência sem servidor, submissão às lojas
- **Malha LoRa** (P4-T01..T04): comunicação entre aparelhos sem rede via ESP32
- **CarPlay / Android Auto** (AUTO-T00..T03)
- **Sentry** (P1-T07) — hoje o registro de erro é feito em Postgres próprio
- **Chaves opcionais de provedor** (WeatherKit, Xweather/raios)

> **Cuidado de marketing:** "funciona sem rede" é verdade hoje **no aparelho**
> (motor local, plano offline, carta do plano). "Comunica sem rede entre
> pessoas" é a malha LoRa, e **não existe**. A distância entre as duas frases é
> a distância entre uma promessa honesta e um processo.

---

## 6. O que eu levaria para a campanha

Três afirmações fortes, verdadeiras e verificáveis hoje:

1. **"O EOS conta a sua casa, não a sua conta."** Somar a despensa de quem mora
   junto, dividir pelas bocas reais, e nunca inflar. Ninguém no mercado faz isso
   e é demonstrável numa tela.
2. **"Ele não te tranquiliza sem base."** O veredito vem de regra
   determinística; casa desconhecida vira "espere", nunca "pode ir". É uma
   promessa de caráter, e o código a sustenta.
3. **"Responde com a rede caída."** Motor local, plano em cópia offline, carta
   do plano desenhada sem rede.

E uma pergunta de posicionamento que precisa ser respondida antes do texto:
**o comprador chega por medo (evento próximo) ou por identidade (prepper, pai
recente, cuidador)?** Os dois compram, mas por canais, momentos e preços
diferentes.

---

## Manutenção

Este documento envelhece a cada release. A regra:

- Quem move uma feature de nível **atualiza esta tabela no mesmo commit**
- Uma feature só sobe para **PROVADO** quando existe um teste nomeado
- Toda campanha aprovada cita a linha deste documento que a sustenta
