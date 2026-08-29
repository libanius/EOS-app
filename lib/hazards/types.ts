// ─── Unified hazard model (docs/hazard-data-architecture.md) ──────────────────
// Every provider normalizes its payload into HazardEvent so the UI and the
// decision engine never branch on provider-specific shapes.

export interface Coordinates {
  lat: number
  lng: number
}

export type HazardSource =
  | 'weatherkit'
  | 'nws'
  | 'nhc'
  | 'usgs'
  | 'shakealert'
  | 'xweather'
  | 'accuweather'
  | 'tomorrow'
  | 'openweather'
  | 'open-meteo'
  | 'fema_ipaws'
  // Três fontes abertas, sem chave, entram em D-226 para cumprir o que a ficha
  // de planos já prometia. EONET substitui o FIRMS do rótulo antigo, que exigiria
  // MAP_KEY e deixaria a promessa parada esperando um cadastro.
  | 'nasa_eonet'
  | 'fema_openfema'
  | 'openfda'
  | 'eos'

// Where the statement's authority comes from — drives the visual classification.
// official → government warning; observational → detected fact; forecast → model
// projection; eos_analysis → the EOS engine's own inference (never a government alert).
export type HazardAuthority = 'official' | 'observational' | 'forecast' | 'eos_analysis'

export type HazardSeverity = 'info' | 'minor' | 'moderate' | 'severe' | 'extreme'
export type HazardUrgency = 'future' | 'expected' | 'immediate'
export type HazardCertainty = 'possible' | 'likely' | 'observed'
export type HazardConfidence = 'low' | 'medium' | 'high'

// Visual class shown in the UI (section 4 of the spec).
export type HazardClass =
  | 'OFFICIAL_WARNING'
  | 'WATCH'
  | 'ADVISORY'
  | 'DETECTED_EVENT'
  | 'FORECAST'
  | 'EOS_RISK_ANALYSIS'

// Structured numbers behind an event. Text is for humans; THIS is what the
// transition detector compares. "Foi elevado a Tempestade Tropical, ventos de
// 46 mph" only exists because the previous scan stored windMph and category —
// re-parsing them out of a summary string is how alerts get silently wrong.
export interface HazardMetrics {
  /** Sustained winds, mph — tropical cyclones. */
  windMph?: number
  /** Central pressure, mb — tropical cyclones. */
  pressureMb?: number
  /** Raw NHC classification: HU, MH, TS, TD, STS, SD, PTC, RM. */
  classification?: string
  /** Saffir-Simpson category 1-5. Hurricanes only, derived from windMph. */
  category?: number
  /** Richter magnitude — earthquakes. */
  magnitude?: number
  /** Depth in km — earthquakes. */
  depthKm?: number
  /** US AQI — air quality. */
  aqi?: number
  /** Minutes until precipitation starts — nowcast. */
  startsInMinutes?: number
  /** How hard it will rain — kept structured so the copy renders in either language. */
  precipIntensity?: PrecipIntensity
  /** Expected duration in minutes — nowcast. */
  precipDurationMinutes?: number
}

export interface HazardEvent {
  id: string
  sourceEventId: string
  source: HazardSource
  authority: HazardAuthority
  visualClass: HazardClass
  hazardType: string
  eventType: string
  title: string
  summary: string
  instructions?: string[]
  severity: HazardSeverity
  urgency: HazardUrgency
  certainty: HazardCertainty
  confidence?: HazardConfidence
  location?: Coordinates
  geometry?: unknown
  distanceMiles?: number
  metrics?: HazardMetrics
  startsAt?: string
  endsAt?: string
  detectedAt: string
  updatedAt: string
  expiresAt?: string
  officialUrl?: string
  // A short, opaque reference to the raw payload for debugging — never the raw
  // payload inline, never sensitive fields.
  rawPayloadReference?: string
}

// ─── Minute-by-minute precipitation ───────────────────────────────────────────

export type PrecipIntensity = 'none' | 'light' | 'moderate' | 'heavy'
export type PrecipType = 'rain' | 'snow' | 'sleet' | 'mixed' | 'unknown'

export interface MinuteForecast {
  minute: number // minutes from now (0, 15, 30 … depending on provider resolution)
  timeIso: string
  precipIntensityMmH: number // mm/h
  precipProbabilityPct: number // 0-100
  precipType: PrecipType
}

export interface UpcomingPrecipitationResult {
  hazardType: 'precipitation'
  eventType: 'rain_starting_soon' | 'rain_ongoing' | 'rain_clearing' | 'no_precipitation'
  startsInMinutes: number | null
  expectedDurationMinutes: number | null
  intensity: PrecipIntensity
  precipType: PrecipType
  probability: number // 0-1
  confidence: HazardConfidence
  source: HazardSource
  observedAt: string
}

// ─── Lightning ────────────────────────────────────────────────────────────────

export interface LightningStrike {
  lat: number
  lng: number
  occurredAt: string
  distanceMiles: number
  peakAmperage?: number
}

export type LightningThreat = 'clear' | 'attention' | 'elevated' | 'stop_activity' | 'immediate_danger'

export interface LightningAnalysis {
  threat: LightningThreat
  nearestMiles: number | null
  counts: { last5: number; last10: number; last15: number; last30: number }
  trend: 'approaching' | 'receding' | 'steady' | 'unknown'
  minutesSinceLast: number | null
  bearingFromUser: string | null
  observedAt: string
}

// ─── Provider health (section 7) ──────────────────────────────────────────────

export type ProviderStatus =
  | 'live'
  | 'syncing'
  | 'degraded'
  | 'offline'
  | 'not_configured'
  | 'unavailable_here'

export interface ProviderHealth {
  provider: HazardSource
  status: ProviderStatus
  lastAttemptAt?: string
  lastSuccessAt?: string
  latencyMs?: number
  dataAgeSeconds?: number
  consecutiveFailures: number
  fallbackProvider?: HazardSource
  message?: string
}

// A user-facing monitoring lane in the Live Intelligence Network. Backed by one
// or more providers (primary + fallbacks).
export interface HazardChannel {
  key: string
  label: string
  dataType: string
  status: ProviderStatus
  required: boolean
  configured: boolean
  usingFallback: boolean
  primaryProvider: HazardSource
  activeProvider?: HazardSource
  fallbackProvider?: HazardSource
  official: boolean
  lastSuccessAt?: string
  dataAgeSeconds?: number
  message?: string
}

export type NetworkTone = 'mint' | 'amber' | 'red' | 'muted'

/**
 * A causa do estado da rede, como DADO.
 *
 * `headline` continua existindo e continua em inglês: é o texto de base e o que
 * os testes de `health.ts` asseguram. Mas ele é uma frase montada no servidor, e
 * o servidor não sabe em que idioma a pessoa lê — a mesma lição que o
 * `docs/11-product-memory` já registrou duas vezes. `headlineKey` é a razão em
 * si; a tela escolhe as palavras.
 */
export type NetworkHeadlineKey = 'limited_coverage' | 'partial_channels' | 'backup_source' | 'all_live'

export interface NetworkStatus {
  headline: string
  headlineKey: NetworkHeadlineKey
  tone: NetworkTone
  liveCount: number
  configuredCount: number
  totalChannels: number
  degradedCount: number
  notConfiguredCount: number
  syncedAt: string
}

export interface HazardNetworkSnapshot {
  location: Coordinates
  events: HazardEvent[]
  channels: HazardChannel[]
  network: NetworkStatus
  precipitation: UpcomingPrecipitationResult | null
  fetchedAt: string
}
