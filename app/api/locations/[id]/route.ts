/**
 * PATCH  /api/locations/[id] — renomeia ou move (INVENTORY-001 §3.2, §4.3).
 * DELETE /api/locations/[id] — remove. Com itens ou sublugares dentro, exige
 * `moveTo` (E21). A Casa padrão não sai (422). Mochila: sai o item junto.
 *
 * Mover um lugar muda o escopo de tudo dentro dele, de qualquer conta: por
 * isso a casa inteira é reconciliada e recalculada.
 */

import { NextResponse } from 'next/server'
import { isHouseLocation, serializeHouse, StockError, subtreeOf, withStockWrite, type House } from '@/lib/inventory-server'
import { stockRoute } from '@/lib/inventory-route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

function findLocation(house: House, id: string) {
  const loc = house.locations.find(l => l.id === id)
  if (!loc) throw new StockError(403, 'Lugar fora da sua casa.')
  return loc
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  return stockRoute(req, 'api/locations PATCH', async ({ userId, admin, body }) => {
    const { house } = await withStockWrite(admin, userId, h => h.accountIds, async h => {
      const loc = findLocation(h, id)
      const patch: Record<string, unknown> = {}

      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
        if (!name) throw new StockError(400, 'Dê um nome ao lugar.')
        patch.name = name
      }

      if (body.parentId !== undefined) {
        if (loc.isDefault) throw new StockError(422, 'A Casa não muda de lugar.')
        const parentId = body.parentId
        if (parentId === null) {
          if (loc.holdingId) throw new StockError(422, 'A mochila precisa estar em algum lugar.')
          patch.parent_id = null
        } else {
          if (typeof parentId !== 'string' || !isHouseLocation(h, parentId)) throw new StockError(403, 'Lugar fora da sua casa.')
          // E15: nem nele mesmo, nem dentro de um filho dele.
          if (subtreeOf(h, id).has(parentId)) throw new StockError(422, 'Um lugar não pode ir para dentro dele mesmo.')
          patch.parent_id = parentId
        }
      }

      if (!Object.keys(patch).length) throw new StockError(400, 'Nada para mudar.')
      const { error } = await admin.from('locations').update(patch).eq('id', id)
      if (error) throw new Error(`locations update: ${error.message}`)

      // A mochila é item e lugar: os dois andam e se chamam igual.
      if (loc.holdingId) {
        const itemPatch: Record<string, unknown> = { updated_by: userId }
        if (patch.parent_id !== undefined) itemPatch.location_id = patch.parent_id
        if (patch.name !== undefined) itemPatch.label = patch.name
        const { error: e2 } = await admin.from('holdings').update(itemPatch).eq('id', loc.holdingId)
        if (e2) throw new Error(`holdings update: ${e2.message}`)
      }
    })
    return NextResponse.json({ house: serializeHouse(house) })
  })
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const moveToQuery = new URL(req.url).searchParams.get('moveTo')
  return stockRoute(req, 'api/locations DELETE', async ({ userId, admin, body }) => {
    const moveTo = typeof body.moveTo === 'string' && body.moveTo ? body.moveTo : moveToQuery
    const { house } = await withStockWrite(admin, userId, h => h.accountIds, async h => {
      const loc = findLocation(h, id)
      if (loc.isDefault) throw new StockError(422, 'A Casa não pode ser apagada.')

      const items = h.items.filter(i => i.locationId === id)
      const children = h.locations.filter(l => l.parentId === id)
      if (items.length || children.length) {
        // E21: nunca apaga em cascata. Sem destino, recusa.
        if (!moveTo) throw new StockError(422, 'Este lugar tem coisas dentro. Escolha para onde elas vão.')
        if (!isHouseLocation(h, moveTo)) throw new StockError(403, 'Lugar fora da sua casa.')
        if (subtreeOf(h, id).has(moveTo)) throw new StockError(422, 'Escolha um lugar fora deste.')
        if (items.length) {
          const { error } = await admin.from('holdings').update({ location_id: moveTo, updated_by: userId }).eq('location_id', id)
          if (error) throw new Error(`holdings move: ${error.message}`)
        }
        if (children.length) {
          const { error } = await admin.from('locations').update({ parent_id: moveTo }).eq('parent_id', id)
          if (error) throw new Error(`locations move: ${error.message}`)
        }
      }

      const { error } = await admin.from('locations').delete().eq('id', id)
      if (error) throw new Error(`locations delete: ${error.message}`)
      if (loc.holdingId) {
        const { error: e2 } = await admin.from('holdings').delete().eq('id', loc.holdingId)
        if (e2) throw new Error(`holdings delete: ${e2.message}`)
      }
    })
    return NextResponse.json({ house: serializeHouse(house) })
  })
}
