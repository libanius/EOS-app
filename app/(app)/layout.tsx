import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Botão de acesso rápido à Ficha Pessoal — canto superior direito */}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 200,
      }}>
        <Link
          href="/ficha"
          aria-label="Minha Ficha de Emergência"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(14,14,14,0.85)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#727272',
            textDecoration: 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </Link>
      </div>
      {children}
      <BottomNav />
    </>
  )
}
