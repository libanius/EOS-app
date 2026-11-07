/**
 * Estoque único da casa — leitura e escrita no servidor (INVENTORY-001 §4.2, §4.3, INV-T02).
 *
 * A casa toda edita qualquer item (D-I5), e a RLS de `holdings`/`locations`
 * só deixa cada conta ver a própria linha. Por isso tudo aqui usa service role,
 * DEPOIS de conferir que o item ou o lugar é de uma conta confirmada da casa de
 * quem pede. Quem pede fica em `created_by`/`updated_by`.
 *
 * Ordem de toda escrita (spec §4.2):
 *   1. ler a casa;
 *   2. reconciliar a conta dona com o `resource_inventory` gravado AGORA
 *      (E24 — o número de hoje nunca é trocado pelo de agosto);
 *   3. aplicar a escrita;
 *   4. recalcular o `resource_inventory` de cada conta tocada.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getHousehold } from './household'
import { createAdminClient } from './supabase/admin'
import { logError } from './error-log'
import { DEFAULT_LOCATION_NAME, locationSubtree, type EosLocation } from './holdings'
import {
  homeScope,
  isFoodType,
  mealsOf,
  projectInventory,
  reconcilePlan,
  type InventoryRow,
  type ReconcileItem,
  type StockOp,
} from './inventory'

export type HouseItem = ReconcileItem & {
  provenanceRef: string | null
  createdBy: string | null
  updatedBy: string | null
  category: string | null
  createdAt: string
  updatedAt: string
}

export type HouseLocation = EosLocation & { profileId: string; holdingId: string | null }

export type House = {
  me: string
  accountIds: string[]
  names: Map<string, string>
  /** Pessoas que cada conta cobre: ela + dependentes (a mesma conta de `lib/household.ts`). */
  coverage: Map<string, number>
  locations: HouseLocation[]
  homeRootIds: string[]
  items: HouseItem[]
}

type HoldingRow = {
  id: string; profile_id: string; location_id: string; resource_key: string; label: string
  kind: 'CONSUMABLE' | 'DURABLE'; quantity: number | string; unit: string | null
  brand: string | null; model: string | null; notes: string | null; expires_on: string | null
  category: string | null; food_type: string | null; meals_override: number | string | null
  provenance: string; provenance_ref: string | null; created_by: string | null; updated_by: string | null
  created_at: string; updated_at: string
}

type LocationRow = {
  id: string; profile_id: string; parent_id: string | null; name: string
  kind: EosLocation['kind']; is_default: boolean; holding_id: string | null
}

export const HOLDING_COLUMNS =
  'id, profile_id, location_id, resource_key, label, kind, quantity, unit, brand, model, notes, expires_on, category, food_type, meals_override, provenance, provenance_ref, created_by, updated_by, created_at, updated_at'

