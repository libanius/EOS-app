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

import RiskProvider from '@/components/v2/RiskProvider'
import WorldV2 from '@/components/world-v2/WorldV2'

export default function DashboardWorldV2Page() {
  return (
    <RiskProvider>
      <WorldV2 />
    </RiskProvider>
  )
}
