import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/location — record the caller's live position (D-064).
 *
 * Writes the LATEST POINT ONLY. A new report overwrites the previous one; there
 * is no history table, no trail and no replay. EOS answers "where is my family
 * now", it does not keep a record of where they have been.
 *
 * This endpoint only ever writes the CALLER's own row (`auth.uid()`), so it can
 * never be used to plant a position for someone else. Whether anyone else may
 * READ that point is a separate decision, enforced in /api/circles by the
 * `location` consent flag in `shared_fields`.
 */

/** Below this, the browser is guessing from IP/wifi — not a usable family point. */
const MAX_ACCURACY_M = 5000

/**
 * Floor between writes. The client posts on movement, so during a drive this is
 * what bounds it — low enough to feel live (D-073), high enough that a jittery
 * GPS cannot hammer the row.
 */
const MIN_INTERVAL_MS = 8_000

function isFiniteCoord(lat: unknown, lng: unknown) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body: { lat?: unknown; lng?: unknown; accuracy_m?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const { lat, lng, accuracy_m: accuracy } = body
  if (!isFiniteCoord(lat, lng)) {
    return NextResponse.json({ error: 'Coordenadas inválidas.' }, { status: 400 })
  }

  const accuracyM =
    typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null

  // A wildly imprecise fix is worse than none: shown on a map it implies a
  // certainty that does not exist. Accept the call, store nothing.
  if (accuracyM !== null && accuracyM > MAX_ACCURACY_M) {
    return NextResponse.json({ ok: true, stored: false, reason: 'accuracy' })
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('last_location_at')
    .eq('id', user.id)
    .maybeSingle()

  const previous = existing?.last_location_at ? Date.parse(existing.last_location_at) : 0
  if (previous && Date.now() - previous < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: true, stored: false, reason: 'throttled' })
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      last_location_lat: lat,
      last_location_lng: lng,
      last_location_at: new Date().toISOString(),
      last_location_accuracy_m: accuracyM,
    })
    .eq('id', user.id)

  if (error) {
    // 42703 = undefined_column → migration 20260727000000_live_location.sql
    // has not been applied yet. Fail soft: live location is additive, and the
    // map still has the profile point.
    if (error.code === '42703') {
      return NextResponse.json({ ok: true, stored: false, reason: 'migration_pending' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, stored: true })
}
