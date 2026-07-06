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

  // RLS lets the requester read their own rows, but we need the circle name too;
  // use the admin client for the join (still scoped to this user's requests).
  const admin = createAdminClient()
  const client = admin ?? supabase
  const { data, error } = await client
    .from('circle_join_requests')
    .select('id, circle_id, status, created_at, circles:circle_id(name)')
    .eq('requester_id', user.id)
    .in('status', ['pending', 'rejected'])
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requests = (data ?? []).map(r => {
    const c = r.circles as { name?: string } | null
    return { id: r.id, circle_id: r.circle_id, status: r.status, created_at: r.created_at, circle_name: c?.name ?? '—' }
  })
  return NextResponse.json({ requests })
}
