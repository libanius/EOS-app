import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canonicalKey, type ChecklistTier } from '@/lib/checklist'
import { ACQUISITION_STATUSES, legacyFromStatus, type AcquisitionStatus } from '@/lib/acquisition'

interface Params { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cutover (D-176): o id agora é de `requirements`.
  const { error } = await supabase
    .from('requirements')
    .delete()
    .eq('id', id)
    .eq('profile_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

interface PatchBody { item_name?: string; quantity?: number; unit?: string | null; tier?: string; status?: string }

const TIERS: ChecklistTier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PatchBody
  try { body = (await req.json()) as PatchBody }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, string | number | boolean | null> = {}
  if (typeof body.item_name === 'string') {
    const name = body.item_name.trim().slice(0, 160)
    if (!name) return NextResponse.json({ error: 'item_name required' }, { status: 400 })
    patch.label = name
    // `resource_key` acompanha o nome: é a chave que liga precisar a ter.
    patch.resource_key = canonicalKey(name)
  }
  if (body.quantity !== undefined) {
    const quantity = Number(body.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }
    patch.quantity = quantity
  }
  if (body.unit !== undefined) {
    patch.unit = typeof body.unit === 'string' && body.unit.trim()
      ? body.unit.trim().slice(0, 24)
      : null
  }
  if (body.status !== undefined) {
    if (!ACQUISITION_STATUSES.includes(body.status as AcquisitionStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    patch.status = body.status
  }
  if (body.tier !== undefined) {
    if (!TIERS.includes(body.tier as ChecklistTier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }
    patch.tier = body.tier
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // Cutover (D-176): o id é de `requirements`, e `checklists` está congelada.
  const { error, data } = await supabase
    .from('requirements')
    .update(patch)
    .eq('id', id)
    .eq('profile_id', user.id)
    .select()
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  /*
   * A tela lê `item_name`/`canonical_key`; o banco novo guarda `label`/
   * `resource_key`. Traduzir aqui evita mudar a tela junto com o banco.
   */
  return NextResponse.json({
    ok: true,
    item: data && {
      id: data.id,
      item_name: data.label,
      canonical_key: data.resource_key,
      tier: data.tier,
      quantity: Number(data.quantity) || 0,
      unit: data.unit,
      status: data.status,
      acquired: legacyFromStatus(data.status),
    },
  })
}
