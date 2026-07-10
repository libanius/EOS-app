# Hazard Data Integrations — Auditoria

> Auditoria verificável das integrações meteorológicas e de emergência do EOS.
> Data: 2026-07-10. Método: leitura direta do código (`lib/`, `app/api/`, `worker/`, `supabase/`), não por nome comercial.
> Companion: `hazard-data-architecture.md` (desenho alvo) e `hazard-provider-setup.md` (ativação).

---

## Matriz-resumo

| Canal | Serviço principal | Status | Uso atual | Ação necessária |
| --- | --- | ---: | --- | --- |
| Weather forecast | Apple WeatherKit | **MISSING** (usa Open-Meteo) | Open-Meteo é a fonte real de current/hourly/daily (`lib/weather/providers/open-meteo.ts`) | Criar adapter WeatherKit desacoplado atrás de `WeatherProvider`; manter Open-Meteo como fallback real. Sem credencial Apple → `NOT_CONFIGURED`. |
| Rain nowcast | WeatherKit minute forecast | **NOT CONFIGURED** | Nenhum | Adapter `getMinuteForecast` no WeatherKit (requer chave). Fallback real via Open-Meteo `minutely_15` (sem chave). |
| Rain fallback | AccuWeather MinuteCast / configurável | **NOT CONFIGURED** | Nenhum | Adapter + env vars + feature flag; sem chave → `NOT_CONFIGURED`. Cadeia: WeatherKit → AccuWeather → Open-Meteo minutely. |
| Earthquakes | USGS Earthquake GeoJSON | **PARTIAL** | `lib/monitor.ts:fetchEarthquakes`, usado em `/api/monitor`, `/api/weather-intelligence`, `/api/circles/[id]/monitoring` e na tela Cenário | Normalização completa (profundidade, distância, tsunami, significance, felt, alert level, ShakeMap) + regras de relevância configuráveis → `HazardEvent`. |
| Earthquake early warning | USGS ShakeAlert | **NOT CONFIGURED** | Nenhum | Interface `EarthquakeEarlyWarningProvider`, feature flag desligada, documentar licenciamento. Nunca exibir "ShakeAlert connected". |
| Tornado & severe weather | NWS Alerts API | **PARTIAL** | `lib/monitor.ts:fetchWeather` (`alerts/active?point=`), usado em Cenário e agregadores | Normalização completa (instruction, onset, ends, areaDesc, geometry, sender, id) + **dedup por `id`+`sent`** → `HazardEvent` com `authority=official`. |
| Hurricane local warnings | NWS Alerts API | **PARTIAL** | Mesmo endpoint de alertas (captura Hurricane Warning/Watch, Storm Surge, Tropical Storm) | Mesma normalização NWS; separar semanticamente de tracking do NHC. |
| Hurricane tracking | NOAA/NHC | **MISSING** | Nenhum | Provider real via `nhc.noaa.gov/CurrentStorms.json` (público, sem chave): posição, categoria, vento, pressão, movimento, cone/advisory → `HazardEvent` com `authority=forecast`. |
| Lightning | Xweather (ou equivalente) | **NOT CONFIGURED** | Nenhum | Interface `LightningProvider`; adapter Xweather (requer credenciais). Regras de distância centralizadas. Sem chave → `NOT_CONFIGURED`. |
| Public emergency alerts | FEMA IPAWS | **NOT CONFIGURED** | Nenhum (parte do IPAWS já chega via NWS/CAP para clima) | Interface `PublicAlertProvider`; adapter IPAWS-OPEN (requer COG/autorização). Sem acesso → `NOT_CONFIGURED`. |
| Push notifications | web-push / VAPID (Web Push) | **PARTIAL** | `web-push` + tabela `push_subscriptions`; só broadcast manual de Admin de círculo (`/api/circles/[id]/push`); SW em `worker/index.ts` | Automação por hazard (preferências por tipo, quiet hours, cooldown, dedup, update/cancel) — Fase 2 documentada. |

> Nota de honestidade: o app **não usa Apple WeatherKit hoje**. O nome "WeatherKit" não aparece porque a fonte real é Open-Meteo. Isso é `MISSING` (a fonte pedida), não um wrapper escondido.

---

## Detalhe por fonte

