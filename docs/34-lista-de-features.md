# Lista completa de features do EOS

> **O que é este documento.** O enumerado, sem opinião. Cada linha é uma
> capacidade que existe no código, com onde ela vive, quem pode usar e qual é a
> prova.
>
> A leitura crítica — o que vale vender, o que precisa ser reescrito, o que não
> existe — está em [33-inventario-de-verdade.md](33-inventario-de-verdade.md).
> Aqui é só o inventário.
>
> **Método.** Enumerado cruzando quatro fontes do próprio código, não da
> documentação: 34 telas, 70 rotas de API, 37 tabelas do banco e 17 portões de
> plano. Levantado em 2026-08-12.

## Legenda

| Símbolo | Significado |
| --- | --- |
| **T** | Tem teste automatizado nomeado |
| **C** | Existe no código, sem teste dedicado |
| **G** | Só existe como portão de plano — **não implementado** |
| — | Livre para qualquer usuário |
| **F** | Exige plano Família |
| **P** | Exige plano Premium |

---

## 1. Conta e identidade

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 1.1 | Cadastro com e-mail e senha | `/auth/signup` | — | C |
| 1.2 | Login | `/auth/login` | — | C |
| 1.3 | Verificação de e-mail | `/auth/verify` | — | C |
| 1.4 | Recuperação de senha | `/auth/forgot-password`, `/auth/update-password` | — | C |
| 1.5 | Onboarding inicial (perfil + família) | `/onboarding` | — | C |
| 1.6 | Exclusão da conta e dos dados | `/api/account/delete` | — | C |
| 1.7 | Troca de idioma pt-BR / en | global (`lib/i18n`) | — | C |

## 2. Ficha de emergência

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 2.1 | Ficha Master: dados pessoais, tipo sanguíneo, alergias, medicamentos, notas médicas, contato de emergência | `/ficha` | — | C |
| 2.2 | Percentual de completude da ficha | `/ficha` | — | C |
| 2.3 | Endereço estruturado por país (EUA/Brasil), com campo de unidade | `/ficha` → `/api/household/address` | — | **T** `address-flow-test` (9), `address` (unit) |
| 2.4 | Geocodificação do endereço para ponto no mapa | `/api/household/address` | — | **T** idem |
| 2.5 | "Quem mais mora neste endereço" com bifurcação: com celular → convite; sem celular → dependente | `/ficha` | — | **T** `one-door-test` (6) |
| 2.6 | Foto de perfil | `/api/profile/personalization/photo` | — | C |
| 2.7 | Personalização e memória confirmada do Pilot | `/api/profile/personalization` | — | C |
| 2.8 | **QR público da ficha** para socorristas | `/ficha/[id]` | **F** | C |
| 2.9 | Exportar ficha como PDF | — | **P** | **G — não existe** |

## 3. A casa (household)

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 3.1 | Cadastro de dependentes (nome, idade, condições, medicamentos, mobilidade, bebê) | `/family/cadastro` | — | **T** `roster-page-test` (11) |
| 3.2 | Sugestão de tags médicas por IA | `/api/family-members/suggest-tags` | — | C |
| 3.3 | Vincular dependente a uma conta do círculo | `/api/family-members/[id]/link` | — | **T** `duplicate-person-test` |
| 3.4 | Confirmar que alguém do círculo mora na mesma casa | `/api/circles/[id]/household` | **F** | **T** `household-test` (9) |
| 3.5 | Despensa somada de quem mora junto | `/api/household` | **F** | **T** `household-test`, `household-consistency-test` (8) |
| 3.6 | Autonomia = min(água, comida) dividida pelas bocas reais | `lib/household.ts` | — | **T** `household` (unit) |
| 3.7 | Morar junto **não** dá acesso à ficha médica (consentimento separado) | `/api/circles/[id]/family-access` | — | **T** `household-consent-test` |
| 3.8 | Detecção de pessoa duplicada, sem fundir sozinho | `/family`, `/api/household` | — | **T** `duplicate-person-test` (8), `same-person` (unit, 11) |
| 3.9 | Convite pendente fecha sozinho quando a pessoa entra | `lib/household.ts` | — | **T** `duplicate-person-test` |
| 3.10 | Lista única "quem mora aqui": contas, dependentes e convidados juntos | `/family/cadastro` | — | **T** `one-door-test` |
| 3.11 | Leitura de ficha do círculo com alcance controlado | `/api/circles/[id]/members/[userId]` | — | **T** `circle-admin-test` |

