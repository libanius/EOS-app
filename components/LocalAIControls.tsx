'use client'
import { useEffect, useState } from 'react'
import { localRuntime, type LocalStatus } from '@/lib/local-ai-client'
import { preparationFeedback } from '@/local-ai/preparation-feedback'

export default function LocalAIControls({ pt, busy = false }: { pt: boolean; busy?: boolean }) {
  const [status, setStatus] = useState<LocalStatus | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [issue, setIssue] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = () => {
      void localRuntime().then(r => r.status()).then(s => { if (alive) setStatus(s) })
        .catch(() => { if (alive) setIssue('local_runtime_missing') })
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  const preparing = progress !== null
  const prepare = async () => {
    setProgress(0); setIssue(null)
    try {
      const runtime = await localRuntime()
      setStatus(await runtime.prepare(setProgress))
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'local_worker_failed')
      void localRuntime().then(r => r.status()).then(setStatus).catch(() => {})
    } finally { setProgress(null) }
  }
  const stop = async () => {
    const runtime = await localRuntime()
    await runtime.cancel()
    setStatus(await runtime.status())
  }
  const feedback = preparationFeedback(pt, status, progress, issue)
  const color = feedback.tone === 'ready' ? 'var(--ac)' : feedback.tone === 'warning' ? 'var(--warn)' : 'var(--tx)'
  const canPrepare = !preparing && !busy && status && !['unsupported', 'ready', 'loading'].includes(status.state)
  const prepareLabel = issue || status?.state === 'error'
    ? (pt ? 'Tentar novamente' : 'Try again')
    : status?.state === 'cached'
      ? (pt ? 'Carregar modelo local' : 'Load local model')
      : (pt ? 'Preparar conversa offline' : 'Prepare offline conversation')
  return <div className="t-foot ink-2" style={{ margin: '0 16px 8px', padding: '8px 12px', border: '1px solid var(--bd)', borderRadius: 12, background: 'var(--sf)' }}>
    <div role="status">
      <p style={{ color, fontWeight: 700, fontSize: 14 }}>{feedback.title}</p>
      {feedback.next && <p>{feedback.next}</p>}
    </div>
    {preparing && <progress aria-label={pt ? 'Progresso da preparação' : 'Setup progress'} max={1}
      value={progress > 0 && progress < 1 ? progress : undefined} style={{ width: '100%', accentColor: 'var(--ac)' }} />}
    {canPrepare && <button type="button" className="wv2-pill" onClick={() => void prepare()}>{prepareLabel}</button>}
    {(preparing || busy || status?.state === 'ready') && <button type="button" className="wv2-pill" onClick={() => void stop()}>
      {preparing ? (pt ? 'Cancelar preparação' : 'Cancel setup') : (pt ? 'Interromper IA local' : 'Stop local AI')}
    </button>}
    {status?.provider === 'webllm' && ['ready', 'cached'].includes(status.state) && !preparing && !busy && <button type="button" className="wv2-pill" onClick={() => {
      void localRuntime().then(async r => { await r.remove(); setIssue(null); setStatus(await r.status()) }).catch(() => setIssue('local_worker_failed'))
    }}>{pt ? 'Remover modelo baixado' : 'Remove downloaded model'}</button>}
  </div>
}
