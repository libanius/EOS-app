import BottomNav from '@/components/BottomNav'
import AppActions from '@/components/AppActions'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppActions />
      {children}
      <BottomNav />
    </>
  )
}
