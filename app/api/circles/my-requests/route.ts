import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/circles/my-requests — the caller's own pending/rejected join requests,
 * with the target circle name, so the UI can show a "pending approval" state.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const client = admin ?? supabase
  const { data, error } = await client
    .from('circle_join_requests')
    .select('id, circle_id, status, created_at')
    .eq('requester_id', user.id)
    .in('status', ['pending', 'rejected'])
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const circleIds = (data ?? []).map(r => r.circle_id)
  const nameById = new Map<string, string>()
  if (circleIds.length) {
    const { data: circles } = await client.from('circles').select('id, name').in('id', circleIds)
    for (const c of circles ?? []) nameById.set(c.id, c.name)
  }

  const requests = (data ?? []).map(r => ({
    id: r.id, circle_id: r.circle_id, status: r.status, created_at: r.created_at,
    circle_name: nameById.get(r.circle_id) ?? '—',
  }))
  return NextResponse.json({ requests })
}
