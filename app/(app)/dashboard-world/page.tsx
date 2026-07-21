'use client'

/**
 * Hybrid World Dashboard — HWD-01 static visual prototype (D-047 / D-050).
 * Isolated route: does NOT touch production /dashboard (doc 16 §26, reversible).
 * No map SDK yet (MapLibre is HWD-02). The world is a background plate; the HUD
 * is real React components reading live RiskProvider data. Mock family/route
 * overlays are clearly labeled. Spec: docs/16-hybrid-world-dashboard.md.
 */

import RiskProvider from '@/components/v2/RiskProvider'
import WorldDashboard from '@/components/world-dashboard/WorldDashboard'

export default function DashboardWorldPage() {
  return (
    <RiskProvider>
      <WorldDashboard />
    </RiskProvider>
  )
}
