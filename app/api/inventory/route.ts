import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── GET /api/inventory ───────────────────────────────────────────────────────
// Returns the authenticated user's resource inventory (single row).
// If no row exists yet, returns safe defaults.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('resource_inventory')
    .select(
      'id, water_liters, food_days, fuel_liters, battery_percent, has_medical_kit, has_communication_device, cash_amount, updated_at',
    )
    .eq('profile_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/inventory]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return defaults if no row yet (first visit)
  const inventory = data ?? {
    id: null,
    water_liters: 0,
    food_days: 0,
    fuel_liters: 0,
    battery_percent: 0,
    has_medical_kit: false,
    has_communication_device: false,
    cash_amount: 0,
    updated_at: null,
  }

  return NextResponse.json({ inventory })
}

// ─── POST /api/inventory ──────────────────────────────────────────────────────
// Upserts the inventory row for the authenticated user.
// Uses INSERT … ON CONFLICT (profile_id) DO UPDATE so it's idempotent.
//
// Body (all fields optional — only provided fields are updated on conflict):
// {
//   water_liters?:             number  (≥ 0)
//   food_days?:                number  (≥ 0)
//   fuel_liters?:              number  (≥ 0)
//   battery_percent?:          number  (0–100)
//   has_medical_kit?:          boolean
//   has_communication_device?: boolean
//   cash_amount?:              number  (≥ 0)
// }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body: {
    water_liters?: number
    food_days?: number
    fuel_liters?: number
    battery_percent?: number
    has_medical_kit?: boolean
    has_communication_device?: boolean
    cash_amount?: number
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  // Validate numeric ranges
  if (body.water_liters !== undefined && body.water_liters < 0) {
    return NextResponse.json({ error: 'water_liters deve ser ≥ 0.' }, { status: 422 })
  }
  if (body.food_days !== undefined && body.food_days < 0) {
    return NextResponse.json({ error: 'food_days deve ser ≥ 0.' }, { status: 422 })
  }
  if (body.fuel_liters !== undefined && body.fuel_liters < 0) {
    return NextResponse.json({ error: 'fuel_liters deve ser ≥ 0.' }, { status: 422 })
  }
  if (
    body.battery_percent !== undefined &&
    (body.battery_percent < 0 || body.battery_percent > 100)
  ) {
    return NextResponse.json({ error: 'battery_percent deve estar entre 0 e 100.' }, { status: 422 })
  }
  if (body.cash_amount !== undefined && body.cash_amount < 0) {
    return NextResponse.json({ error: 'cash_amount deve ser ≥ 0.' }, { status: 422 })
  }

  const payload = {
    profile_id: user.id,
    ...(body.water_liters !== undefined && { water_liters: body.water_liters }),
    ...(body.food_days !== undefined && { food_days: body.food_days }),
    ...(body.fuel_liters !== undefined && { fuel_liters: body.fuel_liters }),
    ...(body.battery_percent !== undefined && { battery_percent: body.battery_percent }),
    ...(body.has_medical_kit !== undefined && { has_medical_kit: body.has_medical_kit }),
    ...(body.has_communication_device !== undefined && {
      has_communication_device: body.has_communication_device,
    }),
    ...(body.cash_amount !== undefined && { cash_amount: body.cash_amount }),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('resource_inventory')
    .upsert(payload, { onConflict: 'profile_id' })
    .select(
      'id, water_liters, food_days, fuel_liters, battery_percent, has_medical_kit, has_communication_device, cash_amount, updated_at',
    )
    .single()

  if (error) {
    console.error('[POST /api/inventory]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ inventory: data })
}
