import { type NextRequest, NextResponse } from 'next/server'
import { fetchOpenMeteoForecast, fetchOpenMeteoAirQuality } from '@/lib/weather/providers/open-meteo'
import { fetchWeather } from '@/lib/monitor'
import { fetchEarthquakes } from '@/lib/monitor'
import type { WeatherSnapshot, WeatherAlert, EarthquakeEvent } from '@/lib/weather/types'

// Aggregate all weather providers in parallel. Providers fail gracefully —
// a failed provider returns null and its key in `providers` is marked 'error'.
// To add a new provider: import it here and add a parallel fetch below.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const [forecast, airQuality, nwsRaw, usgsRaw] = await Promise.all([
    fetchOpenMeteoForecast(lat, lng),
    fetchOpenMeteoAirQuality(lat, lng),
    fetchWeather(lat, lng).catch(() => []),
    fetchEarthquakes(lat, lng).catch(() => []),
  ])

  if (!forecast) {
    return NextResponse.json({ error: 'Weather data unavailable' }, { status: 503 })
  }

  const alerts: WeatherAlert[] = nwsRaw.map(a => ({
    id: a.url ?? `${a.source}-${a.type}-${Date.now()}`,
    source: 'NWS',
    type: a.type,
    severity: a.severity as WeatherAlert['severity'],
    headline: a.headline,
    expires: a.expires,
    url: a.url,
  }))

  const earthquakes: EarthquakeEvent[] = usgsRaw.map(a => {
    const match = a.headline.match(/M(\d+\.\d+)/)
    return {
      magnitude: match ? parseFloat(match[1]) : 0,
      place: a.headline.replace(/^M\d+\.\d+ — /, ''),
      time_iso: new Date().toISOString(),
      severity: a.severity as EarthquakeEvent['severity'],
    }
  })

  const snapshot: WeatherSnapshot = {
    location: { lat, lng },
    current: forecast.current,
    hourly: forecast.hourly,
    daily: forecast.daily,
    air_quality: airQuality,
    alerts,
    earthquakes,
    fetched_at: new Date().toISOString(),
    providers: {
      'open-meteo': 'ok',
      'open-meteo-aq': airQuality ? 'ok' : 'unavailable',
      'nws': nwsRaw.length >= 0 ? 'ok' : 'error',
      'usgs': usgsRaw.length >= 0 ? 'ok' : 'error',
    },
  }

  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=120' },
  })
}
