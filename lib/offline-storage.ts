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
 * O plano de voo da família, no dispositivo (PLAN-T05).
 *
 * Este é o cache que justifica o produto: o plano precisa funcionar exatamente
 * quando o EOS não funciona (doc 18 §2). Guarda o documento inteiro por círculo,
 * com a versão e o instante da sincronização — porque uma cópia local exibida
 * sem idade nem versão é a falha do doc 18 §6: duas pessoas executando planos
 * diferentes vão para lugares diferentes.
 */
export interface StoredFamilyPlan {
  circleId: string
  /** O documento como veio de `GET /api/plans`. */
  document: unknown
  version: number
  syncedAt: string
}

const planKey = (circleId: string) => `family-plan:${circleId}`

export async function saveFamilyPlan(p: StoredFamilyPlan): Promise<void> {
  const db = await getDB()
  if (!db) return
  await db.put('kv', p, planKey(p.circleId))
}

export async function getFamilyPlan(circleId: string): Promise<StoredFamilyPlan | null> {
  const db = await getDB()
  if (!db) return null
  const v = await db.get('kv', planKey(circleId))
  return (v as StoredFamilyPlan | undefined) ?? null
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
