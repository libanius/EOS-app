# 18 — Planos de Emergência da Família ("plano de voo")

> Status: SPEC / CONCEPT DECIDED
> Date: 2026-07-27
> Decision: **D-066**. Fonte de abrigo/rota: **D-065**. Localização ao vivo: **D-064**.

---

## 1. Origem

O EOS já sabe responder *"quão ruim está"* (índice de risco), *"quanto aguentamos"*
(autonomia) e *"onde minha família está"* (D-064). Falta a pergunta que fecha o
ciclo:

> **"Para onde vamos, e como nos encontramos, quando nada estiver funcionando?"**

Abrigos oficiais (D-065) respondem isso parcialmente e só durante desastre ativo —
na maior parte do tempo não há nenhum aberto. E abrigo oficial não resolve o caso
mais comum de uma família: *o pai está no trabalho, a filha na escola, a mãe na
estrada, e o celular parou de funcionar.*

O **Plano de Emergência da Família** é a resposta a isso: um plano **autoral**,
escrito pela própria família em tempo de calma, compartilhado no círculo, cacheado
no aparelho, e **executado quando o sistema está degradado**.

A metáfora do dono é precisa: **plano de voo**. Combinado antes, seguido sem
negociação durante, revisado depois.

---

## 2. O princípio que governa tudo

> **O plano precisa funcionar exatamente quando o EOS não funciona.**

Isso não é um requisito não-funcional; é a definição do produto. Toda decisão
abaixo deriva daqui:

- O plano é **cacheado no dispositivo** e renderiza sem rede.
- O plano é **determinístico e humano**. Nenhum passo depende de inferência em
  tempo de execução.
- O plano **declara sua própria idade e versão**, pelo mesmo motivo que um ponto
  de localização declara freshness (D-064): duas pessoas executando versões
  diferentes do plano vão para lugares diferentes.

---

## 3. Anatomia de um plano

| Elemento | O que é | Autoria |
|---|---|---|
| **Endereço de casa** | A ORIGEM de toda distância que a tela afirma. Cartão próprio, no topo. | Usuário |
| **Pontos de encontro** | Primário, secundário, terciário. Onde a família se reúne. | Usuário |
| **Lugares importantes** | Escola, trabalho, casa de parente — onde alguém pode estar quando o plano começar. | Usuário |
| **Rotas** | Traçados entre lugares conhecidos e pontos de encontro. | Usuário desenha |
| **Papéis** | Quem busca quem. "Ana pega Isadora na escola." | Usuário |
| **Gatilhos** | Quando executar. "Sem contato por 2h." "Ordem de evacuação." | Usuário |
| **Contingências** | Se o primário estiver bloqueado, vai para o secundário. | Usuário |

Um plano sem **ponto de encontro** e sem **papéis** não é um plano — é um mapa.
A UI deve tratar esses dois como obrigatórios e o resto como opcional.

### O endereço de casa não é "mais um lugar"

Descoberto ao revisar PLAN-T03 com o dono, e vale como regra: **toda distância
desta feature sai da casa** — quanto falta até cada ponto de encontro, quantos
minutos a pé, se o terceiro ponto é alcançável sem carro.

Enquanto a casa era um chip no fim da lista de lugares, dava para montar um
plano inteiro e nunca ver nenhuma dessas contas, **sem que a tela dissesse por
quê**. Ausência de número parece "está tudo bem". Hoje:

- a casa tem cartão próprio, primeiro, dizendo que é a origem das contas;
- quando ela falta, cada ponto de encontro **explica** a distância ausente em vez
  de omiti-la;
- o `plan-drill` (SIM-T06) só pula a checagem de alcance quando não há casa — e
  esse silêncio agora tem causa visível na tela do plano.

Precisão importa e é declarada. `profiles.location` é texto livre com
placeholder "Cidade, Estado" e o geocoding devolve o **centroide da cidade**: bom
para alerta meteorológico, inútil para "quanto tempo a pé". A UI oferece esse
endereço como ponto de partida e diz, na mesma frase, que é o centro da cidade e
não a casa. O caminho preciso é marcar com o GPS estando lá.

---

## 4. Escalonamento dos pontos de encontro

Convenção clássica de preparação, adotada aqui porque resolve casos distintos:

| Nível | Distância típica | Caso que resolve |
|---|---|---|
| **Primário** | Na frente de casa / quarteirão | Incêndio doméstico, evacuação imediata do imóvel |
| **Secundário** | No bairro, a pé | Casa inacessível, mas a região está bem |
| **Terciário** | Fora da cidade/região | Evacuação regional, bairro inteiro comprometido |

O terciário precisa ser alcançável **sem GPS e sem combustível abundante** — a UI
deve mostrar distância e rumo desde cada lugar conhecido, para a família julgar
se o ponto escolhido é realista a pé.

---

## 5. Rotas autorais, não roteamento

