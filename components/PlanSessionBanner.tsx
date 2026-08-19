'use client'

import { useEffect, useMemo, useState } from 'react'
import { remainingPlanSessionSeconds, shouldAskBeforeDisarmingExpiredSession } from '@/lib/plan-session'
import { useLanguage } from '@/lib/i18n'
import { usePlanSession } from './PlanSessionProvider'

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function formatRemaining(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export default function PlanSessionBanner() {
  const { session, active, disarm, addDayPoint } = usePlanSession()
  const { language } = useLanguage()
  const pt = language === 'pt'
  const [open, setOpen] = useState(false)
  const [dismissedExpiredSessionId, setDismissedExpiredSessionId] = useState<string | null>(null)
  const [pointName, setPointName] = useState(pt ? 'Ponto do dia' : 'Day point')
  const [message, setMessage] = useState<string | null>(null)
  const now = useNow(active)

  const expired = useMemo(
    () => Boolean(session && shouldAskBeforeDisarmingExpiredSession(session, now)),
    [now, session],
  )

  if (!active || !session) return null

  const remaining = remainingPlanSessionSeconds(session, now)
  const showExpiredPrompt = expired && dismissedExpiredSessionId !== session.id

  const markHere = () => {
    setMessage(null)
    if (!navigator.geolocation) {
      setMessage(pt ? 'GPS indisponível neste aparelho.' : 'GPS unavailable on this device.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        void addDayPoint({
          name: pointName.trim() || (pt ? 'Ponto do dia' : 'Day point'),
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }).then(result => {
          setMessage(result.message ?? (pt ? 'Ponto marcado.' : 'Point marked.'))
        })
      },
      () => setMessage(pt ? 'Não consegui ler sua posição.' : 'Could not read your location.'),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    )
  }

  return (
    <div className={`sim-banner plan-session-banner${showExpiredPrompt ? ' expired' : ''}`} role={showExpiredPrompt ? 'alert' : 'status'}>
      <span className="sim-dot" aria-hidden="true" />
      <button type="button" className="sim-text as-button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <strong>{pt ? 'SESSÃO ARMADA' : 'ARMED SESSION'}</strong>
        <em>{session.planName ?? session.name} · {session.members.length} {pt ? 'adultos' : 'adults'}</em>
      </button>
      <span className={`sim-clock${showExpiredPrompt ? ' urgent' : ''}`}>
        {showExpiredPrompt ? (pt ? 'expirou' : 'expired') : formatRemaining(remaining)}
      </span>
      <button type="button" onClick={() => { void disarm('manual') }}>
        {pt ? 'Desarmar' : 'Disarm'}
      </button>

      {showExpiredPrompt && (
        <div className="sim-controls plan-session-expiry">
          <span>{pt ? 'Janela encerrada' : 'Window ended'}</span>
          <button type="button" onClick={() => { void disarm('expired') }}>
            {pt ? 'Encerrar' : 'End'}
          </button>
          <button type="button" onClick={() => setDismissedExpiredSessionId(session.id)}>
            {pt ? 'Agora não' : 'Not now'}
          </button>
        </div>
      )}

      {open && !showExpiredPrompt && (
        <div className="sim-controls plan-session-controls">
          <span>{pt ? 'Pontos do dia' : 'Day points'}</span>
          <input
            value={pointName}
            onChange={event => setPointName(event.target.value)}
            aria-label={pt ? 'Nome do ponto do dia' : 'Day point name'}
          />
          <button type="button" onClick={markHere}>
            {pt ? 'Marcar onde estou' : 'Mark here'}
          </button>
          {session.places.length > 0 && <span>{session.places.length}</span>}
          {message && <span className="plan-session-msg">{message}</span>}
        </div>
      )}
    </div>
  )
}
