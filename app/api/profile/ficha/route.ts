import { type NextRequest, NextResponse } from 'next/server'
import { geocodeLocation } from '@/lib/geocode'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { ensureProfile } from '@/lib/ensure-profile'
import { DEFAULT_MAP_BASE_MODE, normalizeMapBaseMode, type MapBaseMode } from '@/lib/map-base-mode'

const PUBLIC_FICHA_FIELDS = 'id, name, location, location_lat, location_lng, blood_type, allergies, emergency_contact_name, emergency_contact_phone, medical_notes, medications'
const PRIVATE_FICHA_FIELDS = `${PUBLIC_FICHA_FIELDS}, map_base_mode`

function columnMissing(error: { code?: string } | null) {
  return error?.code === '42703'
}

// ─── GET /api/profile/ficha ───────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  await ensureProfile(supabase, user)
  let { data, error } = await supabase
    .from('profiles').select(PRIVATE_FICHA_FIELDS).eq('id', user.id).single()
  if (columnMissing(error)) {
    const fallback = await supabase
      .from('profiles').select(PUBLIC_FICHA_FIELDS).eq('id', user.id).single()
    data = fallback.data ? { ...fallback.data, map_base_mode: DEFAULT_MAP_BASE_MODE } : fallback.data
    error = fallback.error
  }
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
  await ensureProfile(supabase, user)
  let body: {
    name?: string
    location?: string | null
    blood_type?: string | null
    allergies?: string[]
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
    medical_notes?: string | null
    medications?: string[]
    map_base_mode?: MapBaseMode
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
  if (body.location !== undefined) {
    const loc = body.location?.trim() || null
    patch.location = loc
    if (loc) {
      const coords = await geocodeLocation(loc)
      if (coords) {
        patch.location_lat = coords.lat
        patch.location_lng = coords.lng
      }
    } else {
      patch.location_lat = null
      patch.location_lng = null
    }
  }
  if (body.blood_type              !== undefined) patch.blood_type              = body.blood_type
  if (body.allergies               !== undefined) patch.allergies               = body.allergies
  if (body.emergency_contact_name  !== undefined) patch.emergency_contact_name  = body.emergency_contact_name
  if (body.emergency_contact_phone !== undefined) patch.emergency_contact_phone = body.emergency_contact_phone
  if (body.medical_notes           !== undefined) patch.medical_notes           = body.medical_notes
  if (body.medications             !== undefined) patch.medications             = body.medications
  if (body.map_base_mode           !== undefined) {
    const mapBaseMode = normalizeMapBaseMode(body.map_base_mode)
    if (!mapBaseMode) return NextResponse.json({ error: 'Base do mapa inválida.' }, { status: 400 })
    patch.map_base_mode = mapBaseMode
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }
  let { data, error } = await supabase
    .from('profiles').update(patch).eq('id', user.id).select(PRIVATE_FICHA_FIELDS).single()
  if (columnMissing(error)) {
    const legacyPatch = { ...patch }
    delete legacyPatch.map_base_mode
    if (Object.keys(legacyPatch).length === 0) {
      return NextResponse.json({
        ficha: { id: user.id, map_base_mode: patch.map_base_mode },
        migrationPending: true,
      })
    }
    const fallback = await supabase
      .from('profiles').update(legacyPatch).eq('id', user.id).select(PUBLIC_FICHA_FIELDS).single()
    data = fallback.data ? { ...fallback.data, map_base_mode: patch.map_base_mode } : fallback.data
    error = fallback.error
  }
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Guard the service role key so a misconfigured environment returns a clean
  // JSON error instead of crashing the serverless function with a bare 500.
  if (!url || !key) {
    console.error('[POST /api/profile/ficha] Missing SUPABASE_SERVICE_ROLE_KEY')
    return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })
  }
  const service = createServiceClient(url, key)
  const { data, error } = await service
    .from('profiles').select(PUBLIC_FICHA_FIELDS).eq('id', body.id).single()
  if (error || !data) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 })
  return NextResponse.json({ ficha: data })
}
