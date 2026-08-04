import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateInviteCode, computeCircleScore } from '@/lib/circles'

type MemberProfile = {
  name?: string
  location_lat?: number
  location_lng?: number
  last_location_lat?: number | null
  last_location_lng?: number | null
  last_location_at?: string | null
  emergency_contact_name?: string
  emergency_contact_phone?: string
  avatar_url?: string | null
}

type CircleRole = 'Admin' | 'Editor' | 'Viewer'
type FamilyAccessStatus = 'none' | 'requested' | 'approved' | 'denied'
type CircleMembershipRow = {
  circle_id: string
  user_id?: string
  role?: string | null
  share_inventory?: boolean | null
  shared_fields?: string[] | null
  family_access_status?: FamilyAccessStatus | null
  family_access_requested_at?: string | null
  family_access_requested_by?: string | null
  family_access_approved_at?: string | null
  family_access_approved_by?: string | null
}

/** Beyond this the live point is history, not a position — fall back to profile. */
const LIVE_POINT_MAX_AGE_MS = 30 * 60 * 1000

/**
 * D-064 — location consent.
 *
 * Unlike inventory and emergency contact, an EMPTY `shared_fields` does NOT mean
 * "share location". That legacy "empty = share all" convention predates this
 * decision, and a member who never opened the toggle must not start broadcasting
 * their position because of it. Location requires the string to be present.
 */
function sharesLocation(sharedFields: string[]) {
  return sharedFields.includes('location')
}

/**
 * Resolve what the circle is allowed to see for one member: a fresh live point,
 * or the static profile point, or nothing. `freshness` is returned alongside so
 * the UI can never present a stale point as a current one.
 */
