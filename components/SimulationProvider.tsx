'use client'

/**
 * SimulationProvider — global simulation state (D-067 / doc 19 §3, §5).
 *
 * Mounted in the (app) layout so every screen sits inside it. RiskProvider reads
 * it and serves a synthetic snapshot when a simulation is running, which is what
 * makes the WHOLE app respond to the scenario instead of just one page.
 *
 * Safety rules encoded here — do not relax any of them:
 *
 *   NEVER PERSISTED. State lives in memory only, so a reload always returns to
 *   reality. A simulation must never be a mode you inherit without knowing.
 *
 *   AUTO-EXPIRES. Idle sessions end on their own; nobody should be able to walk
 *   away and come back to a fictional emergency.
 *
 *   REAL CRITICAL ALERTS ABORT IT. `abortForRealAlert` is called by RiskProvider
 *   the moment a genuine CRITICAL alert lands. A real threat never competes for
 *   attention with a fictional one.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SimulationConfig } from '@/lib/simulation'

/** A session left alone this long is over. */
const IDLE_TIMEOUT_MS = 45 * 60 * 1000

type SimulationCtx = {
  config: SimulationConfig | null
  active: boolean
  /** Set when this drill is shared with a circle (D-071), so ending propagates. */
  sharedSessionId: string | null
  setSharedSession: (id: string | null) => void
  /** Set when the session was ended by a real alert, so the UI can explain why. */
  abortedByRealAlert: boolean
  /** The config of a drill that just ENDED deliberately — drives the debrief. */
  debriefFor: SimulationConfig | null
  clearDebrief: () => void
  start: (config: SimulationConfig) => void
  /** Quando o exercício termina sozinho. Null quando não há simulação. */
  endsAt: number | null
  extend: (minutes: number) => void
  update: (patch: Partial<SimulationConfig>) => void
  stop: () => void
  abortForRealAlert: () => void
  clearAbortNotice: () => void
}

const Ctx = createContext<SimulationCtx | null>(null)

/** Safe to call outside the provider — returns an inert simulation. */
export function useSimulation(): SimulationCtx {
  return (
    useContext(Ctx) ?? {
      config: null,
      active: false,
      sharedSessionId: null,
      setSharedSession: () => {},
      abortedByRealAlert: false,
      debriefFor: null,
      clearDebrief: () => {},
      start: () => {},
      endsAt: null,
      extend: () => {},
      update: () => {},
      stop: () => {},
      abortForRealAlert: () => {},
      clearAbortNotice: () => {},
    }
  )
}

export default function SimulationProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SimulationConfig | null>(null)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [abortedByRealAlert, setAborted] = useState(false)
  const [sharedSessionId, setSharedSessionId] = useState<string | null>(null)
  const [debriefFor, setDebriefFor] = useState<SimulationConfig | null>(null)
  const lastTouch = useRef<number>(0)

  // Ending a SHARED drill ends it for the whole circle (D-071). A family split
  // between reality and fiction is the failure this feature must not create.
  const endShared = useCallback((reason: 'owner' | 'real_alert') => {
    setSharedSessionId(current => {
      if (current) {
        void fetch(`/api/simulation/${current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', reason }),
        }).catch(() => {})
      }
      return null
    })
  }, [])

  const stop = useCallback(() => {
    setEndsAt(null)
    endShared('owner')
    // A deliberate end earns a debrief; the value of a simulator is what you
    // learn afterwards, not the run itself (doc 19 §8).
    setConfig(current => {
      if (current) setDebriefFor(current)
      return null
    })
    lastTouch.current = 0
  }, [endShared])

  const start = useCallback((next: SimulationConfig) => {
    setAborted(false)
    lastTouch.current = Date.now()
    // O fim é decidido no início. Sem isso, "esqueci ligado" é o estado mais
    // provável — e um app inteiro respondendo a um evento que não existe.
    setEndsAt(Date.now() + Math.max(1, next.durationMin ?? 30) * 60_000)
    setConfig(next)
  }, [])

  /** Estica o exercício sem precisar recomeçar. */
  const extend = useCallback((minutes: number) => {
    lastTouch.current = Date.now()
    setEndsAt(current => (current ? current + minutes * 60_000 : current))
  }, [])

  const update = useCallback((patch: Partial<SimulationConfig>) => {
    lastTouch.current = Date.now()
    setConfig(current => (current ? { ...current, ...patch } : current))
  }, [])

  const abortForRealAlert = useCallback(() => {
    setConfig(current => {
      if (!current) return current
      setAborted(true)
      endShared('real_alert')
      // NO debrief here. A genuine threat owns the screen; a training report is
      // exactly the wrong thing to show at that moment.
      return null
    })
  }, [endShared])

  const clearAbortNotice = useCallback(() => setAborted(false), [])

  /**
   * Fim por tempo combinado.
   *
   * Encerra pelo mesmo caminho do botão, então o debrief acontece igual: o valor
   * do simulador está no que se aprende depois, e um treino que termina sozinho
   * sem relatório desperdiça o exercício inteiro.
   */
  useEffect(() => {
    if (!config || !endsAt) return
    const timer = setInterval(() => {
      if (Date.now() >= endsAt) stop()
    }, 5_000)
    return () => clearInterval(timer)
  }, [config, endsAt, stop])

  // Idle expiry. Interaction anywhere counts as being at the controls.
  useEffect(() => {
    if (!config) return
    const touch = () => { lastTouch.current = Date.now() }
    window.addEventListener('pointerdown', touch, { passive: true })
    window.addEventListener('keydown', touch)

    const timer = setInterval(() => {
      if (Date.now() - lastTouch.current > IDLE_TIMEOUT_MS) stop()
    }, 60_000)

    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
      clearInterval(timer)
    }
  }, [config, stop])

  const value = useMemo<SimulationCtx>(
    () => ({
      config,
      active: config !== null,
      sharedSessionId,
      setSharedSession: setSharedSessionId,
      abortedByRealAlert,
      debriefFor,
      clearDebrief: () => setDebriefFor(null),
      start,
      endsAt,
      extend,
      update,
      stop,
      abortForRealAlert,
      clearAbortNotice,
    }),
    [config, sharedSessionId, abortedByRealAlert, debriefFor, start, update, stop, abortForRealAlert, clearAbortNotice, endsAt, extend],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
