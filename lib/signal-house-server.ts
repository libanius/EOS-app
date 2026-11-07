/**
 * "Marcar como tenho" — leitura e escrita no servidor (SIGNAL-002 §4.2, §4.3).
 *
 * A casa é lida com service role porque somar contas exige ler linhas de outra
 * conta, e a RLS impede (D-123). A escrita é sempre na conta de quem respondeu,
 * com o cliente autenticado: a RLS garante que ninguém grava na linha de outro.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getHousehold } from './household'
import { houseItemStates, type BaselineRow, type HouseItemState } from './signal-house'
import { rowToSignal, type SignalRow } from './content-package'
import { signalBySlug } from './signals-content'
import type { Signal } from './signals'

export type HouseState = { accounts: number; items: Record<string, HouseItemState> }

/** Contas que respondem pela casa: confirmadas, e sempre eu. */
export async function houseAccounts(userId: string): Promise<{ ids: string[]; names: Map<string, string> }> {
  const household = await getHousehold(userId)
  const names = new Map<string, string>()
  for (const p of household.people) {
    if (p.userId && !p.awaitingConfirmation) names.set(p.userId, p.name)
  }
  if (!names.has(userId)) names.set(userId, '')
  return { ids: Array.from(names.keys()), names }
}

export async function readHouseState(admin: SupabaseClient, userId: string): Promise<HouseState> {
  const { ids, names } = await houseAccounts(userId)
  const { data, error } = await admin
    .from('requirements')
    .select('profile_id, resource_key, status, provenance, updated_at')
    .in('profile_id', ids)
    .is('kit_id', null)
    .is('scenario_id', null)
  if (error) throw new Error(error.message)
  return { accounts: ids.length, items: houseItemStates((data ?? []) as BaselineRow[], names, userId) }
}

/** O Sinal pelo slug: o do banco, se existir; senão o conteúdo do Marco 1. */
export async function findSignal(admin: SupabaseClient, slug: string): Promise<Signal | null> {
  const { data } = await admin
    .from('signals')
    .select('slug, status, version, level, occurred_on, published_on, region, official_alert, reviewed_by_curator, content, sources, protocol, video')
    .eq('slug', slug)
    .maybeSingle()
  if (data) return rowToSignal(data as SignalRow)
  return signalBySlug(slug) ?? null
}
