import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type RainViewerFrame = { time: number; path: string }
type RainViewerIndex = {
  version?: string
  generated?: number
  host?: string
  radar?: { past?: RainViewerFrame[]; nowcast?: RainViewerFrame[] }
}

// GET /api/world/radar
// Normalizes RainViewer's public weather-maps index into one latest tile URL.
// The browser still loads radar tiles directly from RainViewer's tile host.
export async function GET() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `RainViewer HTTP ${res.status}` }, { status: 502 })
    }

    const json = (await res.json()) as RainViewerIndex
    const host = json.host
    const frames = json.radar?.past ?? []
    const latest = frames[frames.length - 1]
    if (!host || !latest?.path) {
      return NextResponse.json({ ok: false, error: 'RainViewer radar unavailable' }, { status: 503 })
    }

    return NextResponse.json({
      ok: true,
      provider: 'rainviewer',
      generated: json.generated ?? null,
      frameTime: latest.time,
      // RainViewer docs: {host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png
      // Max native zoom is 7; MapLibre overzooms above that.
      tileUrl: `${host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`,
      attribution: 'RainViewer',
    }, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    const message = err instanceof Error && err.name === 'TimeoutError'
      ? 'RainViewer timeout'
      : 'RainViewer network error'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
