// ─── Scheduled hazard scan (D-220) ────────────────────────────────────────────
//
// The piece that makes the EOS speak while the app is closed.
//
// Shape of one run:
//   1. Which places matter — last known position of every active profile, plus
//      the places families explicitly asked to watch.
//   2. Group them onto a coarse grid so one upstream fetch serves everyone
//      nearby. A neighbourhood is one scan, not one scan per phone.
//   3. Per place: read the feeds, compare against what the last run stored,
//      keep only what CHANGED.
//   4. Per person at that place: apply their preferences, quiet hours, cooldown
//      and the dedup log — then, and only then, push.
//
// Every suppression is written to notification_delivery_log with a reason. When
// someone asks "why didn't I get the hurricane alert?", there is an answer.

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccess, type Plan } from '@/lib/feature-gates'
import { fetchOpenMeteoAirQuality } from '@/lib/weather/providers/open-meteo'
import { HAZARD_CONFIG } from './config'
import { getHazardNetwork } from './network'
import {
  DEFAULT_ALERT_TYPES,
  airQualityEvent,
  notificationCopy,
  precipitationEvent,
  preferenceKey,
} from './alerting'
import {
  detectTransitions,
  isCritical,
  isRelevantForUser,
  type HazardTransition,
  type StoredHazardState,
} from './transitions'
import type { Coordinates, HazardEvent } from './types'

const A = HAZARD_CONFIG.alerting

// The app's base language is English (D-206); Portuguese is honoured whenever
// the person actually chose it. `profiles.language` is how that choice reaches
// the server — the scan has no browser, so localStorage and the cookie are both
// out of reach here.
function prefersPt(language: unknown): boolean {
  return language === 'pt'
}

export interface ScanSummary {
  locations: number
  usersConsidered: number
  transitions: number
  pushed: number
  suppressed: Record<string, number>
  errors: string[]
  startedAt: string
  durationMs: number
}

/**
 * No write in this pipeline is allowed to fail quietly (D-222).
 *
 * The dedup defect hid behind `await db.from(…).upsert(…)` with the result
 * thrown away. Postgres was refusing every row with 42P10 — the unique index
 * was partial, and a partial index cannot arbitrate `ON CONFLICT` unless the
 * statement repeats its predicate, which PostgREST never emits — while the scan
 * went on reporting `pushed: 1` into an empty table.
 *
 * It survived because these writes look like bookkeeping and are not:
 * `notification_delivery_log` IS the dedup and IS the cooldown. Losing the
 * write does not lose a record of the suppression, it removes the suppression.
 * So a failed write has to reach the summary the scheduler prints, where a
 * human sees it.
 */
function guard(
  summary: ScanSummary,
  where: string,
  result: { error: { message: string; code?: string } | null },
): boolean {
  if (!result.error) return true
  const code = result.error.code ? ` [${result.error.code}]` : ''
  summary.errors.push(`write ${where}${code}: ${result.error.message}`)
  return false
}

interface TargetUser {
  userId: string
  plan: Plan
  pt: boolean
}

interface ScanTarget {
  scanKey: string
  location: Coordinates
  users: TargetUser[]
}

/** Round to the grid so nearby people share one upstream fetch. */
export function scanKeyFor(lat: number, lng: number): string {
  return `${lat.toFixed(A.scanKeyPrecision)},${lng.toFixed(A.scanKeyPrecision)}`
}

// ─── 1. Where to look ─────────────────────────────────────────────────────────

