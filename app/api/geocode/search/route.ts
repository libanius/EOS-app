import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/geocode/search?q=&lat=&lng= — place search for the map (Nominatim).
 *
 * Server-side proxy for three reasons: the User-Agent Nominatim requires cannot
 * be set from a browser, the response can be cached at the edge, and it keeps
 * our origin off OSM's rate-limit radar.
 *
 * IMPORTANT — Nominatim's usage policy forbids autocomplete/typeahead against
 * the public instance and caps traffic at ~1 req/s. This endpoint is therefore
 * SUBMIT-DRIVEN by contract: the client must call it when the user commits a
 * query, never on every keystroke. Wiring a keystroke autocomplete to this route
 * is what gets the whole app blocked.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)'

export type GeocodeResult = {
  id: string
  label: string
  /** Short leading part of the label — the name people actually scan for. */
  name: string
  lat: number
  lng: number
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (query.length < 2) {
    return NextResponse.json({ results: [] as GeocodeResult[] })
  }

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '6',
    addressdetails: '0',
  })

  // Bias results toward the user's area when we know it: "Main Street" should
  // mean the one nearby, not one three states away.
  const lat = Number(request.nextUrl.searchParams.get('lat'))
  const lng = Number(request.nextUrl.searchParams.get('lng'))
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const d = 1.2 // degrees — roughly a regional window
    params.set('viewbox', `${lng - d},${lat + d},${lng + d},${lat - d}`)
    params.set('bounded', '0')
  }

  try {
    const response = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    })
    if (!response.ok) {
      return NextResponse.json({ results: [], error: `Nominatim ${response.status}` }, { status: 200 })
    }

    const raw = (await response.json()) as Array<{
      place_id?: number
      display_name?: string
      lat?: string
      lon?: string
    }>

    const results: GeocodeResult[] = raw
      .map(item => {
        const latitude = Number(item.lat)
        const longitude = Number(item.lon)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
        const label = item.display_name ?? ''
        return {
          id: String(item.place_id ?? `${latitude},${longitude}`),
          label,
          name: label.split(',')[0] || label,
          lat: latitude,
          lng: longitude,
        }
      })
      .filter((r): r is GeocodeResult => r !== null)

    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    )
  } catch {
    return NextResponse.json({ results: [], error: 'Busca indisponível' }, { status: 200 })
  }
}
