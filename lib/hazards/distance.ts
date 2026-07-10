import type { Coordinates } from './types'

const EARTH_RADIUS_MILES = 3958.7613

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in miles between two coordinates (haversine). */
export function haversineMiles(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** Initial bearing from `from` to `to`, as a 16-point compass label. */
export function compassBearing(from: Coordinates, to: Coordinates): string {
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat))
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng))
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  const normalized = (deg + 360) % 360
  return COMPASS[Math.round(normalized / 22.5) % 16]
}
