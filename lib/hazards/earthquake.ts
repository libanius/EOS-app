import { HAZARD_CONFIG } from './config'
import type { HazardSeverity } from './types'

export interface EarthquakeRelevance {
  relevant: boolean
  reason:
    | 'tsunami_flag'
    | 'moderate_nearby'
    | 'significant_regional'
    | 'large_distant'
    | 'not_relevant'
  severity: HazardSeverity
}

interface EarthquakeInput {
  magnitude: number
  distanceMiles: number
  tsunami: boolean
}

/**
 * Configurable relevance for a detected earthquake (section D). USGS reports
 * detected/confirmed events — this never implies prediction.
 */
export function classifyEarthquake({ magnitude, distanceMiles, tsunami }: EarthquakeInput): EarthquakeRelevance {
  const c = HAZARD_CONFIG.earthquake

  if (tsunami) {
    return { relevant: true, reason: 'tsunami_flag', severity: 'extreme' }
  }
  if (distanceMiles <= c.nearbyRadiusMiles && magnitude >= c.nearbyMinMagnitude) {
    return { relevant: true, reason: 'moderate_nearby', severity: magnitude >= 6 ? 'severe' : 'moderate' }
  }
  if (distanceMiles <= c.regionalRadiusMiles && magnitude >= c.regionalMinMagnitude) {
    return { relevant: true, reason: 'significant_regional', severity: 'severe' }
  }
  if (magnitude >= c.distantMinMagnitude) {
    return { relevant: true, reason: 'large_distant', severity: 'severe' }
  }
  return { relevant: false, reason: 'not_relevant', severity: 'minor' }
}
