'use client'

/**
 * /sim/[token] — landing for a drill invite link (D-072).
 *
 * It does one thing: register the visitor as INVITED, then send them to the
 * dashboard, where the same pop-up everyone else sees asks whether they want to
 * join. The link is a doorbell, not a key.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n'

export default function SimJoinPage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const { language } = useLanguage()
  const pt = language === 'pt'
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/simulation/join/${params.token}`, { method: 'POST' })
      .then(r => r.json())
      .then((d: { ok?: boolean; error?: string; message?: string }) => {
        if (cancelled) return
        if (d.ok) {
          router.replace('/dashboard')
          return
        }
        setMessage(
          d.message ??
            (pt ? 'Este convite não é mais válido.' : 'This invite is no longer valid.'),
        )
      })
      .catch(() => {
        if (!cancelled) setMessage(pt ? 'Não foi possível abrir o convite.' : 'Could not open the invite.')
      })
    return () => { cancelled = true }
  }, [params.token, router, pt])

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{pt ? 'Treino da família' : 'Family drill'}</p>
          <h1 className="list-title">
            {message ?? (pt ? 'Abrindo o convite…' : 'Opening the invite…')}
          </h1>
        </header>
      </div>
    </div>
  )
}
