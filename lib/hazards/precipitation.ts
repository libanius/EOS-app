import { HAZARD_CONFIG } from './config'
import type {
  MinuteForecast,
  UpcomingPrecipitationResult,
  PrecipIntensity,
  PrecipType,
  HazardSource,
  HazardConfidence,
} from './types'

interface DetectOptions {
  lookAheadMinutes?: number
  minimumProbability?: number // 0-1
  minimumIntensity?: number // mm/h
  source?: HazardSource
  confidence?: HazardConfidence
  now?: number // epoch ms — injectable for tests
}

function intensityBucket(mmH: number): PrecipIntensity {
  const { lightMaxMmH, moderateMaxMmH } = HAZARD_CONFIG.precipitation
  if (mmH <= 0) return 'none'
  if (mmH <= lightMaxMmH) return 'light'
  if (mmH <= moderateMaxMmH) return 'moderate'
  return 'heavy'
}

function dominantType(points: MinuteForecast[]): PrecipType {
  const counts = new Map<PrecipType, number>()
  for (const p of points) counts.set(p.precipType, (counts.get(p.precipType) ?? 0) + 1)
  let best: PrecipType = 'rain'
  let bestN = -1
  for (const [type, n] of Array.from(counts.entries())) {
    if (type === 'unknown') continue
    if (n > bestN) { best = type; bestN = n }
  }
  return bestN >= 0 ? best : 'rain'
}

/**
 * Detect whether precipitation is starting, ongoing, or clearing within the
 * look-ahead window. Pure function over a normalized minute forecast — never
 * asserts certainty ("vai chover"); the caller phrases it as an estimate.
 */
export function detectUpcomingPrecipitation(
  forecast: MinuteForecast[],
  options: DetectOptions = {},
): UpcomingPrecipitationResult {
  const cfg = HAZARD_CONFIG.precipitation
  const lookAhead = options.lookAheadMinutes ?? cfg.lookAheadMinutes
  const minProb = options.minimumProbability ?? cfg.minimumProbability
  const minInt = options.minimumIntensity ?? cfg.minimumIntensityMmH
  const source: HazardSource = options.source ?? 'open-meteo'
  const nowMs = options.now ?? (Date.parse(forecast[0]?.timeIso ?? '') || 0)
  const observedAt = new Date(nowMs || Date.now()).toISOString()

  const inWindow = forecast.filter(p => p.minute >= 0 && p.minute <= lookAhead)

  const isWet = (p: MinuteForecast) =>
    p.precipIntensityMmH >= minInt && p.precipProbabilityPct / 100 >= minProb

  const empty = (eventType: UpcomingPrecipitationResult['eventType']): UpcomingPrecipitationResult => ({
    hazardType: 'precipitation',
    eventType,
    startsInMinutes: null,
    expectedDurationMinutes: null,
    intensity: 'none',
    precipType: 'rain',
    probability: 0,
    confidence: options.confidence ?? 'medium',
    source,
    observedAt,
  })

  if (inWindow.length === 0) return empty('no_precipitation')

  const wetPoints = inWindow.filter(isWet)
  if (wetPoints.length === 0) return empty('no_precipitation')

  const rainingNow = isWet(inWindow[0])
  const firstWet = wetPoints[0]

  // Estimate contiguous duration from the first wet point.
  let duration = 0
  const step = inWindow.length > 1 ? inWindow[1].minute - inWindow[0].minute : 15
  for (const p of inWindow) {
    if (p.minute < firstWet.minute) continue
    if (isWet(p)) duration += step
    else break
  }

  const peakIntensity = Math.max(...wetPoints.map(p => p.precipIntensityMmH))
  const avgProb = wetPoints.reduce((s, p) => s + p.precipProbabilityPct, 0) / wetPoints.length / 100
  const type = dominantType(wetPoints)

  let eventType: UpcomingPrecipitationResult['eventType']
  if (rainingNow) {
    // Ongoing now — is it clearing within the window?
    eventType = isWet(inWindow[inWindow.length - 1]) ? 'rain_ongoing' : 'rain_clearing'
  } else {
    eventType = 'rain_starting_soon'
  }

  return {
    hazardType: 'precipitation',
    eventType,
    startsInMinutes: rainingNow ? 0 : firstWet.minute,
    expectedDurationMinutes: duration || step,
    intensity: intensityBucket(peakIntensity),
    precipType: type,
    probability: Number(avgProb.toFixed(2)),
    confidence: options.confidence ?? 'medium',
    source,
    observedAt,
  }
}
