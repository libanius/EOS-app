'use client'

/**
 * SimulationInvite — the pop-up that asks whether you want to join the family's
 * drill (D-071 / SIM-T07).
 *
 * Centre of the screen, blocking, two clear answers. It is deliberately NOT a
 * banner: entering a simulation changes every number the person will see for the
 * next hour, so it deserves a decision, not a dismissible notice.
 *
 * The pop-up is also what guarantees the rule the API enforces: nobody is ever
 * placed in a scenario they did not accept.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { useSimulation } from './SimulationProvider'
import { simulationLabel, type SimulationConfig } from '@/lib/simulation'

/** How often we ask whether a drill concerns us. Push is best-effort. */
const POLL_MS = 20_000

type Session = {
  id: string
  config: SimulationConfig
  ownerName: string
  isOwner: boolean
  myStatus: 'invited' | 'joined' | 'declined'
}

export default function SimulationInvite() {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const reduceMotion = useReducedMotion()
  const { start, stop, active, setSharedSession } = useSimulation()
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const response = await fetch('/api/simulation').catch(() => null)
      if (!response?.ok || cancelled) return
      const data = (await response.json().catch(() => null)) as { session?: Session | null } | null
      if (cancelled) return
      setSession(data?.session ?? null)

      // The drill ended somewhere else (owner, or a real alert): leave it here
      // too. Nobody keeps flying a scenario the family already left.
      if (!data?.session && active) {
        setSharedSession(null)
        stop()
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [active, stop, setSharedSession])

  // Already accepted elsewhere (another device): mirror it without asking again.
  useEffect(() => {
    if (session?.myStatus === 'joined' && !active) {
      setSharedSession(session.id)
      start(session.config)
    }
  }, [session, active, start, setSharedSession])

  const answer = async (action: 'join' | 'decline') => {
    if (!session) return
    setBusy(true)
    await fetch(`/api/simulation/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => {})
    if (action === 'join') {
      setSharedSession(session.id)
      start(session.config)
    }
    setSession(null)
    setBusy(false)
  }

  const open = Boolean(session && session.myStatus === 'invited' && !session.isOwner)

  return (
    <AnimatePresence>
      {open && session && (
        <motion.div
          className="sim-invite-scrim"
          role="dialog"
          aria-modal="true"
          aria-label={pt ? 'Convite para simulação' : 'Simulation invite'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="sim-invite"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 12 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', bounce: 0.22, duration: 0.4 }}
          >
            <span className="tag">{pt ? 'Treino da família' : 'Family drill'}</span>
            <h2>
              {pt
                ? `${session.ownerName} iniciou uma simulação`
                : `${session.ownerName} started a simulation`}
            </h2>
            <p className="scenario">{simulationLabel(session.config, pt)}</p>
            <p className="note">
              {pt
                ? 'Se você entrar, o EOS inteiro passa a se comportar como se fosse verdade — no seu aparelho também. Nada é gravado nos seus dados reais.'
                : 'If you join, the whole of EOS starts behaving as if it were true — on your phone too. Nothing is written to your real data.'}
            </p>
            <div className="actions">
              <button type="button" className="primary" disabled={busy} onClick={() => answer('join')}>
                {pt ? 'Participar' : 'Join'}
              </button>
              <button type="button" disabled={busy} onClick={() => answer('decline')}>
                {pt ? 'Agora não' : 'Not now'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
