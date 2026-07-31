import { type NextRequest, NextResponse } from 'next/server'
import { getWind } from '@/lib/world/wind'

/**
 * GET /api/world/wind?lat=&lng= — grade de vento em volta da pessoa.
 *
 * Uma seta só, na casa do usuário, não mostra que o vento gira nem de que lado o
 * mar empurra. São 25 leituras numa requisição única e sem chave (o Open-Meteo
 * aceita listas de coordenadas).
 */
export const revalidate = 600

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(request.nextUrl.searchParams.get('lng') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat e lng são obrigatórios.' }, { status: 400 })
  }

  try {
    const snapshot = await getWind({ lat, lng })
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
