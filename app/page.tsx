import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export default async function Home() {
  const supabase = await createClient()
  const language = (await cookies()).get('eos-language')?.value === 'en' ? 'en' : 'pt'
  const copy = language === 'pt' ? {
    line1: 'Nos primeiros 15 minutos', line2: 'de uma crise,', accent: 'cada decisão importa.',
    sub: 'EOS analisa sua família, seus recursos e o cenário de emergência — e entrega um plano de ação claro, mesmo sem internet.',
    features: ['Plano de ação com IA adaptado à sua família', 'Funciona offline — modo sobrevivência sem rede', 'Base de conhecimento: FEMA, Cruz Vermelha, OMS e SAS', 'Círculos familiares para coordenação em grupo'],
    signup: 'Criar conta gratuita', login: 'Já tenho conta — Entrar',
    footnote: 'Seus dados ficam protegidos e não são compartilhados.',
    pricingTitle: 'Planos', perMonth: '/mês', cancelAnytime: 'Cobrança mensal em USD. Cancele quando quiser.',
    plans: [
      { name: 'Grátis', price: '$0', items: ['Análise de IA básica', 'Clima severo (NWS) e terremotos (USGS)', 'Checklist de preparação'] },
      { name: 'Família', price: '$9.90', highlight: true, items: ['Tudo do Grátis, mais:', 'Qualidade do ar, focos de incêndio e FEMA', 'Círculos familiares + QR de emergência', 'Monitoramento multi-localização'] },
      { name: 'Premium', price: '$19.90', items: ['Tudo do Família, mais:', 'Vigilância CDC/FDA', 'Alertas push críticos + histórico 30 dias', 'Múltiplos círculos + exportar ficha PDF'] },
    ],
    footLegal: 'Termos', footPrivacy: 'Privacidade', footRefund: 'Reembolso',
  } : {
    line1: 'In the first 15 minutes', line2: 'of a crisis,', accent: 'every decision matters.',
    sub: 'EOS analyzes your family, resources, and emergency scenario — then delivers a clear action plan, even without internet.',
    features: ['AI action plans adapted to your family', 'Works offline with network-free survival mode', 'Knowledge base: FEMA, Red Cross, WHO, and SAS', 'Family circles for group coordination'],
    signup: 'Create free account', login: 'Already have an account — Sign in',
    footnote: 'Your data stays protected and is not shared.',
    pricingTitle: 'Plans', perMonth: '/mo', cancelAnytime: 'Billed monthly in USD. Cancel anytime.',
    plans: [
      { name: 'Free', price: '$0', items: ['Core AI analysis', 'Severe weather (NWS) and earthquakes (USGS)', 'Preparedness checklist'] },
      { name: 'Family', price: '$9.90', highlight: true, items: ['Everything in Free, plus:', 'Air quality, fire detection, and FEMA', 'Family circles + emergency QR', 'Multi-location monitoring'] },
      { name: 'Premium', price: '$19.90', items: ['Everything in Family, plus:', 'CDC/FDA surveillance', 'Critical push alerts + 30-day history', 'Multiple circles + PDF ficha export'] },
    ],
    footLegal: 'Terms', footPrivacy: 'Privacy', footRefund: 'Refunds',
  }
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
          {copy.line1}<br />
          {copy.line2}<br />
          <span style={s.accent}>{copy.accent}</span>
        </h1>
        <p style={s.sub}>
          {copy.sub}
        </p>
      </div>

      {/* Feature list */}
      <ul style={s.features}>
        {copy.features.map((feature) => (
          <li key={feature} style={s.feature}>
            <span style={s.featureDot} />
            {feature}
          </li>
        ))}
      </ul>

      {/* CTAs */}
      <div style={s.ctas}>
        <Link href="/auth/signup" className="btn bp bfull" style={s.ctaPrimary}>
          {copy.signup}
        </Link>
        <Link href="/auth/login" className="btn bs bfull" style={s.ctaSecondary}>
          {copy.login}
        </Link>
      </div>

      <p style={s.footnote}>
        {copy.footnote}
      </p>

      {/* Pricing */}
      <section style={s.pricing} id="pricing">
        <h2 style={s.pricingTitle}>{copy.pricingTitle}</h2>
        <div style={s.plans}>
          {copy.plans.map((plan) => (
            <div key={plan.name} style={{ ...s.plan, ...(plan.highlight ? s.planHi : null) }}>
              <div style={s.planHead}>
                <span style={s.planName}>{plan.name}</span>
                <span style={s.planPrice}>
                  {plan.price}
                  {plan.price !== '$0' && <span style={s.per}>{copy.perMonth}</span>}
                </span>
              </div>
              <ul style={s.planItems}>
                {plan.items.map((it) => (
                  <li key={it} style={s.planItem}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={s.cancel}>{copy.cancelAnytime}</p>
      </section>

      {/* Footer — legal identity for payment-processor review */}
      <footer style={s.foot}>
        <nav style={s.footNav}>
          <Link href="/terms" style={s.footLink}>{copy.footLegal}</Link>
          <Link href="/privacy" style={s.footLink}>{copy.footPrivacy}</Link>
          <Link href="/refund" style={s.footLink}>{copy.footRefund}</Link>
        </nav>
        <p style={s.footCo}>BrightScale Group LLC</p>
        <p style={s.footMeta}>5851 Holmberg Rd, Unit 4124, Parkland, FL 33067, USA</p>
        <p style={s.footMeta}>
          <a href="mailto:contact@brightscalegroup.com" style={{ color: 'var(--mu)' }}>
            contact@brightscalegroup.com
          </a>
        </p>
        <p style={s.footMeta}>© 2026 BrightScale Group LLC. All rights reserved.</p>
      </footer>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '40px 24px 48px',
    maxWidth: 460,
    margin: '0 auto',
    gap: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 40,
    marginTop: 24,
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
    marginBottom: 48,
  },
  // ── Pricing ──
  pricing: {
    width: '100%',
    marginBottom: 40,
  },
  pricingTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--tx)',
    textAlign: 'center',
    marginBottom: 20,
  },
  plans: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  plan: {
    border: '1px solid var(--bd)',
    borderRadius: 12,
    padding: '18px 16px',
  },
  planHi: {
    borderColor: 'var(--ac)',
  },
  planHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  planName: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--tx)',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--ac)',
  },
  per: {
    fontSize: 12,
    fontWeight: 400,
    color: 'var(--mu)',
    marginLeft: 2,
  },
  planItems: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  planItem: {
    fontSize: 13,
    color: 'var(--mu)',
    lineHeight: 1.4,
    paddingLeft: 14,
    position: 'relative',
  },
  cancel: {
    fontSize: 12,
    color: 'var(--mu)',
    textAlign: 'center',
    marginTop: 16,
  },
  // ── Footer ──
  foot: {
    width: '100%',
    borderTop: '1px solid var(--bd)',
    paddingTop: 24,
    textAlign: 'center',
  },
  footNav: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  footLink: {
    fontSize: 13,
    color: 'var(--mu)',
    textDecoration: 'none',
  },
  footCo: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--tx)',
    marginBottom: 4,
  },
  footMeta: {
    fontSize: 12,
    color: 'var(--mu)',
    lineHeight: 1.6,
  },
}
