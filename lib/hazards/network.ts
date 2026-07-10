import { fetchOpenMeteoForecast } from '@/lib/weather/providers/open-meteo'
import { HAZARD_CONFIG } from './config'
import { deriveStatus, aggregateNetworkStatus } from './health'
import { detectUpcomingPrecipitation } from './precipitation'
import { nwsProvider } from './providers/nws'
import { usgsProvider } from './providers/usgs'
import { nhcProvider } from './providers/nhc'
import { openMeteoNowcastProvider } from './providers/open-meteo-nowcast'
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

  const [forecast, nowcast, nws, usgs, nhc, lightning, shakeAlert, ipaws] = await Promise.all([
    timedForecast(location),
    openMeteoNowcastProvider.getMinuteForecast(location),
    nwsProvider.getEvents(location),
    usgsProvider.getEvents(location),
    nhcProvider.getEvents(location),
    xweatherLightningProvider.getRecentStrikes(location, HAZARD_CONFIG.lightning.attentionMiles, new Date(Date.now() - 1_800_000)),
    shakeAlertProvider.getActiveWarning(location),
    femaIpawsProvider.getEvents(location),
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

  const events: HazardEvent[] = [...nws.data, ...usgs.data, ...nhc.data, ...ipaws.data]
    .concat(shakeAlert.data ? [shakeAlert.data] : [])
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

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
