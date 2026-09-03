# Hazard Data Architecture

> Desenho do subsistema de inteligência de riscos do EOS. Companion: `hazard-data-integrations-audit.md` (estado) e `hazard-provider-setup.md` (ativação).
> Data: 2026-07-10. Decisão registrada em `08-decisions-log.md` (D-043).

---

## Princípios

1. **Providers desacoplados** atrás de interfaces (`lib/hazards/providers/interfaces.ts`). O agregador nunca conhece o formato de uma API específica.
2. **Modelo unificado** `HazardEvent` — toda fonte normaliza para ele (`lib/hazards/types.ts`).
3. **Honestidade de estado** — a UI só reflete o estado real de cada canal; nunca "conectado" sem chamada bem-sucedida (`lib/hazards/health.ts`).
4. **Sem segredo no cliente** — credenciais só no servidor (`lib/hazards/env.ts`), lidas em rotas Node.
5. **Não quebrar o existente** — `lib/monitor.ts` e `lib/weather/` continuam intactos; o novo subsistema vive em `lib/hazards/` e é aditivo.

---

## Camadas

```
                      app/api/hazards (Node route)
                                │
                     lib/hazards/network.ts  ── cache 60s in-memory
                                │  (Promise.all — providers em paralelo)
        ┌───────────────┬───────┴────────┬─────────────────┬───────────────┐
   providers reais                    adapters (credenciais)         fallback
   nws · usgs · nhc                weatherkit · accuweather        open-meteo
   open-meteo-nowcast              xweather · shakealert · ipaws  (forecast+minute)
        │                                     │
        └────────────► normalização → HazardEvent ◄──────────┘
                                │
                   health.ts → HazardChannel[] + NetworkStatus
                                │
                 components/LiveIntelligenceNetwork.tsx (estados reais)
```

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `lib/hazards/types.ts` | Modelo unificado: `HazardEvent`, `HazardChannel`, `ProviderHealth`, `NetworkStatus`, nowcast, raios. |
| `lib/hazards/config.ts` | Thresholds centralizados (raios 25/15/10/6 mi, relevância de terremoto, freshness/timeout, nowcast). |
| `lib/hazards/distance.ts` | Haversine (milhas) + rumo (bússola). |
| `lib/hazards/precipitation.ts` | `detectUpcomingPrecipitation` — chuva começando/ongoing/clearing (nunca "certeza"). |
| `lib/hazards/lightning.ts` | `analyzeStrikes` / `threatForDistance` — contagem por janela, tendência, ameaça. |
| `lib/hazards/earthquake.ts` | `classifyEarthquake` — relevância por magnitude × distância × tsunami. |
| `lib/hazards/health.ts` | `deriveStatus` (stale→degraded) + `aggregateNetworkStatus` (regra ALL SYSTEMS LIVE). |
| `lib/hazards/env.ts` | Credenciais server-only + flags `configured`. |
| `lib/hazards/providers/interfaces.ts` | `WeatherProvider`, `MinuteForecastProvider`, `HazardEventProvider`, `LightningProvider`, `EarthquakeEarlyWarningProvider`. |
| `lib/hazards/providers/nws.ts` | Real. Normalização completa + dedup por ID. `authority=official`. |
| `lib/hazards/providers/usgs.ts` | Real. Distância, tsunami, ShakeMap, relevância. `authority=observational`. |
| `lib/hazards/providers/nhc.ts` | Real (`CurrentStorms.json`). `authority=forecast`. |
| `lib/hazards/providers/open-meteo-nowcast.ts` | Real (`minutely_15`). Fallback de nowcast keyless. |
| `lib/hazards/providers/adapters.ts` | WeatherKit / AccuWeather / Xweather / ShakeAlert / FEMA IPAWS — `NOT_CONFIGURED` sem credencial, nunca simulados. |
| `lib/hazards/network.ts` | Orquestra tudo → `HazardNetworkSnapshot` (events + channels + network + precip). |
| `app/api/hazards/route.ts` | `GET ?lat&lng[&force=1]`. |
| `components/LiveIntelligenceNetwork.tsx` | UI rotativa, reduce-motion, expansível, estados reais. |

---

## Classificação visual (section 4)

`HazardEvent.visualClass` dirige o rótulo na UI e **nunca** apresenta análise do EOS como alerta oficial:

| visualClass | Origem típica | Autoridade |
| --- | --- | --- |
| `OFFICIAL_WARNING` | NWS *Warning* | official |
| `WATCH` | NWS *Watch* | official |
| `ADVISORY` | NWS *Advisory/Statement* | official |
| `DETECTED_EVENT` | USGS terremoto, raio detectado | observational |
| `FORECAST` | NHC forecast/track | forecast |
| `EOS_RISK_ANALYSIS` | Motor de decisão EOS | eos_analysis |

