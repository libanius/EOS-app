/**
 * EOS — Offline storage (IndexedDB via `idb`)
 *
 * Stores the smallest set of data needed for EOS to be useful without the
 * network:
 *   - profile         (single row)
 *   - inventory       (single row)
 *   - recent plans    (last 5 action plans)
 *   - checklist       (latest generated items)
 *
 * Only runs in the browser. All helpers are no-ops on the server.
 *
 * Public API:
 *   saveProfile / getProfile
 *   saveInventory / getInventory
 *   savePlan      / getRecentPlans
 *   saveChecklist / getChecklist
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
