import { HAZARD_CONFIG } from '../config'
import type {
  Coordinates,
  HazardEvent,
  HazardSeverity,
  HazardUrgency,
  HazardCertainty,
  HazardClass,
} from '../types'
import type { HazardEventProvider, ProviderResult } from './interfaces'

const UA = 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)'

interface NwsProps {
  '@id'?: string
  id?: string
  event?: string
  headline?: string
  description?: string
  instruction?: string
  severity?: string
  urgency?: string
  certainty?: string
  effective?: string
  onset?: string
  expires?: string
  ends?: string
  sent?: string
  areaDesc?: string
  senderName?: string
  parameters?: Record<string, unknown>
}

interface NwsFeature {
  id?: string
  geometry?: unknown
  properties: NwsProps
}

function severity(s?: string): HazardSeverity {
  switch ((s ?? '').toLowerCase()) {
    case 'extreme': return 'extreme'
    case 'severe': return 'severe'
    case 'moderate': return 'moderate'
    case 'minor': return 'minor'
    default: return 'info'
  }
}

function urgency(u?: string): HazardUrgency {
  switch ((u ?? '').toLowerCase()) {
    case 'immediate': return 'immediate'
    case 'expected': return 'expected'
    default: return 'future'
  }
}

function certainty(c?: string): HazardCertainty {
  switch ((c ?? '').toLowerCase()) {
    case 'observed': return 'observed'
    case 'likely': return 'likely'
    default: return 'possible'
  }
}

/** Classify an NWS event name into the UI visual class (section 4). */
export function nwsVisualClass(event: string, sev: HazardSeverity): HazardClass {
  const e = event.toLowerCase()
  if (e.includes('warning')) return 'OFFICIAL_WARNING'
  if (e.includes('watch')) return 'WATCH'
  if (e.includes('advisory') || e.includes('statement')) return 'ADVISORY'
  return sev === 'extreme' || sev === 'severe' ? 'OFFICIAL_WARNING' : 'ADVISORY'
}

function splitInstructions(instruction?: string): string[] | undefined {
  if (!instruction) return undefined
  const parts = instruction.split(/\n\n+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return parts.length ? parts : undefined
}

export function normalizeNwsFeature(f: NwsFeature): HazardEvent {
  const p = f.properties
  const event = p.event ?? 'Weather Alert'
  const sev = severity(p.severity)
  const sourceEventId = p.id ?? p['@id'] ?? f.id ?? `nws-${event}-${p.sent ?? ''}`
  return {
    id: `nws:${sourceEventId}`,
    sourceEventId,
    source: 'nws',
    authority: 'official',
    visualClass: nwsVisualClass(event, sev),
    hazardType: event.toLowerCase().replace(/\s+/g, '_'),
    eventType: event,
    title: p.headline ?? event,
    summary: p.description?.replace(/\s+/g, ' ').trim() ?? p.headline ?? event,
    instructions: splitInstructions(p.instruction),
    severity: sev,
    urgency: urgency(p.urgency),
    certainty: certainty(p.certainty),
    geometry: f.geometry ?? undefined,
    startsAt: p.onset ?? p.effective ?? undefined,
    endsAt: p.ends ?? p.expires ?? undefined,
    detectedAt: p.sent ?? p.effective ?? new Date().toISOString(),
    updatedAt: p.sent ?? new Date().toISOString(),
    expiresAt: p.expires ?? undefined,
    officialUrl: p['@id'],
    rawPayloadReference: sourceEventId,
  }
}

/**
 * Deduplicate by official ID, keeping the most recently updated version.
 * NWS re-issues alerts with a new `sent` timestamp when they change.
 */
export function dedupeEvents(events: HazardEvent[]): HazardEvent[] {
  const byId = new Map<string, HazardEvent>()
  for (const e of events) {
    const existing = byId.get(e.sourceEventId)
    if (!existing || Date.parse(e.updatedAt) >= Date.parse(existing.updatedAt)) {
      byId.set(e.sourceEventId, e)
    }
  }
  return Array.from(byId.values())
}

export const nwsProvider: HazardEventProvider = {
  source: 'nws',
  isConfigured: () => true, // keyless
  async getEvents(location: Coordinates): Promise<ProviderResult<HazardEvent[]>> {
    const started = Date.now()
    try {
      const res = await fetch(
        `https://api.weather.gov/alerts/active?point=${location.lat},${location.lng}`,
        { headers: { 'User-Agent': UA, Accept: 'application/geo+json' }, signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs) },
      )
      if (!res.ok) {
        return { provider: 'nws', status: 'degraded', data: [], latencyMs: Date.now() - started, message: `HTTP ${res.status}` }
      }
      const json = (await res.json()) as { features?: NwsFeature[] }
      const events = dedupeEvents((json.features ?? []).map(normalizeNwsFeature))
      return {
        provider: 'nws',
        status: 'live',
        data: events,
        latencyMs: Date.now() - started,
        lastSuccessAt: new Date().toISOString(),
        dataAgeSeconds: 0,
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error'
      return { provider: 'nws', status: 'offline', data: [], latencyMs: Date.now() - started, message }
    }
  },
}