## 4. Inventário e preparação

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 4.1 | Inventário: água, comida, combustível, bateria, kit médico, comunicação | `/inventory`, `/api/inventory` | — | C |
| 4.2 | Compartilhar inventário com a casa | `circle_members.share_inventory` | **F** | **T** `household-test` |
| 4.3 | Checklist de preparação | `/checklist`, `/api/checklist` | — | C |
| 4.4 | Geração de checklist por cenário | `/api/checklist/generate` | — | C |
| 4.5 | Marcar item adquirido | `/api/checklist/toggle` | — | C |
| 4.6 | Salvar itens sugeridos pelo Pilot | `/api/checklist/save-items` | — | **T** `pilot-abilities-test` |
| 4.7 | Tela Preparação: autonomia, lacunas, prontidão | `/preparedness` | — | C |
| 4.8 | Score de prontidão por IA | `/api/ai/readiness` | — | C |
| 4.9 | Separação água/comida (dura) de bateria/combustível (capacita) | `/dashboard` | — | C |

## 5. O Pilot (assistente)

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 5.1 | Conversa livre com o Pilot | orbe, toda tela | — | **T** `pilot-abilities-test` (8) |
| 5.2 | Cinco intenções rápidas (agora / ficar ou sair / quanto tempo / o que falta / dá para sair) | orbe | — | **T** idem |
| 5.3 | Motor determinístico local, responde sem rede | `components/world-v2/pilot-engine.ts` | — | **T** `rules-engine` (unit) |
| 5.4 | Veredito determinístico sobrepõe a IA | `lib/pilot-guard.ts` | — | **T** `pilot-guard` (unit), `guardrails-test` |
| 5.5 | Casa desconhecida vira "espere", nunca "pode ir" | `lib/pilot-guard.ts` | — | **T** `pilot-guard` |
| 5.6 | Resposta em streaming, palavra a palavra | `/api/pilot/chat?stream=1` | — | C |
| 5.7 | O Pilot vira tarefa no checklist com um toque | Pilot | — | **T** `pilot-abilities-test` |
| 5.8 | O Pilot propõe memória/preferência para confirmar | Pilot | — | C |
| 5.9 | O Pilot entrega destino real com coordenada verificada | `/api/pilot/chat` | — | **T** `pilot-abilities-test` |
| 5.10 | "Ver no mapa" desenha o trajeto | `/dashboard` | — | C |
| 5.11 | Mesmos números em toda tela; conversa sobrevive à navegação | global | — | **T** `pilot-one-truth-test` (7) |
| 5.12 | Orbe idêntico em toda tela, arrastável fora do dashboard | global | — | **T** `pilot-orb-test` (6) |
| 5.13 | Revisão do plano pelo Pilot | `/plan` | — | **T** `plan-pilot-review` (unit) |
| 5.14 | Telemetria do Pilot sem conteúdo de conversa | `/api/pilot/metrics` | — | **T** `pilot-metrics-test` (9), `pilot-metrics` (unit, 17) |
| 5.15 | Limite de uso (12/min, 200/dia) com mensagem humana | `lib/rate-limit.ts` | — | **T** `guardrails-test` |

