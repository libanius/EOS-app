import type { LocalRuntime } from '../local-ai/runtime'
export type { LocalStatus, LocalRuntime } from '../local-ai/runtime'
let loading: Promise<LocalRuntime> | null = null
export function localRuntime(): Promise<LocalRuntime> {
  const scope = window as unknown as { EOSLocalAI?: LocalRuntime }
  if (scope.EOSLocalAI) return Promise.resolve(scope.EOSLocalAI)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/local-ai-runtime.js'; script.async = true
    const timer = setTimeout(() => { script.remove(); loading = null; reject(new Error('local_runtime_missing')) }, 15000)
    script.onload = () => { clearTimeout(timer); if (scope.EOSLocalAI) resolve(scope.EOSLocalAI); else { loading = null; reject(new Error('local_runtime_missing')) } }
    script.onerror = () => { clearTimeout(timer); script.remove(); loading = null; reject(new Error('local_runtime_missing')) }
    document.head.appendChild(script)
  })
  return loading
}

export async function clearLocalAISession(): Promise<void> {
  if (typeof window === 'undefined') return
  const runtime = (window as unknown as { EOSLocalAI?: LocalRuntime }).EOSLocalAI
  await runtime?.cancel()
}
