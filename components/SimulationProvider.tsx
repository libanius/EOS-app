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
  /** Set when the session was ended by a real alert, so the UI can explain why. */
  abortedByRealAlert: boolean
  start: (config: SimulationConfig) => void
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
      abortedByRealAlert: false,
      start: () => {},
      update: () => {},
      stop: () => {},
      abortForRealAlert: () => {},
      clearAbortNotice: () => {},
    }
  )
}

export default function SimulationProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SimulationConfig | null>(null)
  const [abortedByRealAlert, setAborted] = useState(false)
  const lastTouch = useRef<number>(0)

  const stop = useCallback(() => {
    setConfig(null)
    lastTouch.current = 0
  }, [])

  const start = useCallback((next: SimulationConfig) => {
    setAborted(false)
    lastTouch.current = Date.now()
    setConfig(next)
  }, [])

  const update = useCallback((patch: Partial<SimulationConfig>) => {
    lastTouch.current = Date.now()
    setConfig(current => (current ? { ...current, ...patch } : current))
  }, [])

  const abortForRealAlert = useCallback(() => {
    setConfig(current => {
      if (!current) return current
      setAborted(true)
      return null
    })
  }, [])

  const clearAbortNotice = useCallback(() => setAborted(false), [])

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
      abortedByRealAlert,
      start,
      update,
      stop,
      abortForRealAlert,
      clearAbortNotice,
    }),
    [config, abortedByRealAlert, start, update, stop, abortForRealAlert, clearAbortNotice],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
