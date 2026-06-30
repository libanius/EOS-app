import { type NextRequest, NextResponse } from 'next/server'
import { getMonitorData } from '@/lib/monitor'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat e lng obrigatórios.' }, { status: 400 })
  }
  const { result, cached } = await getMonitorData(lat, lng)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store', 'X-EOS-Cache': cached ? 'HIT' : 'MISS' },
  })
}
