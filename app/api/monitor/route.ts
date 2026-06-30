import { type NextRequest, NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'CRITICAL' | 'HIGH' | 'WATCH' | 'MODERATE' | 'CLEAR'

interface MonitorAlert {
  source: string
  type: string
  severity: Severity
  headline: string
  expires: string | null
  url: string | null
}

interface MonitorStatus {
  weather: Severity
  earthquake: Severity
}

interface MonitorResponse {
  location: { lat: number; lng: number }
  alerts: MonitorAlert[]
  status: MonitorStatus
  cached_at: string
}

// ─── Severity normalisation ───────────────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, WATCH: 2, MODERATE: 1, CLEAR: 0 }

function maxSeverity(...levels: Severity[]): Severity {
  return levels.reduce((a, b) => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b), 'CLEAR')
}

function nwsSeverityToEos(nwsSeverity: string | undefined, nwsCertainty: string | undefined): Severity {
  const s = (nwsSeverity ?? '').toLowerCase()
  const c = (nwsCertainty ?? '').toLowerCase()
  if (s === 'extreme') return 'CRITICAL'
  if (s === 'severe' && c === 'observed') return 'CRITICAL'
  if (s === 'severe') return 'HIGH'
  if (s === 'moderate') return 'WATCH'
  if (s === 'minor') return 'MODERATE'
  return 'MODERATE'
}

function usgsmagToEos(mag: number): Severity {
  if (mag >= 7.0) return 'CRITICAL'
  if (mag >= 5.5) return 'HIGH'
  if (mag >= 4.0) return 'WATCH'
  return 'MODERATE'
}

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Serverless: survives within one warm instance. Redis can replace this later.

interface CacheEntry { data: MonitorResponse; expiresAt: number }
const cache = new Map<string, CacheEntry>()

function cacheGet(key: string): MonitorResponse | null {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) return null
  return entry.data
}

function cacheSet(key: string, data: MonitorResponse, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// ─── NWS Weather (api.weather.gov) ───────────────────────────────────────────

async function fetchWeather(lat: number, lng: number): Promise<MonitorAlert[]> {
  try {
    const url = `https://api.weather.gov/alerts/active?point=${lat},${lng}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)', Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const json = await res.json() as { features?: Array<{ properties: Record<string, string> }> }
    return (json.features ?? []).map(f => {
      const p = f.properties
      return {
        source: 'nws',
        type: p.event?.toUpperCase().replace(/\s+/g, '_') ?? 'WEATHER',
        severity: nwsSeverityToEos(p.severity, p.certainty),
        headline: p.headline ?? p.event ?? 'Weather alert',
        expires: p.expires ?? null,
        url: p['@id'] ?? null,
      } satisfies MonitorAlert
    })
  } catch {
    return []
  }
}

// ─── USGS Earthquakes ─────────────────────────────────────────────────────────

async function fetchEarthquakes(lat: number, lng: number): Promise<MonitorAlert[]> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=300&minmagnitude=3.0&orderby=time&limit=5&starttime=${since}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const json = await res.json() as { features?: Array<{ properties: Record<string, string | number> }> }
    return (json.features ?? []).map(f => {
      const p = f.properties
      const mag = typeof p.mag === 'number' ? p.mag : parseFloat(String(p.mag))
      return {
        source: 'usgs',
        type: 'EARTHQUAKE',
        severity: usgsmagToEos(mag),
        headline: `M${mag.toFixed(1)} — ${p.place ?? 'unknown location'}`,
        expires: null,
        url: typeof p.url === 'string' ? p.url : null,
      } satisfies MonitorAlert
    })
  } catch {
    return []
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat e lng obrigatórios.' }, { status: 400 })
  }

  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'no-store', 'X-EOS-Cache': 'HIT' },
    })
  }

  const [weatherAlerts, earthquakeAlerts] = await Promise.all([
    fetchWeather(lat, lng),
    fetchEarthquakes(lat, lng),
  ])

  const alerts = [...weatherAlerts, ...earthquakeAlerts]

  const status: MonitorStatus = {
    weather: maxSeverity(...weatherAlerts.map(a => a.severity)),
    earthquake: maxSeverity(...earthquakeAlerts.map(a => a.severity)),
  }

  const response: MonitorResponse = {
    location: { lat, lng },
    alerts,
    status,
    cached_at: new Date().toISOString(),
  }

  // Cache: use shortest TTL across sources that returned data (1min earthquake, 5min weather)
  const ttl = earthquakeAlerts.length > 0 ? 60_000 : 5 * 60_000
  cacheSet(cacheKey, response, ttl)

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store', 'X-EOS-Cache': 'MISS' },
  })
}
