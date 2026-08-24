import { HAZARD_CONFIG } from '../config'
import { haversineMiles } from '../distance'
import { classifyEarthquake } from '../earthquake'
import type { Coordinates, HazardEvent } from '../types'
import type { HazardEventProvider, ProviderResult } from './interfaces'

interface UsgsProps {
  mag?: number
  place?: string
  time?: number
  updated?: number
  url?: string
  detail?: string
  felt?: number | null
  tsunami?: number
  sig?: number
  alert?: string | null
  title?: string
  products?: { shakemap?: unknown[] }
}

interface UsgsFeature {
  id?: string
  properties: UsgsProps
  geometry?: { coordinates?: [number, number, number] } // [lng, lat, depthKm]
}

/** Normalize one USGS feature relative to the user location. */
export function normalizeUsgsFeature(f: UsgsFeature, user: Coordinates): HazardEvent {
  const p = f.properties
  const coords = f.geometry?.coordinates
  const epicenter: Coordinates | undefined = coords ? { lat: coords[1], lng: coords[0] } : undefined
  const depthKm = coords?.[2]
  const magnitude = typeof p.mag === 'number' ? p.mag : 0
  const distanceMiles = epicenter ? haversineMiles(user, epicenter) : Number.POSITIVE_INFINITY
  const tsunami = p.tsunami === 1
  const relevance = classifyEarthquake({ magnitude, distanceMiles, tsunami })
  const time = p.time ? new Date(p.time).toISOString() : new Date().toISOString()
  const updated = p.updated ? new Date(p.updated).toISOString() : time
  const hasShakemap = Array.isArray(p.products?.shakemap) && p.products.shakemap.length > 0

  const depthNote = depthKm !== undefined ? `, depth ${depthKm.toFixed(0)} km` : ''
  const distNote = Number.isFinite(distanceMiles) ? `, ~${distanceMiles.toFixed(0)} mi away` : ''
  const shakemapNote = hasShakemap ? ' ShakeMap available.' : ''

  return {
    id: `usgs:${f.id ?? `${magnitude}-${p.time}`}`,
    sourceEventId: f.id ?? `${magnitude}-${p.time}`,
    source: 'usgs',
    authority: 'observational',
    visualClass: 'DETECTED_EVENT',
    hazardType: tsunami ? 'earthquake_tsunami' : 'earthquake',
    eventType: 'earthquake_detected',
    title: p.title ?? `M${magnitude.toFixed(1)} — ${p.place ?? 'unknown location'}`,
    summary: `Magnitude ${magnitude.toFixed(1)}${depthNote}${distNote}. ${tsunami ? 'Tsunami evaluation in effect. ' : ''}Detected earthquake reported by USGS.${shakemapNote}`,
    severity: relevance.severity,
    urgency: 'immediate',
    certainty: 'observed',
    location: epicenter,
    distanceMiles: Number.isFinite(distanceMiles) ? Number(distanceMiles.toFixed(1)) : undefined,
    metrics: { magnitude, depthKm },
    startsAt: time,
    detectedAt: time,
    updatedAt: updated,
    officialUrl: p.url,
    rawPayloadReference: f.id,
  }
}

export const usgsProvider: HazardEventProvider = {
  source: 'usgs',
  isConfigured: () => true, // keyless
  async getEvents(location: Coordinates): Promise<ProviderResult<HazardEvent[]>> {
    const started = Date.now()
    const c = HAZARD_CONFIG.earthquake
    try {
      const since = new Date(Date.now() - c.queryWindowHours * 3_600_000).toISOString()
      const url =
        `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
        `&latitude=${location.lat}&longitude=${location.lng}` +
        `&maxradiuskm=${c.queryRadiusKm}&minmagnitude=${c.queryMinMagnitude}` +
        `&orderby=time&limit=20&starttime=${since}`
      const res = await fetch(url, { signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs) })
      if (!res.ok) {
        return { provider: 'usgs', status: 'degraded', data: [], latencyMs: Date.now() - started, message: `HTTP ${res.status}` }
      }
      const json = (await res.json()) as { features?: UsgsFeature[] }
      // Keep only relevant events per the configurable rules.
      // The magnitude comes from `metrics`, never re-parsed from the title: USGS
      // titles read "M 4.3 - 10km SSW of…" (with a space), so the old
      // /M(\d+\.\d+)/ never matched, every quake scored magnitude 0, and the
      // relevance filter silently dropped ALL of them.
      const events = (json.features ?? [])
        .map(f => normalizeUsgsFeature(f, location))
        .filter(e =>
          classifyEarthquake({
            magnitude: e.metrics?.magnitude ?? 0,
            distanceMiles: e.distanceMiles ?? Number.POSITIVE_INFINITY,
            tsunami: e.hazardType.includes('tsunami'),
          }).relevant,
        )
      return {
        provider: 'usgs',
        status: 'live',
        data: events,
        latencyMs: Date.now() - started,
        lastSuccessAt: new Date().toISOString(),
        dataAgeSeconds: 0,
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error'
      return { provider: 'usgs', status: 'offline', data: [], latencyMs: Date.now() - started, message }
    }
  },
}
