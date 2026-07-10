import { HAZARD_CONFIG } from '../config'
import type { Coordinates, MinuteForecast, PrecipType } from '../types'
import type { MinuteForecastProvider, ProviderResult } from './interfaces'

// Open-Meteo minutely_15 gives 15-minute-resolution precipitation with global
// coverage and no API key. It is a real nowcast fallback — not minute-real like
// WeatherKit/AccuWeather — so callers label confidence as `medium`.

function precipTypeFromCode(code: number): PrecipType {
  if (code >= 71 && code <= 77) return 'snow'
  if (code === 85 || code === 86) return 'snow'
  if (code === 66 || code === 67) return 'sleet'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rain'
  return 'unknown'
}

export const openMeteoNowcastProvider: MinuteForecastProvider = {
  source: 'open-meteo',
  isConfigured: () => true, // keyless
  async getMinuteForecast(location: Coordinates): Promise<ProviderResult<MinuteForecast[]>> {
    const started = Date.now()
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast')
      const p = url.searchParams
      p.set('latitude', location.lat.toFixed(4))
      p.set('longitude', location.lng.toFixed(4))
      p.set('minutely_15', 'precipitation,weather_code')
      p.set('forecast_minutely_15', '8') // next 2 hours at 15-min steps
      p.set('timeformat', 'unixtime')
      const res = await fetch(url, { signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs) })
      if (!res.ok) {
        return { provider: 'open-meteo', status: 'degraded', data: [], latencyMs: Date.now() - started, message: `HTTP ${res.status}` }
      }
      const json = (await res.json()) as {
        minutely_15?: { time?: number[]; precipitation?: number[]; weather_code?: number[] }
      }
      const m = json.minutely_15
      if (!m?.time?.length) {
        return { provider: 'open-meteo', status: 'unavailable_here', data: [], latencyMs: Date.now() - started, message: 'No minute forecast for this location' }
      }
      const nowSec = Math.floor(Date.now() / 1000)
      const data: MinuteForecast[] = m.time.map((t, i) => {
        const mmPer15 = m.precipitation?.[i] ?? 0
        const code = m.weather_code?.[i] ?? 0
        return {
          minute: Math.round((t - nowSec) / 60),
          timeIso: new Date(t * 1000).toISOString(),
          precipIntensityMmH: Number((mmPer15 * 4).toFixed(2)), // mm/15min → mm/h
          // No probability at minute resolution — infer presence honestly.
          precipProbabilityPct: mmPer15 > 0 ? 80 : 0,
          precipType: precipTypeFromCode(code),
        }
      })
      return {
        provider: 'open-meteo',
        status: 'live',
        data,
        latencyMs: Date.now() - started,
        lastSuccessAt: new Date().toISOString(),
        dataAgeSeconds: 0,
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error'
      return { provider: 'open-meteo', status: 'offline', data: [], latencyMs: Date.now() - started, message }
    }
  },
}
