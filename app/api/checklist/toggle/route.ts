import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ToggleBody {
  canonicalKey: string
  acquired: boolean
}

/**
 * POST /api/checklist/toggle
 * Body: { canonicalKey: string; acquired: boolean }
 *
 * Toggles ALL rows of the authenticated user sharing the same canonical_key.
 * Guarantees cross-scenario dedup: mark item in A -> item in B auto-updated.
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

  let body: ToggleBody
  try {
    body = (await req.json()) as ToggleBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.canonicalKey || typeof body.acquired !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { error, count } = await supabase
    .from('checklists')
    .update(
      {
        acquired: body.acquired,
        acquired_at: body.acquired ? new Date().toISOString() : null,
      },
      { count: 'exact' },
    )
    .eq('profile_id', user.id)
    .eq('canonical_key', body.canonicalKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: count ?? 0 })
}