export function rowToItem(r: HoldingRow): HouseItem {
  return {
    id: r.id,
    profileId: r.profile_id,
    locationId: r.location_id,
    resourceKey: r.resource_key,
    label: r.label,
    kind: r.kind,
    quantity: Number(r.quantity) || 0,
    unit: r.unit,
    brand: r.brand,
    model: r.model,
    notes: r.notes,
    expiresOn: r.expires_on,
    foodType: isFoodType(r.food_type) ? r.food_type : null,
    mealsOverride: r.meals_override === null || r.meals_override === undefined ? null : Number(r.meals_override),
    provenance: r.provenance,
    provenanceRef: r.provenance_ref,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    category: r.category,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** A Casa padrão de uma conta, criada sob demanda e nunca duplicada (índice parcial). */
export async function ensureDefaultHome(admin: SupabaseClient, profileId: string): Promise<string> {
  const read = () =>
    admin.from('locations').select('id').eq('profile_id', profileId).eq('is_default', true).maybeSingle()
  const existing = await read()
  if (existing.error) throw new Error(`locations: ${existing.error.message}`)
  if (existing.data?.id) return existing.data.id as string
  const created = await admin
    .from('locations')
    .insert({ profile_id: profileId, name: DEFAULT_LOCATION_NAME, kind: 'HOME', is_default: true })
    .select('id')
    .maybeSingle()
  if (created.data?.id) return created.data.id as string
  const again = await read() // corrida perdida: outra requisição criou primeiro
  if (again.data?.id) return again.data.id as string
  throw new Error(`locations: ${created.error?.message ?? 'Casa padrão não criada'}`)
}

/** Lê a casa de quem pede: contas confirmadas, cobertura, lugares e itens de todas. */
export async function loadHouse(admin: SupabaseClient, userId: string): Promise<House> {
  const household = await getHousehold(userId)
  const names = new Map<string, string>()
  const coverage = new Map<string, number>()
  for (const p of household.people) {
    if (p.userId && !p.awaitingConfirmation) {
      names.set(p.userId, p.name)
      coverage.set(p.userId, coverage.get(p.userId) ?? 1)
    }
  }
  if (!names.has(userId)) names.set(userId, '')
  if (!coverage.has(userId)) coverage.set(userId, 1)
  for (const p of household.people) {
    if (p.userId === null && p.dependsOn && coverage.has(p.dependsOn)) {
      coverage.set(p.dependsOn, (coverage.get(p.dependsOn) ?? 1) + 1)
    }
  }
  const accountIds = Array.from(names.keys())

  await ensureDefaultHome(admin, userId)

  const [locRes, itemRes] = await Promise.all([
    admin.from('locations').select('id, profile_id, parent_id, name, kind, is_default, holding_id').in('profile_id', accountIds),
    admin.from('holdings').select(HOLDING_COLUMNS).in('profile_id', accountIds),
  ])
  if (locRes.error) throw new Error(`locations: ${locRes.error.message}`)
  if (itemRes.error) throw new Error(`holdings: ${itemRes.error.message}`)

  const locations: HouseLocation[] = ((locRes.data ?? []) as LocationRow[]).map(l => ({
    id: l.id,
    parentId: l.parent_id,
    name: l.name,
    kind: l.kind,
    isDefault: l.is_default,
    profileId: l.profile_id,
    holdingId: l.holding_id,
  }))
  return {
    me: userId,
    accountIds,
    names,
    coverage,
    locations,
    homeRootIds: locations.filter(l => l.isDefault).map(l => l.id),
    items: ((itemRes.data ?? []) as HoldingRow[]).map(rowToItem),
  }
}

export function isHouseLocation(house: House, id: string): boolean {
  return house.locations.some(l => l.id === id)
}

export function defaultHomeOf(house: House, profileId: string): string | null {
  return house.locations.find(l => l.isDefault && l.profileId === profileId)?.id ?? null
}

/** Itens de uma conta que estão sob a Casa: os que a reconciliação e a projeção enxergam. */
export function accountHomeItems(house: House, profileId: string): HouseItem[] {
  const scope = homeScope(house.locations, house.homeRootIds)
  return house.items.filter(i => i.profileId === profileId && scope.has(i.locationId))
}

/** Aplica operações de reconciliação ou de escrita legada no estoque de uma conta. */
export async function applyStockOps(
  admin: SupabaseClient,
  profileId: string,
  locationId: string,
  ops: StockOp[],
  actor: string | null,
): Promise<void> {
  for (const o of ops) {
    if (o.op === 'create') {
      const { error } = await admin.from('holdings').insert({
        profile_id: profileId,
        location_id: locationId,
        resource_key: o.item.resourceKey,
        label: o.item.label,
        kind: o.item.kind,
        quantity: o.item.quantity,
        unit: o.item.unit,
        provenance: 'BACKFILL',
        created_by: actor,
        updated_by: actor,
      })
      if (error) throw new Error(`holdings insert: ${error.message}`)
    } else if (o.op === 'update') {
      const { error } = await admin
        .from('holdings')
        .update({ quantity: o.quantity, unit: o.unit, updated_by: actor })
        .eq('id', o.id)
        .eq('profile_id', profileId)
      if (error) throw new Error(`holdings update: ${error.message}`)
    } else {
      const { error } = await admin.from('holdings').delete().eq('id', o.id).eq('profile_id', profileId)
      if (error) throw new Error(`holdings delete: ${error.message}`)
    }
  }
}

async function readInventoryRow(admin: SupabaseClient, profileId: string): Promise<InventoryRow | null> {
  const { data, error } = await admin
    .from('resource_inventory')
    .select('water_liters, food_days, fuel_liters, cash_amount, has_medical_kit, has_communication_device, battery_percent')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw new Error(`resource_inventory: ${error.message}`)
  return (data as InventoryRow | null) ?? null
}

/**
 * Passo 2: o estoque da conta passa a bater com a linha gravada AGORA.
 * Mexe só no "estoque informado" (BACKFILL). Devolve se mudou algo.
 */
export async function reconcileAccount(admin: SupabaseClient, house: House, profileId: string): Promise<boolean> {
  const row = await readInventoryRow(admin, profileId)
  const ops = reconcilePlan(accountHomeItems(house, profileId), row, house.coverage.get(profileId) ?? 1)
  if (!ops.length) return false
  const home = defaultHomeOf(house, profileId) ?? (await ensureDefaultHome(admin, profileId))
  await applyStockOps(admin, profileId, home, ops, null)
  return true
}

/** Passo 4: `resource_inventory` da conta = soma do estoque dela sob a Casa. Bateria não muda. */
export async function recomputeAccount(admin: SupabaseClient, house: House, profileId: string): Promise<void> {
  const items = house.items.filter(i => i.profileId === profileId)
  const p = projectInventory(items, house.locations, house.homeRootIds, house.coverage.get(profileId) ?? 1)
  const { error } = await admin
    .from('resource_inventory')
    .upsert({ profile_id: profileId, ...p, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  if (error) throw new Error(`resource_inventory: ${error.message}`)
}

/**
 * O ciclo inteiro de uma escrita no estoque (spec §4.2):
 * reconcilia as contas que serão tocadas, escreve, relê e recalcula.
 * `touched` = contas cujo estoque a escrita muda (a dona do item, e a dona
 * de um lugar quando um item muda de lugar entre contas não muda nada: o item
 * continua da dona).
 */
export async function withStockWrite<T>(
  admin: SupabaseClient,
  userId: string,
  touched: (house: House) => string[],
  write: (house: House) => Promise<T>,
): Promise<{ result: T; house: House }> {
  let house = await loadHouse(admin, userId)
  const accounts = Array.from(new Set(touched(house))).filter(a => house.accountIds.includes(a))
  let reconciled = false
  for (const a of accounts) reconciled = (await reconcileAccount(admin, house, a)) || reconciled
  if (reconciled) house = await loadHouse(admin, userId)
  const result = await write(house)
  house = await loadHouse(admin, userId)
  for (const a of accounts) await recomputeAccount(admin, house, a)
  return { result, house }
}

/**
 * Mudança de cobertura (E23): dependente criado, removido ou vinculado a uma
 * conta; conta que confirma ou deixa de morar na casa. Use em par:
 *
 *   const snap = await beginCoverageChange(userId)   // ANTES da mudança
 *   ...mudança...
 *   await endCoverageChange(userId, snap)            // DEPOIS
 *
 * Antes: reconcilia a casa com a cobertura ANTIGA, para o primeiro recálculo
 * não trocar o número de hoje pelo de agosto (E24). Depois: recalcula todas as
 * contas que estavam na casa e a de quem agiu, cada uma na casa em que ficou.
 *
 * O estoque nunca derruba a ação principal: falha aqui é registrada e segue.
 */
export async function beginCoverageChange(userId: string): Promise<string[]> {
  const admin = createAdminClient()
  if (!admin) return [userId]
  try {
    const house = await loadHouse(admin, userId)
    for (const a of house.accountIds) await reconcileAccount(admin, house, a)
    return house.accountIds
  } catch (e) {
    await logError('inventory/coverage-begin', e, { userId })
    return [userId]
  }
}

export async function endCoverageChange(userId: string, before: string[]): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return
  try {
    const done = new Set<string>()
    for (const id of Array.from(new Set([userId, ...before]))) {
      if (done.has(id)) continue
      const house = await loadHouse(admin, id)
      for (const a of house.accountIds) {
        if (done.has(a)) continue
        await recomputeAccount(admin, house, a)
        done.add(a)
      }
    }
  } catch (e) {
    await logError('inventory/coverage-end', e, { userId })
  }
}

/** Resumo da casa para a tela e para o Pilot. */
export function houseTotals(house: House) {
  const scope = homeScope(house.locations, house.homeRootIds)
  let water = 0
  let foodPersonDays = 0
  for (const a of house.accountIds) {
    const p = projectInventory(house.items.filter(i => i.profileId === a), house.locations, house.homeRootIds, house.coverage.get(a) ?? 1)
    water += p.water_liters
    foodPersonDays += p.food_days * (house.coverage.get(a) ?? 1)
  }
  return {
    waterLiters: Math.round(water * 1000) / 1000,
    foodPersonDays: Math.round(foodPersonDays * 1000) / 1000,
    itemsAtHome: house.items.filter(i => scope.has(i.locationId)).length,
  }
}

/** O que a API devolve: a casa como a tela e o Pilot leem. */
export function serializeHouse(house: House) {
  return {
    me: house.me,
    accounts: house.accountIds.map(id => ({ id, name: house.names.get(id) ?? '', isMe: id === house.me })),
    homeRootIds: house.homeRootIds,
    locations: house.locations,
    items: house.items.map(i => ({
      ...i,
      meals: i.resourceKey === 'comida' ? mealsOf(i) : null,
      createdByName: i.createdBy ? house.names.get(i.createdBy) ?? null : null,
      updatedByName: i.updatedBy ? house.names.get(i.updatedBy) ?? null : null,
      ownerName: house.names.get(i.profileId) ?? '',
    })),
    totals: houseTotals(house),
  }
}

/** Ids de um lugar e de tudo que está dentro dele. */
export function subtreeOf(house: House, locationId: string): Set<string> {
  return locationSubtree(house.locations, locationId)
}

/** Erro de regra de negócio com status HTTP: a rota devolve, não registra. */
export class StockError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 422, message: string) {
    super(message)
  }
}
