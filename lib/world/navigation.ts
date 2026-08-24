/**
 * Navigation adapter (D-065).
 *
 * EOS deliberately does NOT compute road routes. A hosted routing API dies the
 * moment the network does — which is exactly when a family needs to move — and a
 * confident line drawn over a flooded, closed road is the same class of error as
 * the fictional shelter this decision removed.
 *
 * So navigation is split in two:
 *
 *   ON-DEVICE (always works)  → bearing + distance, from lib/world/shelters.
 *   HANDOFF (needs network)   → the phone's own maps app, which has live traffic
 *                               and closures EOS will never have.
 *
 * The `RouteProvider` interface below is the seam. Today the only implementation
 * is the handoff. When the native app ships an embedded engine (Valhalla /
 * GraphHopper, roadmap phase M), it registers here and no UI changes.
 */

export type LatLng = { lat: number; lng: number }
export type TravelMode = 'driving' | 'walking'

export type RouteProvider = {
  id: string
  /** Whether this provider can produce a drawable geometry at all. */
  canDrawGeometry: boolean
  /** Whether it keeps working with no network. */
  worksOffline: boolean
}

/** The only provider that exists today. Intentionally draws nothing. */
export const HANDOFF_PROVIDER: RouteProvider = {
  id: 'device-maps-handoff',
  canDrawGeometry: false,
  worksOffline: false,
}

/**
 * Build a directions URL for the device's own maps app.
 *
 * Apple Maps is preferred on Apple platforms because it is the system default
 * there and supports downloaded offline regions; everything else gets Google
 * Maps' universal URL. Either way EOS is handing the user to a tool that knows
 * about the road, and saying so.
 */
export function directionsUrl(destination: LatLng, label?: string): string {
  const { lat, lng } = destination
  const isApple =
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) &&
    !/Android/.test(navigator.userAgent)

  if (isApple) {
    const name = label ? `&q=${encodeURIComponent(label)}` : ''
    return `https://maps.apple.com/?daddr=${lat},${lng}${name}&dirflg=d`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

function pointParam(point: LatLng): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`
}

function samePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001
}

function dedupeConsecutive(points: LatLng[]): LatLng[] {
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]))
}

function sampleInterior(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points
  if (max <= 0) return []
  const sampled: LatLng[] = []
  const step = (points.length - 1) / (max - 1)
  for (let i = 0; i < max; i += 1) {
    sampled.push(points[Math.round(i * step)])
  }
  return dedupeConsecutive(sampled)
}

/**
 * Google Maps handoff for an EOS route with ordered stops.
 *
 * This does not compute roads inside EOS. It passes the family-agreed sequence
 * to Google Maps, which then calculates streets, ETA and turn-by-turn. The URL
 * budget is intentionally conservative because mobile browsers and app bridges
 * are less forgiving than desktop Chrome.
 */
export function googleMapsRouteUrl(
  points: LatLng[],
  opts: { travelMode?: TravelMode; maxWaypoints?: number } = {},
): string | null {
  const clean = dedupeConsecutive(points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)))
  if (clean.length < 2) return null

  const travelMode = opts.travelMode ?? 'driving'
  const maxWaypoints = opts.maxWaypoints ?? 8
  const origin = clean[0]
  const destination = clean[clean.length - 1]
  const interior = sampleInterior(clean.slice(1, -1), maxWaypoints)

  const params = new URLSearchParams({
    api: '1',
    origin: pointParam(origin),
    destination: pointParam(destination),
    travelmode: travelMode,
  })
  if (interior.length) params.set('waypoints', interior.map(pointParam).join('|'))

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function googleMapsRouteUrlFromLineString(
  geometry: unknown,
  mode: 'foot' | 'car' | undefined,
): string | null {
  const coords = (geometry as { type?: string; coordinates?: unknown } | null)?.coordinates
  if (!Array.isArray(coords)) return null
  const points = coords
    .filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
    .map(([lng, lat]) => ({ lat, lng }))
  return googleMapsRouteUrl(points, { travelMode: mode === 'foot' ? 'walking' : 'driving' })
}

/** Human distance. Under a km, metres are what someone on foot can act on. */
export function formatDistance(km: number, metric: boolean): string {
  if (!Number.isFinite(km)) return '—'
  if (metric) {
    if (km < 1) return `${Math.round(km * 1000)} m`
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
  }
  const miles = km * 0.621371
  if (miles < 0.2) return `${Math.round(miles * 5280)} ft`
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}

/**
 * Rough walking time at 4.5 km/h — the pace of an adult with a child and a bag,
 * not a fit adult on a track. Deliberately pessimistic: a family that arrives
 * early is fine, a family that planned on 5 km/h and arrives after dark is not.
 */
export function walkingMinutes(km: number): number {
  return Math.round((km / 4.5) * 60)
}
