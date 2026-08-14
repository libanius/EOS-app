import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { statusFromLegacy } from '@/lib/acquisition'

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

  /*
   * Cutover (D-176): opera em `requirements`. `checklists` está congelada.
   *
   * Continua atingindo TODAS as linhas do mesmo `resource_key` — inclusive em
   * kits diferentes —, que é o comportamento que a tela sempre teve: marcar
   * "água" na Bug Out marca "água" na casa.
   */
  const { error, count } = await supabase
    .from('requirements')
    .update({ status: statusFromLegacy(body.acquired) }, { count: 'exact' })
    .eq('profile_id', user.id)
    .eq('resource_key', body.canonicalKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: count ?? 0 })
}
