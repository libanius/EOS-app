import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canonicalKey, type ChecklistTier } from '@/lib/checklist'
import { syncRequirements } from '@/lib/requirements-sync'

interface SaveBody {
  kitType: string
  items: { name: string; tier?: ChecklistTier; quantity?: number; unit?: string | null }[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: SaveBody
  try { body = (await req.json()) as SaveBody }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.kitType || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'kitType and items required' }, { status: 400 })
  }

  const rows = body.items
    .filter((i) => i.name?.trim())
    .map((i) => ({
      profile_id: user.id,
      kit_type: body.kitType,
      canonical_key: canonicalKey(i.name),
      item_name: i.name.trim(),
      tier: (i.tier ?? 'ESSENTIAL') as ChecklistTier,
      quantity: i.quantity ?? 1,
      unit: i.unit ?? null,
      acquired: false,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid items' }, { status: 400 })
  }

  /*
   * Cutover (D-176): grava só em `requirements`. `checklists` está congelada.
   *
   * `syncRequirement` continua sendo a porta — ela já lê-então-escreve, já
   * resolve o kit sob demanda e já está provada contra o banco
   * (`npm run test:dual-write`). O que muda é o papel: era espelho, virou a
   * escrita.
   */
  await syncRequirements(supabase, user.id, rows)

  return NextResponse.json({ ok: true, saved: rows.length })
}
