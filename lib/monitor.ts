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

export interface WeatherCurrent {
  temp: number
  unit: 'F' | 'C'
  wind_speed: string
  wind_dir: string
  condition: string
  rain_pct: number | null
  is_daytime: boolean
  // next 5 hours
  hourly: Array<{ hour: string; temp: number; condition: string; rain_pct: number | null }>
}

export interface MonitorResult {
  location: { lat: number; lng: number }
  alerts: MonitorAlert[]
  status: MonitorStatus
  current: WeatherCurrent | null
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

export async function fetchWeatherCurrent(lat: number, lng: number): Promise<WeatherCurrent | null> {
  try {
    // Step 1: resolve grid point
    const pointRes = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
      { headers: { 'User-Agent': 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)', Accept: 'application/geo+json' }, signal: AbortSignal.timeout(8000) }
    )
    if (!pointRes.ok) return null
    const pointJson = await pointRes.json() as { properties?: { forecastHourly?: string } }
    const hourlyUrl = pointJson.properties?.forecastHourly
    if (!hourlyUrl) return null

    // Step 2: fetch hourly forecast
    const hourlyRes = await fetch(hourlyUrl, {
      headers: { 'User-Agent': 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)', Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!hourlyRes.ok) return null
    const hourlyJson = await hourlyRes.json() as {
      properties?: {
        periods?: Array<{
          startTime: string; temperature: number; temperatureUnit: string
          windSpeed: string; windDirection: string; shortForecast: string
          isDaytime: boolean; probabilityOfPrecipitation?: { value: number | null }
        }>
      }
    }
    const periods = hourlyJson.properties?.periods ?? []
    if (periods.length === 0) return null

    const now = periods[0]
    return {
      temp: now.temperature,
      unit: now.temperatureUnit as 'F' | 'C',
      wind_speed: now.windSpeed,
      wind_dir: now.windDirection,
      condition: now.shortForecast,
      rain_pct: now.probabilityOfPrecipitation?.value ?? null,
      is_daytime: now.isDaytime,
      hourly: periods.slice(1, 6).map(p => ({
        hour: new Date(p.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
        temp: p.temperature,
        condition: p.shortForecast,
        rain_pct: p.probabilityOfPrecipitation?.value ?? null,
      })),
    }
  } catch { return null }
}

interface CacheEntry { data: MonitorResult; expiresAt: number }
const cache = new Map<string, CacheEntry>()

export async function getMonitorData(lat: number, lng: number): Promise<{ result: MonitorResult; cached: boolean }> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() < hit.expiresAt) return { result: hit.data, cached: true }

  const [weatherAlerts, earthquakeAlerts, current] = await Promise.all([
    fetchWeather(lat, lng),
    fetchEarthquakes(lat, lng),
    fetchWeatherCurrent(lat, lng),
  ])
  const alerts = [...weatherAlerts, ...earthquakeAlerts]
  const result: MonitorResult = {
    location: { lat, lng },
    alerts,
    status: { weather: maxSeverity(...weatherAlerts.map(a => a.severity)), earthquake: maxSeverity(...earthquakeAlerts.map(a => a.severity)) },
    current,
    cached_at: new Date().toISOString(),
  }
  cache.set(key, { data: result, expiresAt: Date.now() + (earthquakeAlerts.length > 0 ? 60_000 : 300_000) })
  return { result, cached: false }
}
