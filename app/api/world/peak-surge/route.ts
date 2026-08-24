import { NextResponse } from 'next/server'
import { getPeakSurge } from '@/lib/world/peak-surge'

/**
 * GET /api/world/peak-surge — Peak Storm Surge Forecast oficial do NHC/CPHC.
 *
 * Proxy no servidor porque o produto é KML e porque a descoberta do arquivo
 * mais recente passa por páginas/arquivos da NOAA que não devem ser acoplados
 * ao cliente.
 */
export const revalidate = 300

export async function GET() {
  try {
    const snapshot = await getPeakSurge()
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (error) {
    return NextResponse.json(
      {
        source: 'NOAA National Hurricane Center / Central Pacific Hurricane Center',
        fetchedAt: new Date().toISOString(),
        features: { type: 'FeatureCollection', features: [] },
        storms: [],
        empty: true,
        error: error instanceof Error ? error.message : 'peak_surge_failed',
      },
      { status: 200 },
    )
  }
}
