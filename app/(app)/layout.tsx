import BottomNav from '@/components/BottomNav'
import AppActions from '@/components/AppActions'
import SyncStatus from '@/components/SyncStatus'

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
