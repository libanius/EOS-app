import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

// ─── PATCH /api/family-members/[id] ──────────────────────────────────────────
// Updates a family member that belongs to the authenticated user.
//
// Body: { name?, age?, medical_conditions?, mobility_impaired?, is_infant? }
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params

  let body: {
    name?: string
    age?: number | null
    medical_conditions?: string[]
    mobility_impaired?: boolean
    is_infant?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  // Build update payload — only include fields that were sent
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined)               patch.name               = body.name.trim()
  if (body.age !== undefined)                patch.age                = body.age
  if (body.medical_conditions !== undefined) patch.medical_conditions = body.medical_conditions
  if (body.mobility_impaired !== undefined)  patch.mobility_impaired  = body.mobility_impaired
  if (body.is_infant !== undefined)          patch.is_infant          = body.is_infant

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  if (patch.name === '') {
    return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  }

  // RLS guarantees profile_id = auth.uid() — .eq filter adds defence-in-depth
  const { data, error } = await supabase
    .from('family_members')
    .update(patch)
    .eq('id', id)
    .eq('profile_id', user.id)
    .select('id, profile_id, name, age, medical_conditions, mobility_impaired, is_infant, created_at')
    .single()

  if (error) {
    console.error('[PATCH /api/family-members/:id]', error.message)
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json({ member: data })
}

// ─── DELETE /api/family-members/[id] ─────────────────────────────────────────
// Deletes a family member that belongs to the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params

  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', id)
    .eq('profile_id', user.id)

  if (error) {
    console.error('[DELETE /api/family-members/:id]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
