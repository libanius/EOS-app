import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/scenario')

  return (
    <main style={s.page}>
      {/* Brand */}
      <div style={s.brand}>
        <span style={s.hex}>⬡</span>
        <span style={s.brandName}>EOS</span>
      </div>

      {/* Headline */}
      <div style={s.hero}>
        <h1 style={s.headline}>
          Nos primeiros 15 minutos<br />
          de uma crise,<br />
          <span style={s.accent}>cada decisão importa.</span>
        </h1>
        <p style={s.sub}>
          EOS analisa sua situação familiar, seus recursos e o cenário de emergência
          — e entrega um plano de ação claro, mesmo sem internet.
        </p>
      </div>

      {/* Feature list */}
      <ul style={s.features}>
        <li style={s.feature}>
          <span style={s.featureDot} />
          Plano de ação com IA adaptado à sua família
        </li>
        <li style={s.feature}>
          <span style={s.featureDot} />
          Funciona offline — modo sobrevivência sem rede
        </li>
        <li style={s.feature}>
          <span style={s.featureDot} />
          Base de conhecimento: FEMA, Cruz Vermelha, OMS, SAS
        </li>
        <li style={s.feature}>
          <span style={s.featureDot} />
          Círculos familiares para coordenar em grupo
        </li>
      </ul>

      {/* CTAs */}
      <div style={s.ctas}>
        <Link href="/auth/signup" className="btn bp bfull" style={s.ctaPrimary}>
          Criar conta gratuita
        </Link>
        <Link href="/auth/login" className="btn bs bfull" style={s.ctaSecondary}>
          Já tenho conta — Entrar
        </Link>
      </div>

      {/* Footer note */}
      <p style={s.footnote}>
        Seus dados ficam protegidos e não são compartilhados.
      </p>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px 48px',
    maxWidth: 420,
    margin: '0 auto',
    gap: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 40,
  },
  hex: {
    fontSize: 28,
    color: 'var(--ac)',
    lineHeight: 1,
  },
  brandName: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--tx)',
    letterSpacing: '0.05em',
  },
  hero: {
    width: '100%',
    marginBottom: 32,
  },
  headline: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.25,
    color: 'var(--tx)',
    marginBottom: 16,
  },
  accent: {
    color: 'var(--ac)',
  },
  sub: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--mu)',
  },
  features: {
    width: '100%',
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 36,
  },
  feature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 14,
    color: 'var(--tx)',
    lineHeight: 1.4,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--ac)',
    flexShrink: 0,
    marginTop: 5,
  },
  ctas: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 20,
  },
  ctaPrimary: {
    fontSize: 15,
    padding: '15px 18px',
  },
  ctaSecondary: {
    fontSize: 15,
    padding: '15px 18px',
  },
  footnote: {
    fontSize: 12,
    color: 'var(--mu)',
    textAlign: 'center',
  },
}