### A. Apple WeatherKit — `MISSING`
- **Arquivos**: nenhum. A previsão real é `lib/weather/providers/open-meteo.ts` (`fetchOpenMeteoForecast`, `fetchOpenMeteoAirQuality`), consumida por `app/api/weather-intelligence/route.ts` e pela engine `lib/weather/engine.ts`.
- **Endpoints atuais**: `api.open-meteo.com/v1/forecast`, `air-quality-api.open-meteo.com`.
- **Dados consumidos**: current (temp, feels-like, umidade, vento, precip, UV, visibilidade, weather_code), hourly 24h, daily 3 dias, AQI.
- **Frequência**: on-demand. `Cache-Control: max-age=300, stale-while-revalidate=120` na rota; sem cache de servidor persistente.
- **Cache**: HTTP apenas (rota weather-intelligence). `lib/monitor.ts` tem cache in-memory `Map` (60s se há terremoto, senão 300s).
- **Erros**: try/catch → `null`, provider marcado `unavailable`/`error`. Sem retry/backoff.
- **Fallback**: nenhum (Open-Meteo é único).
- **Env**: nenhuma (keyless).
- **UI**: tela Weather + Cenário (via `/api/monitor` que usa NWS current).
- **Motor de decisão**: `lib/weather/engine.ts` (recomendações de atividade). `/api/analyze` **não** injeta contexto meteorológico automaticamente.
- **Push**: não.
- **Riscos**: WeatherKit exige Apple Developer + private key JWT (ES256) assinada **no servidor**; nunca no cliente. Sem credencial não há como ativar — preparar adapter e manter Open-Meteo.

### B. Rain nowcast (minuto-a-minuto) — `NOT CONFIGURED` (fonte pedida) / fallback real disponível
- **Arquivos**: nenhum. `open-meteo.ts` hoje **não** pede `minutely_15`.
- **Ação**: WeatherKit minute (requer chave) → adapter `NOT_CONFIGURED`; **Open-Meteo `minutely_15`** é fallback real e gratuito (precipitação 15-min). Domain fn `detectUpcomingPrecipitation` normaliza ambos.
- **Riscos**: minutely_15 não é "minuto real" como WeatherKit/AccuWeather; rotular confiança como `medium` e a fonte corretamente.

### C. Fallback minuto-a-minuto (AccuWeather / Tomorrow.io / OpenWeather) — `NOT CONFIGURED`
- **Arquivos**: nenhum. **Ação**: adapters + env vars + flags; sem credencial → `NOT_CONFIGURED`. Nunca inserir chave falsa.

### D. USGS Earthquake GeoJSON — `PARTIAL`
- **Arquivos**: `lib/monitor.ts:fetchEarthquakes`. **Endpoint**: `earthquake.usgs.gov/fdsnws/event/1/query` (radius 300km, minmag 3.0, 24h, limit 5).
- **Consumido hoje**: `mag`, `place`, `url`; severity derivada de magnitude (`usgsMag`).
- **Faltando**: profundidade, distância ao usuário, `tsunami` flag, `sig`, `felt`, `alert` (green/yellow/orange/red), ShakeMap URL, `updated`.
- **Frequência/cache**: on-demand; cache in-memory 60s quando há evento. **Erros**: try/catch → `[]`. **Fallback**: nenhum. **Env**: nenhuma.
- **UI**: Cenário (painel de severidade + cards). **Motor**: não injeta. **Push**: não.
- **Ação**: normalização completa + regras de relevância configuráveis → `HazardEvent` (`authority=observational`, `hazardType=earthquake`).

### E. USGS ShakeAlert — `NOT CONFIGURED`
- Nenhuma integração. Acesso exige licenciamento/parceria. **Ação**: interface `EarthquakeEarlyWarningProvider`, feature flag off, documentar requisitos. Não simular.

### F. NWS Alerts API — `PARTIAL`
- **Arquivos**: `lib/monitor.ts:fetchWeather`. **Endpoint**: `api.weather.gov/alerts/active?point=lat,lng` (User-Agent setado, Accept geo+json, timeout 8s).
- **Consumido hoje**: `event`, `severity`, `certainty`, `headline`, `expires`, `@id`. Severity via `nwsSev`.
- **Faltando**: `description`, `instruction`, `effective`, `onset`, `ends`, `areaDesc`, `sender`/`senderName`, `urgency`, geometry/polygon, e **deduplicação por `id`+`sent`**.
- **Cobertura**: já captura por texto todos os eventos listados (Tornado/Severe Thunderstorm/Flash Flood/Flood/Hurricane/Tropical Storm/Storm Surge/Extreme Wind/Red Flag/Heat/Winter Storm) — mas sem tipagem canônica nem mapeamento consistente.
- **UI**: Cenário (2 cards, botão "Analisar"). **Motor**: só quando o usuário toca "Analisar" (preenche o campo). **Push**: não.
- **Ação**: normalização completa + dedup → `HazardEvent` (`authority=official`, `OFFICIAL WARNING`/`WATCH`/`ADVISORY` conforme `event`/`severity`).

### G. NOAA / NHC — `MISSING`
- Nenhuma integração. **Ação**: provider real `nhc.noaa.gov/CurrentStorms.json` (público). Ciclones ativos, posição, categoria, vento sustentado, pressão, movimento, advisory/cone quando disponível → `HazardEvent` (`authority=forecast`, `hazardType=tropical_cyclone`). **Separado** dos alertas NWS (que são os oficiais que afetam a localização).