## 6. Plano da família

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 6.1 | Pontos de encontro (porta de casa, bairro, fora da cidade) | `/plan` | — | **T** `plan-editor-test` (14) |
| 6.2 | Rotas desenhadas à mão (a pé / de carro) | `/plan` | — | **T** idem |
| 6.3 | Papéis: quem faz o quê | `/plan` | — | **T** idem |
| 6.4 | "Quem busca quem" alcança dependentes sem conta | `/plan` | — | **T** `plan-gaps-dependents` (unit, 9) |
| 6.5 | Aviso "ninguém ficou encarregado de X" sem travar o salvamento | `/plan` | — | **T** idem |
| 6.6 | Gatilhos: condição → ação | `/plan` | — | **T** `plan-editor-test` |
| 6.7 | Lacunas que bloqueiam o salvamento (ponto de encontro, papéis) | `/plan` | — | **T** `plan-envelope`, `plan-execution` (unit) |
| 6.8 | Confirmação de leitura por membro, com versão | `/api/plans/[id]/ack` | — | **T** `plan-editor-test` |
| 6.9 | Carta do plano desenhada offline | `/plan` | — | **T** idem |
| 6.10 | Plano por círculo, múltiplos planos | `/api/circles/[id]/plans` | — | **T** `multi-plan-test` |
| 6.11 | Ponto do mapa confirmado sem digitar | `/plan` | — | **T** `plan-editor-test` |
| 6.12 | Treino do plano (drill) | `lib/plan-drill.ts` | — | **T** `plan-drill` (unit) |

## 7. Círculos

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 7.1 | **Criar** círculo | `/circles` | **F** | **T** `circles-page-test` |
| 7.2 | Entrar por código de convite | `/circles`, `/convite/[code]` | — | **T** `invite-link-test` |
| 7.3 | Entrar por QR | `/circles` | — | C |
| 7.4 | Buscar círculo pelo nome | `/api/circles/search` | — | C |
| 7.5 | Pedido de entrada com aprovação | `/api/circles/[id]/requests` | — | **T** `circles-page-test` |
| 7.6 | Papéis Admin / Editor / Viewer | `/circles` | — | **T** `circle-admin-test` |
| 7.7 | Convite nunca concede ficha sozinho (só "solicitado") | `/api/circles/join` | — | **T** `invite-link-test` |
| 7.8 | Sair do círculo | `/api/circles/[id]/leave` | — | C |
| 7.9 | Compartilhar círculo | `/api/circles/[id]/share` | — | C |
| 7.10 | Monitorar localização dos membros | `/api/circles/[id]/monitoring` | **F** | **T** `circle-location-test` |
| 7.11 | Marcador estável no mapa (não pula) | `/dashboard` | — | **T** `marker-stability-test` |
| 7.12 | Notificações do círculo | `/api/circles/[id]/push` | — | C |
| 7.13 | Planos de ação do círculo | `circle_action_plans` | — | C |
| 7.14 | Pertencer a múltiplos círculos | — | **P** | **G — sem limite no código: todos já podem** |

## 8. Mundo / mapa / clima

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 8.1 | Índice de risco com estado (safe/watch/warning/critical) | `/dashboard` | — | C |
| 8.2 | Alertas de clima severo (NWS) | `/api/hazards` | — | **T** `hazards` (unit) |
| 8.3 | Terremotos (USGS) | `/api/hazards` | — | **T** idem |
| 8.4 | Furacões / ciclones (NHC) com cone | `/api/world/cyclones` | — | **T** `weather-layers-test` (8) |
| 8.5 | Chuva / nowcast (Open-Meteo) | `/api/world/radar` | — | **T** idem |
| 8.6 | Vento em grade, com setas no mapa | `/api/world/wind` | — | **T** idem |
| 8.7 | **Camada de vento animada** (partículas + campo escalar) | `/dashboard` | **P** | C — `lib/world/WindParticleLayer.ts` |
| 8.8 | Camadas: escuro, satélite, chuva, alertas, vento, ciclone, flood, surge, impacto de vento, tornado | `/dashboard` | — | **T** `weather-layers-test` |
| 8.9 | A escolha de camadas sobrevive ao reload | `/dashboard` | — | **T** idem |
| 8.10 | Abrigos abertos (FEMA National Shelter System) | `/api/shelters` | **F** | C |
| 8.11 | Qualidade do ar (AQI, via Open-Meteo) | `/dashboard`, `/weather` | — | C — **não bloqueado hoje** |
| 8.12 | Busca de lugares / geocodificação | `/api/geocode/search` | — | C |
| 8.13 | Tela de clima dedicada | `/weather` | — | C |
| 8.14 | Faixa de veredito em repouso (pior entre clima e casa) | `/dashboard` | — | **T** `resting-verdict` (unit, 20) |
| 8.15 | Saúde dos provedores | `provider_health`, `/api/health` | — | C |
| 8.16 | Incêndios via satélite (NASA FIRMS) | — | **F** | **G — não existe** |
| 8.17 | Declarações de desastre (FEMA) | — | **F** | **G — não existe** |
| 8.18 | Vigilância de surtos (CDC) | — | **P** | **G — não existe** |
| 8.19 | Recalls de medicamentos (FDA) | — | **P** | **G — não existe** |
| 8.20 | Histórico de alertas (30 dias) | — | **P** | **G — não existe** |
| 8.21 | Camadas NHC operacionais separadas (centro, trajetória, pontos, cone, trajetória passada, watches/warnings, wind radii, WSP, arrival time, outlook + legenda) | `/dashboard`, `/api/world/cyclones` | — | **T** `weather-layers-test` 20/20 + provider real D-227 |

