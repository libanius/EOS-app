/**
 * PATCH  /api/holdings/[id] — edita, muda quantidade ou move (INVENTORY-001 §4.3).
 * DELETE /api/holdings/[id] — remove. Mochila com itens exige `moveTo` (E14).
 *
 * Qualquer conta confirmada da casa mexe em qualquer item (D-I5); o item
 * continua da dona, e `updated_by` passa a ser quem mexeu.
 */

import { NextResponse } from 'next/server'
import { checkItemInput, type ItemInput } from '@/lib/inventory'
import {
  isHouseLocation,
  serializeHouse,
  StockError,
  subtreeOf,
  withStockWrite,
  type House,
  type HouseItem,
} from '@/lib/inventory-server'
import { stockRoute } from '@/lib/inventory-route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

function findItem(house: House, id: string): HouseItem {
  const item = house.items.find(i => i.id === id)
  // Não existe ou é de outra casa: a mesma resposta, para não revelar nada (critério 13).
  if (!item) throw new StockError(403, 'Item fora da sua casa.')
  return item
}

const bagOf = (house: House, itemId: string) => house.locations.find(l => l.holdingId === itemId) ?? null

function toInput(i: HouseItem): ItemInput {
  return {
    label: i.label, resourceKey: i.resourceKey, kind: i.kind, quantity: i.quantity, unit: i.unit,
    brand: i.brand, model: i.model, notes: i.notes, expiresOn: i.expiresOn, foodType: i.foodType,
    mealsOverride: i.mealsOverride, category: i.category ?? 'outros',
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  return stockRoute(req, 'api/holdings PATCH', async ({ userId, admin, body }) => {
    const touched = (h: House) => {
      const item = findItem(h, id)
      // Mochila mudando de lugar muda o escopo de tudo dentro, de qualquer conta.
      return bagOf(h, id) && body.locationId !== undefined ? h.accountIds : [item.profileId]
    }

    const { house } = await withStockWrite(admin, userId, touched, async h => {
      const item = findItem(h, id)
      const check = checkItemInput(body, toInput(item))
      if (!check.ok) throw new StockError(check.status, check.error)
      const v = check.value
      const bag = bagOf(h, id)
      if (bag && v.resourceKey !== item.resourceKey) throw new StockError(422, 'Uma mochila continua sendo mochila.')

      let locationId = item.locationId
      if (body.locationId !== undefined) {
        if (typeof body.locationId !== 'string' || !isHouseLocation(h, body.locationId)) {
          throw new StockError(403, 'Lugar fora da sua casa.')
        }
        locationId = body.locationId
        // E15: a mochila não entra nela mesma nem em algo que está dentro dela.
        if (bag && subtreeOf(h, bag.id).has(locationId)) throw new StockError(422, 'A mochila não pode ir para dentro dela mesma.')
      }

      const { error } = await admin
        .from('holdings')
        .update({
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
          updated_by: userId,
        })
        .eq('id', id)
      if (error) throw new Error(`holdings update: ${error.message}`)

      if (bag) {
        const { error: e2 } = await admin.from('locations').update({ parent_id: locationId, name: v.label }).eq('id', bag.id)
        if (e2) throw new Error(`locations update: ${e2.message}`)
      }
    })

    return NextResponse.json({ house: serializeHouse(house) })
  })
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const moveToQuery = new URL(req.url).searchParams.get('moveTo')
  return stockRoute(req, 'api/holdings DELETE', async ({ userId, admin, body }) => {
    const moveTo = typeof body.moveTo === 'string' && body.moveTo ? body.moveTo : moveToQuery
    const touched = (h: House) => (bagOf(h, id) ? h.accountIds : [findItem(h, id).profileId])

    const { house } = await withStockWrite(admin, userId, touched, async h => {
      findItem(h, id)
      const bag = bagOf(h, id)
      if (bag) {
        const items = h.items.filter(i => i.locationId === bag.id)
        const children = h.locations.filter(l => l.parentId === bag.id)
        if (items.length || children.length) {
          // E14: nunca apaga em cascata. Sem destino, recusa.
          if (!moveTo) throw new StockError(422, 'A mochila tem itens dentro. Escolha para onde eles vão.')
          if (!isHouseLocation(h, moveTo)) throw new StockError(403, 'Lugar fora da sua casa.')
          if (subtreeOf(h, bag.id).has(moveTo)) throw new StockError(422, 'Escolha um lugar fora da mochila.')
          if (items.length) {
            const { error } = await admin.from('holdings').update({ location_id: moveTo, updated_by: userId }).eq('location_id', bag.id)
            if (error) throw new Error(`holdings move: ${error.message}`)
          }
          if (children.length) {
            const { error } = await admin.from('locations').update({ parent_id: moveTo }).eq('parent_id', bag.id)
            if (error) throw new Error(`locations move: ${error.message}`)
          }
        }
        const { error } = await admin.from('locations').delete().eq('id', bag.id)
        if (error) throw new Error(`locations delete: ${error.message}`)
      }
      const { error } = await admin.from('holdings').delete().eq('id', id)
      if (error) throw new Error(`holdings delete: ${error.message}`)
    })

    return NextResponse.json({ house: serializeHouse(house) })
  })
}
