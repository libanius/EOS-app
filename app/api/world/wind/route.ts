import { type NextRequest, NextResponse } from 'next/server'
import { getWind } from '@/lib/world/wind'

/**
 * GET /api/world/wind?lat=&lng=&span=&latSpan=&lngSpan=&grid=&forecastHours=&model= — grade de vento.
 *
 * Uma seta só, na casa do usuário, não mostra que o vento gira nem de que lado o
 * mar empurra. O Open-Meteo aceita listas de coordenadas. A grade padrão é
 * local; a camada animada pode pedir uma grade maior do viewport, limitada no
 * provider.
 */
export const revalidate = 600

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(request.nextUrl.searchParams.get('lng') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat e lng são obrigatórios.' }, { status: 400 })
  }
  const span = parseFloat(request.nextUrl.searchParams.get('span') ?? '')
  const latSpan = parseFloat(request.nextUrl.searchParams.get('latSpan') ?? '')
  const lngSpan = parseFloat(request.nextUrl.searchParams.get('lngSpan') ?? '')
  const grid = parseInt(request.nextUrl.searchParams.get('grid') ?? '', 10)
  const forecastHours = parseInt(request.nextUrl.searchParams.get('forecastHours') ?? '', 10)
  const model = request.nextUrl.searchParams.get('model') ?? ''
  const cellSelection = request.nextUrl.searchParams.get('cellSelection') ?? ''

  try {
    const snapshot = await getWind(
      { lat, lng },
      undefined,
      {
        spanDeg: Number.isFinite(span) ? span : undefined,
        latSpanDeg: Number.isFinite(latSpan) ? latSpan : undefined,
        lngSpanDeg: Number.isFinite(lngSpan) ? lngSpan : undefined,
        grid: Number.isFinite(grid) ? grid : undefined,
        forecastHours: Number.isFinite(forecastHours) ? forecastHours : undefined,
        model: model || undefined,
        cellSelection: cellSelection === 'land' || cellSelection === 'sea' || cellSelection === 'nearest' ? cellSelection : undefined,
      },
    )
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'wind_failed', readings: [], atUser: null },
      { status: 200 },
    )
  }
}
