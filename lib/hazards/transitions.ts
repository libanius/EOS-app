// ─── Transition detection (D-220) ─────────────────────────────────────────────
//
// The difference between the EOS and a weather widget is this file.
//
// A widget renders STATE: "there is a Category 1 hurricane". An alert reports
// CHANGE: "Lala was downgraded to a Category 1 hurricane". The second one is
// what makes a phone buzz, because it is the only one that carries news.
//
// Everything here is pure: previous snapshot in, transitions out. No network,
// no database, no clock beyond what is passed in — so the rules that decide
// whether a family gets woken at 3am are testable to the letter.

import { HAZARD_CONFIG } from './config'
import type { HazardEvent, HazardMetrics, HazardSeverity } from './types'

export type TransitionKind =
  | 'formed' // a tropical cyclone that did not exist before
  | 'issued' // an official warning newly in force
  | 'detected' // an observed fact (earthquake) newly reported
  | 'upgraded' // same event, stronger
  | 'downgraded' // same event, weaker
  | 'cleared' // the event is over / no longer returned

export interface HazardTransition {
  kind: TransitionKind
  event: HazardEvent
  /** Human-readable prior state, e.g. "Tropical Depression". Absent for new events. */
  fromState?: string
  /** Human-readable current state, e.g. "Tropical Storm". */
  toState: string
  fromMetrics?: HazardMetrics
  toMetrics?: HazardMetrics
  /** Stable identity of this exact change. Two scans producing the same change
   *  produce the same key — that is what stops the duplicate the competitor
   *  sent twice on two different days. */
  dedupKey: string
}

/** The minimum shape the detector needs from the previous scan. */
export interface StoredHazardState {
  id: string
  severity: HazardSeverity
  eventType: string
  title: string
  hazardType: string
  metrics?: HazardMetrics | null
}

// The audit record is written in the app's base language (English, D-206).
// What a person READS is rendered later, from `metrics`, in their language —
// see notificationCopy. Storing a translated label would freeze one language
// into the database.
const EN = false

const SEVERITY_RANK: Record<HazardSeverity, number> = {
  info: 0,
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
}

// Tropical intensity ladder. A hurricane's Saffir-Simpson category rides on top
// so "Category 2 → Category 1" reads as a downgrade even though both are 'HU'
// and both may carry the same `severity`.
const TROPICAL_RANK: Record<string, number> = {
  RM: 0, // remnants
  PTC: 1, // potential tropical cyclone
  SD: 1, // subtropical depression
  TD: 1, // tropical depression
  STS: 2, // subtropical storm
  TS: 2, // tropical storm
  HU: 3, // hurricane — category adds on top
  MH: 3, // major hurricane — its category (3+) does the separating
}

const TROPICAL_LABEL_PT: Record<string, string> = {
  RM: 'Remanescentes',
  PTC: 'Ciclone Tropical Potencial',
  SD: 'Depressão Subtropical',
  TD: 'Depressão Tropical',
  STS: 'Tempestade Subtropical',
  TS: 'Tempestade Tropical',
  HU: 'Furacão',
  MH: 'Furacão Maior',
}

const TROPICAL_LABEL_EN: Record<string, string> = {
  RM: 'Remnants',
  PTC: 'Potential Tropical Cyclone',
  SD: 'Subtropical Depression',
  TD: 'Tropical Depression',
  STS: 'Subtropical Storm',
  TS: 'Tropical Storm',
  HU: 'Hurricane',
  MH: 'Major Hurricane',
}

/** Name of a cyclone's current state, e.g. "Furacão Categoria 2". */
export function tropicalStateLabel(metrics: HazardMetrics | null | undefined, pt: boolean): string {
  const cls = (metrics?.classification ?? '').toUpperCase()
  const table = pt ? TROPICAL_LABEL_PT : TROPICAL_LABEL_EN
  const base = table[cls] ?? (pt ? 'Ciclone Tropical' : 'Tropical Cyclone')
  if ((cls === 'HU' || cls === 'MH') && metrics?.category) {
    return pt ? `${base} Categoria ${metrics.category}` : `${base} Category ${metrics.category}`
  }
  return base
}

/**
 * A single comparable number for one event's intensity.
 *
 * Tropical cyclones get their own ladder because severity alone is too coarse:
 * a Category 4 and a Category 2 are both `severe`, and collapsing them would
 * make the EOS silent on exactly the change a family needs to hear.
 */
export function intensityRank(state: { severity: HazardSeverity; metrics?: HazardMetrics | null }): number {
  const m = state.metrics
  const cls = (m?.classification ?? '').toUpperCase()
  if (cls && cls in TROPICAL_RANK) {
    const base = TROPICAL_RANK[cls]
    // Hurricanes: 3 + category (1-5) → 4..8, above every non-hurricane rank.
    if (base === 3) return 3 + (m?.category ?? 1)
    return base
  }
  return SEVERITY_RANK[state.severity]
}

/** How a brand-new event should be announced, by where its authority comes from. */
function birthKind(event: HazardEvent): TransitionKind {
  if (event.hazardType === 'tropical_cyclone') return 'formed'
  if (event.authority === 'official') return 'issued'
  return 'detected'
}

