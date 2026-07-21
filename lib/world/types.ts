/**
 * Hybrid World Dashboard — normalized UI contracts (doc 16 §23.3).
 * Components consume these EOS-owned shapes, never raw provider payloads.
 * HWD-01 uses mock data for family/route; every mock is labeled in the UI.
 */

export type WorldConfidence = 'exact' | 'approximate' | 'semantic' | 'unknown'

export type WorldLocation = {
  id: string
  label: string
  coordinates: [number, number] // [lng, lat]
  confidence: WorldConfidence
  updatedAt: string | null
}

export type FamilyStatus = 'green' | 'amber' | 'red' | 'gray'

export type WorldFamilyMarker = {
  id: string
  name: string
  semanticLocation: string // e.g. "HOME", "SCHOOL", "SITE"
  status: FamilyStatus
  updatedLabel: string | null
  mock: boolean
  /** normalized position on the background plate, 0..1 (x from left, y from top) */
  plate: { x: number; y: number }
}

export type WorldRouteStatus = 'mock' | 'recommended' | 'alternate' | 'blocked'

export type WorldRoute = {
  id: string
  status: WorldRouteStatus
  destinationLabel: string
  distanceMi?: number
  durationMin?: number
  reasons: string[]
  /** polyline over the background plate, normalized 0..1 points */
  plate: Array<{ x: number; y: number }>
}