---

## NHC Operational Layers

Decisão D-223: os produtos oficiais do NHC não criam uma nova tela nem um mapa
paralelo. Eles são camadas do `MUNDO`, sobre o mesmo MapLibre e a mesma
proveniência de hazards.

Camadas previstas:

| Layer | Fonte | Autoridade | Regra de UI |
| --- | --- | --- | --- |
| Centro atual | NHC `CurrentStorms.json` / GIS | forecast | Mostra nome, classe, vento, pressão, movimento e distância até o usuário. |
| Trajetória prevista | NHC GIS forecast track | forecast | Linha oficial; não interpolar como previsão própria. |
| Pontos de previsão | NHC GIS forecast points | forecast | Marcadores por horário/intensidade; tocar mostra validade temporal. |
| Cone de incerteza | NHC GIS forecast cone | forecast | Sempre rotulado como incerteza do centro, não área de dano. |
| Trajeto passado | NHC GIS past track | observational/forecast archive | Mostra contexto histórico, sem virar gatilho de ação por si só. |
| Watches/warnings | NHC/NWS oficial | official | Cores oficiais quando possível; ações EOS podem abrir plano/preparação, mas não inferem evacuação. |
| Impacto EOS | Open-Meteo/NWS/NHC + motor EOS | eos_analysis | Sempre rotulado como leitura/estimativa EOS, nunca como alerta oficial. |

O resumo operacional deve cruzar essas camadas com casa, família consentida,
lugares do plano, rotas e preparação, respondendo "o que isso toca no meu
mundo?". A ausência de ciclone ativo é resposta correta (`empty: true`), não
erro.

Primeiro incremento autorizado por D-224: separar os toggles/visibilidade no
cliente e adicionar a legenda operacional.

Follow-up D-227: o MapServer oficial do NHC também alimenta como camadas reais
`Initial Wind Radii`, `Forecast Wind Radii`, `34/50/64kt WSP`, `Earliest
Reasonable Arrival Time`, `Most Likely Arrival Time` e `Seven-Day Outlook`.
Esses produtos são forecast/probabilidade oficial; o EOS pode cruzar com casa,
família e plano, mas não pode converter isso sozinho em ordem de evacuação.

---

## Regra crítica "ALL SYSTEMS LIVE"

`aggregateNetworkStatus` só emite `ALL SYSTEMS LIVE` quando **todo canal obrigatório e configurado** está `live` e **nenhum** usa fallback. Precedência (testada):

1. canal obrigatório `offline`/`degraded` → `N OF M CHANNELS LIVE` (âmbar) ou `MONITORING WITH LIMITED COVERAGE` (vermelho).
2. canal obrigatório em fallback → `USING BACKUP WEATHER SOURCE` (âmbar).
3. tudo obrigatório live, sem fallback, e existem opcionais não configurados → `N OF M CHANNELS LIVE` (mint).
4. tudo live, sem fallback, sem não-configurados → `ALL SYSTEMS LIVE` (mint).

> Estado atual (sem chaves comerciais): a rede reporta **USING BACKUP WEATHER SOURCE** (WeatherKit ausente → Open-Meteo ativo) com 6/9 live e 3 não configurados — verificado ao vivo.

---

## Cache, timeout, rate limit

- **Timeout**: 8 s por fetch (`config.health.requestTimeoutMs`), via `AbortSignal.timeout`.
- **Cache**: `network.ts` guarda o snapshot por coordenada (2 casas) por 60 s. Rota adiciona `Cache-Control` curto. `?force=1` ignora o cache (botão Retry).
- **Erros**: cada provider degrada para `degraded`/`offline` sem derrubar os outros (`Promise.all` com resultados tipados).
- **Freshness**: dado "live" mais velho que 15 min vira `degraded`.

---

## Persistência (Fase 2 — preparada, não ativa)

Migrations em `supabase/migrations/20260710010000_hazard_tables.sql` (a aplicar no SQL Editor). Tabelas: `hazard_events`, `provider_health`, `hazard_subscriptions`, `notification_delivery_log`, `user_hazard_preferences`. RLS: localização exata do usuário nunca legível publicamente. O snapshot ao vivo funciona **sem** essas tabelas (fetch on-demand + cache in-memory); a persistência habilita histórico e automação de push.

## Push automático por hazard (Fase 2 — deferido)

O sistema atual (`web-push` + `push_subscriptions`) faz broadcast manual de Admin de círculo. A automação por hazard (preferências por tipo, quiet hours, cooldown, dedup por evento, update/cancel) usará `user_hazard_preferences` + `notification_delivery_log` e um worker que compara snapshots. As interfaces de evento já estão prontas; a entrega é o próximo incremento.
