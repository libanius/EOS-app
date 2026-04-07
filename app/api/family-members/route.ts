import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── GET /api/family-members ──────────────────────────────────────────────────
// Returns all family members for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('family_members')
    .select('id, profile_id, name, age, medical_conditions, mobility_impaired, is_infant, created_at')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/family-members]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ members: data })
}

// ─── POST /api/family-members ─────────────────────────────────────────────────
// Creates a new family member for the authenticated user.
//
// Body: { name, age?, medical_conditions?, mobility_impaired?, is_infant? }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

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

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('family_members')
    .insert({
      profile_id:         user.id,
      name,
      age:                body.age ?? null,
      medical_conditions: body.medical_conditions ?? [],
      mobility_impaired:  body.mobility_impaired ?? false,
      is_infant:          body.is_infant ?? false,
    })
    .select('id, profile_id, name, age, medical_conditions, mobility_impaired, is_infant, created_at')
    .single()

  if (error) {
    console.error('[POST /api/family-members]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ member: data }, { status: 201 })
}