/** Human-readable state name for any event type. */
export function stateLabel(
  state: { severity: HazardSeverity; eventType: string; title: string; hazardType: string; metrics?: HazardMetrics | null },
  pt: boolean,
): string {
  if (state.hazardType === 'tropical_cyclone') return tropicalStateLabel(state.metrics, pt)
  if (state.hazardType.startsWith('earthquake')) {
    const mag = state.metrics?.magnitude
    return mag ? `M${mag.toFixed(1)}` : state.title
  }
  if (state.hazardType === 'air_quality') {
    const aqi = state.metrics?.aqi
    return aqi != null ? `AQI ${aqi}` : state.title
  }
  return state.title
}

/**
 * A metric signature that changes only when the reported numbers change. It is
 * what keeps the dedup key stable across scans: re-running the scan on an
 * unchanged storm must produce the key already in the delivery log.
 */
function metricSignature(metrics: HazardMetrics | null | undefined): string {
  if (!metrics) return '-'
  const parts = [
    metrics.classification ?? '',
    metrics.category ?? '',
    metrics.windMph ?? '',
    metrics.magnitude ?? '',
    metrics.aqi ?? '',
  ]
  return parts.join('|')
}

function dedupKeyFor(kind: TransitionKind, event: HazardEvent): string {
  return `${kind}:${event.id}:${event.severity}:${metricSignature(event.metrics)}`
}

export interface DetectOptions {
  /** Events stored by the previous scan, keyed by event id. */
  previous: Map<string, StoredHazardState>
  /** What the providers return right now. */
  current: HazardEvent[]
  /** Ids the previous scan owned for this location, used to spot what vanished.
   *  Only these are eligible to be reported as `cleared` — without it, an event
   *  simply absent from another region's scan would read as "over". */
  ownedIds?: string[]
}

/**
 * Compare two scans and report what actually changed.
 *
 * Unchanged events produce nothing. That silence is the feature: a scan every
 * 10 minutes over a storm that sits still must not notify 144 times a day.
 */
export function detectTransitions({ previous, current, ownedIds }: DetectOptions): HazardTransition[] {
  const transitions: HazardTransition[] = []
  const seen = new Set<string>()

  for (const event of current) {
    seen.add(event.id)
    const prev = previous.get(event.id)

    if (!prev) {
      const kind = birthKind(event)
      transitions.push({
        kind,
        event,
        toState: stateLabel(event, EN),
        toMetrics: event.metrics,
        dedupKey: dedupKeyFor(kind, event),
      })
      continue
    }

    const before = intensityRank(prev)
    const after = intensityRank(event)
    if (after === before) continue

    const kind: TransitionKind = after > before ? 'upgraded' : 'downgraded'
    transitions.push({
      kind,
      event,
      fromState: stateLabel(prev, EN),
      toState: stateLabel(event, EN),
      fromMetrics: prev.metrics ?? undefined,
      toMetrics: event.metrics,
      dedupKey: dedupKeyFor(kind, event),
    })
  }

  // What the previous scan knew about and this one no longer returns is over.
  for (const id of ownedIds ?? []) {
    if (seen.has(id)) continue
    const prev = previous.get(id)
    if (!prev) continue
    // Only events that mattered are worth an all-clear. Nobody needs "the
    // moderate air quality you were never told about has ended".
    if (SEVERITY_RANK[prev.severity] < SEVERITY_RANK.moderate) continue
    transitions.push({
      kind: 'cleared',
      event: {
        id: prev.id,
        sourceEventId: prev.id,
        source: 'eos',
        authority: 'eos_analysis',
        visualClass: 'EOS_RISK_ANALYSIS',
        hazardType: prev.hazardType,
        eventType: prev.eventType,
        title: prev.title,
        summary: '',
        severity: prev.severity,
        urgency: 'future',
        certainty: 'observed',
        metrics: prev.metrics ?? undefined,
        detectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      fromState: stateLabel(prev, EN),
      toState: 'ended',
      fromMetrics: prev.metrics ?? undefined,
      dedupKey: `cleared:${prev.id}:${metricSignature(prev.metrics)}`,
    })
  }

  return transitions
}

/**
 * Is this change worth waking a specific family?
 *
 * Distance is the whole question for tropical cyclones. The competitor pushes
 * "Tropical Storm Iselle has formed in the E. Pacific" to a phone in Florida —
 * that is a choice to be interesting rather than useful. The EOS default is the
 * opposite, and `basinWideTropical` is how someone asks for the other one.
 */
export function isRelevantForUser(
  transition: HazardTransition,
  opts: { basinWideTropical?: boolean } = {},
): boolean {
  const { event } = transition
  if (event.hazardType === 'tropical_cyclone' && !opts.basinWideTropical) {
    const distance = event.distanceMiles
    // No position at all → let it through rather than swallow a real storm.
    if (distance == null) return true
    return distance <= HAZARD_CONFIG.alerting.tropicalRelevanceMiles
  }
  return true
}

/** Changes that outrank quiet hours when the user allows the override. */
export function isCritical(transition: HazardTransition): boolean {
  if (transition.kind === 'cleared' || transition.kind === 'downgraded') return false
  return (
    transition.event.severity === 'extreme' ||
    (transition.event.severity === 'severe' && transition.event.urgency === 'immediate')
  )
}
