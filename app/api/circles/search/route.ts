import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/circles/search?q=name — find circles by name so a user can request to
 * join one without a code (spec: "Isadora pede para entrar sem convite prévio").
 * Returns only id, name and member_count — never inventory or member data.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ circles: [] })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  // Escape ILIKE wildcards in user input.
  const safe = q.replace(/[%_]/g, (m) => `\\${m}`)
  const { data: circles, error } = await admin
    .from('circles')
    .select('id, name')
    .ilike('name', `%${safe}%`)
    .limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Annotate with member count and whether the caller already belongs / requested.
  const ids = (circles ?? []).map(c => c.id)
  const [{ data: members }, { data: myReqs }] = await Promise.all([
    admin.from('circle_members').select('circle_id, user_id').in('circle_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    admin.from('circle_join_requests').select('circle_id, status').eq('requester_id', user.id).in('circle_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
  ])
  const countByCircle = new Map<string, number>()
  const iAmMember = new Set<string>()
  for (const m of members ?? []) {
    countByCircle.set(m.circle_id, (countByCircle.get(m.circle_id) ?? 0) + 1)
    if (m.user_id === user.id) iAmMember.add(m.circle_id)
  }
  const myReqStatus = new Map<string, string>()
  for (const r of myReqs ?? []) myReqStatus.set(r.circle_id, r.status)

  const results = (circles ?? []).map(c => ({
    id: c.id,
    name: c.name,
    member_count: countByCircle.get(c.id) ?? 0,
    is_member: iAmMember.has(c.id),
    request_status: myReqStatus.get(c.id) ?? null,
  }))
  return NextResponse.json({ circles: results })
}
