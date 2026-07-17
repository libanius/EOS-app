import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={wrap}>
      <style>{css}</style>

      <header style={head}>
        <Link href="/" style={brand}>
          <span style={hex}>⬡</span>
          <span style={brandName}>EOS</span>
        </Link>
        <Link href="/" style={backLink}>← Home</Link>
      </header>

      <article className="legal">{children}</article>

      <footer style={foot}>
        <p style={{ marginBottom: 6 }}>
          <strong style={{ color: 'var(--tx)' }}>BrightScale Group LLC</strong>
        </p>
        <p>5851 Holmberg Rd, Unit 4124, Parkland, FL 33067, USA</p>
        <p>
          <a href="mailto:contact@brightscalegroup.com" style={{ color: 'var(--ac)' }}>
            contact@brightscalegroup.com
          </a>
        </p>
        <nav style={footNav}>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund">Refunds</Link>
        </nav>
      </footer>
    </main>
  )
}

const wrap: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '32px 24px 64px',
  minHeight: '100dvh',
}
const head: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 32,
}
const brand: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  textDecoration: 'none',
}
const hex: React.CSSProperties = { fontSize: 22, color: 'var(--ac)', lineHeight: 1 }
const brandName: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--tx)',
  letterSpacing: '0.05em',
}
const backLink: React.CSSProperties = { fontSize: 13, color: 'var(--mu)', textDecoration: 'none' }
const foot: React.CSSProperties = {
  marginTop: 48,
  paddingTop: 24,
  borderTop: '1px solid var(--bd)',
  fontSize: 12,
  color: 'var(--mu)',
  lineHeight: 1.7,
}
const footNav: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  marginTop: 12,
}

const css = `
.legal { color: var(--tx); font-size: 15px; line-height: 1.7; }
.legal h1 { font-size: 26px; font-weight: 700; margin-bottom: 8px; }
.legal h2 { font-size: 18px; font-weight: 700; margin: 28px 0 10px; color: var(--tx); }
.legal p { color: var(--mu); margin-bottom: 12px; }
.legal ul { margin: 0 0 12px 20px; color: var(--mu); }
.legal li { margin-bottom: 6px; }
.legal strong { color: var(--tx); }
.legal a { color: var(--ac); }
.legal .updated { font-size: 13px; color: var(--mu); margin-bottom: 24px; }
.legal .note { font-size: 13px; border-left: 2px solid var(--ac); padding-left: 12px; }
footer nav a { color: var(--mu); text-decoration: none; font-size: 12px; }
footer nav a:hover { color: var(--ac); }
`
