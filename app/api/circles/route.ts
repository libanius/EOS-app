import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInviteCode, computeCircleScore } from '@/lib/circles'

/**
 * GET /api/circles
 *
 * Returns every Circle the caller belongs to (as leader or member) along with
 * its Circle Strength Score.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Own memberships (LEADER via circles.leader_id, MEMBER via circle_members).
  const { data: memberships, error: mErr } = await supabase
    .from('circle_members')
    .select('circle_id, role, share_inventory')
    .eq('user_id', user.id)

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 })
  }

  const circleIds = (memberships ?? []).map((m) => m.circle_id)

  // Also pull circles where I'm the leader even if circle_members row missing.
  const { data: ledCircles } = await supabase
    .from('circles')
    .select('id')
    .eq('leader_id', user.id)

  const allIds = Array.from(
    new Set<string>([
      ...circleIds,
      ...((ledCircles ?? []).map((c) => c.id) as string[]),
    ]),
  )

  if (allIds.length === 0) {
    return NextResponse.json({ circles: [] })
  }

  const { data: circles } = await supabase
    .from('circles')
    .select('id, name, invite_code, leader_id, created_at')
    .in('id', allIds)

  // Score per circle
  const results: unknown[] = []
  for (const c of circles ?? []) {
    const { data: pooled } = await supabase.rpc('circle_pooled_inventory', {
      circle_uuid: c.id,
    })
    const row = Array.isArray(pooled) ? pooled[0] : pooled
    const score = computeCircleScore({
      water_liters: Number(row?.water_liters ?? 0),
      food_days: Number(row?.food_days ?? 0),
      medical_kit_count: Number(row?.medical_kit_count ?? 0),
      communication_device_count: Number(
        row?.communication_device_count ?? 0,
      ),
      member_count: Number(row?.member_count ?? 0),
    })

    const myMembership = memberships?.find((m) => m.circle_id === c.id)
    results.push({
      ...c,
      is_leader: c.leader_id === user.id,
      role: c.leader_id === user.id ? 'LEADER' : myMembership?.role ?? 'MEMBER',
      share_inventory: myMembership?.share_inventory ?? false,
      pooled: row,
      score,
    })
  }

  return NextResponse.json({ circles: results })
}

/**
 * POST /api/circles
 * Body: { name: string }
 *
 * Creates a new Circle. Caller becomes the LEADER and is auto-inserted into
 * circle_members so RLS queries return them.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: string }
  try {
    body = (await req.json()) as { name?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }

  // Try a few times in the rare case of invite-code collision.
  let circle: { id: string; invite_code: string } | null = null
  let lastErr: string | null = null
  for (let attempt = 0; attempt < 5 && !circle; attempt += 1) {
    const invite_code = generateInviteCode()
    const { data, error } = await supabase
      .from('circles')
      .insert({
        name: body.name.trim().slice(0, 60),
        invite_code,
        leader_id: user.id,
      })
      .select('id, invite_code')
      .single()

    if (!error && data) {
      circle = data
      break
    }
    lastErr = error?.message ?? null
    if (!error?.message?.includes('unique')) break
  }

  if (!circle) {
    return NextResponse.json(
      { error: lastErr ?? 'Could not create circle' },
      { status: 500 },
    )
  }

  // Auto-insert leader as member (role LEADER).
  await supabase
    .from('circle_members')
    .insert({
      circle_id: circle.id,
      user_id: user.id,
      role: 'LEADER',
      share_inventory: true,
    })

  return NextResponse.json({ circle }, { status: 201 })
}
