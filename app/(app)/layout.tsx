import BottomNav from '@/components/BottomNav'
import AppActions from '@/components/AppActions'
import { LanguageProvider } from '@/lib/i18n'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AppActions />
      {children}
      <BottomNav />
    </LanguageProvider>
  )
}
