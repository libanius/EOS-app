/** Dedicated worker: all weights, GPU work and third-party runtime stay off the UI thread. */
import { CreateMLCEngine, hasModelInCache, deleteModelAllInfoInCache, type MLCEngine } from '@mlc-ai/web-llm'
import { MODEL_CONFIG, MODEL_ID } from './model'
import type { LocalPrompt } from '../lib/local-ai-core'
let engine: MLCEngine | null = null
const artifactFetch = globalThis.fetch.bind(globalThis)
let networkAllowed = false
// Cached inference cannot repair a missing asset by silently going online.
globalThis.fetch = (...args: Parameters<typeof fetch>) => networkAllowed
  ? artifactFetch(...args) : Promise.reject(new Error('offline_assets_missing'))
self.onmessage = async event => {
  const { id, method, data } = event.data as { id: number; method: string; data: LocalPrompt & { allowDownload?: boolean } }
  const reply = (result: unknown) => self.postMessage({ id, result })
  try {
    if (method === 'hasCache') { reply(await hasModelInCache(MODEL_ID, MODEL_CONFIG)); return }
    if (method === 'load') {
      networkAllowed = data.allowDownload === true
      engine = await CreateMLCEngine(MODEL_ID, { appConfig: MODEL_CONFIG, logLevel: 'ERROR',
        initProgressCallback: report => self.postMessage({ id, progress: report.progress }),
      }, { context_window_size: 4096 })
      networkAllowed = false
      reply(true); return
    }
    if (method === 'remove') { await engine?.unload(); engine = null; await deleteModelAllInfoInCache(MODEL_ID, MODEL_CONFIG); reply(true); return }
    if (method !== 'generate' || !engine) throw new Error('model_unavailable')
    const completion = await engine.chat.completions.create({
      messages: [{ role: 'system', content: data.instructions }, { role: 'user', content: data.prompt }],
      temperature: 0.2, max_tokens: 600, stream: false,
      response_format: { type: 'json_object', schema: JSON.stringify({ type: 'object', properties: {
        answer: { type: 'string' }, sourceIds: { type: 'array', items: { type: 'string', enum: data.sourceIds }, minItems: 1, maxItems: 3 }, question: { type: 'string' },
      }, required: ['answer', 'sourceIds', 'question'], additionalProperties: false }) },
    })
    if (completion.choices[0]?.finish_reason !== 'stop') throw new Error('incomplete_local_answer')
    reply(completion.choices[0]?.message.content)
  } catch { networkAllowed = false; self.postMessage({ id, error: 'local_worker_failed' }) }
}
