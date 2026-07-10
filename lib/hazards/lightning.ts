import { HAZARD_CONFIG } from './config'
import type { LightningStrike, LightningAnalysis, LightningThreat } from './types'

/** Map the nearest strike distance to a configured threat level. */
export function threatForDistance(nearestMiles: number | null): LightningThreat {
  if (nearestMiles === null) return 'clear'
  const c = HAZARD_CONFIG.lightning
  if (nearestMiles < c.immediateDangerMiles) return 'immediate_danger'
  if (nearestMiles < c.stopActivityMiles) return 'stop_activity'
  if (nearestMiles < c.elevatedMiles) return 'elevated'
  if (nearestMiles < c.attentionMiles) return 'attention'
  return 'clear'
}

interface AnalyzeOptions {
  now?: number // epoch ms — injectable for tests
  bearingFromUser?: string | null
}

/**
 * Analyze recent strikes into a threat assessment. Pure over the strike list;
 * the caller supplies distances (computed from the user location) and bearing.
 */
export function analyzeStrikes(strikes: LightningStrike[], options: AnalyzeOptions = {}): LightningAnalysis {
  const now = options.now ?? Date.now()
  const observedAt = new Date(now).toISOString()
  const minutesAgo = (iso: string) => (now - Date.parse(iso)) / 60_000

  const within = (mins: number) => strikes.filter(s => minutesAgo(s.occurredAt) <= mins && minutesAgo(s.occurredAt) >= 0)

  const counts = {
    last5: within(5).length,
    last10: within(10).length,
    last15: within(15).length,
    last30: within(30).length,
  }

  if (strikes.length === 0) {
    return {
      threat: 'clear',
      nearestMiles: null,
      counts,
      trend: 'unknown',
      minutesSinceLast: null,
      bearingFromUser: null,
      observedAt,
    }
  }

  const nearestMiles = Math.min(...strikes.map(s => s.distanceMiles))
  const mostRecent = strikes.reduce((a, b) => (Date.parse(a.occurredAt) > Date.parse(b.occurredAt) ? a : b))
  const minutesSinceLast = Math.max(0, Math.round(minutesAgo(mostRecent.occurredAt)))

  // Trend: compare mean distance of the older half vs the recent half of the window.
  const w = HAZARD_CONFIG.lightning.trendWindowMinutes
  const recent = strikes.filter(s => minutesAgo(s.occurredAt) <= w / 2 && minutesAgo(s.occurredAt) >= 0)
  const older = strikes.filter(s => minutesAgo(s.occurredAt) > w / 2 && minutesAgo(s.occurredAt) <= w)
  let trend: LightningAnalysis['trend'] = 'unknown'
  if (recent.length && older.length) {
    const mean = (arr: LightningStrike[]) => arr.reduce((s, x) => s + x.distanceMiles, 0) / arr.length
    const diff = mean(recent) - mean(older)
    trend = Math.abs(diff) < 1 ? 'steady' : diff < 0 ? 'approaching' : 'receding'
  } else if (recent.length && !older.length) {
    trend = 'approaching'
  }

  return {
    threat: threatForDistance(nearestMiles),
    nearestMiles: Number(nearestMiles.toFixed(1)),
    counts,
    trend,
    minutesSinceLast,
    bearingFromUser: options.bearingFromUser ?? null,
    observedAt,
  }
}
