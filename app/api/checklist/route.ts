import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/checklist
 *
 * Returns all checklist items belonging to the authenticated user, grouped
 * by tier, with the "shared" flag indicating the item appears in more than
 * one scenario (canonical_key duplicated across scenario_ids).
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

  const { data, error } = await supabase
    .from('checklists')
    .select(
      'id, scenario_id, canonical_key, item_name, tier, quantity, unit, acquired, acquired_at',
    )
    .eq('profile_id', user.id)
    .order('tier', { ascending: true })
    .order('item_name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.canonical_key, (counts.get(row.canonical_key) ?? 0) + 1)
  }

  const items = (data ?? []).map((row) => ({
    ...row,
    shared: (counts.get(row.canonical_key) ?? 0) > 1,
  }))

  return NextResponse.json({ items })
}
