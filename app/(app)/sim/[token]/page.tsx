'use client'

/**
 * /sim/[token] — landing for a drill invite link (D-072).
 *
 * It does one thing: register the visitor as INVITED, then send them to the
 * dashboard, where the same pop-up everyone else sees asks whether they want to
 * join. The link is a doorbell, not a key.
 */

import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n'
import { simulationLabel, type SimulationConfig } from '@/lib/simulation'

const INVITE_KEY = 'eos-onboarding-sim-invite'

type InviteContext = {
  token: string
  ownerName: string
  config: SimulationConfig
}

export default function SimJoinPage({ params }: { params: { token: string } }) {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const [message, setMessage] = useState<string | null>(null)
  const [context, setContext] = useState<InviteContext | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/simulation/join/${params.token}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { session?: { status: string; config: SimulationConfig; ownerName: string } }) => {
        if (cancelled || !d.session) return
        const next = { token: params.token, ownerName: d.session.ownerName, config: d.session.config }
        setContext(next)
        localStorage.setItem(INVITE_KEY, JSON.stringify(next))
      })
      .catch(() => {})

    fetch(`/api/simulation/join/${params.token}`, { method: 'POST' })
      .then(r => r.json())
      .then((d: { ok?: boolean; error?: string; message?: string }) => {
        if (cancelled) return
        if (d.ok) {
          localStorage.removeItem(INVITE_KEY)
          // A FULL navigation, not router.replace: the invite poller lives in the
          // app layout, which a client-side navigation does not remount — the
          // guest would sit on the dashboard waiting up to 20s for the pop-up.
          window.location.assign('/dashboard')
          return
        }
        if (d.error === 'Não autenticado.' || d.error === 'Unauthorized') {
          const path = `/sim/${params.token}`
          window.location.assign(`/auth/login?redirectTo=${encodeURIComponent(path)}`)
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
  }, [params.token, pt])

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{pt ? 'Treino da família' : 'Family drill'}</p>
          <h1 className="list-title">
            {message ?? (pt ? 'Abrindo o convite…' : 'Opening the invite…')}
          </h1>
          {context ? (
            <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>
              {pt
                ? `${context.ownerName} convidou você para: ${simulationLabel(context.config, true)}`
                : `${context.ownerName} invited you to: ${simulationLabel(context.config, false)}`}
            </p>
          ) : null}
        </header>
      </div>
    </div>
  )
}
