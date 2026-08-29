import { fetchOpenMeteoForecast } from '@/lib/weather/providers/open-meteo'
import { HAZARD_CONFIG } from './config'
import { deriveStatus, aggregateNetworkStatus } from './health'
import { detectUpcomingPrecipitation } from './precipitation'
import { nwsProvider } from './providers/nws'
import { usgsProvider } from './providers/usgs'
import { nhcProvider } from './providers/nhc'
import { openMeteoNowcastProvider } from './providers/open-meteo-nowcast'
import { nasaEonetProvider } from './providers/nasa-eonet'
import { femaDeclarationsProvider } from './providers/fema-declarations'
import { openFdaProvider } from './providers/openfda'
import {
  weatherKitProvider,
  accuWeatherNowcastProvider,
  xweatherLightningProvider,
  shakeAlertProvider,
  femaIpawsProvider,
} from './providers/adapters'
import type {
  Coordinates,
  HazardChannel,
  HazardEvent,
  HazardNetworkSnapshot,
  ProviderStatus,
  UpcomingPrecipitationResult,
} from './types'

/** Do mais grave para o menos grave. Empate desempata pelo relógio. */
const SEVERITY_RANK: Record<string, number> = {
  extreme: 5, severe: 4, moderate: 3, minor: 2, info: 1,
}

