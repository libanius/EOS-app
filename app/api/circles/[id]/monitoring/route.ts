import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/feature-gates'
import { getMonitorData, maxSeverity, type Severity } from '@/lib/monitor'

interface Ctx { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
  const plan = (profile?.plan ?? 'free') as 'free' | 'family' | 'premium'
  if (!canAccess('monitoring_multilocal', plan)) {
    return NextResponse.json({ error: 'Family plan required' }, { status: 403 })
  }

  const { data: membership } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: members } = await supabase.from('circle_members')
    .select('user_id, profiles(name, location_lat, location_lng)')
    .eq('circle_id', params.id)

  const geolocated = (members ?? []).filter(m => {
    const p = m.profiles as { location_lat?: number; location_lng?: number } | null
    return p?.location_lat != null && p?.location_lng != null
  })

  const results = await Promise.all(geolocated.map(async m => {
    const p = m.profiles as unknown as { name?: string; location_lat: number; location_lng: number }
    const { result } = await getMonitorData(p.location_lat, p.location_lng)
    const severity = maxSeverity(...result.alerts.map(a => a.severity))
    return {
      user_id: m.user_id,
      name: p.name ?? '—',
      is_me: m.user_id === user.id,
      lat: p.location_lat,
      lng: p.location_lng,
      severity: severity as Severity,
      alert_count: result.alerts.length,
      top_alerts: result.alerts.slice(0, 2),
    }
  }))

  results.sort((a, b) => {
    const rank: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, WATCH: 2, MODERATE: 1, CLEAR: 0 }
    return rank[b.severity] - rank[a.severity]
  })

  return NextResponse.json({ members: results, fetched_at: new Date().toISOString() })
}
