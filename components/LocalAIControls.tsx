'use client'
import { useEffect, useState } from 'react'
import { localRuntime, type LocalStatus } from '@/lib/local-ai-client'

export default function LocalAIControls({ pt, busy = false }: { pt: boolean; busy?: boolean }) {
  const [status, setStatus] = useState<LocalStatus | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    void localRuntime().then(r => r.status()).then(s => { if (alive) setStatus(s) }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])
  const prepare = async () => {
    setPreparing(true); setError(false)
    try { const runtime = await localRuntime(); setStatus(await runtime.prepare(setProgress)) }
    catch (e) { if (!(e instanceof Error && e.message === 'local_cancelled')) setError(true) }
    finally { setPreparing(false) }
  }
  const stop = async () => {
    const runtime = await localRuntime()
    await runtime.cancel(); setPreparing(false); setStatus(await runtime.status())
  }
  const label = preparing
    ? `${pt ? 'Preparando IA local' : 'Preparing local AI'} · ${Math.round(progress * 100)}%`
    : status?.state === 'ready'
      ? (pt ? 'IA local pronta nesta sessão' : 'Local AI ready in this session')
      : status?.state === 'cached'
        ? (pt ? 'Arquivos locais encontrados; carregue para verificar' : 'Local files found; load to verify')
        : status?.state === 'unsupported'
          ? (pt ? 'IA local indisponível aqui; a biblioteca continua disponível' : 'Local AI unavailable here; the library remains available')
          : (pt ? 'Prepare a conversa offline antes de perder a conexão' : 'Prepare offline conversation before losing connection')
  return <div className="t-foot ink-2" style={{ padding: '4px 16px 8px' }}>
    <p role="status">{label}</p>
    {status?.reason === 'appleIntelligenceNotEnabled' && <p>{pt ? 'Ative Apple Intelligence nos Ajustes do iPhone.' : 'Enable Apple Intelligence in iPhone Settings.'}</p>}
    {status?.state === 'needs_download' && <p>{pt ? 'Download opcional de aproximadamente 1 GB. Prefira Wi-Fi; o aparelho precisa de espaço e memória disponíveis.' : 'Optional download of about 1 GB. Prefer Wi-Fi; the device needs available storage and memory.'}</p>}
    {error && <p role="alert">{pt ? 'Não consegui preparar o modelo. Você ainda pode consultar os textos salvos.' : 'Could not prepare the model. You can still search saved texts.'}</p>}
    {!preparing && !busy && status && !['unsupported', 'ready'].includes(status.state) && <button type="button" className="wv2-pill" onClick={() => void prepare()}>{pt ? 'Preparar conversa offline' : 'Prepare offline conversation'}</button>}
    {(preparing || busy || status?.state === 'ready') && <button type="button" className="wv2-pill" onClick={() => void stop()}>{pt ? 'Interromper IA local' : 'Stop local AI'}</button>}
    {status?.provider === 'webllm' && ['ready', 'cached'].includes(status.state) && !preparing && !busy && <button type="button" className="wv2-pill" onClick={() => {
      void localRuntime().then(async r => { await r.remove(); setStatus(await r.status()) }).catch(() => setError(true))
    }}>{pt ? 'Remover modelo baixado' : 'Remove downloaded model'}</button>}
  </div>
}
