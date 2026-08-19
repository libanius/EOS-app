import type { CirclePlace, PointPrecision, WaypointKind } from './family-plan'
import { distanceKm } from './world/shelters'

export const POINT_PRECISIONS: PointPrecision[] = ['gps', 'address', 'city', 'unknown']
export const CONFIRMED_POINT_PRECISIONS: Exclude<PointPrecision, 'unknown'>[] = ['gps', 'address', 'city']

export function normalizePointPrecision(value: unknown): PointPrecision | null {
  return POINT_PRECISIONS.includes(value as PointPrecision) ? value as PointPrecision : null
}

export function placeKindForWaypoint(kind: WaypointKind): CirclePlace['kind'] {
  if (kind === 'home' || kind === 'school' || kind === 'work') return kind
  if (kind.startsWith('rendezvous_')) return 'rendezvous'
  return 'custom'
}

export function shouldVersionPlansForPlaceMove(
  before: Pick<CirclePlace, 'lat' | 'lng'>,
  after: Pick<CirclePlace, 'lat' | 'lng'>,
): boolean {
  return distanceKm(before, after) * 1000 > 50
}
