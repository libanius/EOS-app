import BottomNav from '@/components/BottomNav'
import AppActions from '@/components/AppActions'
import SyncStatus from '@/components/SyncStatus'
import FichaFirstRun from '@/components/FichaFirstRun'
import LocationReporter from '@/components/LocationReporter'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import RiskProvider from '@/components/v2/RiskProvider'
import PilotDock from '@/components/world-v2/PilotDock'
import SimulationProvider from '@/components/SimulationProvider'
import SimulationBanner from '@/components/SimulationBanner'
import SimulationInvite from '@/components/SimulationInvite'
import SimulationDebrief from '@/components/SimulationDebrief'

// NOTE: V2Shell (components/v2 — the "Prévia Viva" risk state machine) is WIP and
// NOT on the roadmap yet (see D-045 / P3-T07). It was shipped to production
// prematurely and could interfere with the authenticated flow (upgrade/settings).
// Unmounted here to restore the known-good layout while we prioritize Stripe.
// The v2/ files stay in the repo for when P3-T07 is picked up.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SimulationProvider>
      {/*
        D-079: o risco passa a ser estado do APP, não da tela do dashboard — é o
        que permite o Pilot existir em qualquer página. Uma instância só,
        montada aqui, também evita o refetch a cada navegação.
      */}
      <RiskProvider>
      <SimulationBanner />
      {/* D-071: a família é convidada, nunca colocada no treino sem aceitar. */}
      <SimulationInvite />
      {/* SIM-T05: o que o treino ensinou, em números. */}
      <SimulationDebrief />
      {/* D-075: sem isto o service worker só existia para quem abria /settings. */}
      <ServiceWorkerRegistrar />
      <FichaFirstRun />
      {/* D-064: silent unless the user consented AND already granted GPS. */}
      <LocationReporter />
      <AppActions />
      {children}
      <SyncStatus />
      <BottomNav />
      {/* Alcançável de qualquer tela; some no dashboard, que tem a PilotBar. */}
      <PilotDock />
      </RiskProvider>
    </SimulationProvider>
  )
}
