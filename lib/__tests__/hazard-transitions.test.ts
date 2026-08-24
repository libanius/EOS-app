import {
  detectTransitions,
  intensityRank,
  isCritical,
  isRelevantForUser,
  tropicalStateLabel,
  type StoredHazardState,
} from '@/lib/hazards/transitions'
import { aqiBand, airQualityEvent, notificationCopy, precipitationEvent, preferenceKey } from '@/lib/hazards/alerting'
import { inQuietHours, scanKeyFor } from '@/lib/hazards/scan'
import { saffirSimpsonCategory } from '@/lib/hazards/providers/nhc'
import type { HazardEvent, HazardMetrics } from '@/lib/hazards/types'

const LOCATION = { lat: 26.31, lng: -80.24 } // Parkland, FL

function cyclone(name: string, classification: string, windMph: number, distanceMiles = 200): HazardEvent {
  const metrics: HazardMetrics = {
    classification,
    windMph,
    category: classification === 'HU' || classification === 'MH' ? saffirSimpsonCategory(windMph) : undefined,
  }
  return {
    id: `nhc:${name.toLowerCase()}`,
    sourceEventId: name.toLowerCase(),
    source: 'nhc',
    authority: 'forecast',
    visualClass: 'FORECAST',
    hazardType: 'tropical_cyclone',
    eventType: `active_${classification.toLowerCase()}`,
    title: `Tropical Storm ${name}`,
    summary: '',
    severity: classification === 'HU' || classification === 'MH' ? 'severe' : 'moderate',
    urgency: 'expected',
    certainty: 'likely',
    distanceMiles,
    metrics,
    detectedAt: '2026-08-24T12:00:00Z',
    updatedAt: '2026-08-24T12:00:00Z',
  }
}

function stored(event: HazardEvent): StoredHazardState {
  return {
    id: event.id,
    severity: event.severity,
    eventType: event.eventType,
    title: event.title,
    hazardType: event.hazardType,
    metrics: event.metrics,
  }
}

describe('intensityRank', () => {
  it('puts every hurricane category above a tropical storm', () => {
    const ts = intensityRank({ severity: 'moderate', metrics: { classification: 'TS', windMph: 60 } })
    const cat1 = intensityRank({ severity: 'severe', metrics: { classification: 'HU', windMph: 80, category: 1 } })
    const cat4 = intensityRank({ severity: 'severe', metrics: { classification: 'HU', windMph: 140, category: 4 } })
    expect(cat1).toBeGreaterThan(ts)
    expect(cat4).toBeGreaterThan(cat1)
  })

  it('separates categories that share the same severity', () => {
    // Both are `severe`; only the category tells them apart. Collapsing them is
    // exactly how a downgrade alert goes missing.
    const cat2 = intensityRank({ severity: 'severe', metrics: { classification: 'HU', windMph: 100, category: 2 } })
    const cat1 = intensityRank({ severity: 'severe', metrics: { classification: 'HU', windMph: 90, category: 1 } })
    expect(cat2).toBeGreaterThan(cat1)
  })
})