async function collectTargets(db: SupabaseClient): Promise<ScanTarget[]> {
  const since = new Date(Date.now() - A.locationMaxAgeDays * 86_400_000).toISOString()
  const byKey = new Map<string, ScanTarget>()

  const add = (lat: number, lng: number, user: TargetUser) => {
    const scanKey = scanKeyFor(lat, lng)
    const existing = byKey.get(scanKey)
    if (existing) {
      if (!existing.users.some(u => u.userId === user.userId)) existing.users.push(user)
      return
    }
    byKey.set(scanKey, { scanKey, location: { lat, lng }, users: [user] })
  }

  // Profiles with a recent fix. A stale coordinate is worse than none — it would
  // alert a family about a city they left two weeks ago.
  const { data: profiles } = await db
    .from('profiles')
    .select('id, plan, language, last_location_lat, last_location_lng, last_location_at')
    .not('last_location_lat', 'is', null)
    .not('last_location_lng', 'is', null)
    .gte('last_location_at', since)

  for (const p of profiles ?? []) {
    const lat = p.last_location_lat as number | null
    const lng = p.last_location_lng as number | null
    if (lat == null || lng == null) continue
    add(lat, lng, {
      userId: p.id as string,
      plan: ((p.plan as Plan | null) ?? 'free'),
      pt: prefersPt(p.language),
    })
  }

  // Places explicitly watched (the grandparents' house, the kids' school).
  const { data: subs } = await db.from('hazard_subscriptions').select('user_id, lat, lng')
  if (subs?.length) {
    const ids = Array.from(new Set(subs.map(s => s.user_id as string)))
    const { data: subProfiles } = await db.from('profiles').select('id, plan, language').in('id', ids)
    const meta = new Map((subProfiles ?? []).map(p => [p.id as string, p]))
    for (const s of subs) {
      const p = meta.get(s.user_id as string)
      add(s.lat as number, s.lng as number, {
        userId: s.user_id as string,
        plan: ((p?.plan as Plan | null) ?? 'free'),
        pt: prefersPt(p?.language),
      })
    }
  }

  return Array.from(byKey.values()).slice(0, A.maxLocationsPerRun)
}

// ─── 2. Read one place ────────────────────────────────────────────────────────

async function currentEventsFor(target: ScanTarget): Promise<HazardEvent[]> {
  const [snapshot, air] = await Promise.all([
    getHazardNetwork(target.location, { force: true }),
    fetchOpenMeteoAirQuality(target.location.lat, target.location.lng).catch(() => null),
  ])

  const events = [...snapshot.events]
  const aqi = airQualityEvent(air, target.scanKey, target.location)
  if (aqi) events.push(aqi)
  const precip = precipitationEvent(snapshot.precipitation, target.scanKey, target.location)
  if (precip) events.push(precip)
  return events
}

// ─── 3. Remember / compare ────────────────────────────────────────────────────

