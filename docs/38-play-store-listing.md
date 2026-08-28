# 38 — Ficha da Play Store

> Material de listagem e declarações de política. Não é código.
> Última atualização: 2026-08-28 · Faixa 1 do lançamento

Este documento existe porque metade do trabalho de publicar não é técnica: é
declarar com precisão o que o app faz com os dados das pessoas. E o EOS coleta
justamente as três categorias que o Google trata com mais rigor — **localização
precisa, informação de saúde e dados de crianças**.

Declarar errado aqui não é um formulário mal preenchido. É motivo de suspensão,
e a correção depois do fato é muito mais cara do que o cuidado agora.

---

## 1. Data safety — respostas ao formulário

As linhas abaixo saíram do esquema real (`eos_schema.sql`) e do código, não de
memória. Onde há dúvida, ela está escrita como dúvida.

### 1.1 Localização

| Campo | Resposta | De onde vem |
|---|---|---|
| Localização **aproximada** | Coletada | `profiles.location` (cidade digitada) |
| Localização **precisa** | Coletada | `profiles.location_lat/lng` e `last_location_lat/lng` — coordenada de GPS |
| Finalidade | Funcionalidade do app; **não** publicidade | alerta por perigo, abrigos próximos, rota do plano |
| Compartilhada com terceiros? | **Sim** | a coordenada vai a provedores de perigo (NWS, USGS, NHC, Open-Meteo) e a tiles de mapa (MapTiler) |
| Compartilhada com outros usuários? | **Sim**, com consentimento explícito | membros do círculo veem a posição ao vivo; há alternância própria (D-064) |
| Obrigatória? | **Não** | o app funciona com localização salva à mão |
| Criptografada em trânsito | Sim | HTTPS ponta a ponta |
| Pode ser apagada | Sim | exclusão de conta remove em cascata (FK `profiles_id_auth_users_fkey`, D-175) |

> **Coleta em segundo plano**: a varredura de perigo (D-220) roda no servidor
> sobre a **última posição conhecida**, não sobre GPS em segundo plano no
> aparelho. Isso NÃO é "background location" no sentido da política, e é bom
> que assim seja: a permissão de segundo plano exige justificativa em vídeo e é
> a maior fonte de rejeição da categoria.

### 1.2 Informação pessoal e de saúde

| Campo | Resposta | De onde vem |
|---|---|---|
| Nome | Coletado | `profiles.name`, `family_members.name` |
| E-mail | Coletado | autenticação |
| **Informação de saúde** | **Coletada** | `profiles.blood_type`, `allergies`, `medications`, `medical_notes`; `family_members.medical_conditions`, `mobility_impaired` |
| Telefone | Coletado | `profiles.emergency_contact_phone` |
| Finalidade | Funcionalidade do app | a ficha de emergência existe para ser lida por um socorrista |
| Obrigatória? | **Não** | todos os campos médicos são opcionais |

> ⚠️ **O ponto que exige decisão sua.** `lib/pilot-family-record.ts` monta tipo
> sanguíneo, alergias, medicamentos e notas médicas **dentro do prompt** enviado
> à OpenAI (D-105/D-106). Isso é transferência de dado de saúde a um terceiro,
> e o formulário tem de dizer **"compartilhado com terceiros"**.
>
> Três caminhos, e é decisão de produto, não de engenharia:
>
> 1. **Declarar e explicar** — o mais rápido; a política de privacidade precisa
>    nomear a OpenAI como subprocessador e dizer para quê;
> 2. **Deixar o usuário escolher** — uma chave "o Pilot pode ler minha ficha
>    médica", desligada por padrão. Mais honesto, e o Pilot degrada com clareza;
> 3. **Não enviar** — o Pilot perde a capacidade que D-105/D-106 construíram.
>
> Minha recomendação é a **2**. Ela preserva a função para quem quer, e dado de
> saúde sair do aparelho por padrão é o tipo de coisa que uma família descobre
> depois e não perdoa.

### 1.3 Crianças

O app guarda **idade** e **condição médica de menores** (`family_members`, com
`is_infant`). Isso não torna o EOS um app dirigido a crianças — o usuário é o
adulto responsável —, mas exige atenção em dois lugares:

- **Público-alvo**: declarar como dirigido a **adultos (18+)**, o que mantém o
  EOS fora do programa Famílias e das suas exigências extras;
- **Content rating**: responder ao questionário de fato; a categoria é utilitário
  sem conteúdo gerado por usuário público.

> ⚠️ **Verificar antes de responder**: existe chat de círculo
> (`circle_messages`). Comunicação entre usuários pode disparar exigências de
> moderação e denúncia no questionário. O chat é **privado e fechado ao círculo
> convidado** — não é comunidade pública —, mas a pergunta precisa ser lida com
> calma, não respondida no automático.

### 1.4 Dados financeiros

Pagamento é **Stripe Checkout**, fora do app. O EOS guarda apenas
`stripe_customer_id` e `stripe_subscription_id` — **nenhum dado de cartão toca o
servidor do EOS**. No formulário: "informação de compra — coletada", cartão
não.

### 1.5 Terceiros que recebem dados

| Terceiro | O que recebe | Por quê |
|---|---|---|
| Supabase | tudo (é o banco) | armazenamento e autenticação |
| Vercel | tráfego HTTP | hospedagem |
| OpenAI | pergunta ao Pilot + ficha médica + contexto familiar | resposta do Pilot, RAG |
| Stripe | e-mail, dados de pagamento | assinatura |
| MapTiler | coordenada aproximada | tiles do mapa |
| NWS · USGS · NHC · Open-Meteo | coordenada | previsão e alerta |
| Serviços de push (FCM/APNs/Mozilla) | endpoint da inscrição | notificação na tela de bloqueio |

