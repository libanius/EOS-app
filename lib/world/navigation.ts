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
