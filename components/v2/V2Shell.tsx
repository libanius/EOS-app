'use client'

import type { ReactNode } from 'react'
import RiskProvider from './RiskProvider'
import RiskIslandPro from './RiskIslandPro'
import './v2.css'

/**
 * V2Shell — mounts the app-wide risk state machine and the Global Risk
 * Island above every authenticated screen. The island is sticky and
 * in-flow, so legacy screens are pushed down, never covered.
 */
export default function V2Shell({ children }: { children: ReactNode }) {
  return (
    <RiskProvider>
      <RiskIslandPro />
      {children}
    </RiskProvider>
  )
}
