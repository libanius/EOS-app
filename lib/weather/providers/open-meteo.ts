// Open-Meteo provider — global coverage, no API key required.
// Docs: https://open-meteo.com/en/docs
// To swap provider: implement the same return shapes and swap the import in the API route.

import type { WeatherCurrent, HourlyForecast, DailyForecast, AirQualitySnapshot } from '../types'

// ─── WMO Weather Interpretation Codes ─────────────────────────────────────────

const WMO_LABEL: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Heavy showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail',
}

const WMO_ICON: Record<number, string> = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌦', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌦', 81: '🌧', 82: '🌧',
  85: '❄️', 86: '❄️',
  95: '⛈', 96: '⛈', 99: '⛈',
}

function wmoLabel(code: number): string { return WMO_LABEL[code] ?? 'Unknown' }
function wmoIcon(code: number): string  { return WMO_ICON[code]  ?? '🌡' }

function degToCompass(deg: number): string {
  const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return d[Math.round(deg / 22.5) % 16]
}

// ─── Open-Meteo forecast ───────────────────────────────────────────────────────

interface OmForecastRaw {
  current: Record<string, number>
  hourly: { time: string[] } & Record<string, number[]>
  daily: { time: string[] } & Record<string, (number | string)[]>
}

export async function fetchOpenMeteoForecast(lat: number, lng: number): Promise<{
  current: WeatherCurrent
  hourly: HourlyForecast[]
  daily: DailyForecast[]
} | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    const p = url.searchParams
    p.set('latitude',  lat.toFixed(4))
    p.set('longitude', lng.toFixed(4))
    p.set('current', [
      'temperature_2m','apparent_temperature','relative_humidity_2m','dew_point_2m',
      'precipitation','weather_code','cloud_cover','visibility',
      'wind_speed_10m','wind_gusts_10m','wind_direction_10m','surface_pressure','uv_index','is_day',
    ].join(','))
    p.set('hourly', [
      'temperature_2m','apparent_temperature','precipitation_probability','precipitation',
      'weather_code','wind_speed_10m','wind_gusts_10m','uv_index','cloud_cover','visibility',
    ].join(','))
    p.set('daily', [
      'weather_code','temperature_2m_max','temperature_2m_min','sunrise','sunset',
      'uv_index_max','precipitation_sum','wind_speed_10m_max','wind_gusts_10m_max',
    ].join(','))
    p.set('wind_speed_unit', 'mph')
    p.set('temperature_unit', 'fahrenheit')
    p.set('precipitation_unit', 'inch')
    p.set('visibility_unit', 'mi') // returns miles — no native param, convert below
    p.set('timezone', 'auto')
    p.set('forecast_days', '3')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const d = (await res.json()) as OmForecastRaw

    // hourly: keep only next 24 h starting from now
    const now = Date.now()
    const cutoff = now + 24 * 3_600_000
    const hourly: HourlyForecast[] = (d.hourly?.time ?? [])
      .map((t, i) => {
        const ts = new Date(t).getTime()
        if (ts < now - 3_600_000 || ts > cutoff) return null
        return {
          time_iso: t,
          temp_f: d.hourly.temperature_2m?.[i] ?? 0,
          feels_like_f: d.hourly.apparent_temperature?.[i] ?? 0,
          precip_prob_pct: d.hourly.precipitation_probability?.[i] ?? 0,
          precip_in: d.hourly.precipitation?.[i] ?? 0,
          wind_mph: d.hourly.wind_speed_10m?.[i] ?? 0,
          wind_gust_mph: d.hourly.wind_gusts_10m?.[i] ?? 0,
          uv_index: d.hourly.uv_index?.[i] ?? 0,
          cloud_cover_pct: d.hourly.cloud_cover?.[i] ?? 0,
          visibility_mi: (d.hourly.visibility?.[i] ?? 10000) / 1609,
          weather_code: d.hourly.weather_code?.[i] ?? 0,
          condition: wmoLabel(d.hourly.weather_code?.[i] ?? 0),
          condition_icon: wmoIcon(d.hourly.weather_code?.[i] ?? 0),
        } satisfies HourlyForecast
      })
      .filter((x): x is HourlyForecast => x !== null)

    const daily: DailyForecast[] = (d.daily?.time ?? []).map((t, i) => ({
      date: t as string,
      temp_max_f: (d.daily.temperature_2m_max?.[i] as number) ?? 0,
      temp_min_f: (d.daily.temperature_2m_min?.[i] as number) ?? 0,
      precip_sum_in: (d.daily.precipitation_sum?.[i] as number) ?? 0,
      wind_max_mph: (d.daily.wind_speed_10m_max?.[i] as number) ?? 0,
      gust_max_mph: (d.daily.wind_gusts_10m_max?.[i] as number) ?? 0,
      uv_max: (d.daily.uv_index_max?.[i] as number) ?? 0,
      sunrise_iso: (d.daily.sunrise?.[i] as string) ?? '',
      sunset_iso: (d.daily.sunset?.[i] as string) ?? '',
      weather_code: (d.daily.weather_code?.[i] as number) ?? 0,
      condition: wmoLabel((d.daily.weather_code?.[i] as number) ?? 0),
    }))

    const c = d.current
    const firstHour = hourly[0]

    const current: WeatherCurrent = {
      temp_f: c.temperature_2m,
      feels_like_f: c.apparent_temperature,
      humidity_pct: c.relative_humidity_2m,
      dew_point_f: c.dew_point_2m,
      pressure_hpa: c.surface_pressure,
      wind_mph: c.wind_speed_10m,
      wind_gust_mph: c.wind_gusts_10m,
      wind_dir_deg: c.wind_direction_10m,
      wind_dir_label: degToCompass(c.wind_direction_10m),
      precip_in: c.precipitation ?? 0,
      precip_prob_pct: firstHour?.precip_prob_pct ?? 0,
      uv_index: c.uv_index ?? 0,
      cloud_cover_pct: c.cloud_cover ?? 0,
      visibility_mi: (c.visibility ?? 16090) / 1609,
      weather_code: c.weather_code,
      condition: wmoLabel(c.weather_code),
      condition_icon: wmoIcon(c.weather_code),
      is_daytime: c.is_day === 1,
      sunrise_iso: daily[0]?.sunrise_iso ?? '',
      sunset_iso: daily[0]?.sunset_iso ?? '',
    }

    return { current, hourly, daily }
  } catch { return null }
}

// ─── Open-Meteo Air Quality ───────────────────────────────────────────────────
// Docs: https://open-meteo.com/en/docs/air-quality-api

function aqiCategory(aqi: number | null): string {
  if (aqi == null) return 'Unknown'
  if (aqi <= 50)  return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

interface OmAqRaw { current: Record<string, number | null> }

export async function fetchOpenMeteoAirQuality(lat: number, lng: number): Promise<AirQualitySnapshot | null> {
  try {
    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
    url.searchParams.set('latitude',  lat.toFixed(4))
    url.searchParams.set('longitude', lng.toFixed(4))
    url.searchParams.set('current', 'us_aqi,pm10,pm2_5,ozone,dust')
    url.searchParams.set('timezone', 'auto')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const d = (await res.json()) as OmAqRaw
    const c = d.current

    return {
      us_aqi: c.us_aqi ?? null,
      pm25:   c.pm2_5  ?? null,
      pm10:   c.pm10   ?? null,
      ozone:  c.ozone  ?? null,
      dust:   c.dust   ?? null,
      category: aqiCategory(c.us_aqi ?? null),
      source: 'open-meteo-aq',
    }
  } catch { return null }
}