### H. Lightning — `NOT CONFIGURED`
- Nenhuma integração. **Ação**: interface `LightningProvider`; adapter Xweather (requer `XWEATHER_CLIENT_ID/SECRET`). Regras de distância (25/15/10/6 mi) em `lib/hazards/config.ts`, não como números mágicos. Sem chave → `NOT_CONFIGURED`.

### I. FEMA IPAWS — `NOT CONFIGURED`
- Nenhuma integração direta. **Ação**: interface `PublicAlertProvider`; adapter IPAWS-OPEN (requer COG ID/autorização FEMA). Feature flag off, documentar. Não mostrar conectado.

### J. Push notifications — `PARTIAL`
- **Arquivos**: `app/api/push/subscribe/route.ts` (salva subscription), `app/api/circles/[id]/push/route.ts` (envia via `web-push`), `worker/index.ts` (SW: push + notificationclick), tabela `push_subscriptions` (migration `20260630000200`).
- **Hoje**: só Admin de círculo dispara manualmente; gate `monitoring_push` (premium). Limpa endpoints `410`.
- **Faltando**: automação por hazard, preferências por tipo, quiet hours, cooldown, dedup por evento, update/cancel, notificação por mudança relevante (não por polling). **Ação**: Fase 2 (subsistema de entrega) — interfaces preparadas nesta fase.

---

## Riscos transversais encontrados

1. **Sem retry/backoff** em nenhum fetch — só try/catch → vazio. Um blip de rede zera o canal silenciosamente.
2. **Sem dedup de alertas NWS** por ID — a mesma tempestade pode aparecer repetida entre polls.
3. **Sem health real dos providers** — a UI hoje mostra `providers: {open-meteo:'ok', ...}` de forma otimista (`nwsRaw.length >= 0 ? 'ok'` é sempre `ok`). Não reflete falha real.
4. **Fuso fixo `America/Sao_Paulo`** em `fetchWeatherCurrent` (hardcoded) — incorreto para usuários fora do Brasil.
5. **Motor de decisão não recebe contexto de hazard automaticamente** — só quando o usuário toca "Analisar".
6. **Localização precisa**: `/api/monitor` recebe lat/lng por querystring sem persistir; ok. Ao persistir hazards/preferências, aplicar RLS e nunca expor localização exata.

---

## Pós-implementação (2026-07-10, D-043)

Subsistema novo em `lib/hazards/` (aditivo — não altera `lib/monitor.ts` nem `lib/weather/`). Verificado ao vivo em Miami: `GET /api/hazards` → `USING BACKUP WEATHER SOURCE`, 6/9 canais `live`, 3 `not_configured` (nunca "ALL SYSTEMS LIVE" falso).

| Canal | Status final | O que ficou |
| --- | ---: | --- |
| Weather forecast (WeatherKit) | **PARTIAL** | Interface `WeatherProvider` + adapter WeatherKit (`NOT_CONFIGURED`); Open-Meteo real como fallback ativo. |
| Rain nowcast | **IMPLEMENTED** (fallback) | Open-Meteo `minutely_15` real + `detectUpcomingPrecipitation`. WeatherKit/AccuWeather como upgrade. |
| Rain fallback (AccuWeather) | **NOT CONFIGURED** | Adapter + env + flag. |
| Earthquakes (USGS) | **IMPLEMENTED** | Normalização completa + distância + relevância + dedup. |
| Earthquake early warning (ShakeAlert) | **NOT CONFIGURED** | Interface + flag; nunca simulado. |
| Tornado & severe (NWS) | **IMPLEMENTED** | Normalização completa + dedup por ID. |
| Hurricane local (NWS) | **IMPLEMENTED** | Coberto pela normalização NWS. |
| Hurricane tracking (NHC) | **IMPLEMENTED** | `CurrentStorms.json` real, `authority=forecast`. |
| Lightning (Xweather) | **NOT CONFIGURED** | Interface + regras de distância centralizadas. |
| Public alerts (FEMA IPAWS) | **NOT CONFIGURED** | Interface + flag. |
| Push notifications | **PARTIAL** | Base existente mantida; automação por hazard = Fase 2 (migrations preparadas). |

**Serviços funcionando agora**: NWS, USGS, NHC, Open-Meteo (forecast + nowcast), EOS Engine.
**Aguardando credencial**: WeatherKit, AccuWeather, Xweather.
**Aguardando autorização**: ShakeAlert (licenciamento), FEMA IPAWS (COG FEMA).
**Deferido (documentado)**: persistência (5 tabelas em `20260710010000_hazard_tables.sql`, aplicar no SQL Editor) e automação de push por hazard.

**Telas que usam os novos dados**: tela **Cenário** (`components/LiveIntelligenceNetwork.tsx` no topo da coluna esquerda). O painel de monitoramento anterior permanece intacto.

**Como testar**: ver `hazard-provider-setup.md`. `npx jest lib/__tests__/hazards.test.ts` (10 grupos), `GET /api/hazards?lat&lng[&force=1]`.
