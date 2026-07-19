import BottomNav from '@/components/BottomNav'
import AppActions from '@/components/AppActions'
import SyncStatus from '@/components/SyncStatus'

// NOTE: V2Shell (components/v2 — the "Prévia Viva" risk state machine) is WIP and
// NOT on the roadmap yet (see D-045 / P3-T07). It was shipped to production
// prematurely and could interfere with the authenticated flow (upgrade/settings).
// Unmounted here to restore the known-good layout while we prioritize Stripe.
// The v2/ files stay in the repo for when P3-T07 is picked up.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppActions />
      {children}
      <SyncStatus />
      <BottomNav />
    </>
  )
}
