import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const FICHA_FIELDS = 'id, name, location, blood_type, allergies, emergency_contact_name, emergency_contact_phone, medical_notes, medications'

// ─── GET /api/profile/ficha ───────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  const { data, error } = await supabase
    .from('profiles').select(FICHA_FIELDS).eq('id', user.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ficha: data })
}

// ─── PATCH /api/profile/ficha ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  let body: {
    name?: string
    location?: string | null
    blood_type?: string | null
    allergies?: string[]
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
    medical_notes?: string | null
    medications?: string[]
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    patch.name = name
  }
  if (body.location !== undefined) patch.location = body.location?.trim() || null
  if (body.blood_type              !== undefined) patch.blood_type              = body.blood_type
  if (body.allergies               !== undefined) patch.allergies               = body.allergies
  if (body.emergency_contact_name  !== undefined) patch.emergency_contact_name  = body.emergency_contact_name
  if (body.emergency_contact_phone !== undefined) patch.emergency_contact_phone = body.emergency_contact_phone
  if (body.medical_notes           !== undefined) patch.medical_notes           = body.medical_notes
  if (body.medications             !== undefined) patch.medications             = body.medications
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('profiles').update(patch).eq('id', user.id).select(FICHA_FIELDS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ficha: data })
}

// ─── POST /api/profile/ficha — leitura pública (socorristas, sem auth) ────────
export async function POST(req: NextRequest) {
  let body: { id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await service
    .from('profiles').select(FICHA_FIELDS).eq('id', body.id).single()
  if (error || !data) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 })
  return NextResponse.json({ ficha: data })
}