async function loadPrevious(
  db: SupabaseClient,
  scanKey: string,
  ids: string[],
): Promise<{ previous: Map<string, StoredHazardState>; ownedIds: string[] }> {
  // Two sets matter: the events this location owned last time (to spot what
  // vanished) and the global rows for whatever the feeds return right now.
  const [owned, byId] = await Promise.all([
    db.from('hazard_events').select('id, severity, event_type, title, hazard_type, metrics').eq('scan_key', scanKey),
    ids.length
      ? db.from('hazard_events').select('id, severity, event_type, title, hazard_type, metrics').in('id', ids)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const previous = new Map<string, StoredHazardState>()
  const rows = [...((owned.data ?? []) as Record<string, unknown>[]), ...(((byId as { data?: unknown[] }).data ?? []) as Record<string, unknown>[])]
  for (const row of rows) {
    previous.set(row.id as string, {
      id: row.id as string,
      severity: row.severity as StoredHazardState['severity'],
      eventType: row.event_type as string,
      title: row.title as string,
      hazardType: row.hazard_type as string,
      metrics: (row.metrics ?? null) as StoredHazardState['metrics'],
    })
  }

  return {
    previous,
    ownedIds: ((owned.data ?? []) as Record<string, unknown>[]).map(r => r.id as string),
  }
}

async function persist(
  db: SupabaseClient,
  scanKey: string,
  events: HazardEvent[],
  transitions: HazardTransition[],
  summary: ScanSummary,
) {
  const now = new Date().toISOString()

  if (events.length) {
    guard(summary, 'hazard_events', await db.from('hazard_events').upsert(
      events.map(e => ({
        id: e.id,
        source: e.source,
        authority: e.authority,
        visual_class: e.visualClass,
        hazard_type: e.hazardType,
        event_type: e.eventType,
        title: e.title,
        summary: e.summary,
        severity: e.severity,
        urgency: e.urgency,
        certainty: e.certainty,
        confidence: e.confidence ?? null,
        lat: e.location?.lat ?? null,
        lng: e.location?.lng ?? null,
        distance_miles: e.distanceMiles ?? null,
        starts_at: e.startsAt ?? null,
        ends_at: e.endsAt ?? null,
        detected_at: e.detectedAt,
        updated_at: e.updatedAt,
        expires_at: e.expiresAt ?? null,
        official_url: e.officialUrl ?? null,
        raw_ref: e.rawPayloadReference ?? null,
        metrics: e.metrics ?? null,
        scan_key: scanKey,
        last_seen_at: now,
      })),
      { onConflict: 'id' },
    ))
  }

  // An event that ended stops owning this location, so the next run does not
  // report it as "cleared" over and over.
  const clearedIds = transitions.filter(t => t.kind === 'cleared').map(t => t.event.id)
  if (clearedIds.length) {
    guard(
      summary,
      'hazard_events.scan_key',
      await db.from('hazard_events').update({ scan_key: null }).in('id', clearedIds),
    )
  }

  if (!transitions.length) return new Map<string, string>()

  const { data, error: transitionsError } = await db
    .from('hazard_transitions')
    .insert(
      transitions.map(t => ({
        hazard_event_id: t.event.id,
        kind: t.kind,
        hazard_type: t.event.hazardType,
        severity: t.event.severity,
        from_state: t.fromState ?? null,
        to_state: t.toState,
        from_metrics: t.fromMetrics ?? null,
        to_metrics: t.toMetrics ?? null,
        title: t.event.title,
        scan_key: scanKey,
      })),
    )
    .select('id, hazard_event_id, kind')

  guard(summary, 'hazard_transitions', { error: transitionsError })

  const ids = new Map<string, string>()
  for (const row of data ?? []) {
    ids.set(`${row.kind as string}:${row.hazard_event_id as string}`, row.id as string)
  }
  return ids
}

// ─── 4. Deliver ───────────────────────────────────────────────────────────────

interface Preferences {
  enabledTypes: string[]
  quietStart: number | null
  quietEnd: number | null
  allowCriticalOverride: boolean
  cooldownMinutes: number
  basinWideTropical: boolean
  pushEnabled: boolean
}

const DEFAULT_PREFERENCES: Preferences = {
  enabledTypes: [...DEFAULT_ALERT_TYPES],
  quietStart: null,
  quietEnd: null,
  allowCriticalOverride: true,
  cooldownMinutes: 30,
  basinWideTropical: false,
  pushEnabled: true,
}

async function loadPreferences(db: SupabaseClient, userIds: string[]): Promise<Map<string, Preferences>> {
  const map = new Map<string, Preferences>()
  if (!userIds.length) return map
  const { data } = await db
    .from('user_hazard_preferences')
    .select('user_id, enabled_types, quiet_hours_start, quiet_hours_end, allow_critical_override, cooldown_minutes, basin_wide_tropical, push_enabled')
    .in('user_id', userIds)

  for (const row of data ?? []) {
    const enabled = (row.enabled_types as string[] | null) ?? []
    map.set(row.user_id as string, {
      // An empty array means "not customised", not "everything off" — a user who
      // never opened the settings must still be warned.
      enabledTypes: enabled.length ? enabled : [...DEFAULT_ALERT_TYPES],
      quietStart: (row.quiet_hours_start as number | null) ?? null,
      quietEnd: (row.quiet_hours_end as number | null) ?? null,
      allowCriticalOverride: (row.allow_critical_override as boolean | null) ?? true,
      cooldownMinutes: (row.cooldown_minutes as number | null) ?? 30,
      basinWideTropical: (row.basin_wide_tropical as boolean | null) ?? false,
      pushEnabled: (row.push_enabled as boolean | null) ?? true,
    })
  }
  return map
}

/**
 * Is `now` inside the user's quiet hours?
 *
 * The offset is approximated from longitude (15° per hour) because the profile
 * carries no timezone. It is accurate to about an hour — good enough to avoid
 * 3am, not good enough to promise "exactly 22:00". Documented rather than hidden.
 */
export function inQuietHours(
  now: Date,
  location: Coordinates,
  quietStart: number | null,
  quietEnd: number | null,
): boolean {
  if (quietStart == null || quietEnd == null) return false
  const offsetHours = Math.round(location.lng / 15)
  const localHour = (((now.getUTCHours() + offsetHours) % 24) + 24) % 24
  // A window that wraps midnight (22 → 7) is the common case.
  return quietStart <= quietEnd
    ? localHour >= quietStart && localHour < quietEnd
    : localHour >= quietStart || localHour < quietEnd
}

function vapidReady(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

async function deliver(
  db: SupabaseClient,
  target: ScanTarget,
  transitions: HazardTransition[],
  transitionIds: Map<string, string>,
  summary: ScanSummary,
) {
  if (!transitions.length) return

  const userIds = target.users.map(u => u.userId)
  const preferences = await loadPreferences(db, userIds)
  const now = new Date()

  const { data: subscriptions } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  const subsByUser = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>()
  for (const s of subscriptions ?? []) {
    const list = subsByUser.get(s.user_id as string) ?? []
    list.push({ endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string })
    subsByUser.set(s.user_id as string, list)
  }

  const log = (userId: string, t: HazardTransition, status: string, detail?: string) => {
    summary.suppressed[status] = (summary.suppressed[status] ?? 0) + 1
    return {
      user_id: userId,
      hazard_event_id: t.event.id,
      transition_id: transitionIds.get(`${t.kind}:${t.event.id}`) ?? null,
      channel: 'push',
      status,
      dedup_key: t.dedupKey,
      detail: detail ?? null,
    }
  }

  const rows: Record<string, unknown>[] = []

  for (const user of target.users) {
    const prefs = preferences.get(user.userId) ?? DEFAULT_PREFERENCES
    const subs = subsByUser.get(user.userId) ?? []

    // Already-delivered keys for this user — the trap that caught the
    // competitor, which sent the same downgrade twice on two different days.
    const { data: alreadySent } = await db
      .from('notification_delivery_log')
      .select('dedup_key')
      .eq('user_id', user.userId)
      .in('dedup_key', transitions.map(t => t.dedupKey))
    const seen = new Set((alreadySent ?? []).map(r => r.dedup_key as string))

    const { data: recent } = await db
      .from('notification_delivery_log')
      .select('sent_at')
      .eq('user_id', user.userId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
    const lastSentAt = recent?.[0]?.sent_at ? Date.parse(recent[0].sent_at as string) : 0

    let sentThisRun = 0

    for (const t of transitions) {
      if (seen.has(t.dedupKey)) {
        rows.push(log(user.userId, t, 'deduped'))
        continue
      }
      if (!prefs.enabledTypes.includes(preferenceKey(t.event.hazardType))) {
        rows.push(log(user.userId, t, 'not_relevant', 'type disabled'))
        continue
      }
      if (!isRelevantForUser(t, { basinWideTropical: prefs.basinWideTropical })) {
        rows.push(log(user.userId, t, 'not_relevant', 'out of range'))
        continue
      }

      const critical = isCritical(t)

      if (!prefs.pushEnabled && !critical) {
        rows.push(log(user.userId, t, 'not_relevant', 'push disabled'))
        continue
      }
      if (!canAccess('monitoring_push', user.plan) && !critical) {
        rows.push(log(user.userId, t, 'plan_gated'))
        continue
      }
      if (inQuietHours(now, target.location, prefs.quietStart, prefs.quietEnd)) {
        if (!(critical && prefs.allowCriticalOverride)) {
          rows.push(log(user.userId, t, 'suppressed_quiet_hours'))
          continue
        }
      }
      // Cooldown throttles the stream, never a critical warning.
      const sinceLast = now.getTime() - lastSentAt
      if (!critical && (sentThisRun > 0 || sinceLast < prefs.cooldownMinutes * 60_000)) {
        rows.push(log(user.userId, t, 'suppressed_cooldown'))
        continue
      }
      if (!subs.length) {
        rows.push(log(user.userId, t, 'no_subscription'))
        continue
      }
      if (!vapidReady()) {
        // The transition is already recorded; only delivery is impossible.
        rows.push(log(user.userId, t, 'failed', 'VAPID keys missing'))
        continue
      }

      const copy = notificationCopy(t, user.pt)
      const payload = JSON.stringify({
        title: copy.title,
        body: copy.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: copy.url, eventId: t.event.id, kind: t.kind },
      })

      const results = await Promise.allSettled(
        subs.map(s =>
          webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload),
        ),
      )
      const ok = results.some(r => r.status === 'fulfilled')

      const dead = subs
        .filter((_, i) => {
          const r = results[i]
          return r.status === 'rejected' && (r.reason as { statusCode?: number })?.statusCode === 410
        })
        .map(s => s.endpoint)
      if (dead.length) {
        guard(
          summary,
          'push_subscriptions.delete',
          await db.from('push_subscriptions').delete().in('endpoint', dead),
        )
      }

      if (ok) {
        summary.pushed += 1
        sentThisRun += 1
        rows.push({
          user_id: user.userId,
          hazard_event_id: t.event.id,
          transition_id: transitionIds.get(`${t.kind}:${t.event.id}`) ?? null,
          channel: 'push',
          status: 'sent',
          dedup_key: t.dedupKey,
          detail: copy.body.slice(0, 500),
        })
      } else {
        rows.push(log(user.userId, t, 'failed'))
      }
    }
  }

  if (rows.length) {
    // onConflict on the (user_id, dedup_key) unique index: a race between two
    // overlapping runs resolves into one row instead of a duplicate push.
    //
    // That index has to be TOTAL. It shipped partial (`WHERE dedup_key IS NOT
    // NULL`) and Postgres refused every batch with 42P10, which is what made
    // dedup and cooldown inert until D-222. `npm run test:hazard-dedup` is the
    // regression, and `guard` is why a repeat would be visible in one run
    // instead of four days later.
    guard(
      summary,
      'notification_delivery_log',
      await db
        .from('notification_delivery_log')
        .upsert(rows, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true }),
    )
  }
}

// ─── The run ──────────────────────────────────────────────────────────────────

async function scanOne(db: SupabaseClient, target: ScanTarget, summary: ScanSummary) {
  try {
    const events = await currentEventsFor(target)
    const { previous, ownedIds } = await loadPrevious(db, target.scanKey, events.map(e => e.id))
    const transitions = detectTransitions({ previous, current: events, ownedIds })
    summary.transitions += transitions.length

    const transitionIds = await persist(db, target.scanKey, events, transitions, summary)
    if (transitions.length) await deliver(db, target, transitions, transitionIds, summary)
  } catch (err) {
    summary.errors.push(`${target.scanKey}: ${err instanceof Error ? err.message : 'scan error'}`)
  }
}

/**
 * One full pass. Safe to call concurrently with itself: the unique dedup index
 * means the worst case of an overlapping run is wasted work, never a double push.
 */
export async function runHazardScan(): Promise<ScanSummary> {
  const startedAt = new Date()
  const summary: ScanSummary = {
    locations: 0,
    usersConsidered: 0,
    transitions: 0,
    pushed: 0,
    suppressed: {},
    errors: [],
    startedAt: startedAt.toISOString(),
    durationMs: 0,
  }

  const db = createAdminClient()
  if (!db) {
    summary.errors.push('SUPABASE_SERVICE_ROLE_KEY missing — scan cannot read profiles')
    summary.durationMs = Date.now() - startedAt.getTime()
    return summary
  }

  if (vapidReady()) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:brightscalegroup@gmail.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    )
  } else {
    // Detection and history still run; only delivery is impossible. Saying so
    // beats a silent no-op that looks like "no hazards today".
    summary.errors.push('VAPID keys missing — transitions recorded, no push sent')
  }

  const targets = await collectTargets(db)
  summary.locations = targets.length
  summary.usersConsidered = new Set(targets.flatMap(t => t.users.map(u => u.userId))).size

  for (let i = 0; i < targets.length; i += A.scanConcurrency) {
    const batch = targets.slice(i, i + A.scanConcurrency)
    await Promise.all(batch.map(t => scanOne(db, t, summary)))
  }

  summary.durationMs = Date.now() - startedAt.getTime()
  return summary
}