## 9. Cenários e simulação

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 9.1 | Biblioteca de cenários | `/scenario`, `scenarios` | — | C |
| 9.2 | Sessão de simulação com fontes derrubadas | `/api/simulation` | — | C |
| 9.3 | Convite para treino (a família aceita, não é colocada) | `/sim/[token]` | — | **T** `simulation-share-test` |
| 9.4 | Painéis em linguagem natural | `/api/simulation/parse` | — | C |
| 9.5 | Debrief que cobra o plano | `components/SimulationDebrief.tsx` | — | C |
| 9.6 | Ações de preparação a partir da simulação | doc 24 | — | C |

## 10. Comms

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 10.1 | Mensagens do círculo | `/comms`, `/api/comms/messages` | — | C |
| 10.2 | Perfis de rádio (frequências combinadas) | `/api/comms/radio` | — | C |
| 10.3 | Inbox de notificações | `/api/comms/notifications` | — | **T** `notification-surface` (unit) |
| 10.4 | Ping para a família | `/api/family/ping` | — | C |

## 11. Notificações

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 11.1 | Inscrição em push (Web Push / VAPID) | `/api/push/subscribe` | — | **T** `push-test` |
| 11.2 | Cron diário de alertas de clima (11:00 UTC) | `/api/cron/weather-notifications` | **P** | C — **não checa plano hoje** |
| 11.3 | Registro de entrega | `notification_delivery_log` | — | C |
| 11.4 | Preferências de perigo por usuário | `user_hazard_preferences` | — | C |

## 12. Educação (EDU)

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 12.1 | Base de conhecimento: FEMA, Cruz Vermelha, OMS, SAS, SAMHSA, NCTSN, CDC, Military FM, Navy SEAL, Seymour | `/edu` | — | **T** `edu` (unit) |
| 12.2 | Busca semântica (pgvector) | `lib/knowledge.ts` | — | **T** `edu-rag` (unit) |
| 12.3 | Conteúdo vira ação de preparação | `/api/edu/actions` | — | **T** `edu-actions` (unit) |
| 12.4 | Contagem de visualizações | `/api/edu/views` | — | C |
| 12.5 | Curadoria/ingestão pelo admin | `/admin/edu` | admin | C |

## 13. Cobrança

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 13.1 | Checkout Stripe | `/api/billing/checkout` | — | C |
| 13.2 | Portal do cliente (cancelar, trocar cartão) | `/api/billing/portal` | — | C |
| 13.3 | Webhook de reconciliação | `/api/billing/webhook` | — | C |
| 13.4 | Códigos-presente com expiração e rebaixamento automático | `/api/billing/redeem`, `lib/plan.ts` | — | C |
| 13.5 | Programa de afiliados: códigos, indicações, conversões | `/admin/affiliates` | — | **T** `affiliate` (unit) |
| 13.6 | Três planos: free / family / premium | `lib/feature-gates.ts` | — | C |
| 13.7 | Política de reembolso publicada | `/refund` | — | C |