As rotas do plano são **desenhadas pelo usuário**, não calculadas por motor de
roteamento. Três razões:

1. **Sobrevivem offline.** Uma polilinha guardada não precisa de servidor.
2. **Carregam conhecimento local que nenhum roteador tem.** "Não pegue a ponte
   baixa, ela alaga." "Corte pelo parque, o portão fica aberto."
3. **São um compromisso familiar**, não uma sugestão. Todo mundo combinou aquele
   caminho; o valor está no acordo, não na otimização.

Um motor de roteamento (D-065) pode **propor** um traçado inicial para o usuário
editar, quando houver rede. Ele nunca substitui a rota salva em tempo de execução.

---

## 6. Versão e sincronismo — o risco de segurança central

Este é o ponto onde um plano de família mata alguém se for mal projetado.

**Cenário de falha:** o pai edita o ponto de encontro terciário na terça. A filha
não abriu o app desde domingo. Na quinta cai a rede. Os dois executam planos
diferentes e vão para lugares diferentes.

**Regras obrigatórias:**

1. Todo plano tem **`version`** inteira, incrementada a cada alteração salva.
2. Todo aparelho guarda a versão que baixou e **exibe a idade da cópia local**:
   "Plano v7 · sincronizado há 2 dias".
3. Uma alteração dispara **notificação push ao círculo** — mudar o ponto de
   encontro é evento de segurança, não edição de perfil.
4. Ao detectar versão nova, a UI exige **reconhecimento explícito** do membro
   ("Vi a mudança"), e o autor consegue ver **quem já reconheceu**. Sem isso, o
   autor não sabe se o plano é real ou só uma intenção dele.
5. Divergência nunca é resolvida silenciosamente. Em degradação, a cópia local é
   soberana e a UI diz claramente qual versão está sendo executada.

---

## 7. Relação com as outras camadas do mapa

Três camadas com **proveniências diferentes**, e a UI nunca pode confundi-las:

| Camada | Origem | Autoridade | Some quando? |
|---|---|---|---|
| **Abrigos oficiais** | FEMA NSS (D-065) | Oficial, externo, efêmero | Fecha o desastre |
| **Plano da família** | Autoral, do círculo | Compromisso interno | Nunca — é durável |
| **Posições ao vivo** | GPS consentido (D-064) | Fato, com idade | Ao revogar consentimento |

Regra herdada de D-062.1 e D-064: **nada é inventado**. Se não há abrigo aberto, a
tela diz que não há. Se o plano não existe, a tela convida a criar — não desenha
um exemplo.

---

## 8. Privacidade

O plano revela onde a família mora, estuda, trabalha e se reúne. É o dado mais
sensível do EOS inteiro.

- Escopo é o **círculo**. Nunca público.
- **Nunca** aparece na ficha de emergência pública (`/ficha/[id]`, QR). Um plano
  de encontro numa ficha que qualquer um escaneia é o oposto de segurança.
- Sair do círculo remove o acesso ao plano na próxima leitura.
- Papéis citam membros do círculo por referência, não por dado pessoal duplicado.

---

## 9. Papel do Pilot (futuro, não MVP)

Quando o Pilot amadurecer (UPP-03), ele atua em três momentos — e **nunca** com
escrita silenciosa:

1. **Construir**: propõe um rascunho a partir do domicílio, dos lugares conhecidos
   e da geografia. O usuário confirma elemento por elemento.
2. **Revisar**: aponta lacunas concretas. "Seu ponto terciário está a 14 km — a
   pé, com uma criança de 3 anos, isso é 4 horas."
3. **Executar**: durante um evento, indica **qual** plano/contingência se aplica e
   qual papel é do usuário. Ele lê o plano; não o reescreve.

Esta é a mesma trava de UPP-03: nenhuma mutação de memória longa sem confirmação.
Um plano alterado por IA sem o usuário saber é indistinguível de sabotagem.

---

## 10. Ligação com mapas offline

O plano resolve a pergunta que a fase de mapas offline precisa responder:
**qual região baixar?**

Baixar "o mundo" é inviável. Mas o **envelope geográfico do plano** — a bounding
box de todos os lugares conhecidos, pontos de encontro e rotas, com margem — é um
recorte pequeno, definido pelo próprio usuário, e é exatamente a área onde a
família vai operar em degradação.

**O plano é o que torna o download offline finito e certo.** Por isso ele vem
antes dos mapas offline no roadmap, não depois.

### O que foi entregue, e o que NÃO foi (PLAN-T06)

`lib/plan-envelope.ts` calcula a caixa: bounds com margem, centro, maior
dimensão em km e área — corrigindo a longitude pelo cosseno da latitude, sem o
que a área sairia ~11% maior na Flórida.

**Baixar tiles não foi feito, e não por esquecimento.** O basemap padrão é o
CARTO keyless, cujos termos não autorizam download em massa; o MapTiler, que tem
oferta offline explícita, exige uma chave que não está configurada. Prometer
"mapa offline" e entregar um cache que viola o provedor seria pior que não
entregar.

