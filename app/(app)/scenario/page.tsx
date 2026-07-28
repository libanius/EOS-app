'use client'

/**
 * /scenario — the EOS Simulator (D-067 / docs/19-scenario-simulator.md).
 *
 * The previous page was a one-shot analyser in the old visual language. This is
 * the cockpit: you configure the environment and the whole app flies in it.
 * The legacy analyser is preserved at /scenario-legacy.
 */

import SimulatorPage from '@/components/world-v2/SimulatorPage'

export default function ScenarioPage() {
  return <SimulatorPage />
}
