'use client'
import { useState } from 'react'
import type { Signal } from '@/lib/signals'
import { signalSharePath, signalShareText, type ShareLanguage } from '@/lib/signal-sharing'

export default function SignalShareButtons({ signal, lang }: { signal: Signal; lang: ShareLanguage }) {
  const [message, setMessage] = useState('')
  const pt = lang === 'pt'
  const copy = async (full: boolean) => {
    try {
      const url = `${window.location.origin}${signalSharePath(signal.slug, lang)}`
      await navigator.clipboard.writeText(signalShareText(signal, lang, url, full))
      setMessage(pt ? 'Copiado com o link do EOS.' : 'Copied with the EOS link.')
    } catch { setMessage(pt ? 'Não foi possível copiar. Tente novamente.' : 'Could not copy. Please try again.') }
  }
  const share = async () => {
    const url = `${window.location.origin}${signalSharePath(signal.slug, lang)}`
    if (!navigator.share) { await copy(false); return }
    try {
      await navigator.share({ title: `EOS · ${signal.title[lang]}`, text: `${signal.summary[lang]}\n\n${pt ? 'Preparação, sem pânico.' : 'Preparation, not panic.'} EOS`, url })
      setMessage('')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setMessage(pt ? 'Não foi possível compartilhar. Use Copiar resumo.' : 'Could not share. Use Copy summary.')
    }
  }
  return <div style={{ display: 'grid', gap: 10 }}>
    <button type="button" className="sg-btn block" onClick={() => void share()}>{pt ? 'Compartilhar Sinal' : 'Share Signal'}</button>
    <button type="button" className="sg-btn block" onClick={() => void copy(true)}>{pt ? 'Copiar resumo com link' : 'Copy summary with link'}</button>
    <span role="status" aria-live="polite" style={{ fontSize: 14 }}>{message}</span>
  </div>
}
