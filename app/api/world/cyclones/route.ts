import { type NextRequest, NextResponse } from 'next/server'
import { getCyclones } from '@/lib/world/cyclones'

/**
 * GET /api/world/cyclones?lat=&lng= — ciclones ativos com geometria oficial.
 *
 * Proxy no servidor por três motivos: o serviço GIS do NHC não manda CORS
 * confiável, a resposta pode ser cacheada na borda, e assim uma mudança de fonte
 * não vira mudança no cliente.
 *
 * `empty: true` é resposta CORRETA — na maior parte do ano não há ciclone ativo.
 * A UI precisa distinguir isso de "não consegui falar com o NHC", e por isso os
 * dois estados são campos separados desde o provider.
 */
export const revalidate = 300

export async function GET(request: NextRequest) {
  const lat = parseFloat(request.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(request.nextUrl.searchParams.get('lng') ?? '')
  const user = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null

  try {
    const snapshot = await getCyclones(user)
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'cyclones_failed', storms: [], empty: true },
      { status: 200 },
    )
  }
}
