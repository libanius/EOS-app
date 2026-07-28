/**
 * FEMA National Shelter System — the only shelter source EOS is allowed to use
 * (D-065, resolving the D-051 §5 debt against OpenAI-inferred shelters).
 *
 * Public, keyless, authoritative:
 *   https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0
 *
 * TWO HONESTY RULES ENCODED HERE — do not "improve" them away:
 *
 *  1. AN EMPTY RESULT IS THE NORMAL ANSWER. Shelters only open during an active
 *     disaster; on a calm day the national count is a handful and your state has
 *     none. "No open shelter near you" is correct information, not a failure to
 *     be papered over with a nearest-anything fallback.
 *
 *  2. THE FEED IS THIN. `evacuation_capacity`, `total_population` and `org_name`
 *     are frequently null, and accessibility comes back `UNK`. EOS may state
 *     WHERE a shelter is and WHETHER it is open. It may never promise a bed,
 *     wheelchair access or pet acceptance from this data.
 */

const NSS_ENDPOINT =
  'https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0/query'

/** Nothing beyond this is a realistic destination for a family under stress. */
export const SHELTER_SEARCH_RADIUS_KM = 120

export type ShelterAccessibility = 'yes' | 'no' | 'unknown'

export type Shelter = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  lat: number
  lng: number
  /** Straight-line distance from the requested point, in km. */
  distanceKm: number
  /** Compass bearing from the requested point, in degrees (0 = north). */
  bearing: number
  status: string
  /** null means "the feed did not say" — never render it as a number. */
  capacity: number | null
  occupancy: number | null
  organization: string | null
  wheelchairAccessible: ShelterAccessibility
  acceptsPets: ShelterAccessibility
}

export type ShelterSnapshot = {
  shelters: Shelter[]
  /** True when the source answered but had nothing open nearby — not an error. */
  empty: boolean
  source: 'FEMA National Shelter System'
  fetchedAt: string
  /** Present when the upstream call failed; the UI must say so, not fake data. */
  error?: string
}

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/**
 * Great-circle distance. Pure trigonometry, no network — this is the part of
 * navigation EOS actually owns and that survives total degradation (D-065 §4).
 */
export function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial bearing in degrees, 0–360 (0 = north). Also network-free. */
export function bearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const dLng = toRad(to.lng - from.lng)
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

const COMPASS_PT = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']
const COMPASS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** "nordeste" is more actionable than "47°" when someone is on foot. */
export function compassPoint(degrees: number, pt: boolean) {
  const index = Math.round(((degrees % 360) + 360) % 360 / 45) % 8
  return (pt ? COMPASS_PT : COMPASS_EN)[index]
}

function yesNoUnknown(raw: unknown): ShelterAccessibility {
  const value = String(raw ?? '').trim().toUpperCase()
  if (value === 'Y' || value === 'YES' || value === 'TRUE') return 'yes'
  if (value === 'N' || value === 'NO' || value === 'FALSE' || value === 'NONE') return 'no'
  return 'unknown'
}

function positiveOrNull(raw: unknown): number | null {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

type NssFeature = {
  attributes?: Record<string, unknown>
  geometry?: { x?: number; y?: number }
}

/**
 * Fetch open shelters near a point. Server-side only — the browser never talks
 * to FEMA directly, so the call can be cached and the origin stays ours.
 */
export async function fetchShelters(
  lat: number,
  lng: number,
  radiusKm = SHELTER_SEARCH_RADIUS_KM,
): Promise<ShelterSnapshot> {
  const fetchedAt = new Date().toISOString()
  const base: Omit<ShelterSnapshot, 'shelters' | 'empty'> = {
    source: 'FEMA National Shelter System',
    fetchedAt,
  }

  const params = new URLSearchParams({
    where: "shelter_status = 'OPEN'",
    outFields:
      'objectid,shelter_id,shelter_name,address,city,state,shelter_status,evacuation_capacity,total_population,org_name,wheelchair_accessible,pet_accommodations_code',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  })

  try {
    const response = await fetch(`${NSS_ENDPOINT}?${params}`, {
      // Shelter status changes in minutes during an event, but the feed is
      // national and small — 5 minutes is responsive without hammering FEMA.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) {
      return { ...base, shelters: [], empty: false, error: `FEMA respondeu ${response.status}` }
    }

    const data = (await response.json()) as { features?: NssFeature[]; error?: { message?: string } }
    if (data.error) {
      return { ...base, shelters: [], empty: false, error: data.error.message ?? 'Erro do FEMA' }
    }

    const origin = { lat, lng }
    const shelters = (data.features ?? [])
      .map((feature): Shelter | null => {
        const a = feature.attributes ?? {}
        const x = feature.geometry?.x
        const y = feature.geometry?.y
        if (typeof x !== 'number' || typeof y !== 'number') return null
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null

        const point = { lat: y, lng: x }
        return {
          id: String(a.shelter_id ?? a.objectid ?? `${x},${y}`),
          name: String(a.shelter_name ?? 'Abrigo'),
          address: (a.address as string) || null,
          city: (a.city as string) || null,
          state: (a.state as string) || null,
          lat: y,
          lng: x,
          distanceKm: distanceKm(origin, point),
          bearing: bearing(origin, point),
          status: String(a.shelter_status ?? 'OPEN'),
          capacity: positiveOrNull(a.evacuation_capacity),
          occupancy: positiveOrNull(a.total_population),
          organization: (a.org_name as string) || null,
          wheelchairAccessible: yesNoUnknown(a.wheelchair_accessible),
          acceptsPets: yesNoUnknown(a.pet_accommodations_code),
        }
      })
      .filter((s): s is Shelter => s !== null)
      .filter(s => s.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 10)

    // `empty: true` is a real answer, not a degraded one.
    return { ...base, shelters, empty: shelters.length === 0 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar o FEMA'
    return { ...base, shelters: [], empty: false, error: message }
  }
}
