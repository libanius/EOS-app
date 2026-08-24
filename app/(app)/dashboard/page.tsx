'use client'

/**
 * /dashboard — the app's front door.
 *
 * Built on the World v2 design system (components/world-v2): the black HWD map
 * with an Apple-grade surface over it, and the Pilot copilot always one tap
 * away. Logged-in users land here from `/` (app/page.tsx).
 *
 * The previous dashboard is preserved at /dashboard-legacy, and the HWD v1
 * prototype at /dashboard-world — this promotion is reversible by swapping the
 * redirect back and renaming the two folders.
 */

import WorldV2 from '@/components/world-v2/WorldV2'

/**
 * O `RiskProvider` saiu daqui e subiu para o layout autenticado (D-079): o risco
 * virou estado do app, e é o que permite o Pilot existir em qualquer tela.
 * Mantê-lo aqui também aninharia dois provedores, com dois conjuntos de polling.
 */
export default function DashboardWorldV2Page() {
  return <WorldV2 />
}
