/**
 * POST /api/signals/items — a resposta de um item do Sinal (SIGNAL-002 §3.2, §4.3).
 *
 * Body `{ slug, resourceKey, answer: 'have' | 'need' | 'not_applicable', lang? }`.
 * Grava na linha de base da MINHA conta: cria com origem PROTOCOL, ou atualiza
 * só o estado preservando a origem (D-161). Kit médico e rádio também gravam a
 * marca antiga do inventário, para o Painel e o Pilot enxergarem igual.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findSignal, readHouseState } from '@/lib/signal-house-server'
import {
  HOUSE_ANSWERS,
  LEGACY_INVENTORY_FLAG,
  answerToStatus,
  checkAnswerable,
  userCanReach,
  type HouseAnswer,
} from '@/lib/signal-house'
import type { AcquisitionStatus } from '@/lib/acquisition'
import { logError } from '@/lib/error-log'

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
      if (from !== target) {
        const { error } = await supabase.from('requirements').update({ status: target }).eq('id', existing.id)
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

    const flag = LEGACY_INVENTORY_FLAG[resourceKey]
    if (flag) {
      const { error } = await supabase
        .from('resource_inventory')
        .upsert({ profile_id: userId, [flag]: answer === 'have', updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
      if (error) throw new Error(error.message)
    }

    const house = await readHouseState(admin, userId)
    return NextResponse.json({ resourceKey, state: house.items[resourceKey] ?? null, accounts: house.accounts })
  } catch (e) {
    await logError('api/signals/items', e, { userId, context: { slug, resourceKey } })
    return NextResponse.json({ error: 'Não foi possível gravar.' }, { status: 500 })
  }
}
