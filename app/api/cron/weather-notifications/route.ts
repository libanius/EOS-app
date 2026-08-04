import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCommsNotifications } from '@/lib/comms-notifications'
import { fetchWeather, SEVERITY_RANK, type MonitorAlert } from '@/lib/monitor'

export const runtime = 'nodejs'

type ProfilePoint = {
  id: string
  location_lat: number | null
  location_lng: number | null
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

function sourceKeyFor(alert: MonitorAlert, lat: number, lng: number) {
  const official = alert.url?.trim()
  if (official) return `weather:${official}`
  const basis = [
    alert.source,
    alert.type,
    alert.headline,
    alert.expires ?? 'active',
    lat.toFixed(2),
    lng.toFixed(2),
  ].join(':')
  return `weather:${basis.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-')}`
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  const { data, error } = await admin
    .from('profiles')
    .select('id, location_lat, location_lng')
    .not('location_lat', 'is', null)
    .not('location_lng', 'is', null)
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const profiles = ((data ?? []) as ProfilePoint[]).filter(profile =>
    typeof profile.location_lat === 'number'
    && typeof profile.location_lng === 'number'
    && Number.isFinite(profile.location_lat)
    && Number.isFinite(profile.location_lng),
  )

  let checked = 0
  let matched = 0
  let created = 0

  for (const profile of profiles) {
    const lat = profile.location_lat as number
    const lng = profile.location_lng as number
    checked += 1
    const alerts = await fetchWeather(lat, lng)
    const relevant = alerts.filter(alert => SEVERITY_RANK[alert.severity] >= SEVERITY_RANK.WATCH)
    matched += relevant.length

    for (const alert of relevant) {
      const sourceKey = sourceKeyFor(alert, lat, lng)
      await createCommsNotifications({
        admin,
        recipientIds: [profile.id],
        scope: 'weather',
        kind: 'weather_alert',
        title: alert.headline,
        body: `${alert.source.toUpperCase()} · ${alert.severity}${alert.expires ? ` · expira ${new Date(alert.expires).toLocaleString('pt-BR')}` : ''}`,
        href: `/weather?alertId=${encodeURIComponent(sourceKey)}`,
        severity: alert.severity,
        sourceKey,
        metadata: {
          source: alert.source,
          type: alert.type,
          expires: alert.expires,
          url: alert.url,
          lat: Number(lat.toFixed(3)),
          lng: Number(lng.toFixed(3)),
        },
      })
      created += 1
    }
  }

  return NextResponse.json({ ok: true, checked, matched, attempted: created })
}
