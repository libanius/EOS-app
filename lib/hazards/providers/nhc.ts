import { HAZARD_CONFIG } from '../config'
import { haversineMiles } from '../distance'
import type { Coordinates, HazardEvent, HazardSeverity } from '../types'
import type { HazardEventProvider, ProviderResult } from './interfaces'

interface NhcStorm {
  id?: string
  name?: string
  classification?: string // HU, TS, TD, PTC, STS…
  intensity?: string // sustained winds kt
  pressure?: string // mb
  latitudeNumeric?: number
  longitudeNumeric?: number
  movementDir?: number | string
  movementSpeed?: number | string
  lastUpdate?: string
  publicAdvisory?: { advNum?: string; issuance?: string; url?: string }
  forecastTrack?: { kmzFile?: string }
  forecastCone?: { kmzFile?: string }
}

const CLASS_LABEL: Record<string, string> = {
  HU: 'Hurricane', MH: 'Major Hurricane', TS: 'Tropical Storm', TD: 'Tropical Depression',
  STS: 'Subtropical Storm', SD: 'Subtropical Depression', PTC: 'Potential Tropical Cyclone', RM: 'Remnants',
}

function stormSeverity(classification: string, windKt: number): HazardSeverity {
  const c = classification.toUpperCase()
  if (c === 'HU' || c === 'MH') return windKt >= 96 ? 'extreme' : 'severe'
  if (c === 'TS' || c === 'STS') return 'moderate'
  return 'minor'
}

/** Saffir-Simpson from sustained winds in mph. Null when it is not a hurricane. */
export function saffirSimpsonCategory(windMph: number): number | undefined {
  if (windMph >= 157) return 5
  if (windMph >= 130) return 4
  if (windMph >= 111) return 3
  if (windMph >= 96) return 2
  if (windMph >= 74) return 1
  return undefined
}

export function normalizeNhcStorm(s: NhcStorm, user: Coordinates): HazardEvent {
  const cls = (s.classification ?? '').toUpperCase()
  const label = CLASS_LABEL[cls] ?? 'Tropical Cyclone'
  const windKt = parseFloat(String(s.intensity ?? '0')) || 0
  const windMph = Math.round(windKt * 1.15078)
  const pos: Coordinates | undefined =
    typeof s.latitudeNumeric === 'number' && typeof s.longitudeNumeric === 'number'
      ? { lat: s.latitudeNumeric, lng: s.longitudeNumeric }
      : undefined
  const distanceMiles = pos ? haversineMiles(user, pos) : undefined
  const updated = s.lastUpdate ?? new Date().toISOString()
  const movement = s.movementDir != null && s.movementSpeed != null
    ? ` Moving ${s.movementDir}° at ${s.movementSpeed} kt.`
    : ''
  const distNote = distanceMiles != null ? ` ~${distanceMiles.toFixed(0)} mi from you.` : ''

  return {
    id: `nhc:${s.id ?? s.name ?? label}`,
    sourceEventId: s.id ?? `${s.name}-${s.publicAdvisory?.advNum ?? ''}`,
    source: 'nhc',
    authority: 'forecast',
    visualClass: 'FORECAST',
    hazardType: 'tropical_cyclone',
    eventType: `active_${cls.toLowerCase() || 'cyclone'}`,
    title: `${label} ${s.name ?? ''}`.trim(),
    summary: `${label} ${s.name ?? ''} — winds ${windMph} mph (${windKt} kt), pressure ${s.pressure ?? '—'} mb.${movement}${distNote} NHC forecast intelligence; consult NWS for local warnings.`,
    severity: stormSeverity(cls, windKt),
    urgency: 'expected',
    certainty: 'likely',
    confidence: 'high',
    location: pos,
    distanceMiles: distanceMiles != null ? Number(distanceMiles.toFixed(1)) : undefined,
    metrics: {
      windMph,
      pressureMb: parseFloat(String(s.pressure ?? '')) || undefined,
      classification: cls || undefined,
      category: cls === 'HU' || cls === 'MH' ? saffirSimpsonCategory(windMph) : undefined,
    },
    detectedAt: updated,
    updatedAt: updated,
    officialUrl: s.publicAdvisory?.url ?? 'https://www.nhc.noaa.gov/',
    rawPayloadReference: s.id,
  }
}

export const nhcProvider: HazardEventProvider = {
  source: 'nhc',
  isConfigured: () => true, // keyless public feed
  async getEvents(location: Coordinates): Promise<ProviderResult<HazardEvent[]>> {
    const started = Date.now()
    try {
      const res = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs),
      })
      if (!res.ok) {
        return { provider: 'nhc', status: 'degraded', data: [], latencyMs: Date.now() - started, message: `HTTP ${res.status}` }
      }
      const json = (await res.json()) as { activeStorms?: NhcStorm[] }
      const events = (json.activeStorms ?? [])
        .map(s => normalizeNhcStorm(s, location))
        .sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9))
      return {
        provider: 'nhc',
        status: 'live',
        data: events,
        latencyMs: Date.now() - started,
        lastSuccessAt: new Date().toISOString(),
        dataAgeSeconds: 0,
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error'
      return { provider: 'nhc', status: 'offline', data: [], latencyMs: Date.now() - started, message }
    }
  },
}
