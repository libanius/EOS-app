/**
 * EOS — Offline storage (IndexedDB via `idb`)
 *
 * Stores the smallest set of data needed for EOS to be useful without the
 * network:
 *   - profile         (single row)
 *   - inventory       (single row)
 *   - recent plans    (last 5 action plans)
 *   - checklist       (latest generated items)
 *   - shelters        (last known official shelters + when they were read)
 *
 * Only runs in the browser. All helpers are no-ops on the server.
 *
 * Public API:
 *   saveProfile / getProfile
 *   saveInventory / getInventory
 *   savePlan      / getRecentPlans
 *   saveChecklist / getChecklist
 *   saveShelters  / getShelters
 *   clearAll
 */

import type { IDBPDatabase } from 'idb'
import type { PlanDocument, PlanSummary } from './family-plan'

const DB_NAME = 'eos'
const DB_VERSION = 1

type EOSDB = IDBPDatabase<unknown>

export interface StoredProfile {
  id: string
  name: string
  location?: string | null
  family_size?: number
}

export interface StoredInventory {
  profile_id: string
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
  cash_amount: number
  updated_at: string
}

export interface StoredPlan {
  id: string
  created_at: string
  scenario_type: string
  scenario_description: string
  mode: 'CONNECTED' | 'LOCAL_AI' | 'SURVIVAL'
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  risks: string[]
  immediate_actions: string[]
  short_term_actions: string[]
  mid_term_actions: string[]
}

export interface StoredChecklistItem {
  id: string
  canonical_key: string
  item_name: string
  tier: 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'
  quantity: number
  unit: string | null
  acquired: boolean
}

let dbPromise: Promise<EOSDB> | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

