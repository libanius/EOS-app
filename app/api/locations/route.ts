/**
 * POST /api/locations — cria um sublugar ou uma mochila (INVENTORY-001 §3.2, §4.3).
 *
 * `{ name, parentId?, kind? }` cria um sublugar. Sem `parentId`, vai na minha
 * Casa; um lugar sem pai só existe se não for HOME (o carro, a fazenda).
 * `{ name, bag: true, parentId? }` cria a mochila: um item `mochila` E um lugar
 * ligado a ele (D-I3).
 */

import { NextResponse } from 'next/server'
import {
  defaultHomeOf,
  isHouseLocation,
  serializeHouse,
  StockError,
  withStockWrite,
} from '@/lib/inventory-server'
import { stockRoute } from '@/lib/inventory-route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const LOCATION_KINDS = new Set(['FARM', 'WAREHOUSE', 'OFFICE', 'VEHICLE', 'RV', 'BOAT', 'STORAGE_UNIT', 'SECOND_RESIDENCE', 'CUSTOM'])

export async function POST(req: Request) {
  return stockRoute(req, 'api/locations POST', async ({ userId, admin, body }) => {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
    if (!name) throw new StockError(400, 'Dê um nome ao lugar.')
    const bag = body.bag === true
    const kind = typeof body.kind === 'string' ? body.kind : 'CUSTOM'
    if (!LOCATION_KINDS.has(kind)) throw new StockError(422, 'Tipo de lugar inválido.')
    const rootRequested = body.parentId === null

    const { result, house } = await withStockWrite(admin, userId, () => (bag ? [userId] : []), async h => {
      let parentId: string | null
      if (rootRequested) {
        // Raiz fora da Casa (o carro). Mochila sempre está em algum lugar.
        if (bag) throw new StockError(422, 'A mochila precisa estar em algum lugar.')
        parentId = null
      } else {
        parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : defaultHomeOf(h, userId)
        if (!parentId || !isHouseLocation(h, parentId)) throw new StockError(403, 'Lugar fora da sua casa.')
      }

      let holdingId: string | null = null
      if (bag) {
        const { data, error } = await admin
          .from('holdings')
          .insert({
            profile_id: userId, location_id: parentId, resource_key: 'mochila', label: name, kind: 'DURABLE',
            quantity: 1, unit: 'un', category: 'equipamento', provenance: 'MANUAL', created_by: userId, updated_by: userId,
          })
          .select('id')
          .single()
        if (error) throw new Error(`holdings insert: ${error.message}`)
        holdingId = data.id as string
      }

      const { data, error } = await admin
        .from('locations')
        .insert({ profile_id: userId, parent_id: parentId, name, kind: bag ? 'CUSTOM' : kind, is_default: false, holding_id: holdingId })
        .select('id')
        .single()
      if (error) {
        if (holdingId) await admin.from('holdings').delete().eq('id', holdingId)
        throw new Error(`locations insert: ${error.message}`)
      }
      return data.id as string
    })

    return NextResponse.json({ id: result, house: serializeHouse(house) }, { status: 201 })
  })
}
