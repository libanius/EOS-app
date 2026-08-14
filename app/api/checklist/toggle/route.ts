import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { statusFromLegacy } from '@/lib/acquisition'
import { syncRequirements, type ChecklistWrite } from '@/lib/requirements-sync'

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
        // A coluna nova acompanha o booleano (D-171). Deixá-las divergir faria
        // a tela mostrar um estado e o modelo novo guardar outro.
        status: statusFromLegacy(body.acquired),
      },
      { count: 'exact' },
    )
    .eq('profile_id', user.id)
    .eq('canonical_key', body.canonicalKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  /*
   * Escrita dupla (D-172). O toggle atinge TODAS as linhas com a mesma
   * `canonical_key` — inclusive em kits diferentes —, então o espelho precisa
   * reler quais foram, e não supor uma.
   */
  const { data: afetadas } = await supabase
    .from('checklists')
    .select('canonical_key, item_name, tier, quantity, unit, acquired, kit_type, status')
    .eq('profile_id', user.id)
    .eq('canonical_key', body.canonicalKey)
  await syncRequirements(supabase, user.id, (afetadas ?? []) as ChecklistWrite[])

  return NextResponse.json({ ok: true, updated: count ?? 0 })
}
