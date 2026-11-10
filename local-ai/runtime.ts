/** Standalone local inference for the app and cold-start screen. No remote prompt endpoint. */
import { answerLocally, type LocalRequest, type LocalPrompt, type LocalResult } from '../lib/local-ai-core'
const WORKER_URL = new URL('local-ai-worker.js', (document.currentScript as HTMLScriptElement | null)?.src || new URL('/local-ai-runtime.js', location.href).href).href
export type LocalStatus = { state: 'unsupported' | 'needs_download' | 'cached' | 'loading' | 'ready' | 'error'; provider: 'webllm' | 'apple' | 'none'; reason?: string; progress?: number }
export type LocalRuntime = {
  status(): Promise<LocalStatus>; prepare(progress?: (value: number) => void): Promise<LocalStatus>
  answer(request: LocalRequest): Promise<LocalResult>; cancel(): Promise<void>; remove(): Promise<void>
}
type ApplePlugin = {
  status(): Promise<{ available: boolean; reason: string }>
  generate(input: { instructions: string; prompt: string; requestId: string }): Promise<unknown>
  cancel(): Promise<void>
}
type Prefs = { get(input: { key: string }): Promise<{ value: string | null }>; set(input: { key: string; value: string }): Promise<void> }
type Cap = { getPlatform?(): string; registerPlugin?(name: string): ApplePlugin; Plugins?: Record<string, unknown> }
const scope = globalThis as unknown as { EOSLocalAI: LocalRuntime; Capacitor?: Cap }
let worker: Worker | null = null
let engineReady = false
let loading: Promise<void> | null = null
let generation = 0
let busy = false
let rpcId = 0
let apple: ApplePlugin | null = null
let sessionEnabled = false
const enabledKey = 'eos.local-ai.enabled.v1'
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; progress?: (value: number) => void }>()
const cancellers = new Set<(error: Error) => void>()
function ios() { return scope.Capacitor?.getPlatform?.() === 'ios' }
function plugin(): ApplePlugin | null {
  if (!ios()) return null
  if (!apple) apple = (scope.Capacitor?.Plugins?.EOSLocalAI as ApplePlugin | undefined) ?? scope.Capacitor?.registerPlugin?.('EOSLocalAI') ?? null
  return apple
}
async function enabled() {
  try { return (await (scope.Capacitor?.Plugins?.Preferences as Prefs | undefined)?.get({ key: enabledKey }))?.value === '1' } catch { return false }
}
async function setEnabled(value: boolean) {
  try { await (scope.Capacitor?.Plugins?.Preferences as Prefs | undefined)?.set({ key: enabledKey, value: value ? '1' : '0' }) } catch { /* Explicit preparation still works in this session. */ }
}
function terminateWorker(reason: string) {
  worker?.terminate(); worker = null; engineReady = false; loading = null
  for (const request of Array.from(pending.values())) request.reject(new Error(reason))
  pending.clear()
}
function rpc(method: string, data: unknown = {}, progress?: (value: number) => void): Promise<unknown> {
  if (!worker) {
    worker = new Worker(WORKER_URL, { name: 'eos-local-ai' })
    worker.onmessage = event => {
      const response = event.data as { id: number; result?: unknown; error?: string; progress?: number }
      const request = pending.get(response.id)
      if (!request) return
      if (typeof response.progress === 'number') { request.progress?.(response.progress); return }
      pending.delete(response.id)
      if (response.error) request.reject(new Error('local_worker_failed')); else request.resolve(response.result)
    }
    worker.onerror = () => terminateWorker('local_worker_failed')
  }
  const id = ++rpcId
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, progress }); worker!.postMessage({ id, method, data }) })
}
function bounded<T>(task: Promise<T>, ms = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => { clearTimeout(timer); cancellers.delete(fail); reject(error) }
    const timer = setTimeout(() => {
      terminateWorker('local_timeout'); void plugin()?.cancel().catch(() => {}); fail(new Error('local_timeout'))
    }, ms)
    cancellers.add(fail)
    task.then(value => { clearTimeout(timer); cancellers.delete(fail); resolve(value) }, fail)
  })
}
async function status(): Promise<LocalStatus> {
  if (ios()) {
    try {
      const result = await bounded(plugin()?.status() ?? Promise.resolve(null), 5000)
      if (!result?.available) return { state: 'unsupported', provider: 'apple', reason: result?.reason ?? 'native_plugin_missing' }
      return { state: sessionEnabled || await enabled() ? 'ready' : 'cached', provider: 'apple' }
    } catch { return { state: 'unsupported', provider: 'apple', reason: 'native_plugin_missing' } }
  }
  if (scope.Capacitor?.getPlatform?.() === 'android') return { state: 'unsupported', provider: 'none', reason: 'native_model_unavailable' }
  if (!globalThis.isSecureContext || !navigator.gpu) return { state: 'unsupported', provider: 'none', reason: 'webgpu_unavailable' }
  if (engineReady) return { state: 'ready', provider: 'webllm' }
  if (loading) return { state: 'loading', provider: 'webllm' }
  try { return { state: await bounded(rpc('hasCache'), 15000) ? 'cached' : 'needs_download', provider: 'webllm' } }
  catch { return { state: 'error', provider: 'webllm', reason: 'model_cache_unavailable' } }
}
async function lowBattery() {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }
  try { const b = await nav.getBattery?.(); return !!b && !b.charging && b.level < 0.15 } catch { return false }
}
async function load(progress?: (value: number) => void, allowDownload = false): Promise<void> {
  if (engineReady) return
  if (loading) return loading
  const current = generation
  loading = (async () => {
    if (!navigator.gpu || !await navigator.gpu.requestAdapter()) throw new Error('webgpu_unavailable')
    const cached = await bounded(rpc('hasCache'), 15000)
    if (!cached && !allowDownload) throw new Error('model_not_prepared')
    if (!cached && !navigator.onLine) throw new Error('model_download_requires_connection')
    if (!cached) {
      const storage = await navigator.storage?.estimate?.()
      if (storage?.quota && storage.quota - (storage.usage ?? 0) < 1400 * 1024 * 1024) throw new Error('insufficient_storage')
      await navigator.storage?.persist?.().catch(() => false)
    }
    await rpc('load', { allowDownload }, value => progress?.(Math.max(0, Math.min(1, value))))
    if (current !== generation) throw new Error('local_cancelled')
    engineReady = true; progress?.(1)
  })().finally(() => { if (current === generation) loading = null })
  return loading
}
async function prepare(progress?: (value: number) => void): Promise<LocalStatus> {
  if (await lowBattery()) throw new Error('low_battery')
  if (ios()) {
    const s = await status()
    if (s.state === 'unsupported') throw new Error(s.reason)
    sessionEnabled = true; await setEnabled(true); progress?.(1)
    return { state: 'ready', provider: 'apple' }
  }
  await bounded(load(progress, true), 10 * 60 * 1000)
  return { state: 'ready', provider: 'webllm' }
}
async function cancel() {
  generation++
  terminateWorker('local_cancelled')
  for (const fail of Array.from(cancellers)) fail(new Error('local_cancelled'))
  cancellers.clear()
  try { await plugin()?.cancel() } catch { /* Missing native plugin leaves the documentary library. */ }
}
async function generate(prompt: LocalPrompt): Promise<unknown> {
  if (await lowBattery()) throw new Error('low_battery')
  if (ios()) {
    if (!sessionEnabled && !await enabled()) throw new Error('model_not_prepared')
    const p = plugin()
    if (!p) throw new Error('native_plugin_missing')
    return bounded(p.generate({ instructions: prompt.instructions, prompt: prompt.prompt, requestId: String(generation) }))
  }
  await bounded(load(undefined, false))
  if (!engineReady) throw new Error('model_unavailable')
  return bounded(rpc('generate', prompt))
}
async function answer(request: LocalRequest): Promise<LocalResult> {
  if (busy) throw new Error('local_busy')
  busy = true
  const current = generation
  try {
    const result = await answerLocally(request, generate)
    if (current !== generation) throw new Error('local_cancelled')
    return result
  } finally { busy = false }
}
async function remove() {
  await cancel(); sessionEnabled = false; await setEnabled(false)
  if (!ios()) { await bounded(rpc('remove'), 15000); terminateWorker('local_removed') }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void cancel() })
scope.EOSLocalAI = { status, prepare, answer, cancel, remove }
