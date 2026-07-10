import { haversineMiles, compassBearing } from '../hazards/distance'
import { normalizeNwsFeature, dedupeEvents, nwsVisualClass } from '../hazards/providers/nws'
import { normalizeUsgsFeature } from '../hazards/providers/usgs'
import { classifyEarthquake } from '../hazards/earthquake'
import { analyzeStrikes, threatForDistance } from '../hazards/lightning'
import { detectUpcomingPrecipitation } from '../hazards/precipitation'
import { deriveStatus, aggregateNetworkStatus } from '../hazards/health'
import { weatherKitProvider, xweatherLightningProvider, femaIpawsProvider } from '../hazards/providers/adapters'
import type { HazardChannel, LightningStrike, MinuteForecast } from '../hazards/types'
import type { ProviderResult } from '../hazards/providers/interfaces'

// ─── Distance ──────────────────────────────────────────────────────────────────

describe('distance', () => {
  it('computes haversine miles between two points', () => {
    // Miami → Orlando ≈ 194 mi
    const d = haversineMiles({ lat: 25.7617, lng: -80.1918 }, { lat: 28.5383, lng: -81.3792 })
    expect(d).toBeGreaterThan(180)
    expect(d).toBeLessThan(210)
  })
  it('returns ~0 for identical points', () => {
    expect(haversineMiles({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBeCloseTo(0, 5)
  })
  it('computes a compass bearing', () => {
    expect(compassBearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBe('N')
    expect(compassBearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBe('E')
  })
})

// ─── NWS normalization + dedup ──────────────────────────────────────────────────

const nwsFeature = (over: Record<string, unknown> = {}) => ({
  id: 'urn:oid:2.49.0.1.840.0.abc',
  geometry: { type: 'Polygon', coordinates: [] },
  properties: {
    id: 'abc', '@id': 'https://api.weather.gov/alerts/abc',
    event: 'Tornado Warning', headline: 'Tornado Warning issued',
    description: 'A tornado was detected.', instruction: 'TAKE COVER NOW!\n\nMove to a basement.',
    severity: 'Extreme', urgency: 'Immediate', certainty: 'Observed',
    onset: '2026-07-10T20:00:00Z', ends: '2026-07-10T20:30:00Z', expires: '2026-07-10T20:45:00Z',
    sent: '2026-07-10T20:00:00Z', areaDesc: 'Miami-Dade', senderName: 'NWS Miami',
    ...over,
  },
})

describe('NWS normalization', () => {
  it('maps official fields into a HazardEvent', () => {
    const e = normalizeNwsFeature(nwsFeature())
    expect(e.source).toBe('nws')
    expect(e.authority).toBe('official')
    expect(e.visualClass).toBe('OFFICIAL_WARNING')
    expect(e.severity).toBe('extreme')
    expect(e.urgency).toBe('immediate')
    expect(e.certainty).toBe('observed')
    expect(e.instructions).toEqual(['TAKE COVER NOW!', 'Move to a basement.'])
    expect(e.expiresAt).toBe('2026-07-10T20:45:00Z')
    expect(e.endsAt).toBe('2026-07-10T20:30:00Z')
  })

  it('classifies watch vs advisory', () => {
    expect(nwsVisualClass('Tornado Watch', 'severe')).toBe('WATCH')
    expect(nwsVisualClass('Heat Advisory', 'moderate')).toBe('ADVISORY')
    expect(nwsVisualClass('Flash Flood Warning', 'severe')).toBe('OFFICIAL_WARNING')
  })

  it('dedupes by official id keeping the latest update', () => {
    const older = normalizeNwsFeature(nwsFeature({ sent: '2026-07-10T20:00:00Z', headline: 'v1' }))
    const newer = normalizeNwsFeature(nwsFeature({ sent: '2026-07-10T20:10:00Z', headline: 'v2' }))
    const deduped = dedupeEvents([older, newer])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].title).toBe('v2')
  })

  it('keeps distinct ids separate', () => {
    const a = normalizeNwsFeature(nwsFeature({ id: 'a' }))
    const b = normalizeNwsFeature(nwsFeature({ id: 'b', event: 'Flood Warning' }))
    expect(dedupeEvents([a, b])).toHaveLength(2)
  })
})

// ─── USGS normalization + distance ──────────────────────────────────────────────

describe('USGS normalization', () => {
  it('computes distance and normalizes an earthquake', () => {
    const user = { lat: 34.05, lng: -118.24 } // LA
    const feature = {
      id: 'us1',
      properties: { mag: 5.2, place: '10km NE of Somewhere', time: Date.parse('2026-07-10T12:00:00Z'), tsunami: 0, url: 'https://x' },
      geometry: { coordinates: [-118.0, 34.1, 8] as [number, number, number] },
    }
    const e = normalizeUsgsFeature(feature, user)
    expect(e.source).toBe('usgs')
    expect(e.authority).toBe('observational')
    expect(e.visualClass).toBe('DETECTED_EVENT')
    expect(e.distanceMiles).toBeGreaterThan(0)
    expect(e.distanceMiles).toBeLessThan(30)
    expect(e.certainty).toBe('observed')
  })
})

describe('earthquake relevance', () => {
  it('flags moderate nearby', () => {
    expect(classifyEarthquake({ magnitude: 4.5, distanceMiles: 50, tsunami: false }).reason).toBe('moderate_nearby')
  })
  it('ignores tiny distant quakes', () => {
    expect(classifyEarthquake({ magnitude: 3.0, distanceMiles: 380, tsunami: false }).relevant).toBe(false)
  })
  it('always flags tsunami', () => {
    const r = classifyEarthquake({ magnitude: 2.0, distanceMiles: 999, tsunami: true })
    expect(r.relevant).toBe(true)
    expect(r.severity).toBe('extreme')
  })
  it('flags large distant quakes', () => {
    expect(classifyEarthquake({ magnitude: 7.5, distanceMiles: 999, tsunami: false }).reason).toBe('large_distant')
  })
})

// ─── Lightning ──────────────────────────────────────────────────────────────────

describe('lightning', () => {
  it('maps distance to configured threat levels', () => {
    expect(threatForDistance(5)).toBe('immediate_danger')
    expect(threatForDistance(8)).toBe('stop_activity')
    expect(threatForDistance(12)).toBe('elevated')
    expect(threatForDistance(20)).toBe('attention')
    expect(threatForDistance(40)).toBe('clear')
    expect(threatForDistance(null)).toBe('clear')
  })

  it('counts strikes per window and finds nearest', () => {
    const now = Date.parse('2026-07-10T12:00:00Z')
    const strikes: LightningStrike[] = [
      { lat: 0, lng: 0, occurredAt: new Date(now - 2 * 60_000).toISOString(), distanceMiles: 7 },
      { lat: 0, lng: 0, occurredAt: new Date(now - 12 * 60_000).toISOString(), distanceMiles: 14 },
      { lat: 0, lng: 0, occurredAt: new Date(now - 25 * 60_000).toISOString(), distanceMiles: 20 },
    ]
    const a = analyzeStrikes(strikes, { now })
    expect(a.counts.last5).toBe(1)
    expect(a.counts.last15).toBe(2)
    expect(a.counts.last30).toBe(3)
    expect(a.nearestMiles).toBe(7)
    expect(a.threat).toBe('stop_activity')
  })

  it('detects an approaching cell', () => {
    const now = Date.parse('2026-07-10T12:00:00Z')
    const strikes: LightningStrike[] = [
      { lat: 0, lng: 0, occurredAt: new Date(now - 1 * 60_000).toISOString(), distanceMiles: 6 },
      { lat: 0, lng: 0, occurredAt: new Date(now - 10 * 60_000).toISOString(), distanceMiles: 18 },
    ]
    expect(analyzeStrikes(strikes, { now }).trend).toBe('approaching')
  })

  it('is clear with no strikes', () => {
    const a = analyzeStrikes([], { now: Date.now() })
    expect(a.threat).toBe('clear')
    expect(a.nearestMiles).toBeNull()
  })
})

// ─── Precipitation nowcast ──────────────────────────────────────────────────────

const minutes = (arr: Array<[number, number, number]>): MinuteForecast[] =>
  arr.map(([minute, mmH, prob]) => ({
    minute,
    timeIso: new Date(Date.parse('2026-07-10T12:00:00Z') + minute * 60_000).toISOString(),
    precipIntensityMmH: mmH,
    precipProbabilityPct: prob,
    precipType: 'rain',
  }))

describe('detectUpcomingPrecipitation', () => {
  const now = Date.parse('2026-07-10T12:00:00Z')

  it('detects rain starting soon', () => {
    const f = minutes([[0, 0, 0], [15, 0, 0], [30, 1.5, 80], [45, 2, 80]])
    const r = detectUpcomingPrecipitation(f, { now })
    expect(r.eventType).toBe('rain_starting_soon')
    expect(r.startsInMinutes).toBe(30)
    expect(r.intensity).toBe('light')
    expect(r.confidence).toBe('medium')
  })

  it('reports no precipitation when dry', () => {
    const r = detectUpcomingPrecipitation(minutes([[0, 0, 0], [30, 0, 0]]), { now })
    expect(r.eventType).toBe('no_precipitation')
    expect(r.startsInMinutes).toBeNull()
  })

  it('reports ongoing rain', () => {
    const f = minutes([[0, 3, 90], [15, 3, 90], [30, 3, 90], [45, 3, 90], [60, 3, 90]])
    const r = detectUpcomingPrecipitation(f, { now })
    expect(r.eventType).toBe('rain_ongoing')
    expect(r.startsInMinutes).toBe(0)
    expect(r.intensity).toBe('moderate')
  })

  it('respects a custom minimum probability', () => {
    const f = minutes([[15, 1, 30]])
    expect(detectUpcomingPrecipitation(f, { now, minimumProbability: 0.5 }).eventType).toBe('no_precipitation')
  })
})

// ─── Health / provider status ────────────────────────────────────────────────────

describe('deriveStatus', () => {
  const base = <T,>(over: Partial<ProviderResult<T>>): ProviderResult<T> =>
    ({ provider: 'nws', status: 'live', data: [] as unknown as T, ...over })

  it('passes through a fresh live result', () => {
    expect(deriveStatus(base({ status: 'live', dataAgeSeconds: 10 }))).toBe('live')
  })
  it('degrades a stale live result', () => {
    expect(deriveStatus(base({ status: 'live', dataAgeSeconds: 5000 }))).toBe('degraded')
  })
  it('keeps not_configured', () => {
    expect(deriveStatus(base({ status: 'not_configured' }))).toBe('not_configured')
  })
})

// ─── Network aggregation (the honesty rule) ──────────────────────────────────────

const ch = (over: Partial<HazardChannel>): HazardChannel => ({
  key: 'k', label: 'L', dataType: 'd', status: 'live',
  required: true, configured: true, usingFallback: false,
  primaryProvider: 'nws', official: false, ...over,
})

describe('aggregateNetworkStatus', () => {
  const at = '2026-07-10T12:00:00Z'

  it('says ALL SYSTEMS LIVE only when every required+configured channel is live and no fallback', () => {
    const s = aggregateNetworkStatus([ch({ key: 'a' }), ch({ key: 'b' })], at)
    expect(s.headline).toBe('ALL SYSTEMS LIVE')
    expect(s.tone).toBe('mint')
  })

  it('NEVER says ALL SYSTEMS LIVE when a required channel is offline', () => {
    const s = aggregateNetworkStatus([ch({ key: 'a' }), ch({ key: 'b', status: 'offline' })], at)
    expect(s.headline).not.toBe('ALL SYSTEMS LIVE')
    expect(s.headline).toBe('1 OF 2 CHANNELS LIVE')
    expect(s.tone).toBe('amber')
  })

  it('reports limited coverage when all required channels are down', () => {
    const s = aggregateNetworkStatus([ch({ status: 'offline' }), ch({ key: 'b', status: 'degraded' })], at)
    expect(s.headline).toBe('MONITORING WITH LIMITED COVERAGE')
    expect(s.tone).toBe('red')
  })

  it('reports backup source when a required channel is on fallback', () => {
    const s = aggregateNetworkStatus([ch({ usingFallback: true }), ch({ key: 'b' })], at)
    expect(s.headline).toBe('USING BACKUP WEATHER SOURCE')
    expect(s.tone).toBe('amber')
  })

  it('does not let a not-configured optional channel claim ALL SYSTEMS LIVE', () => {
    const s = aggregateNetworkStatus(
      [ch({ key: 'a' }), ch({ key: 'lightning', required: false, configured: false, status: 'not_configured' })],
      at,
    )
    expect(s.headline).not.toBe('ALL SYSTEMS LIVE')
    expect(s.notConfiguredCount).toBe(1)
  })
})

// ─── Credentialed providers report NOT_CONFIGURED without keys ────────────────────

describe('credentialed providers (no keys in test env)', () => {
  const loc = { lat: 25, lng: -80 }

  it('WeatherKit is not configured and never fabricates data', async () => {
    expect(weatherKitProvider.isConfigured()).toBe(false)
    const r = await weatherKitProvider.getCurrentConditions(loc)
    expect(r.status).toBe('not_configured')
    expect(r.data).toBeNull()
  })

  it('Xweather lightning is not configured', async () => {
    const r = await xweatherLightningProvider.getRecentStrikes(loc, 25, new Date())
    expect(r.status).toBe('not_configured')
    expect(r.data).toEqual([])
  })

  it('FEMA IPAWS is not configured', async () => {
    const r = await femaIpawsProvider.getEvents(loc)
    expect(r.status).toBe('not_configured')
    expect(r.data).toEqual([])
  })
})