O que resolve o §13.4 hoje é outra coisa, e melhor para o caso: **a carta do
plano** (`components/world-v2/PlanChart.tsx`). Ela não é um mapa de tiles — é o
desenho do próprio plano, projetado das coordenadas que já estão no aparelho.
Não depende de rede, de chave, de WebGL nem de biblioteca de mapa.

E ela deliberadamente **não finge ser um mapa**: sem ruas, sem prédios, sem
rótulo de bairro. Tem norte, barra de escala e as distâncias reais escritas. Uma
carta que insinuasse detalhe que não tem seria pior que nenhuma — a família
seguiria um contorno inventado.

Quando houver chave de provedor com direito a cache, o envelope já está pronto
para recortar o download; a carta continua como o piso que nunca falha.

---

## 11. Modelo de dados (proposto — MVP)

```
family_plans
  id, circle_id, name, version int, status,
  created_by, updated_by, updated_at

family_plan_waypoints
  id, plan_id, kind ('rendezvous_1'|'rendezvous_2'|'rendezvous_3'|'home'|'school'|'work'|'custom'),
  name, lat, lng, notes, sort_order

family_plan_routes
  id, plan_id, label, from_waypoint_id, to_waypoint_id,
  geometry jsonb (LineString), mode ('foot'|'car'), notes

family_plan_roles
  id, plan_id, member_user_id, responsibility text

family_plan_acks
  plan_id, member_user_id, acked_version int, acked_at
```

```
family_plan_triggers
  id, plan_id, condition, action, sort_order
```

`family_plan_acks` é o que torna a §6 real: sem ele não há como saber quem está
executando qual versão. `family_plan_triggers` (migration
`20260730000000_family_plan_triggers.sql`) responde ao "quando": a condição
precisa ser **observável**, nunca um julgamento. "Sem contato por 2 horas" é
gatilho; "se ficar perigoso" exige que alguém decida no pior momento possível.

RLS: leitura e escrita restritas a membros do `circle_id`. Edição por papel do
círculo (Admin/Editor). Endpoints públicos de ficha **nunca** tocam estas tabelas.

---

## 12. Faseamento

| Fase | Entrega |
|---|---|
| **PLAN-T00** | ✅ Esta spec + decisão (D-066) |
| **PLAN-T01** | ✅ Modelo de dados + RLS + API autenticada de leitura/escrita — `GET/PUT /api/plans` (documento inteiro), `POST /api/plans/[id]/ack`. Versão incrementa a cada save, acks antigos NÃO são carregados adiante, e push avisa o círculo. |
| **PLAN-T02** | ✅ Editor em `/plan`: escada de pontos de encontro nomeada pelo caso que resolve, lugares conhecidos, papéis e gatilhos. Ponto de encontro e papel são obrigatórios e a tela diz o que falta antes de deixar salvar. Distância, rumo e tempo a pé desde a casa em cada ponto (§4). |
| **PLAN-T03** | ✅ `RouteDraw`: mapa plano (pitch 0) com os lugares do plano como âncoras nomeadas. A rota começa e termina em pontos que já existem — a família desenha o MEIO. Comprimento e tempo a pé calculados no traçado real; desfazer, limpar e reabrir para editar. Nenhum motor de roteamento, por decisão (§5). |
| **PLAN-T04** | ✅ Versão e idade da cópia sempre na tela; mudança dispara push ao círculo; membro precisa reconhecer explicitamente, e o autor vê quem já viu. Uma nova versão **invalida** o reconhecimento anterior — provado em teste. |
| **PLAN-T05** | ✅ Documento inteiro em IndexedDB por círculo, com versão e instante da sincronização. `GET /api/plans` é NetworkOnly de propósito (D-075): sem isso o service worker devolvia cópia velha como se fosse ao vivo. |
| **PLAN-T06** | ✅ Envelope calculado (`lib/plan-envelope.ts`) + **carta do plano** em SVG que desenha lugares, escada numerada, traçados, norte e escala **sem tile nenhum**. Download de tiles segue fora por termos de provedor (§10). |
| **PLAN-T07** | Pilot propõe/revisa planos com confirmação explícita (§9) |

---

## 13. Critérios de aceitação do MVP

Um plano só é útil se, com o **avião no chão** (sem rede, sem GPS), a família
conseguir:

1. Abrir o EOS e ver o plano completo, com sua versão e idade.
2. Ler quem busca quem, sem ambiguidade.
3. Ver os três pontos de encontro com rumo e distância desde onde está.
4. Seguir as rotas desenhadas na carta do plano — desenhada das coordenadas
   locais, sem depender de tiles.
5. Saber que está executando a mesma versão que o resto da família.

O item 5 é o que separa um plano de um desenho bonito.
