import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/lib/ensure-profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/error-log'
import { legacyWritePlan, type LegacyWrite } from '@/lib/inventory'
import { accountHomeItems, applyStockOps, defaultHomeOf, ensureDefaultHome, StockError, withStockWrite } from '@/lib/inventory-server'

/** E9: o número pedido é menor que o que a casa já detalhou no estoque. */
const LEGACY_CONFLICT: Record<string, string> = {
  water_liters: 'Seu estoque detalhado já tem mais água que isso. Ajuste os itens na tela do estoque.',
  food_days: 'Seu estoque detalhado já tem mais comida que isso. Ajuste os itens na tela do estoque.',
  fuel_liters: 'Seu estoque detalhado já tem mais combustível que isso. Ajuste os itens na tela do estoque.',
  cash_amount: 'Seu estoque detalhado já tem mais dinheiro que isso. Ajuste os itens na tela do estoque.',
  has_medical_kit: 'Há um kit médico detalhado no estoque. Remova-o na tela do estoque.',
  has_communication_device: 'Há um rádio detalhado no estoque. Remova-o na tela do estoque.',
}

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
// INVENTORY-001 (E9): os números viram itens do estoque ("estoque informado")
// e a linha é recalculada a partir do estoque. 409 quando o estoque detalhado
// já passa do número pedido.
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
  await ensureProfile(supabase, user)

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

  /*
   * INVENTORY-001 (E9): os números viram "estoque informado" no estoque da
   * conta, e `resource_inventory` passa a ser a soma do estoque. A bateria não
   * é item e continua sendo gravada direto.
   */
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const write: LegacyWrite = {}
  for (const k of ['water_liters', 'food_days', 'fuel_liters', 'cash_amount'] as const) {
    if (body[k] !== undefined) write[k] = Number(body[k])
  }
  for (const k of ['has_medical_kit', 'has_communication_device'] as const) {
    if (body[k] !== undefined) write[k] = Boolean(body[k])
  }

  try {
    if (Object.keys(write).length) {
      await withStockWrite(admin, user.id, () => [user.id], async house => {
        const plan = legacyWritePlan(accountHomeItems(house, user.id), write, house.coverage.get(user.id) ?? 1)
        if (!plan.ok) throw new StockError(409, LEGACY_CONFLICT[plan.field] ?? 'O estoque detalhado já passa deste número.')
        const home = defaultHomeOf(house, user.id) ?? (await ensureDefaultHome(admin, user.id))
        await applyStockOps(admin, user.id, home, plan.ops, user.id)
      })
    }
    if (body.battery_percent !== undefined) {
      const { error } = await admin
        .from('resource_inventory')
        .upsert({ profile_id: user.id, battery_percent: body.battery_percent, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
      if (error) throw new Error(error.message)
    }
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: e.status })
    await logError('api/inventory POST', e, { userId: user.id })
    return NextResponse.json({ error: 'Não foi possível gravar.' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('resource_inventory')
    .select(
      'id, water_liters, food_days, fuel_liters, battery_percent, has_medical_kit, has_communication_device, cash_amount, updated_at',
    )
    .eq('profile_id', user.id)
    .single()

  if (error) {
    console.error('[POST /api/inventory]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ inventory: data })
}
