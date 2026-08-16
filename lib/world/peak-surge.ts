/**
 * Peak Storm Surge Forecast do NHC/CPHC (D-200).
 *
 * Isto NÃO é o mesmo que "alerta contém storm surge". O NHC publica um produto
 * próprio em KML (`*_PeakStormSurge_*adv.kml`) com polígonos de inundação
 * esperada, como "Hawaii...1-3 ft". O mapa precisa desse KML para o botão Surge
 * significar uma camada operacional, não só um filtro textual de alerta.
 */

const CURRENT_STORMS = 'https://www.nhc.noaa.gov/CurrentStorms.json'
const NHC = 'https://www.nhc.noaa.gov'

type ActiveStorm = {
  id?: string
  name?: string
  publicAdvisory?: { advNum?: string }
}

export type PeakSurgeSnapshot = {
  source: 'NOAA National Hurricane Center / Central Pacific Hurricane Center'
  fetchedAt: string
  features: GeoJSON.FeatureCollection
  storms: Array<{ id: string; name: string; advisory: string | null; kmlUrl: string | null }>
  empty: boolean
  missing?: string[]
  error?: string
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function textBetween(input: string, start: string, end: string): string | null {
  const a = input.indexOf(start)
  if (a < 0) return null
  const b = input.indexOf(end, a + start.length)
  if (b < 0) return null
  return input.slice(a + start.length, b)
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function parseDescription(value: string | null): Record<string, unknown> {
  if (!value) return {}
  const decoded = decodeXml(value).trim()
  if (!decoded) return {}
  try {
    const parsed = JSON.parse(decoded) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function parseCoordinates(value: string | null): Array<[number, number]> {
  if (!value) return []
  return value
    .trim()
    .split(/\s+/)
    .map(part => {
      const [lng, lat] = part.split(',').map(Number)
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] as [number, number] : null
    })
    .filter((point): point is [number, number] => point !== null)
}

function closeRing(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length < 3) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

function bboxFor(rings: Array<Array<[number, number]>>): [number, number, number, number] | null {
  const points = rings.flat()
  if (!points.length) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }
  return [minLng, minLat, maxLng, maxLat]
}

function centreOf(rings: Array<Array<[number, number]>>): [number, number] | null {
  const box = bboxFor(rings)
  return box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : null
}

export function peakSurgeKmlToGeoJson(kml: string, meta: { stormId: string; stormName: string; kmlUrl: string }): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const placemarks = kml.match(/<Placemark\b[\s\S]*?<\/Placemark>/g) ?? []

  for (const placemark of placemarks) {
    const name = decodeXml(textBetween(placemark, '<name>', '</name>') ?? '').trim()
    const description = parseDescription(textBetween(placemark, '<description>', '</description>'))
    const peakRange = String(description.peak_surge_range ?? name.split('...').pop() ?? '').trim()
    const color = String(description.color ?? 'blue')
    const polygons = placemark.match(/<Polygon\b[\s\S]*?<\/Polygon>/g) ?? []

    polygons.forEach((polygon, index) => {
      const outerBlock = textBetween(polygon, '<outerBoundaryIs>', '</outerBoundaryIs>')
      const outer = closeRing(parseCoordinates(textBetween(outerBlock ?? '', '<coordinates>', '</coordinates>')))
      if (outer.length < 4) return

      const rings: Array<Array<[number, number]>> = [outer]
      const innerBlocks = polygon.match(/<innerBoundaryIs>[\s\S]*?<\/innerBoundaryIs>/g) ?? []
      for (const innerBlock of innerBlocks) {
        const inner = closeRing(parseCoordinates(textBetween(innerBlock, '<coordinates>', '</coordinates>')))
        if (inner.length >= 4) rings.push(inner)
      }

      const center = centreOf(rings)
      features.push({
        type: 'Feature',
        id: `${meta.stormId}-peak-surge-${features.length}`,
        geometry: { type: 'Polygon', coordinates: rings },
        properties: {
          source: 'NOAA NHC/CPHC Peak Storm Surge Forecast',
          stormId: meta.stormId,
          stormName: meta.stormName,
          name,
          label: peakRange || name,
          peak_surge_range: peakRange || null,
          color,
          kmlUrl: meta.kmlUrl,
          part: index,
          centerLng: center?.[0] ?? null,
          centerLat: center?.[1] ?? null,
        },
      })
    })
  }

  return { type: 'FeatureCollection', features }
}

function stormCode(storm: ActiveStorm): string | null {
  const id = String(storm.id ?? '').trim()
  return /^[a-z]{2}\d{6}$/i.test(id) ? id.toUpperCase() : null
}

function directKmlUrl(code: string, advisory: string | null): string | null {
  if (!advisory) return null
  const adv = advisory.padStart(3, '0').replace(/[^0-9A-Z]/gi, '')
  return adv ? `${NHC}/gis/peakSurge/${code}_PeakStormSurge_${adv}adv.kml` : null
}

async function okUrl(url: string, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(url, { method: 'HEAD', signal, cache: 'no-store' }).catch(() => null)
  if (response?.ok) return true
  const fallback = await fetch(url, { signal, cache: 'no-store' }).catch(() => null)
  return Boolean(fallback?.ok)
}

async function latestArchiveKmlUrl(code: string, signal?: AbortSignal): Promise<string | null> {
  const year = code.slice(4, 8).slice(2)
  const basinId = code.slice(0, 4).toLowerCase()
  const url = `${NHC}/gis/archive_peakSurge_results.php?id=${basinId}&year=${year}&name=${encodeURIComponent(code)}`
  const response = await fetch(url, { signal, next: { revalidate: 300 } }).catch(() => null)
  if (!response?.ok) return null
  const html = await response.text()
  const matches: string[] = []
  const pattern = new RegExp(`href=["']([^"']*${code}_PeakStormSurge_[^"']*?adv\\.kml)["']`, 'gi')
  let match = pattern.exec(html)
  while (match) {
    matches.push(decodeXml(match[1]))
    match = pattern.exec(html)
  }
  if (!matches.length) return null
  const latest = matches[matches.length - 1]
  return latest.startsWith('http') ? latest : `${NHC}/gis/${latest.replace(/^\//, '')}`
}

async function kmlUrlFor(storm: ActiveStorm, signal?: AbortSignal): Promise<string | null> {
  const code = stormCode(storm)
  if (!code) return null
  const advisory = String(storm.publicAdvisory?.advNum ?? '').trim() || null
  const direct = directKmlUrl(code, advisory)
  if (direct && await okUrl(direct, signal)) return direct
  return latestArchiveKmlUrl(code, signal)
}

export async function getPeakSurge(signal?: AbortSignal): Promise<PeakSurgeSnapshot> {
  const fetchedAt = new Date().toISOString()
  const response = await fetch(CURRENT_STORMS, { signal, next: { revalidate: 300 } }).catch(() => null)
  if (!response?.ok) {
    return {
      source: 'NOAA National Hurricane Center / Central Pacific Hurricane Center',
      fetchedAt,
      features: EMPTY_FC,
      storms: [],
      empty: true,
      error: 'nhc_current_storms_unreachable',
    }
  }

  const payload = (await response.json().catch(() => null)) as { activeStorms?: ActiveStorm[] } | null
  const active = payload?.activeStorms ?? []
  const features: GeoJSON.Feature[] = []
  const storms: PeakSurgeSnapshot['storms'] = []
  const missing: string[] = []

  for (const storm of active) {
    const code = stormCode(storm)
    if (!code) continue
    const stormName = String(storm.name ?? code)
    const kmlUrl = await kmlUrlFor(storm, signal)
    storms.push({
      id: code,
      name: stormName,
      advisory: String(storm.publicAdvisory?.advNum ?? '').trim() || null,
      kmlUrl,
    })
    if (!kmlUrl) {
      missing.push(code)
      continue
    }
    const kmlResponse = await fetch(kmlUrl, { signal, next: { revalidate: 300 } }).catch(() => null)
    if (!kmlResponse?.ok) {
      missing.push(code)
      continue
    }
    const collection = peakSurgeKmlToGeoJson(await kmlResponse.text(), {
      stormId: code,
      stormName,
      kmlUrl,
    })
    features.push(...collection.features)
  }

  return {
    source: 'NOAA National Hurricane Center / Central Pacific Hurricane Center',
    fetchedAt,
    features: { type: 'FeatureCollection', features },
    storms,
    empty: features.length === 0,
    missing,
  }
}