async function getDB(): Promise<EOSDB | null> {
  if (!isBrowser()) return null
  if (!dbPromise) {
    const { openDB } = await import('idb')
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('plans')) {
          db.createObjectStore('plans', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('checklist')) {
          db.createObjectStore('checklist', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

// ─── Profile & inventory ─────────────────────────────────────────────────────

export async function saveProfile(p: StoredProfile): Promise<void> {
  const db = await getDB()
  if (!db) return
  await db.put('kv', p, 'profile')
}

export async function getProfile(): Promise<StoredProfile | null> {
  const db = await getDB()
  if (!db) return null
  const v = await db.get('kv', 'profile')
  return (v as StoredProfile | undefined) ?? null
}

/**
 * Official shelters, kept on the device (FAM-T08).
 *
 * The destination has to be known when the tower is down — that is the whole
 * argument of D-065 §1. The cached copy carries its own timestamp so the UI can
 * say how old it is: shelters open and close during an event, and a stale list
 * presented as current is the same lie as a stale position.
 */
export interface StoredShelters {
  shelters: Array<{
    id: string
    name: string
    lat: number
    lng: number
    address: string | null
    city: string | null
    state: string | null
  }>
  /** Where the user was when this list was fetched — distances are recomputed. */
  origin: { lat: number; lng: number } | null
  fetchedAt: string
}

export async function saveShelters(s: StoredShelters): Promise<void> {
  const db = await getDB()
  if (!db) return
  await db.put('kv', s, 'shelters')
}

export async function getShelters(): Promise<StoredShelters | null> {
  const db = await getDB()
  if (!db) return null
  const v = await db.get('kv', 'shelters')
  return (v as StoredShelters | undefined) ?? null
}

/**
 * O plano de voo da família, no dispositivo (PLAN-T05 / EXEC-T00).
 *
 * Este é o cache que justifica o produto: o plano precisa funcionar exatamente
 * quando o EOS não funciona (doc 18 §2). Guarda o documento inteiro por plano,
 * com a versão e o instante da sincronização — porque uma cópia local exibida
 * sem idade nem versão é a falha do doc 18 §6: duas pessoas executando planos
 * diferentes vão para lugares diferentes.
 */
export interface StoredFamilyPlan {
  circleId: string
  planId: string
  /** O documento como veio de `GET /api/plans`. */
  document: PlanDocument
  version: number
  syncedAt: string
}

export interface StoredFamilyPlanList {
  circleId: string
  plans: PlanSummary[]
  syncedAt: string
}

type LegacyStoredFamilyPlan = Omit<StoredFamilyPlan, 'planId' | 'document'> & {
  document: unknown
}

export type OfflineFamilyPlanSelection = {
  plans: PlanSummary[]
  planId: string | null
  cached: StoredFamilyPlan | null
}

const legacyPlanKey = (circleId: string) => `family-plan:${circleId}`
export const familyPlanDocumentKey = (circleId: string, planId: string) =>
  `family-plan:${circleId}:${planId}`
export const familyPlanListKey = (circleId: string) => `family-plan-list:${circleId}`

function planFromDocument(document: unknown): PlanDocument['plan'] | null {
  const maybePlan = (document as { plan?: PlanDocument['plan'] } | null)?.plan
  return maybePlan?.id ? maybePlan : null
}

function plansFromLegacyDocument(document: unknown): PlanSummary[] {
  const explicit = (document as { plans?: PlanSummary[] } | null)?.plans
  if (Array.isArray(explicit)) return explicit

  const plan = planFromDocument(document)
  return plan
    ? [{
        id: plan.id,
        name: plan.name,
        version: plan.version,
        status: plan.status,
        updated_at: plan.updated_at,
      }]
    : []
}

async function migrateLegacyFamilyPlan(
  db: EOSDB,
  circleId: string,
): Promise<StoredFamilyPlan | null> {
  const legacy = (await db.get('kv', legacyPlanKey(circleId))) as LegacyStoredFamilyPlan | undefined
  if (!legacy?.document) return null

  const plan = planFromDocument(legacy.document)
  if (!plan) return null

  const migrated: StoredFamilyPlan = {
    circleId,
    planId: plan.id,
    document: legacy.document as PlanDocument,
    version: legacy.version ?? plan.version ?? 0,
    syncedAt: legacy.syncedAt,
  }
  await db.put('kv', migrated, familyPlanDocumentKey(circleId, plan.id))

  const existingList = await db.get('kv', familyPlanListKey(circleId))
  if (!existingList) {
    await db.put('kv', {
      circleId,
      plans: plansFromLegacyDocument(legacy.document),
      syncedAt: legacy.syncedAt,
    } satisfies StoredFamilyPlanList, familyPlanListKey(circleId))
  }

  return migrated
}

export function selectOfflineFamilyPlan(
  plans: PlanSummary[],
  cachedPlans: StoredFamilyPlan[],
  targetPlanId?: string | null,
): OfflineFamilyPlanSelection {
  const planId = targetPlanId && plans.some(plan => plan.id === targetPlanId)
    ? targetPlanId
    : plans[0]?.id ?? cachedPlans[0]?.planId ?? null

  return {
    plans,
    planId,
    cached: cachedPlans.find(plan => plan.planId === planId) ?? null,
  }
}

export async function saveFamilyPlan(p: StoredFamilyPlan): Promise<void> {
  const db = await getDB()
  if (!db) return
  await db.put('kv', p, familyPlanDocumentKey(p.circleId, p.planId))
}

export async function getFamilyPlan(circleId: string, planId: string): Promise<StoredFamilyPlan | null> {
  const db = await getDB()
  if (!db) return null
  const v = await db.get('kv', familyPlanDocumentKey(circleId, planId))
  if (v) return v as StoredFamilyPlan

  const migrated = await migrateLegacyFamilyPlan(db, circleId)
  return migrated?.planId === planId ? migrated : null
}

export async function saveFamilyPlanList(list: StoredFamilyPlanList): Promise<void> {
  const db = await getDB()
  if (!db) return
  await db.put('kv', list, familyPlanListKey(list.circleId))
}

export async function getFamilyPlanList(circleId: string): Promise<StoredFamilyPlanList | null> {
  const db = await getDB()
  if (!db) return null
  const v = await db.get('kv', familyPlanListKey(circleId))
  if (v) return v as StoredFamilyPlanList

  await migrateLegacyFamilyPlan(db, circleId)
  const migrated = await db.get('kv', familyPlanListKey(circleId))
  return (migrated as StoredFamilyPlanList | undefined) ?? null
}

export async function saveInventory(i: StoredInventory): Promise<void> {
  const db = await getDB()
  if (!db) return
  await db.put('kv', i, 'inventory')
}

export async function getInventory(): Promise<StoredInventory | null> {
  const db = await getDB()
  if (!db) return null
  const v = await db.get('kv', 'inventory')
  return (v as StoredInventory | undefined) ?? null
}

// ─── Action plans (keep last 5) ──────────────────────────────────────────────

const MAX_PLANS = 5

export async function savePlan(plan: StoredPlan): Promise<void> {
  const db = await getDB()
  if (!db) return

  const tx = db.transaction('plans', 'readwrite')
  const store = tx.objectStore('plans')
  await store.put(plan)

  // Keep only the newest MAX_PLANS
  const all = (await store.getAll()) as StoredPlan[]
  const sorted = all.sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
  const overflow = sorted.slice(MAX_PLANS)
  for (const p of overflow) {
    await store.delete(p.id)
  }
  await tx.done
}

export async function getRecentPlans(): Promise<StoredPlan[]> {
  const db = await getDB()
  if (!db) return []
  const all = (await db.getAll('plans')) as StoredPlan[]
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(
    0,
    MAX_PLANS,
  )
}

// ─── Checklist cache ─────────────────────────────────────────────────────────

export async function saveChecklist(
  items: StoredChecklistItem[],
): Promise<void> {
  const db = await getDB()
  if (!db) return
  const tx = db.transaction('checklist', 'readwrite')
  const store = tx.objectStore('checklist')
  await store.clear()
  for (const it of items) await store.put(it)
  await tx.done
}

export async function getChecklist(): Promise<StoredChecklistItem[]> {
  const db = await getDB()
  if (!db) return []
  return (await db.getAll('checklist')) as StoredChecklistItem[]
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  const db = await getDB()
  if (!db) return
  const tx = db.transaction(['kv', 'plans', 'checklist'], 'readwrite')
  await tx.objectStore('kv').clear()
  await tx.objectStore('plans').clear()
  await tx.objectStore('checklist').clear()
  await tx.done
}
