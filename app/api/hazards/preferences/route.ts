import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ALERT_TYPES } from '@/lib/hazards/alerting'

export const runtime = 'nodejs'

// Which hazard alerts a user wants, when they want silence, and how often.
// A user who never opens this has no row — and gets the defaults, warned about
// everything. Silence is never the default for a safety product.

const DEFAULTS = {
  enabled_types: [...DEFAULT_ALERT_TYPES],
  quiet_hours_start: null as number | null,
  quiet_hours_end: null as number | null,
  allow_critical_override: true,
  cooldown_minutes: 30,
  basin_wide_tropical: false,
  push_enabled: true,
}

const MIGRATION_HINT = 'migration_pending'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_hazard_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  // Table absent → the alerting migration has not been applied yet. Say so
  // instead of pretending the user has no preferences.
  if (error && error.code === '42P01') {
    return NextResponse.json({ ...DEFAULTS, status: MIGRATION_HINT })
  }

  return NextResponse.json({ ...DEFAULTS, ...(data ?? {}), status: 'ok' })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const hour = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null
  }

  const allowed = new Set<string>(DEFAULT_ALERT_TYPES)
  const types = Array.isArray(body.enabled_types)
    ? (body.enabled_types as unknown[]).filter((t): t is string => typeof t === 'string' && allowed.has(t))
    : undefined

  const patch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }
  if (types) patch.enabled_types = types
  if ('quiet_hours_start' in body) patch.quiet_hours_start = hour(body.quiet_hours_start)
  if ('quiet_hours_end' in body) patch.quiet_hours_end = hour(body.quiet_hours_end)
  if ('allow_critical_override' in body) patch.allow_critical_override = Boolean(body.allow_critical_override)
  if ('basin_wide_tropical' in body) patch.basin_wide_tropical = Boolean(body.basin_wide_tropical)
  if ('push_enabled' in body) patch.push_enabled = Boolean(body.push_enabled)
  if ('cooldown_minutes' in body) {
    const n = Number(body.cooldown_minutes)
    // Below 5 minutes a storm sequence becomes a stream of buzzes; above a day
    // the setting is indistinguishable from off.
    patch.cooldown_minutes = Number.isFinite(n) ? Math.min(1440, Math.max(5, Math.round(n))) : 30
  }

  const { data, error } = await supabase
    .from('user_hazard_preferences')
    .upsert(patch, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Hazard alerting migration not applied yet', status: MIGRATION_HINT }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ...DEFAULTS, ...data, status: 'ok' })
}