describe('detectTransitions', () => {
  it('reports a newly formed storm as formed', () => {
    const iselle = cyclone('Iselle', 'TS', 45)
    const t = detectTransitions({ previous: new Map(), current: [iselle] })
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('formed')
    expect(t[0].toState).toBe('Tempestade Tropical')
  })

  it('reports a depression becoming a storm as upgraded', () => {
    const before = cyclone('Moke', 'TD', 30)
    const after = cyclone('Moke', 'TS', 46)
    const t = detectTransitions({
      previous: new Map([[before.id, stored(before)]]),
      current: [after],
    })
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('upgraded')
    expect(t[0].fromState).toBe('Depressão Tropical')
    expect(t[0].toState).toBe('Tempestade Tropical')
  })

  it('reports a category drop as downgraded', () => {
    const before = cyclone('Lala', 'HU', 105) // cat 2
    const after = cyclone('Lala', 'HU', 92) // cat 1
    const t = detectTransitions({
      previous: new Map([[before.id, stored(before)]]),
      current: [after],
    })
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('downgraded')
    expect(t[0].toState).toBe('Furacão Categoria 1')
  })

  it('says nothing when nothing changed — the whole point of scanning often', () => {
    const storm = cyclone('Lala', 'HU', 92)
    const t = detectTransitions({
      previous: new Map([[storm.id, stored(storm)]]),
      current: [storm],
      ownedIds: [storm.id],
    })
    expect(t).toHaveLength(0)
  })

  it('produces the same dedup key for the same change across runs', () => {
    const before = cyclone('Lala', 'HU', 105)
    const after = cyclone('Lala', 'HU', 92)
    const previous = new Map([[before.id, stored(before)]])
    const first = detectTransitions({ previous, current: [after] })
    const second = detectTransitions({ previous, current: [after] })
    // The competitor delivered the same downgrade twice on two different days.
    // A stable key is what makes that impossible here.
    expect(first[0].dedupKey).toBe(second[0].dedupKey)
  })

  it('reports an event that vanished as cleared, only if it mattered', () => {
    const storm = cyclone('Lala', 'HU', 92)
    const trivial: StoredHazardState = {
      id: 'eos:aqi:26.31,-80.24',
      severity: 'minor',
      eventType: 'air_quality_moderate',
      title: 'Qualidade do ar: Moderada',
      hazardType: 'air_quality',
      metrics: { aqi: 60 },
    }
    const t = detectTransitions({
      previous: new Map([[storm.id, stored(storm)], [trivial.id, trivial]]),
      current: [],
      ownedIds: [storm.id, trivial.id],
    })
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('cleared')
    expect(t[0].event.id).toBe(storm.id)
  })

  it('does not report as cleared an event this location never owned', () => {
    const storm = cyclone('Lala', 'HU', 92)
    const t = detectTransitions({
      previous: new Map([[storm.id, stored(storm)]]),
      current: [],
      ownedIds: [],
    })
    expect(t).toHaveLength(0)
  })
})

describe('isRelevantForUser', () => {
  it('drops a storm on the other side of the continent by default', () => {
    const iselle = cyclone('Iselle', 'TS', 45, 3000) // E. Pacific, from Florida
    const [t] = detectTransitions({ previous: new Map(), current: [iselle] })
    expect(isRelevantForUser(t)).toBe(false)
  })

  it('keeps it when the user opted into basin-wide alerts', () => {
    const iselle = cyclone('Iselle', 'TS', 45, 3000)
    const [t] = detectTransitions({ previous: new Map(), current: [iselle] })
    expect(isRelevantForUser(t, { basinWideTropical: true })).toBe(true)
  })

  it('keeps a storm that can actually reach you', () => {
    const near = cyclone('Milton', 'HU', 120, 400)
    const [t] = detectTransitions({ previous: new Map(), current: [near] })
    expect(isRelevantForUser(t)).toBe(true)
  })
})

describe('isCritical', () => {
  it('never treats a downgrade or an all-clear as critical', () => {
    const before = cyclone('Lala', 'MH', 130)
    const after = cyclone('Lala', 'HU', 92)
    after.severity = 'extreme'
    const [t] = detectTransitions({ previous: new Map([[before.id, stored(before)]]), current: [after] })
    expect(t.kind).toBe('downgraded')
    expect(isCritical(t)).toBe(false)
  })

  it('treats an extreme new event as critical', () => {
    const storm = cyclone('Milton', 'MH', 160, 300)
    storm.severity = 'extreme'
    const [t] = detectTransitions({ previous: new Map(), current: [storm] })
    expect(isCritical(t)).toBe(true)
  })
})

describe('air quality', () => {
  it('stays silent while the air is merely moderate', () => {
    const event = airQualityEvent(
      { us_aqi: 60, pm25: 12, pm10: null, ozone: null, dust: null, category: 'Moderate', source: 'open-meteo' },
      '26.31,-80.24',
      LOCATION,
    )
    expect(event).toBeNull()
  })

  it('raises an event once it is unhealthy for sensitive groups', () => {
    const event = airQualityEvent(
      { us_aqi: 118, pm25: 40, pm10: null, ozone: null, dust: null, category: 'USG', source: 'open-meteo' },
      '26.31,-80.24',
      LOCATION,
    )
    expect(event).not.toBeNull()
    expect(event!.severity).toBe('moderate')
    expect(event!.metrics?.aqi).toBe(118)
  })

  it('bands follow the EPA edges', () => {
    expect(aqiBand(50).key).toBe('good')
    expect(aqiBand(101).key).toBe('sensitive')
    expect(aqiBand(151).key).toBe('unhealthy')
    expect(aqiBand(400).key).toBe('hazardous')
  })
})