// In-memory cache to avoid hammering upstream feeds (respects rate limits).
interface CacheEntry { snapshot: HazardNetworkSnapshot; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

async function timedForecast(location: Coordinates): Promise<{ status: ProviderStatus; latencyMs: number; ok: boolean }> {
  const started = Date.now()
  try {
    const f = await fetchOpenMeteoForecast(location.lat, location.lng)
    return { status: f ? 'live' : 'offline', latencyMs: Date.now() - started, ok: !!f }
  } catch {
    return { status: 'offline', latencyMs: Date.now() - started, ok: false }
  }
}

export async function getHazardNetwork(location: Coordinates, opts: { force?: boolean } = {}): Promise<HazardNetworkSnapshot> {
  const key = `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`
  const hit = cache.get(key)
  if (!opts.force && hit && Date.now() < hit.expiresAt) return hit.snapshot

  const [forecast, nowcast, nws, usgs, nhc, lightning, shakeAlert, ipaws, wildfire, declarations, recalls] = await Promise.all([
    timedForecast(location),
    openMeteoNowcastProvider.getMinuteForecast(location),
    nwsProvider.getEvents(location),
    usgsProvider.getEvents(location),
    nhcProvider.getEvents(location),
    xweatherLightningProvider.getRecentStrikes(location, HAZARD_CONFIG.lightning.attentionMiles, new Date(Date.now() - 1_800_000)),
    shakeAlertProvider.getActiveWarning(location),
    femaIpawsProvider.getEvents(location),
    // D-226 — três fontes abertas, sem chave. Em paralelo com o resto: uma
    // delas lenta não pode atrasar o aviso de tempo severo.
    nasaEonetProvider.getEvents(location),
    femaDeclarationsProvider.getEvents(location),
    openFdaProvider.getEvents(location),
  ])

  const now = new Date().toISOString()

  // ── Precipitation (nowcast) ──────────────────────────────────────────────
  let precipitation: UpcomingPrecipitationResult | null = null
  if (nowcast.status === 'live' && nowcast.data.length) {
    precipitation = detectUpcomingPrecipitation(nowcast.data, { source: 'open-meteo', confidence: 'medium' })
  }

  // ── Channels (honest, real states) ───────────────────────────────────────
  const weatherKitOk = weatherKitProvider.isConfigured()
  const accuOk = accuWeatherNowcastProvider.isConfigured()

  const channels: HazardChannel[] = [
    {
      key: 'local-forecast',
      label: 'WeatherKit · Local Forecast',
      dataType: 'Current + hourly forecast',
      status: forecast.ok ? 'live' : 'offline',
      required: true,
      configured: true, // Open-Meteo fallback is keyless
      usingFallback: !weatherKitOk,
      primaryProvider: 'weatherkit',
      activeProvider: weatherKitOk ? 'weatherkit' : 'open-meteo',
      fallbackProvider: 'open-meteo',
      official: false,
      lastSuccessAt: forecast.ok ? now : undefined,
      dataAgeSeconds: forecast.ok ? 0 : undefined,
      message: weatherKitOk ? undefined : 'WeatherKit não configurado — usando Open-Meteo.',
    },
    {
      key: 'rain-nowcast',
      label: 'Rain Nowcast · Minute-by-Minute',
      dataType: 'Minute precipitation',
      status: deriveStatus(nowcast),
      required: true,
      configured: true, // Open-Meteo minutely is keyless
      usingFallback: !weatherKitOk && !accuOk,
      primaryProvider: 'weatherkit',
      activeProvider: 'open-meteo',
      fallbackProvider: 'open-meteo',
      official: false,
      lastSuccessAt: nowcast.lastSuccessAt,
      dataAgeSeconds: nowcast.dataAgeSeconds,
      message: nowcast.status === 'unavailable_here' ? 'Sem previsão minuto-a-minuto nesta região.' : (!weatherKitOk && !accuOk ? 'Usando Open-Meteo (nowcast de reserva).' : undefined),
    },
    {
      key: 'nws',
      label: 'NWS · Severe Weather Alerts',
      dataType: 'Official warnings',
      status: deriveStatus(nws),
      required: true,
      configured: true,
      usingFallback: false,
      primaryProvider: 'nws',
      activeProvider: 'nws',
      official: true,
      lastSuccessAt: nws.lastSuccessAt,
      dataAgeSeconds: nws.dataAgeSeconds,
      message: nws.message,
    },
    {
      key: 'nhc',
      label: 'NHC · Hurricane Intelligence',
      dataType: 'Tropical cyclone tracking',
      status: deriveStatus(nhc),
      required: false,
      configured: true,
      usingFallback: false,
      primaryProvider: 'nhc',
      activeProvider: 'nhc',
      official: true,
      lastSuccessAt: nhc.lastSuccessAt,
      dataAgeSeconds: nhc.dataAgeSeconds,
      message: nhc.message,
    },
    {
      key: 'usgs',
      label: 'USGS · Earthquake Detection',
      dataType: 'Detected earthquakes',
      status: deriveStatus(usgs),
      required: true,
      configured: true,
      usingFallback: false,
      primaryProvider: 'usgs',
      activeProvider: 'usgs',
      official: true,
      lastSuccessAt: usgs.lastSuccessAt,
      dataAgeSeconds: usgs.dataAgeSeconds,
      message: usgs.message,
    },
    {
      key: 'lightning',
      label: 'Lightning · Strike Detection',
      dataType: 'Real-time strikes',
      status: lightning.status,
      required: false,
      configured: xweatherLightningProvider.isConfigured(),
      usingFallback: false,
      primaryProvider: 'xweather',
      official: false,
      message: lightning.message,
    },
    {
      key: 'fema-ipaws',
      label: 'FEMA IPAWS · Public Safety Alerts',
      dataType: 'Public CAP alerts',
      status: ipaws.status,
      required: false,
      configured: femaIpawsProvider.isConfigured(),
      usingFallback: false,
      primaryProvider: 'fema_ipaws',
      official: true,
      message: ipaws.message,
    },
    {
      key: 'shakealert',
      label: 'ShakeAlert · Earthquake Early Warning',
      dataType: 'Seconds-ahead warning',
      status: shakeAlert.status,
      required: false,
      configured: shakeAlertProvider.isConfigured(),
      usingFallback: false,
      primaryProvider: 'shakealert',
      official: true,
      message: shakeAlert.message,
    },
    // ── D-226 · três fontes abertas, sem chave ───────────────────────────
    {
      key: 'wildfire',
      label: 'NASA EONET · Active Wildfires',
      dataType: 'Satellite-tracked fire events',
      status: wildfire.status,
      required: false,
      configured: true,
      usingFallback: false,
      primaryProvider: 'nasa_eonet',
      activeProvider: 'nasa_eonet',
      official: true,
      lastSuccessAt: wildfire.lastSuccessAt,
      dataAgeSeconds: wildfire.dataAgeSeconds,
      message: wildfire.message,
    },
    {
      key: 'fema-declarations',
      label: 'FEMA · Federal Disaster Declarations',
      dataType: 'Declared disasters + assistance',
      status: declarations.status,
      required: false,
      configured: true,
      usingFallback: false,
      primaryProvider: 'fema_openfema',
      activeProvider: 'fema_openfema',
      official: true,
      lastSuccessAt: declarations.lastSuccessAt,
      dataAgeSeconds: declarations.dataAgeSeconds,
      message: declarations.message,
    },
    {
      key: 'fda-recalls',
      label: 'FDA · Drug and Food Recalls',
      dataType: 'Class I recalls',
      status: recalls.status,
      required: false,
      configured: true,
      usingFallback: false,
      primaryProvider: 'openfda',
      activeProvider: 'openfda',
      official: true,
      lastSuccessAt: recalls.lastSuccessAt,
      dataAgeSeconds: recalls.dataAgeSeconds,
      message: recalls.message,
    },
    {
      key: 'eos-engine',
      label: 'EOS Engine · Risk Analysis',
      dataType: 'On-device rules + AI',
      status: 'live',
      required: false,
      configured: true,
      usingFallback: false,
      primaryProvider: 'eos',
      activeProvider: 'eos',
      official: false,
    },
  ]

  const events: HazardEvent[] = [
    ...nws.data, ...usgs.data, ...nhc.data, ...ipaws.data,
    ...wildfire.data, ...declarations.data, ...recalls.data,
  ]
    .concat(shakeAlert.data ? [shakeAlert.data] : [])
    /*
     * Gravidade antes de recência (D-226).
     *
     * A ordem era só por `updatedAt`, o que bastava quando toda fonte publicava
     * emergência. Com recalls e declarações entrando, deixa de bastar: a FDA
     * publica todo dia, um furacão se atualiza a cada seis horas, e a tela
     * mostra os seis primeiros. Ordenar por relógio poria "recall de cápsula"
     * acima de "furacão categoria 3" — e o topo da tela é o único lugar que
     * muita gente lê.
     *
     * Dentro da mesma gravidade, o mais recente ganha, que é o comportamento
     * anterior preservado.
     */
    .sort((a, b) => {
      const peso = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      return peso !== 0 ? peso : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })

  const snapshot: HazardNetworkSnapshot = {
    location,
    events,
    channels,
    network: aggregateNetworkStatus(channels, now),
    precipitation,
    fetchedAt: now,
  }
  cache.set(key, { snapshot, expiresAt: Date.now() + CACHE_TTL_MS })
  return snapshot
}
