import { type NextRequest, NextResponse } from 'next/server'
import { getHazardNetwork } from '@/lib/hazards/network'

export const runtime = 'nodejs'

// GET /api/hazards?lat=..&lng=.. → unified hazard events + real channel health.
// Keyless providers are live; credentialed ones report their true state.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const force = searchParams.get('force') === '1'
  try {
    const snapshot = await getHazardNetwork({ lat, lng }, { force })
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'hazard network error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