> A política de privacidade em `/privacy` precisa listar todos. **Conferir se já
> lista** — foi escrita antes da OpenAI entrar no Pilot com a ficha médica.

---

## 2. Textos da ficha

### Título (máx. 30 caracteres)

```
EOS — Preparo da Família
```
(23 caracteres)

### Descrição curta (máx. 80 caracteres)

```
Alerta antes, plano na mão e a família junta quando a emergência chega.
```
(70 caracteres)

### Descrição completa (máx. 4000 caracteres)

```
O EOS avisa a sua família ANTES, não depois.

A maioria dos apps de clima mostra o estado do tempo. O EOS vigia a MUDANÇA:
quando uma tempestade se forma, se agrava ou muda de rumo na sua direção, o
aviso chega na tela bloqueada — com o app fechado.

O QUE O EOS FAZ

• Alerta por mudança real
  Furacão, terremoto, enchente, qualidade do ar e chuva forte, de fontes
  oficiais (NWS, USGS, NHC). Você é avisado quando algo MUDA, não a cada hora.
  E o mesmo aviso nunca chega duas vezes.

• Plano de emergência da família
  Onde encontrar, quem busca quem, qual rota. Funciona SEM INTERNET: o plano
  fica no aparelho, e o mapa é desenhado mesmo sem sinal.

• Preparação que sabe a sua conta
  Quantos dias de água a sua casa tem, para quantas pessoas, pela régua da
  FEMA. Não é lista genérica: é a sua casa, com o seu número.

• O Pilot
  Um copiloto que conhece a sua situação e responde ao que importa agora —
  ficar ou sair, quanto tempo você aguenta, o que falta comprar.

• Treino
  Simule um cenário e veja a família inteira responder. O debrief mostra a
  lacuna em número, antes que ela custe caro.

• Círculo
  Localização ao vivo entre quem você autorizou, mensagens e guia de rádio
  para quando a rede cair.

FEITO PARA QUANDO DÁ ERRADO

Offline de verdade, não "offline se der". Toda fonte mostra de onde veio o
dado e quando foi vista pela última vez. Quando o EOS não sabe, ele diz que
não sabe — em vez de inventar um número tranquilizador.

PRIVACIDADE

A sua localização é sua. O círculo só vê onde você está se você autorizar, com
uma chave que você desliga a qualquer momento. A ficha médica existe para
salvar a sua vida, não para virar produto: não vendemos dados e não há
publicidade.

Grátis para começar. Planos pagos ampliam o círculo e as camadas do mapa.
```

> **Revisar antes de subir**: cada linha acima é uma promessa que a loja cobra.
> "Funciona sem internet" e "o mesmo aviso nunca chega duas vezes" são
> verdadeiras hoje (a segunda desde a D-222) — se alguma regredir, o texto vira
> propaganda enganosa, não só um bug.

---

## 3. Inventário de material

| Item | Exigência | Estado |
|---|---|---|
| Ícone da loja | 512×512, PNG 32 bits | ✅ `store/icon-512-store.png` — full-bleed, gerado a partir de `public/icon-512.png` |
| Capturas de telefone | 2 a 8, ≥320 px, maior lado ≤ 2× o menor | ✅ `store/screenshots/` — 1080×1920, capturadas da produção real |
| Gráfico de destaque | 1024×500 | ⏳ a gerar |
| Vídeo promocional | opcional | não |
| Política de privacidade | URL pública | ✅ `/privacy` — **revisar** (§1.5) |
| Termos | URL pública | ✅ `/terms` |
| Reembolso | URL pública | ✅ `/refund` |

> **A regra que reprova em silêncio**: a maior dimensão de uma captura não pode
> passar do dobro da menor. Uma captura de iPhone 14 Pro (780×1688) dá razão
> 2,16 e é recusada. Por isso as capturas saem em 1080×1920 (razão 1,78), e
> `scripts/check-store-images.py` confere antes do upload.

---

## 4. O que só o dono pode fazer

1. **Criar o app no Play Console** e fixar o nome do pacote (ex.: `app.eos.familia`) — é permanente.
2. **Copiar o SHA-256** do *App signing key* (não o do upload key).
3. **Setar na Vercel (Production)**: `TWA_PACKAGE_NAME` e `TWA_SHA256_FINGERPRINTS`. Não precisa de deploy — a rota lê a cada pedido.
4. **Conferir** `/.well-known/assetlinks.json`: antes vem `[]`, depois tem que aparecer o pacote. Se continuar `[]`, a impressão digital está fora do formato e foi descartada de propósito.
5. **Decidir o §1.2** — o que o Pilot pode ler da ficha médica.
6. **Gerar o APK**: `npx @bubblewrap/cli init --manifest https://eos-app-fawn.vercel.app/manifest.json`

---

## 5. iOS não vem junto

A App Store **não** aceita este caminho. TWA é tecnologia Android; a Apple
recusa empacotamento fino de site (Guideline 4.2) e o gate **G-03 segue
aberto** — `/mobile/` é template, não app inicializado. Some-se a isso a
questão de assinatura pela Apple (3.1.1), que precisa de decisão própria antes
de qualquer código. Ver `docs/05-platform-strategy.md`.
