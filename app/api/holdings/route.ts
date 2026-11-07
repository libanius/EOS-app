/**
 * GET  /api/holdings — o estoque da casa toda (INVENTORY-001 §4.3).
 * POST /api/holdings — cria um item. Dono = quem cria (D-I5).
 */

import { NextResponse } from 'next/server'
import { checkItemInput } from '@/lib/inventory'
import { defaultHomeOf, isHouseLocation, loadHouse, serializeHouse, StockError, withStockWrite } from '@/lib/inventory-server'
import { stockRoute } from '@/lib/inventory-route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CLIENT_PROVENANCE = new Set(['MANUAL', 'PILOT', 'EDU', 'SIMULATION', 'OFFICIAL_ALERT', 'PLAN_GAP', 'PROTOCOL'])

export async function GET(req: Request) {
  return stockRoute(req, 'api/holdings GET', async ({ userId, admin }) => {
    return NextResponse.json(serializeHouse(await loadHouse(admin, userId)))
  }, { body: false })
}

export async function POST(req: Request) {
  return stockRoute(req, 'api/holdings POST', async ({ userId, admin, body }) => {
    const check = checkItemInput(body)
    if (!check.ok) throw new StockError(check.status, check.error)
    const v = check.value

    const provenance = typeof body.provenance === 'string' ? body.provenance : 'MANUAL'
    if (!CLIENT_PROVENANCE.has(provenance)) throw new StockError(422, 'Origem inválida.')
    const provenanceRef = typeof body.provenanceRef === 'string' ? body.provenanceRef.slice(0, 200) : null

    const { result, house } = await withStockWrite(admin, userId, () => [userId], async h => {
      const locationId = typeof body.locationId === 'string' && body.locationId ? body.locationId : defaultHomeOf(h, userId)
      if (!locationId || !isHouseLocation(h, locationId)) throw new StockError(403, 'Lugar fora da sua casa.')
      const { data, error } = await admin
        .from('holdings')
        .insert({
          profile_id: userId,
          location_id: locationId,
          resource_key: v.resourceKey,
          label: v.label,
          kind: v.kind,
          quantity: v.quantity,
          unit: v.unit,
          brand: v.brand,
          model: v.model,
          notes: v.notes,
          expires_on: v.expiresOn,
          category: v.category,
          food_type: v.foodType,
          meals_override: v.mealsOverride,
          provenance,
          provenance_ref: provenanceRef,
          created_by: userId,
          updated_by: userId,
        })
        .select('id')
        .single()
      if (error) throw new Error(`holdings insert: ${error.message}`)
      return data.id as string
    })

    return NextResponse.json({ id: result, house: serializeHouse(house) }, { status: 201 })
  })
}
