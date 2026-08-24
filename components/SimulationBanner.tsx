'use client'

/**
 * SimulationBanner — the chrome that makes simulation impossible to miss
 * (doc 19 §5.2).
 *
 * This is deliberately loud. A discreet badge is exactly what someone under
 * stress does not see, and the failure mode here — acting on fictional data
 * during a real emergency — is the worst the product has. A flight simulator
 * does not whisper that it is a simulator.
 *
 * It also carries the exit, so leaving is always one tap from any screen.
 */

import { useEffect, useState } from 'react'
import { useSimulation } from './SimulationProvider'
import { useLanguage } from '@/lib/i18n'
import { simulationLabel } from '@/lib/simulation'

/** Segundos restantes do exercício, recalculados de segundo em segundo. */
function useRemaining(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!endsAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [endsAt])
  if (!endsAt) return null
  return Math.max(0, Math.round((endsAt - now) / 1000))
}

export default function SimulationBanner() {
  const { config, active, abortedByRealAlert, stop, update, clearAbortNotice, endsAt, extend } = useSimulation()
  const remaining = useRemaining(endsAt)
  const [open, setOpen] = useState(false)
  const { language } = useLanguage()
  const pt = language === 'pt'

  // A real alert killed the session: say so, because the screen just changed
  // under the user and silence would read as a glitch.
  if (abortedByRealAlert) {
    return (
      <div className="sim-banner aborted" role="alert">
        <span className="sim-dot" aria-hidden="true" />
        <span className="sim-text">
          <strong>{pt ? 'Simulação encerrada' : 'Simulation ended'}</strong>
          <em>{pt ? 'Um alerta real chegou. Isto é a realidade.' : 'A real alert arrived. This is reality.'}</em>
        </span>
        <button type="button" onClick={clearAbortNotice}>
          {pt ? 'Entendi' : 'Got it'}
        </button>
      </div>
    )
  }

  if (!active || !config) return null

  // Advancing time is what separates a simulator from a static scenario: the
  // family gets to feel the situation deteriorate and act again (doc 19 §7).
  const advance = (hours: number) =>
    update({ arrivalHours: Math.max(0, config.arrivalHours - hours) })

  return (
    <div className="sim-banner" role="status">
      <span className="sim-dot" aria-hidden="true" />
      <button type="button" className="sim-text as-button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <strong>{pt ? 'SIMULAÇÃO' : 'SIMULATION'}</strong>
        <em>{simulationLabel(config, pt)}</em>
      </button>
      {/* O tempo restante fica visível o tempo todo: é o que impede o treino de
          virar estado permanente por esquecimento. */}
      {remaining !== null && (
        <span className={`sim-clock${remaining <= 120 ? ' urgent' : ''}`} aria-label={pt ? 'Tempo restante' : 'Time left'}>
          {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
        </span>
      )}
      <button type="button" onClick={stop}>
        {pt ? 'Encerrar' : 'End'}
      </button>

      {open && (
        <div className="sim-controls">
          <span>{pt ? 'Tempo' : 'Time'}</span>
          <button type="button" onClick={() => extend(15)}>+15 min</button>
          <span>{pt ? 'Avançar' : 'Advance'}</span>
          <button type="button" onClick={() => advance(3)}>+3h</button>
          <button type="button" onClick={() => advance(6)}>+6h</button>
          <button type="button" onClick={() => update({ arrivalHours: 0 })}>
            {pt ? 'Impacto' : 'Impact'}
          </button>
          <button
            type="button"
            className={config.powerOut ? 'on' : ''}
            onClick={() => update({ powerOut: !config.powerOut })}
          >
            {pt ? 'Luz' : 'Power'}
          </button>
          <button
            type="button"
            className={config.networkDown ? 'on' : ''}
            onClick={() => update({ networkDown: !config.networkDown })}
          >
            {pt ? 'Rede' : 'Network'}
          </button>
          <button
            type="button"
            className={config.roadsBlocked ? 'on' : ''}
            onClick={() => update({ roadsBlocked: !config.roadsBlocked })}
          >
            {pt ? 'Vias' : 'Roads'}
          </button>
        </div>
      )}
    </div>
  )
}
