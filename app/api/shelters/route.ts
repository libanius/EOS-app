import { type NextRequest, NextResponse } from 'next/server'
import { fetchShelters } from '@/lib/world/shelters'

/**
 * GET /api/shelters?lat=&lng= — open shelters near a point (D-065).
 *
 * Server-side proxy so the browser never calls FEMA directly: keeps the origin
 * ours, lets Next cache the upstream response, and means a FEMA outage degrades
 * in one place instead of in every client.
 *
 * An empty list with `empty: true` is a SUCCESSFUL response — shelters only open
 * during an active disaster. Callers must render "no open shelter nearby", never
 * treat it as a failure and never substitute a nearest-anything fallback.
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get('lat'))
  const lng = Number(request.nextUrl.searchParams.get('lng'))

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'Coordenadas inválidas.' }, { status: 400 })
  }

  const snapshot = await fetchShelters(lat, lng)
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
