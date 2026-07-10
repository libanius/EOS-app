// ─── Decoupled provider interfaces ────────────────────────────────────────────
// Providers implement these so the aggregator never depends on a concrete API.
// Each fetch returns a ProviderResult so health can be recorded uniformly.

import type {
  Coordinates,
  HazardEvent,
  MinuteForecast,
  LightningStrike,
  HazardSource,
  ProviderStatus,
} from '../types'

export interface ProviderResult<T> {
  provider: HazardSource
  status: ProviderStatus
  data: T
  latencyMs?: number
  lastSuccessAt?: string
  dataAgeSeconds?: number
  message?: string
}

// Current + hourly forecast (WeatherKit primary, Open-Meteo fallback).
export interface CurrentConditions {
  tempF: number
  condition: string
  windMph: number
  precipProbabilityPct: number
  observedAt: string
}

export interface HourlyForecastPoint {
  timeIso: string
  tempF: number
  precipProbabilityPct: number
  condition: string
}

export interface WeatherProvider {
  readonly source: HazardSource
  isConfigured(): boolean
  getCurrentConditions(location: Coordinates): Promise<ProviderResult<CurrentConditions | null>>
  getHourlyForecast(location: Coordinates): Promise<ProviderResult<HourlyForecastPoint[]>>
}

// Minute-by-minute precipitation nowcast.
export interface MinuteForecastProvider {
  readonly source: HazardSource
  isConfigured(): boolean
  // Some regions have no minute forecast even when configured → status
  // 'unavailable_here' with empty data.
  getMinuteForecast(location: Coordinates): Promise<ProviderResult<MinuteForecast[]>>
}

// Government / official alert feeds (NWS, FEMA IPAWS) → normalized HazardEvents.
export interface HazardEventProvider {
  readonly source: HazardSource
  isConfigured(): boolean
  getEvents(location: Coordinates): Promise<ProviderResult<HazardEvent[]>>
}

export interface LightningProvider {
  readonly source: HazardSource
  isConfigured(): boolean
  getRecentStrikes(location: Coordinates, radiusMiles: number, since: Date): Promise<ProviderResult<LightningStrike[]>>
}

export interface EarthquakeEarlyWarningProvider {
  readonly source: HazardSource
  isConfigured(): boolean
  // ShakeAlert-style seconds-ahead warning. Never simulated.
  getActiveWarning(location: Coordinates): Promise<ProviderResult<HazardEvent | null>>
}
