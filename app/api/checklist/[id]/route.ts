import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canonicalKey, type ChecklistTier } from '@/lib/checklist'
import { ACQUISITION_STATUSES, legacyFromStatus, type AcquisitionStatus } from '@/lib/acquisition'
import { removeRequirement, syncRequirement, type ChecklistWrite } from '@/lib/requirements-sync'

interface Params { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  /*
   * Lê antes de apagar: sem a linha não há como saber qual requisito espelhado
   * remover, e um requisito órfão faria a prontidão contar uma falta que o
   * usuário já resolveu removendo o item (D-172).
   */
  const { data: antes } = await supabase
    .from('checklists')
    .select('canonical_key, kit_type')
    .eq('id', id)
    .eq('profile_id', user.id)
    .maybeSingle()

  const { error } = await supabase
    .from('checklists')
    .delete()
    .eq('id', id)
    .eq('profile_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (antes) await removeRequirement(supabase, user.id, antes.canonical_key, antes.kit_type)

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
    patch.item_name = name
    patch.canonical_key = canonicalKey(name)
  }
  if (body.quantity !== undefined) {
    const quantity = Number(body.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }
    patch.quantity = Math.min(9999, quantity)
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
    /*
     * `acquired` continua sendo mantida em paralelo até o cutover (D-171).
     * Uma coluna nova que deixa a antiga divergir é pior que nenhuma coluna
     * nova: todo código que ainda lê o booleano passaria a mentir.
     */
    patch.acquired = legacyFromStatus(body.status as AcquisitionStatus)
  }
  if (body.tier !== undefined) {
    if (!TIERS.includes(body.tier as ChecklistTier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }
    patch.tier = body.tier
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  /*
   * Renomear recalcula `canonical_key` (D-121). Guardamos a chave ANTERIOR
   * porque o espelho da chave velha viraria órfão — e um requisito órfão faz a
   * prontidão contar uma falta que não existe mais (D-172).
   */
  const { data: antes } = await supabase
    .from('checklists')
    .select('canonical_key, kit_type')
    .eq('id', id)
    .eq('profile_id', user.id)
    .maybeSingle()

  const { error, data } = await supabase
    .from('checklists')
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
   * Escrita dupla (D-172), na ordem que importa: primeiro grava a chave NOVA,
   * depois remove a antiga se ela mudou. O inverso deixaria uma janela em que
   * o requisito não existe em nenhuma das duas chaves.
   */
  if (data) {
    await syncRequirement(supabase, user.id, data as ChecklistWrite)
    if (antes && antes.canonical_key !== data.canonical_key) {
      await removeRequirement(supabase, user.id, antes.canonical_key, antes.kit_type)
    }
  }

  return NextResponse.json({ ok: true, item: data })
}
