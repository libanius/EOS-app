import { getKnowledgePack, saveKnowledgePack } from './offline-storage'
import { KNOWLEDGE_KEY, MAX_KNOWLEDGE_BYTES, validKnowledgePack, type KnowledgePack } from './offline-knowledge'
import { nativeGet, nativeSet, nativeRemove, isNativeShell } from './native/bridge'

const BLOCK_SIZE = 128 * 1024
export type NativeKnowledgeManifest = { version: string; blocks: number; previous?: { version: string; blocks: number } }
const blockKey = (version: string, i: number) => `${KNOWLEDGE_KEY}:${version}:${i}`
export async function verifyKnowledgePack(pack: unknown): Promise<boolean> {
  // Type narrowing is done by validKnowledgePack; async predicates do not exist in TypeScript.
  return validKnowledgePack(pack) && await contentHash(pack.documents) === pack.version
}
async function contentHash(documents: KnowledgePack['documents']) {
  const bytes = new TextEncoder().encode(JSON.stringify(documents))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
export async function readNativeKnowledge(scope?: unknown): Promise<KnowledgePack | null> {
  try {
    const raw = await nativeGet(KNOWLEDGE_KEY, scope)
    if (!raw) return null
    const manifest = JSON.parse(raw) as NativeKnowledgeManifest
    for (const m of [manifest, manifest.previous]) {
      if (!m || !/^[a-f0-9]{64}$/.test(m.version) || !Number.isInteger(m.blocks) || m.blocks < 1 || m.blocks > 300) continue
      const blocks: string[] = []
      for (let i = 0; i < m.blocks; i++) {
        const block = await nativeGet(blockKey(m.version, i), scope)
        if (block === null) break
        blocks.push(block)
      }
      if (blocks.length !== m.blocks) continue
      try {
        const pack: unknown = JSON.parse(blocks.join(''))
        if (validKnowledgePack(pack) && await verifyKnowledgePack(pack)) return pack
      } catch { /* Try the previous committed generation. */ }
    }
  } catch { /* Absence or damaged storage is not a complete download. */ }
  return null
}
export async function saveNativeKnowledge(pack: KnowledgePack, scope?: unknown): Promise<boolean> {
  const raw = JSON.stringify(pack)
  if (new TextEncoder().encode(raw).byteLength > MAX_KNOWLEDGE_BYTES) return false
  const priorRaw = await nativeGet(KNOWLEDGE_KEY, scope)
  let prior: NativeKnowledgeManifest | null = null
  try { prior = priorRaw ? JSON.parse(priorRaw) : null } catch { /* Recover with a new snapshot. */ }
  if (prior?.version === pack.version && (await readNativeKnowledge(scope))?.version === pack.version) return true
  if (prior?.version === pack.version) prior = prior.previous ? { ...prior.previous } : null
  const blocks = Math.ceil(raw.length / BLOCK_SIZE)
  const written: string[] = []
  let committed = false
  try {
    for (let i = 0; i < blocks; i++) {
      const key = blockKey(pack.version, i)
      written.push(key)
      if (!await nativeSet(key, raw.slice(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE), scope)) throw new Error('native_write_failed')
      if (await nativeGet(key, scope) !== raw.slice(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE)) throw new Error('native_readback_failed')
    }
    const manifest: NativeKnowledgeManifest = { version: pack.version, blocks,
      ...(prior ? { previous: { version: prior.version, blocks: prior.blocks } } : {}) }
    if (!await nativeSet(KNOWLEDGE_KEY, JSON.stringify(manifest), scope)) throw new Error('native_commit_failed')
    committed = true
    // Keep the previous complete generation; discard only the generation before it.
    if (prior?.previous && /^[a-f0-9]{64}$/.test(prior.previous.version) && Number.isInteger(prior.previous.blocks) && prior.previous.blocks <= 300 && prior.previous.version !== pack.version) {
      for (let i = 0; i < prior.previous.blocks; i++) await nativeRemove(blockKey(prior.previous.version, i), scope)
    }
    return true
  } catch {
    if (!committed) for (const key of written) await nativeRemove(key, scope)
    return false
  }
}

export async function readOfflineKnowledge(): Promise<KnowledgePack | null> {
  try {
    const pack = isNativeShell() ? await readNativeKnowledge() : await getKnowledgePack()
    return validKnowledgePack(pack) && await verifyKnowledgePack(pack) ? pack : null
  } catch { return null }
}
let running: Promise<KnowledgePack> | null = null
export function syncOfflineKnowledge(): Promise<KnowledgePack> {
  if (running) return running
  running = (async () => {
    const previous = await readOfflineKnowledge()
    const response = await fetch('/api/pilot/offline-pack', { cache: 'no-store',
      headers: previous ? { 'If-None-Match': `"${previous.version}"` } : {}, signal: AbortSignal.timeout(60000) })
    if (response.status === 304 && previous) return previous
    if (!response.ok) throw new Error(`knowledge_download_${response.status}`)
    const manifest = await response.json() as { schema: number; version: string; syncedAt: string; parts: number; characters: number }
    if (manifest.schema !== 1 || !/^[a-f0-9]{64}$/.test(manifest.version) ||
        !Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > 128 ||
        !Number.isInteger(manifest.characters) || manifest.characters < 2 || manifest.characters > MAX_KNOWLEDGE_BYTES) throw new Error('knowledge_manifest_invalid')
    const parts: string[] = []
    // Small responses avoid hosting payload limits. Every part belongs to the SAME publication version.
    for (let start = 0; start < manifest.parts; start += 3) {
      const group = await Promise.all(Array.from({ length: Math.min(3, manifest.parts - start) }, async (_, offset) => {
        const part = start + offset
        const r = await fetch(`/api/pilot/offline-pack?version=${manifest.version}&part=${part}`, { cache: 'no-store', signal: AbortSignal.timeout(60000) })
        if (!r.ok) throw new Error(`knowledge_part_${r.status}`)
        const payload = await r.json() as { version: string; part: number; data: string }
        if (payload.version !== manifest.version || payload.part !== part || typeof payload.data !== 'string' || payload.data.length > 256 * 1024) throw new Error('knowledge_part_invalid')
        return payload.data
      }))
      parts.push(...group)
    }
    const raw = parts.join('')
    if (raw.length !== manifest.characters || new TextEncoder().encode(raw).byteLength > MAX_KNOWLEDGE_BYTES) throw new Error('knowledge_pack_too_large')
    const pack: unknown = { schema: 1, version: manifest.version, syncedAt: manifest.syncedAt, documents: JSON.parse(raw) }
    if (!validKnowledgePack(pack) || !await verifyKnowledgePack(pack)) throw new Error('knowledge_integrity_failed')
    // Request persistent storage where available; a refusal never means success or failure.
    await navigator.storage?.persist?.().catch(() => false)
    if (!await saveKnowledgePack(pack)) throw new Error('knowledge_storage_failed')
    if (isNativeShell() && !await saveNativeKnowledge(pack)) throw new Error('knowledge_native_storage_failed')
    return pack
  })().finally(() => { running = null })
  return running
}
