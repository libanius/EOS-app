# Hazard Provider Setup

> Como ativar cada provider. Providers keyless já funcionam. Os credenciados ficam `NOT_CONFIGURED` até você preencher as env vars — nunca insira chave falsa.

---

## Já ativos (sem chave, nada a fazer)

| Provider | Fonte | Verificar |
| --- | --- | --- |
| NWS Alerts | `api.weather.gov/alerts/active` | `GET /api/hazards?lat=25.76&lng=-80.19` → canal `NWS` = `live` |
| USGS Earthquakes | `earthquake.usgs.gov` | canal `USGS` = `live` |
| NHC Hurricanes | `nhc.noaa.gov/CurrentStorms.json` | canal `NHC` = `live` |
| Open-Meteo (forecast + nowcast) | `api.open-meteo.com` | canais `Local Forecast` / `Rain Nowcast` = `live (fallback)` |

---

## Apple WeatherKit (previsão principal + minute)

1. Apple Developer Program → **Certificates, Identifiers & Profiles**.
2. Crie um **Services ID** (ex.: `com.eos.weather`) e uma **WeatherKit private key** (`.p8`). Anote **Key ID** e **Team ID**.
3. No Vercel (Prod+Preview):
   ```
   WEATHERKIT_TEAM_ID=XXXXXXXXXX
   WEATHERKIT_SERVICE_ID=com.eos.weather
   WEATHERKIT_KEY_ID=YYYYYYYYYY
   WEATHERKIT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
   ```
4. Implemente a chamada real no branch já preparado de `lib/hazards/providers/adapters.ts` (`weatherKitProvider`): assinar um JWT ES256 (`teamId`/`keyId`/`serviceId`) **no servidor** e chamar `weatherkit.apple.com/api/v1/weather/...`. A chave privada nunca vai ao cliente.
5. Quando `configured` vira `true`, o canal `Local Forecast` deixa de usar fallback e a rede pode chegar a `ALL SYSTEMS LIVE`.

## AccuWeather MinuteCast (fallback de nowcast)

```
ACCUWEATHER_API_KEY=...
```
Implementar a chamada em `accuWeatherNowcastProvider`. Prioridade: WeatherKit → AccuWeather → Open-Meteo.

## Xweather (raios)

```
XWEATHER_CLIENT_ID=...
XWEATHER_CLIENT_SECRET=...
```
Implementar `xweatherLightningProvider.getRecentStrikes`. Regras de distância já centralizadas em `lib/hazards/config.ts` (`lightning`). Sem chave → canal `Lightning` = `NOT CONFIGURED`.

## USGS ShakeAlert (early warning)

Requer **licenciamento/parceria** autorizada com o programa ShakeAlert. Não simular.
```
SHAKEALERT_ENABLED=true
SHAKEALERT_ENDPOINT=...
SHAKEALERT_TOKEN=...
```
Enquanto `configured=false`, canal `ShakeAlert` = `NOT CONFIGURED`. Nunca exibir "ShakeAlert connected" sem conexão real.

## FEMA IPAWS (alertas públicos)

Requer **COG ID** e autorização FEMA (IPAWS-OPEN).
```
FEMA_IPAWS_ENABLED=true
FEMA_IPAWS_COG_ID=...
FEMA_IPAWS_PIN=...
```
Implementar `femaIpawsProvider.getEvents`. Sem acesso → `NOT CONFIGURED`. (Muitos alertas CAP já chegam via NWS.)

---

## Como testar cada provider

- **Ao vivo**: `GET /api/hazards?lat=<lat>&lng=<lng>` — inspecione `channels[].status` e `network.headline`.
- **Forçar refetch** (ignora cache): `&force=1`.
- **Unit**: `npx jest lib/__tests__/hazards.test.ts` — normalização NWS/USGS, dedup, distância, precip, raios, relevância de terremoto, not-configured, stale, agregação de status.
- **Regressão de honestidade**: o teste `aggregateNetworkStatus` garante que **nunca** aparece `ALL SYSTEMS LIVE` com canal obrigatório `offline`/`degraded`/em fallback.
- **Estados por provider**: para simular `offline`, desligue a rede e chame o endpoint — os canais reais viram `offline`, os keyless permanecem íntegros e o headline degrada honestamente.