function memberLocation(profile: MemberProfile | null, consented: boolean, isMe: boolean) {
  const none = { lat: null, lng: null, source: null as 'live' | 'profile' | null, at: null as string | null }
  // You always see yourself: consent governs what OTHERS see, not your own map.
  if (!profile || (!consented && !isMe)) return none

  const liveAt = profile.last_location_at ? Date.parse(profile.last_location_at) : 0
  const liveFresh = liveAt > 0 && Date.now() - liveAt < LIVE_POINT_MAX_AGE_MS
  if (liveFresh && typeof profile.last_location_lat === 'number' && typeof profile.last_location_lng === 'number') {
    return {
      lat: profile.last_location_lat,
      lng: profile.last_location_lng,
      source: 'live' as const,
      at: profile.last_location_at ?? null,
    }
  }

  if (typeof profile.location_lat === 'number' && typeof profile.location_lng === 'number') {
    return { lat: profile.location_lat, lng: profile.location_lng, source: 'profile' as const, at: null }
  }
  return none
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberships, error: mErr } = await supabase
    .from('circle_members')
    .select('circle_id, role, share_inventory, shared_fields, family_access_status, family_access_requested_at, family_access_requested_by, family_access_approved_at, family_access_approved_by')
    .eq('user_id', user.id)
  let myMemberships = memberships as CircleMembershipRow[] | null
  if (mErr) {
    const { data: legacyMemberships, error: legacyErr } = await supabase
      .from('circle_members')
      .select('circle_id, role, share_inventory, shared_fields')
      .eq('user_id', user.id)
    if (legacyErr) return NextResponse.json({ error: legacyErr.message }, { status: 500 })
    myMemberships = legacyMemberships as CircleMembershipRow[] | null
  }

  const circleIds = (myMemberships ?? []).map(m => m.circle_id)
  const { data: ledCircles } = await supabase.from('circles').select('id').eq('leader_id', user.id)
  const allIds = Array.from(new Set<string>([...circleIds, ...((ledCircles ?? []).map(c => c.id) as string[])]))
  if (allIds.length === 0) return NextResponse.json({ circles: [] })

  const { data: circles } = await supabase
    .from('circles')
    .select('id, name, invite_code, leader_id, created_at')
    .in('id', allIds)

  const admin = createAdminClient()
  const results: unknown[] = []
  for (const c of circles ?? []) {
    const [{ data: pooled }, { data: members }] = await Promise.all([
      supabase.rpc('circle_pooled_inventory', { circle_uuid: c.id }),
      supabase.from('circle_members')
        .select('user_id, role, share_inventory, shared_fields, family_access_status, family_access_requested_at, family_access_requested_by, family_access_approved_at, family_access_approved_by')
        .eq('circle_id', c.id),
    ])
    let circleMembers = members as CircleMembershipRow[] | null
    if (!circleMembers) {
      const { data: legacyMembers } = await supabase.from('circle_members')
        .select('user_id, role, share_inventory, shared_fields')
        .eq('circle_id', c.id)
      circleMembers = legacyMembers as CircleMembershipRow[] | null
    }
    // circle_members.user_id references auth.users, and profiles is owner-only
    // under RLS — so resolve co-members' identities with the service-role client
    // (the caller is a member of this circle, which we are iterating).
    const memberIds = (circleMembers ?? []).map(m => m.user_id)
    const profileById = new Map<string, MemberProfile>()
    if (admin && memberIds.length) {
      const { data: profs } = await admin
        .from('profiles')
        .select(
          'id, name, location_lat, location_lng, last_location_lat, last_location_lng, last_location_at, emergency_contact_name, emergency_contact_phone',
        )
        .in('id', memberIds)
      for (const p of profs ?? []) profileById.set(p.id, p as MemberProfile)

      // Faces make a family map readable at a glance. The avatar lives in a
      // private bucket, so each one becomes a short-lived signed URL — the
      // storage path itself never leaves the server.
      const { data: personas } = await admin
        .from('profile_personalization')
        .select('profile_id, avatar_path')
        .in('profile_id', memberIds)
      for (const persona of personas ?? []) {
        const path = (persona as { avatar_path?: string }).avatar_path
        if (!path) continue
        const { data: signed } = await admin.storage.from('profile-photos').createSignedUrl(path, 60 * 60)
        const existing = profileById.get(persona.profile_id as string)
        if (existing && signed?.signedUrl) existing.avatar_url = signed.signedUrl
      }
      // Migration 20260727000000_live_location.sql not applied yet: the live
      // columns are unknown, so re-read without them. Circles must keep working.
      if (!profs) {
        const { data: legacy } = await admin
          .from('profiles')
          .select('id, name, location_lat, location_lng, emergency_contact_name, emergency_contact_phone')
          .in('id', memberIds)
        for (const p of legacy ?? []) profileById.set(p.id, p as MemberProfile)
      }
    }
    const row = Array.isArray(pooled) ? pooled[0] : pooled
    const score = computeCircleScore({
      water_liters: Number(row?.water_liters ?? 0),
      food_days: Number(row?.food_days ?? 0),
      medical_kit_count: Number(row?.medical_kit_count ?? 0),
      communication_device_count: Number(row?.communication_device_count ?? 0),
      member_count: Number(row?.member_count ?? 0),
    })
    const myMembership = myMemberships?.find(m => m.circle_id === c.id)
    const myRole = (myMembership?.role as CircleRole | undefined) ?? (c.leader_id === user.id ? 'Admin' : 'Viewer')
    results.push({
      ...c,
      is_admin: myRole === 'Admin',
      role: myRole,
      share_inventory: myMembership?.share_inventory ?? false,
      shared_fields: (myMembership?.shared_fields as string[] | undefined) ?? [],
      pooled: row,
      score,
      members: (circleMembers ?? []).filter((m): m is CircleMembershipRow & { user_id: string } => typeof m.user_id === 'string').map(m => {
        const p = profileById.get(m.user_id) ?? null
        const sharedFields = (m.shared_fields as string[] | undefined) ?? []
        const sharesContact = m.share_inventory && (sharedFields.length === 0 || sharedFields.includes('emergency_contact'))
        const isMe = m.user_id === user.id
        // D-064: coordinates were previously returned for every member with no
        // gate at all, while emergency contact was gated — a privacy defect
        // against doc 12 §103 and D-051 §1.
        const location = memberLocation(p, sharesLocation(sharedFields), isMe)
        return {
          user_id: m.user_id,
          role: m.role as CircleRole,
          name: p?.name ?? '—',
          avatar_url: p?.avatar_url ?? null,
          location_lat: location.lat,
          location_lng: location.lng,
          /** 'live' | 'profile' | null — the UI must label the point with this. */
          location_source: location.source,
          location_at: location.at,
          shares_location: sharesLocation(sharedFields),
          emergency_contact_name: sharesContact ? (p?.emergency_contact_name ?? null) : null,
          emergency_contact_phone: sharesContact ? (p?.emergency_contact_phone ?? null) : null,
          share_inventory: m.share_inventory as boolean,
          family_access_status: ((m.family_access_status as FamilyAccessStatus | undefined) ?? 'none'),
          family_access_requested_at: (m.family_access_requested_at as string | undefined) ?? null,
          family_access_requested_by: (m.family_access_requested_by as string | undefined) ?? null,
          family_access_approved_at: (m.family_access_approved_at as string | undefined) ?? null,
          family_access_approved_by: (m.family_access_approved_by as string | undefined) ?? null,
          is_me: isMe,
        }
      }),
    })
  }
  return NextResponse.json({ circles: results })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.name || typeof body.name !== 'string') return NextResponse.json({ error: 'name required' }, { status: 400 })

  let circle: { id: string; invite_code: string } | null = null
  let lastErr: string | null = null
  for (let attempt = 0; attempt < 5 && !circle; attempt++) {
    const invite_code = generateInviteCode()
    const { data, error } = await supabase.from('circles')
      .insert({ name: body.name.trim().slice(0, 60), invite_code, leader_id: user.id })
      .select('id, invite_code').single()
    if (!error && data) { circle = data; break }
    lastErr = error?.message ?? null
    if (!error?.message?.includes('unique')) break
  }
  if (!circle) return NextResponse.json({ error: lastErr ?? 'Could not create circle' }, { status: 500 })

  await supabase.from('circle_members').insert({
    circle_id: circle.id, user_id: user.id, role: 'Admin', share_inventory: true,
  })
  return NextResponse.json({ circle }, { status: 201 })
}
