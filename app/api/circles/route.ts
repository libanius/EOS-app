import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInviteCode, computeCircleScore } from '@/lib/circles'

type CircleRole = 'Admin' | 'Editor' | 'Viewer'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberships, error: mErr } = await supabase
    .from('circle_members')
    .select('circle_id, role, share_inventory, shared_fields')
    .eq('user_id', user.id)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const circleIds = (memberships ?? []).map(m => m.circle_id)
  const { data: ledCircles } = await supabase.from('circles').select('id').eq('leader_id', user.id)
  const allIds = Array.from(new Set<string>([...circleIds, ...((ledCircles ?? []).map(c => c.id) as string[])]))
  if (allIds.length === 0) return NextResponse.json({ circles: [] })

  const { data: circles } = await supabase
    .from('circles')
    .select('id, name, invite_code, leader_id, created_at')
    .in('id', allIds)

  const results: unknown[] = []
  for (const c of circles ?? []) {
    const [{ data: pooled }, { data: members }] = await Promise.all([
      supabase.rpc('circle_pooled_inventory', { circle_uuid: c.id }),
      supabase.from('circle_members')
        .select('user_id, role, share_inventory, shared_fields, profiles(name, location_lat, location_lng, emergency_contact_name, emergency_contact_phone)')
        .eq('circle_id', c.id),
    ])
    const row = Array.isArray(pooled) ? pooled[0] : pooled
    const score = computeCircleScore({
      water_liters: Number(row?.water_liters ?? 0),
      food_days: Number(row?.food_days ?? 0),
      medical_kit_count: Number(row?.medical_kit_count ?? 0),
      communication_device_count: Number(row?.communication_device_count ?? 0),
      member_count: Number(row?.member_count ?? 0),
    })
    const myMembership = memberships?.find(m => m.circle_id === c.id)
    const myRole = (myMembership?.role as CircleRole | undefined) ?? (c.leader_id === user.id ? 'Admin' : 'Viewer')
    results.push({
      ...c,
      is_admin: myRole === 'Admin',
      role: myRole,
      share_inventory: myMembership?.share_inventory ?? false,
      shared_fields: (myMembership?.shared_fields as string[] | undefined) ?? [],
      pooled: row,
      score,
      members: (members ?? []).map(m => {
        const p = m.profiles as { name?: string; location_lat?: number; location_lng?: number; emergency_contact_name?: string; emergency_contact_phone?: string } | null
        const sharedFields = (m.shared_fields as string[] | undefined) ?? []
        const sharesContact = m.share_inventory && (sharedFields.length === 0 || sharedFields.includes('emergency_contact'))
        return {
          user_id: m.user_id,
          role: m.role as CircleRole,
          name: p?.name ?? '—',
          location_lat: p?.location_lat ?? null,
          location_lng: p?.location_lng ?? null,
          emergency_contact_name: sharesContact ? (p?.emergency_contact_name ?? null) : null,
          emergency_contact_phone: sharesContact ? (p?.emergency_contact_phone ?? null) : null,
          share_inventory: m.share_inventory as boolean,
          is_me: m.user_id === user.id,
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
