import { type NextRequest, NextResponse } from 'next/server'
import { geocodeLocation } from '@/lib/geocode'
import { createClient } from '@/lib/supabase/server'


// ─── POST /api/profile ────────────────────────────────────────────────────────
// Upserts the authenticated user's profile row (used by onboarding).
// Body:   { name: string, location: string | null }
// Returns: { profile: Profile }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  let body: { name?: string; location?: string | null }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }
  const name = body.name?.trim()
  const location = body.location?.trim() || null
  if (!name) {
    return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  }

  const upsertData: Record<string, unknown> = { id: user.id, name, location }
  if (location) {
    const coords = await geocodeLocation(location)
    if (coords) {
      upsertData.location_lat = coords.lat
      upsertData.location_lng = coords.lng
    }
  } else {
    upsertData.location_lat = null
    upsertData.location_lng = null
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(upsertData, { onConflict: 'id' })
    .select('id, name, location, created_at')
    .single()
  if (error) {
    console.error('[POST /api/profile]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ profile: data }, { status: 200 })
}