## 14. Operação e confiança

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 14.1 | Registro de erro de servidor em Postgres | `/api/errors`, `error_log` | — | **T** `error-grouping-test` |
| 14.2 | Captura de erro de navegador | `/api/client-error` | — | **T** `client-error-test` |
| 14.3 | Agrupamento automático por impressão digital | `lib/error-fingerprint.ts` | — | **T** `error-fingerprint` (unit) |
| 14.4 | Alerta push para o dono quando há erro novo | cron | — | C |
| 14.5 | Limite de requisição atômico em Postgres | `rate_limit_buckets` | — | **T** `guardrails-test` |
| 14.6 | Verificação de saúde real (não `head:true`) | `/api/health` | — | C |
| 14.7 | Painel de status do admin | `/admin/status` | admin | C |
| 14.8 | Sincronização entre aparelhos + fila offline | Realtime | — | C |

## 15. Plataforma

| # | Feature | Onde | Plano | Prova |
| --- | --- | --- | --- | --- |
| 15.1 | PWA instalável com service worker | `public/manifest.json` | — | **T** `twa-manifest` (unit, 10) |
| 15.2 | Ícone maskable dentro da zona segura | `scripts/make-maskable-icon.py` | — | **T** idem, medido em pixels |
| 15.3 | Atalhos de long-press (Ficha, Plano, Preparação) | manifest | — | **T** idem |
| 15.4 | Digital Asset Links para TWA, por variável de ambiente | `/.well-known/assetlinks.json` | — | **T** idem |
| 15.5 | Funciona offline (motor local, plano em cópia, carta) | global | — | **T** `plan-editor-test` |
| 15.6 | Navegação inferior com 7 destinos | `components/BottomNav.tsx` | — | **T** `bottom-nav-test` |

---

## 16. Contagem

Contado a partir das próprias tabelas acima, não estimado.

| Categoria | Quantidade |
| --- | --- |
| Features com teste automatizado (**T**) | 71 |
| Features no código sem teste dedicado (**C**) | 59 |
| Anunciadas e **não implementadas** (**G**) | 7 |
| **Total de features** | **137** |
| Itens de roadmap (seção 17, à parte) | 7 |

**As sete não implementadas**, todas presentes na tabela de planos que o cliente
vê hoje:

| # | Anunciada como | Plano |
| --- | --- | --- |
| 2.9 | Exportar ficha como PDF | Premium |
| 7.14 | Pertencer a múltiplos círculos | Premium (sem limite no código: todos já podem) |
| 8.16 | Incêndios via satélite (NASA) | Família |
| 8.17 | Declarações de desastre (FEMA) | Família |
| 8.18 | Vigilância de surtos (CDC) | Premium |
| 8.19 | Recalls de medicamentos (FDA) | Premium |
| 8.20 | Histórico de alertas (30 dias) | Premium |

---

## 17. Roadmap — não existe, não anunciar no presente

| # | Feature | Estado |
| --- | --- | --- |
| 17.1 | App nativo iOS/Android (llama.rn, IA local no aparelho) | BLOCKED (M-T01..T08) |
| 17.2 | Modo LOCAL_AI (modelo rodando no aparelho) | BLOCKED |
| 17.3 | Malha LoRa entre aparelhos, sem rede (ESP32) | BLOCKED (P4-T01..T04) |
| 17.4 | CarPlay / Android Auto | BLOCKED (AUTO-T00..T03) |
| 17.5 | Sentry (hoje o registro de erro é próprio, em Postgres) | DEFERRED (P1-T07) |
| 17.6 | Provedores pagos opcionais (WeatherKit, raios Xweather) | DRAFT (LA-T03) |
| 17.7 | Landing de conversão v3 | DEFERRED (P3-T07) |

> **Cuidado que vale repetir:** "funciona sem rede" é verdade hoje **no
> aparelho**. "Comunica sem rede **entre pessoas**" é 17.3, e não existe.

---

## Manutenção

- Quem cria uma feature acrescenta a linha aqui **no mesmo commit**
- Uma feature só recebe **T** quando existe um teste nomeado que a exercita
- Um portão de plano sem implementação nasce como **G** e é proibido em material
  de venda até virar C ou T
