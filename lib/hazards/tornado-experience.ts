/** Deterministic tornado UX state; never infer an all-clear from a check-in. */
export type TornadoPhase = 'watch' | 'warning' | 'shelter' | 'ended'
export type TornadoEvent = {
  id: string
  event: string
  expiresAt: string
  polygon?: GeoJSONPolygon | null
}
export type GeoJSONPolygon = { type: 'Polygon'; coordinates: number[][][] }
export function tornadoPhase(event: string, expired: boolean, sheltered: boolean): TornadoPhase | null {
  if (!/tornado (watch|warning)/i.test(event)) return null
  if (expired) return 'ended'
  if (/warning/i.test(event)) return sheltered ? 'shelter' : 'warning'
  return 'watch'
}
export function tornadoInstructions(phase: TornadoPhase): readonly string[] {
  switch (phase) {
    case 'watch': return ['Identify an interior shelter now.', 'Charge your phone and monitor official updates.']
    case 'warning': return ['Seek shelter immediately in a sturdy building.', 'Go to the lowest floor, into an interior room away from windows.', 'Protect your head and neck. Avoid vehicles and mobile homes.']
    case 'shelter': return ['Remain sheltered while the warning is active.', 'Your check-in does not cancel the official warning.']
    case 'ended': return ['Check for new official warnings before leaving shelter.', 'Avoid damaged structures and downed power lines.']
  }
}
export function validOfficialPolygon(value: unknown): value is GeoJSONPolygon {
  if (!value || typeof value !== 'object') return false
  const polygon = value as Partial<GeoJSONPolygon>
  return polygon.type === 'Polygon' && Array.isArray(polygon.coordinates) &&
    polygon.coordinates.length > 0 &&
    polygon.coordinates.every(ring => Array.isArray(ring) && ring.length >= 4 &&
      ring.every(point => Array.isArray(point) && point.length >= 2 &&
        Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90))
}
