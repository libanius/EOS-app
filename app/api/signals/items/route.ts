/**
 * POST /api/signals/items — a resposta de um item do Sinal (SIGNAL-002 §3.2, §4.3).
 *
 * Body `{ slug, resourceKey, answer: 'have' | 'need' | 'not_applicable', lang? }`.
 * Grava na linha de base da MINHA conta: cria com origem PROTOCOL, ou atualiza
 * só o estado preservando a origem (D-161). Desde a INV-T04 (INVENTORY-001
 * §3.4), "Tenho" cria o item no estoque e "Ainda não tenho" com item na casa
 * devolve os itens para a folha perguntar o que remover. A resposta traz o
 * estoque da casa (`house`).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findSignal, readHouseState } from '@/lib/signal-house-server'
import {
  HOUSE_ANSWERS,
  answerToStatus,
  checkAnswerable,
  needsWrite,
  userCanReach,
  type HouseAnswer,
} from '@/lib/signal-house'
import type { AcquisitionStatus } from '@/lib/acquisition'
import { logError } from '@/lib/error-log'
import { coveringItems } from '@/lib/inventory'
import { catalogEntry, categoryOf } from '@/lib/resource-catalog'
import { defaultHomeOf, ensureDefaultHome, loadHouse, serializeHouse, StockError, withStockWrite } from '@/lib/inventory-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = auth.user.id

  const body = (await req.json().catch(() => null)) as { slug?: unknown; resourceKey?: unknown; answer?: unknown; lang?: unknown } | null
  const slug = typeof body?.slug === 'string' ? body.slug : ''
  const resourceKey = typeof body?.resourceKey === 'string' ? body.resourceKey : ''
  const answer = body?.answer as HouseAnswer
  const lang = body?.lang === 'en' ? 'en' : 'pt'
  if (!slug || !resourceKey || !HOUSE_ANSWERS.includes(answer)) {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const check = checkAnswerable(await findSignal(admin, slug), resourceKey)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const target = answerToStatus(answer)

  try {
    /*
     * INVENTORY-001 §3.4 (INV-T04): o estoque é a verdade do "tem".
     * - "Tenho" sem item na casa cria 1 unidade (origem PROTOCOL + slug).
     *   Com item na casa, não cria nada (E4).
     * - "Ainda não tenho" com item na casa não grava nada: devolve os itens
     *   para a folha perguntar quais remover (E5). Remover é sempre explícito.
     */
    if (answer === 'need') {
      const stock = await loadHouse(admin, userId)
      const covering = coveringItems(stock.items, stock.locations, stock.homeRootIds, resourceKey)
      if (covering.length) {
        const view = serializeHouse(stock)
        return NextResponse.json({
          resourceKey,
          confirmRemoval: true,
          covering: view.items.filter(i => covering.some(c => c.id === i.id)),
          house: view,
        })
      }
    }
    if (answer === 'have') {
      await withStockWrite(admin, userId, () => [userId], async stock => {
        if (coveringItems(stock.items, stock.locations, stock.homeRootIds, resourceKey).length) return
        const home = defaultHomeOf(stock, userId) ?? (await ensureDefaultHome(admin, userId))
        const entry = catalogEntry(resourceKey)
        const { error } = await admin.from('holdings').insert({
          profile_id: userId,
          location_id: home,
          resource_key: resourceKey,
          label: check.item.label[lang],
          kind: entry?.kind ?? 'DURABLE',
          quantity: 1,
          unit: 'un',
          category: categoryOf(resourceKey),
          provenance: 'PROTOCOL',
          provenance_ref: slug,
          created_by: userId,
          updated_by: userId,
        })
        if (error) throw new Error(`holdings insert: ${error.message}`)
      })
    }

    const { data: existing, error: readError } = await supabase
      .from('requirements')
      .select('id, status')
      .eq('profile_id', userId)
      .eq('resource_key', resourceKey)
      .is('kit_id', null)
      .is('scenario_id', null)
      .maybeSingle()
    if (readError) throw new Error(readError.message)

    const from = (existing?.status ?? null) as AcquisitionStatus | null
    if (!userCanReach(from, target)) {
      return NextResponse.json({ error: `Transição não permitida: ${from} → ${target}.` }, { status: 409 })
    }

    if (existing) {
      // E4/E15: só pula quando a casa já lê esta resposta como minha.
      const before = from === target ? (await readHouseState(admin, userId)).items[resourceKey] : undefined
      if (needsWrite(from, target, before)) {
        const { error } = await supabase
          .from('requirements')
          .update({ status: target, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw new Error(error.message)
      }
    } else {
      const { error } = await supabase.from('requirements').insert({
        profile_id: userId,
        resource_key: resourceKey,
        label: check.item.label[lang],
        status: target,
        provenance: 'PROTOCOL',
        provenance_ref: slug,
      })
      if (error) throw new Error(error.message)
    }

    const house = await readHouseState(admin, userId)
    const stock = serializeHouse(await loadHouse(admin, userId))
    return NextResponse.json({ resourceKey, state: house.items[resourceKey] ?? null, accounts: house.accounts, house: stock })
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: e.status })
    await logError('api/signals/items', e, { userId, context: { slug, resourceKey } })
    return NextResponse.json({ error: 'Não foi possível gravar.' }, { status: 500 })
  }
}
