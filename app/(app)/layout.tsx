import BottomNav from '@/components/BottomNav'
import AppActions from '@/components/AppActions'
import SyncStatus from '@/components/SyncStatus'
import V2Shell from '@/components/v2/V2Shell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppActions />
      <V2Shell>{children}</V2Shell>
      <SyncStatus />
      <BottomNav />
    </>
  )
}
