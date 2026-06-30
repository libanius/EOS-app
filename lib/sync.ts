/**
 * EOS Sync Layer
 *
 * Provides:
 * 1. Offline write queue (localStorage) — queues failed writes, flushes on reconnect
 * 2. Local snapshot cache — shows stale data instantly while fresh data loads
 */

export interface QueuedWrite {
  id: string
  url: string
  method: string
  body: string | null
  headers: Record<string, string>
  timestamp: number
}

const QUEUE_KEY = 'eos:offline_queue'
const SNAPSHOT_PREFIX = 'eos:snap:'

// ─── Offline write queue ──────────────────────────────────────────────────────

export function getQueue(): QueuedWrite[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedWrite[]
  } catch {
    return []
  }
}

export function enqueue(write: Omit<QueuedWrite, 'id' | 'timestamp'>): void {
  const q = getQueue()
  q.push({ ...write, id: crypto.randomUUID(), timestamp: Date.now() })
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

export function dequeue(id: string): void {
  const q = getQueue().filter(w => w.id !== id)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  const q = getQueue()
  if (!q.length) return { flushed: 0, failed: 0 }
  let flushed = 0, failed = 0
  for (const write of q) {
    try {
      const res = await fetch(write.url, {
        method: write.method,
        headers: write.headers,
        body: write.body ?? undefined,
      })
      if (res.ok) { dequeue(write.id); flushed++ }
      else { failed++ }
    } catch {
      failed++
    }
  }
  return { flushed, failed }
}

// ─── Local snapshot cache ─────────────────────────────────────────────────────

export function saveSnapshot<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SNAPSHOT_PREFIX + key, JSON.stringify({ data, t: Date.now() }))
  } catch {}
}

export function loadSnapshot<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data: T; t: number }
    return parsed.data
  } catch {
    return null
  }
}

// ─── Fetch with queue fallback ────────────────────────────────────────────────
// Use this instead of raw fetch for write operations — auto-queues when offline.

export async function syncFetch(
  url: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; queued: boolean; data: unknown }> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> | undefined) }
  try {
    const res = await fetch(url, { ...options, headers })
    const data = res.ok ? await res.json().catch(() => null) : null
    return { ok: res.ok, queued: false, data }
  } catch {
    // Network error — queue the write if it's a mutating request
    if (method !== 'GET') {
      enqueue({ url, method, body: options.body as string | null ?? null, headers })
      return { ok: false, queued: true, data: null }
    }
    return { ok: false, queued: false, data: null }
  }
}