describe('rain nowcast', () => {
  const base = {
    hazardType: 'precipitation' as const,
    startsInMinutes: 15,
    expectedDurationMinutes: 45,
    intensity: 'moderate' as const,
    precipType: 'rain' as const,
    probability: 0.8,
    confidence: 'medium' as const,
    source: 'open-meteo' as const,
    observedAt: '2026-08-24T12:00:00Z',
  }

  it('alerts on moderate rain starting within the window', () => {
    const event = precipitationEvent({ ...base, eventType: 'rain_starting_soon' }, '26.31,-80.24', LOCATION)
    expect(event).not.toBeNull()
    expect(event!.metrics?.startsInMinutes).toBe(15)
  })

  it('ignores light drizzle', () => {
    const event = precipitationEvent(
      { ...base, eventType: 'rain_starting_soon', intensity: 'light' },
      '26.31,-80.24',
      LOCATION,
    )
    expect(event).toBeNull()
  })

  it('ignores rain that is still an hour out', () => {
    const event = precipitationEvent(
      { ...base, eventType: 'rain_starting_soon', startsInMinutes: 55 },
      '26.31,-80.24',
      LOCATION,
    )
    expect(event).toBeNull()
  })
})

describe('notificationCopy', () => {
  it('writes the change, not the state', () => {
    const before = cyclone('Moke', 'TD', 30)
    const after = cyclone('Moke', 'TS', 46)
    const [t] = detectTransitions({ previous: new Map([[before.id, stored(before)]]), current: [after] })
    const copy = notificationCopy(t, true)
    expect(copy.body).toContain('foi elevado a Tempestade Tropical')
    expect(copy.body).toContain('46 mph')
  })

  it('renders rain intensity in the reader language, not the detection language', () => {
    const event = precipitationEvent(
      {
        hazardType: 'precipitation',
        eventType: 'rain_starting_soon',
        startsInMinutes: 15,
        expectedDurationMinutes: 60,
        intensity: 'moderate',
        precipType: 'rain',
        probability: 0.8,
        confidence: 'medium',
        source: 'open-meteo',
        observedAt: '2026-08-24T12:00:00Z',
      },
      '26.31,-80.24',
      LOCATION,
    )!
    const [t] = detectTransitions({ previous: new Map(), current: [event] })
    expect(notificationCopy(t, false).body).toContain('Moderate rain starting in 15 minutes')
    expect(notificationCopy(t, true).body).toContain('Chuva moderada começando em 15 minutos')
  })

  it('matches the competitor in English for a downgrade', () => {
    const before = cyclone('Lala', 'HU', 105)
    const after = cyclone('Lala', 'HU', 92)
    const [t] = detectTransitions({ previous: new Map([[before.id, stored(before)]]), current: [after] })
    const copy = notificationCopy(t, false)
    expect(copy.body).toContain('has been downgraded to Hurricane Category 1')
    expect(copy.body).toContain('92 mph')
  })
})

describe('quiet hours', () => {
  it('is silent inside a window that wraps midnight', () => {
    // 06:00 UTC at lng -80 → about 01:00 local.
    const at = new Date('2026-08-24T06:00:00Z')
    expect(inQuietHours(at, LOCATION, 22, 7)).toBe(true)
  })

  it('is not silent in the afternoon', () => {
    const at = new Date('2026-08-24T18:00:00Z') // ~13:00 local
    expect(inQuietHours(at, LOCATION, 22, 7)).toBe(false)
  })

  it('is never silent when no window is set', () => {
    const at = new Date('2026-08-24T06:00:00Z')
    expect(inQuietHours(at, LOCATION, null, null)).toBe(false)
  })
})

describe('helpers', () => {
  it('groups nearby coordinates onto one scan key', () => {
    expect(scanKeyFor(26.3112, -80.2401)).toBe(scanKeyFor(26.3149, -80.2437))
    expect(scanKeyFor(26.31, -80.24)).not.toBe(scanKeyFor(25.77, -80.19))
  })

  it('routes every official warning into one preference lane', () => {
    expect(preferenceKey('tornado')).toBe('severe_weather')
    expect(preferenceKey('flood')).toBe('severe_weather')
    expect(preferenceKey('tropical_cyclone')).toBe('tropical_cyclone')
    expect(preferenceKey('earthquake_tsunami')).toBe('earthquake_tsunami')
  })

  it('names a hurricane by its category', () => {
    expect(tropicalStateLabel({ classification: 'HU', category: 3 }, true)).toBe('Furacão Categoria 3')
    expect(tropicalStateLabel({ classification: 'TS' }, false)).toBe('Tropical Storm')
  })
})
