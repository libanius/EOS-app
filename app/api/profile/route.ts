import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── POST /api/profile ────────────────────────────────────────────────────────
//
// Upserts the authenticated user's profile row.
//
// The handle_new_user trigger creates a stub row at signup using the
// raw_user_meta_data full_name. This endpoint lets the onboarding flow
// confirm the name and add the location field.
//
// Body:   { name: string, location: string | null }
// Returns: { profile: Profile }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  // ── Validation ────────────────────────────────────────────────────────────
  let body: { name?: string; location?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const name = body.name?.trim()
  const location = body.location?.trim() || null

  if (!name) {
    return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  }

  // ── Upsert ────────────────────────────────────────────────────────────────
  // INSERT the row with auth.uid() as id (satisfies RN spec).
  // ON CONFLICT (id) → UPDATE, because handle_new_user already inserted
  // a stub row at signup time.
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, name, location },
      { onConflict: 'id' },
    )
    .select('id, name, location, created_at')
    .single()

  if (error) {
    console.error('[POST /api/profile]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data }, { status: 200 })
}
