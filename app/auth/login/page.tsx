'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { signIn } from '@/lib/auth/actions'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSignIn() {
    if (!email || !password) {
      setError('Preencha e-mail e senha.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await signIn({ email, password })
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Brand */}
        <div style={styles.brand}>
          <span style={styles.brandMark}>⬡</span>
          <span style={styles.brandName}>EOS</span>
        </div>

        <h1 style={styles.title}>Bem-vindo de volta</h1>

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Fields */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>E-mail</label>
          <input
            className="input"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            disabled={isPending}
            autoComplete="email"
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Senha</label>
            <Link href="/auth/forgot-password" style={styles.linkSmall}>
              Esqueci minha senha
            </Link>
          </div>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            disabled={isPending}
            autoComplete="current-password"
          />
        </div>

        {/* Submit */}
        <button
          className="btn bp bfull"
          style={{ marginTop: 8 }}
          onClick={handleSignIn}
          disabled={isPending}
        >
          {isPending ? 'Entrando…' : 'Entrar'}
        </button>

        {/* Footer */}
        <p style={styles.footer}>
          Não tem conta?{' '}
          <Link href="/auth/signup" style={styles.link}>
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    background: 'var(--bg)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--sf)',
    border: '1px solid var(--bd)',
    borderRadius: 20,
    padding: '32px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  brandMark: {
    fontSize: 28,
    color: 'var(--ac)',
    lineHeight: 1,
  },
  brandName: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--tx)',
    letterSpacing: 2,
    fontFamily: 'DM Mono, monospace',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--tx)',
    marginTop: -8,
  },
  errorBox: {
    background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--ac3)',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--tx)',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkSmall: {
    fontSize: 12,
    color: 'var(--ac)',
    textDecoration: 'none',
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--mu)',
    marginTop: -4,
  },
  link: {
    color: 'var(--ac)',
    textDecoration: 'none',
    fontWeight: 600,
  },
}
