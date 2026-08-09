import { type NextRequest, NextResponse } from 'next/server'
import { getWind } from '@/lib/world/wind'

/**
 * GET /api/world/wind?lat=&lng=&span=&grid= — grade de vento.
 *
 * Uma seta só, na casa do usuário, não mostra que o vento gira nem de que lado o
 * mar empurra. São 25 leituras numa requisição única e sem chave (o Open-Meteo
 * aceita listas de coordenadas). O mapa pode pedir uma grade maior do viewport,
 * mas o servidor limita para evitar uma camada "bonita" que vire abuso.
 */
export const revalidate = 600

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(request.nextUrl.searchParams.get('lng') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat e lng são obrigatórios.' }, { status: 400 })
  }
  const span = parseFloat(request.nextUrl.searchParams.get('span') ?? '')
  const grid = parseInt(request.nextUrl.searchParams.get('grid') ?? '', 10)

  try {
    const snapshot = await getWind(
      { lat, lng },
      undefined,
      {
        spanDeg: Number.isFinite(span) ? span : undefined,
        grid: Number.isFinite(grid) ? grid : undefined,
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
