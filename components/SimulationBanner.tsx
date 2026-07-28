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

import { useSimulation } from './SimulationProvider'
import { useLanguage } from '@/lib/i18n'
import { simulationLabel } from '@/lib/simulation'

export default function SimulationBanner() {
  const { config, active, abortedByRealAlert, stop, clearAbortNotice } = useSimulation()
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

  return (
    <div className="sim-banner" role="status">
      <span className="sim-dot" aria-hidden="true" />
      <span className="sim-text">
        <strong>{pt ? 'SIMULAÇÃO' : 'SIMULATION'}</strong>
        <em>{simulationLabel(config, pt)}</em>
      </span>
      <button type="button" onClick={stop}>
        {pt ? 'Encerrar' : 'End'}
      </button>
    </div>
  )
}
