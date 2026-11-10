/** Exercise the shipped standalone runtime with an isolated local provider; no real model/GPU claims. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import type { LocalRuntime } from '../../local-ai/runtime'
import type { LocalRequest } from '@/lib/local-ai-core'
function setup(options: { native?: boolean; cached?: boolean; gpu?: boolean; slow?: boolean } = {}) {
  const posts: Array<{ method: string; data: unknown }> = []
  const fetch = jest.fn(() => { throw new Error('Network forbidden in this test') })
  let terminated = 0
  const mockResult = { answer: 'A fervura não remove produtos químicos tóxicos.', sourceIds: ['manual:water'], question: 'Qual a origem da água?' }
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void
    onerror?: () => void
    postMessage(message: { id: number; method: string; data: unknown }) {
      posts.push(message)
      if (message.method === 'generate' && options.slow) return
      const result = message.method === 'hasCache' ? options.cached !== false : message.method === 'generate' ? JSON.stringify(mockResult) : true
      Promise.resolve().then(() => this.onmessage?.({ data: { id: message.id, result } }))
    }
    terminate() { terminated++ }
  }
  const nativeCalls = { generate: jest.fn(async () => mockResult), cancel: jest.fn(async () => {}) }
  const preferences = new Map<string, string>()
  const scope = {
    URL, Error, Promise, Map, Set, console, setTimeout, clearTimeout,
    document: { currentScript: { src: 'https://eos.test/local-ai-runtime.js' }, addEventListener: jest.fn() },
    location: { href: 'https://eos.test/preparedness/plano' }, isSecureContext: true,
    navigator: { onLine: false, ...(options.gpu !== false ? { gpu: { requestAdapter: async () => ({}) } } : {}) },
    Worker: FakeWorker, fetch,
    ...(options.native ? { Capacitor: { getPlatform: () => 'ios', Plugins: {
      EOSLocalAI: { status: async () => ({ available: true, reason: '' }), ...nativeCalls },
      Preferences: { get: async ({ key }: { key: string }) => ({ value: preferences.get(key) ?? null }), set: async ({ key, value }: { key: string; value: string }) => { preferences.set(key, value) } },
    } } } : {}),
  }
  runInNewContext(readFileSync('public/local-ai-runtime.js', 'utf8'), scope)
  return { runtime: (scope as unknown as { EOSLocalAI: LocalRuntime }).EOSLocalAI, posts, fetch, nativeCalls, terminated: () => terminated, preferences }
}
const request: LocalRequest = { question: 'Como tratar água?', pt: true, history: [], pack: {
  schema: 1, version: 'a'.repeat(64), syncedAt: '2026-11-10T14:00:00Z', documents: [
    { id: 'manual:water', title: 'Water safety', kind: 'manual', lang: 'en', source: 'CDC', version: 'v1', text: 'Water treatment. WARNING: Boiling does not remove toxic chemicals.' },
  ],
} }
it('uses a previously cached model for two offline turns without sending prompts by fetch', async () => {
  const s = setup()
  expect((await s.runtime.answer(request)).mode).toBe('local_ai')
  expect((await s.runtime.answer({ ...request, question: 'E para crianças?', history: [{ role: 'user', content: request.question }] })).mode).toBe('local_ai')
  expect(s.posts.filter(p => p.method === 'load')).toHaveLength(1)
  expect(s.posts.filter(p => p.method === 'generate')).toHaveLength(2)
  expect(s.fetch).not.toHaveBeenCalled()
  await s.runtime.cancel()
})
it('missing cache does not silently download a model in response to a question', async () => {
  const s = setup({ cached: false })
  expect((await s.runtime.answer(request)).mode).toBe('documents')
  expect(s.posts.some(p => p.method === 'load')).toBe(false)
  expect(s.fetch).not.toHaveBeenCalled()
  await s.runtime.cancel()
})
it('no WebGPU preserves documentary access instead of claiming a local model is ready', async () => {
  const s = setup({ gpu: false })
  expect((await s.runtime.status()).state).toBe('unsupported')
  expect((await s.runtime.answer(request)).mode).toBe('documents')
  expect(s.posts).toEqual([])
})
it('native preparation persists through application Preferences and native answers stay local', async () => {
  const s = setup({ native: true })
  expect((await s.runtime.status()).state).toBe('cached')
  expect((await s.runtime.answer(request)).mode).toBe('documents')
  await s.runtime.prepare()
  expect(s.preferences.get('eos.local-ai.enabled.v1')).toBe('1')
  const result = await s.runtime.answer(request)
  expect(result.mode).toBe('local_ai')
  expect(s.nativeCalls.generate).toHaveBeenCalledTimes(1)
  expect(s.posts).toEqual([])
  expect(s.fetch).not.toHaveBeenCalled()
})
it('cancellation terminates active generation and never delivers its late result', async () => {
  const s = setup({ slow: true })
  const pending = s.runtime.answer(request)
  const rejected = expect(pending).rejects.toThrow('local_cancelled')
  for (let i = 0; i < 30 && !s.posts.some(p => p.method === 'generate'); i++) await Promise.resolve()
  await s.runtime.cancel()
  await rejected
  expect(s.terminated()).toBeGreaterThan(0)
})
