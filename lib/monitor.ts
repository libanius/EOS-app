export type Severity = 'CRITICAL' | 'HIGH' | 'WATCH' | 'MODERATE' | 'CLEAR'

export interface MonitorAlert {
  source: string
  type: string
  severity: Severity
  headline: string
  expires: string | null
  url: string | null
}

export interface MonitorStatus { weather: Severity; earthquake: Severity }

export interface MonitorResult {
  location: { lat: number; lng: number }
  alerts: MonitorAlert[]
  status: MonitorStatus
  cached_at: string
}

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, WATCH: 2, MODERATE: 1, CLEAR: 0 }

export function maxSeverity(...levels: Severity[]): Severity {
  return levels.reduce((a, b) => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b), 'CLEAR')
}

function nwsSev(sev?: string, cer?: string): Severity {
  const s = (sev ?? '').toLowerCase(), c = (cer ?? '').toLowerCase()
  if (s === 'extreme') return 'CRITICAL'
  if (s === 'severe' && c === 'observed') return 'CRITICAL'
  if (s === 'severe') return 'HIGH'
  if (s === 'moderate') return 'WATCH'
  return 'MODERATE'
}

function usgsMag(mag: number): Severity {
  if (mag >= 7.0) return 'CRITICAL'
  if (mag >= 5.5) return 'HIGH'
  if (mag >= 4.0) return 'WATCH'
  return 'MODERATE'
}

export async function fetchWeather(lat: number, lng: number): Promise<MonitorAlert[]> {
  try {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lng}`, {
      headers: { 'User-Agent': 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)', Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const json = await res.json() as { features?: Array<{ properties: Record<string, string> }> }
    return (json.features ?? []).map(f => {
      const p = f.properties
      return { source: 'nws', type: p.event?.toUpperCase().replace(/\s+/g, '_') ?? 'WEATHER', severity: nwsSev(p.severity, p.certainty), headline: p.headline ?? p.event ?? 'Weather alert', expires: p.expires ?? null, url: p['@id'] ?? null }
    })
  } catch { return [] }
}

export async function fetchEarthquakes(lat: number, lng: number): Promise<MonitorAlert[]> {
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=300&minmagnitude=3.0&orderby=time&limit=5&starttime=${since}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const json = await res.json() as { features?: Array<{ properties: Record<string, string | number> }> }
    return (json.features ?? []).map(f => {
      const p = f.properties
      const mag = typeof p.mag === 'number' ? p.mag : parseFloat(String(p.mag))
      return { source: 'usgs', type: 'EARTHQUAKE', severity: usgsMag(mag), headline: `M${mag.toFixed(1)} — ${p.place ?? 'unknown location'}`, expires: null, url: typeof p.url === 'string' ? p.url : null }
    })
  } catch { return [] }
}

interface CacheEntry { data: MonitorResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()

export async function getMonitorData(lat: number, lng: number): Promise<{ result: MonitorResult; cached: boolean }> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() < hit.expiresAt) return { result: hit.data, cached: true }

  const [weatherAlerts, earthquakeAlerts] = await Promise.all([fetchWeather(lat, lng), fetchEarthquakes(lat, lng)])
  const alerts = [...weatherAlerts, ...earthquakeAlerts]
  const result: MonitorResult = {
    location: { lat, lng },
    alerts,
    status: { weather: maxSeverity(...weatherAlerts.map(a => a.severity)), earthquake: maxSeverity(...earthquakeAlerts.map(a => a.severity)) },
    cached_at: new Date().toISOString(),
  }
  cache.set(key, { data: result, expiresAt: Date.now() + (earthquakeAlerts.length > 0 ? 60_000 : 300_000) })
  return { result, cached: false }
}
