'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signUp } from '@/lib/auth/actions'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSignUp() {
    // Client-side validation (RN-05)
    if (!name.trim()) { setError('Informe seu nome.'); return }
    if (!email.trim()) { setError('Informe seu e-mail.'); return }
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return }

    setError(null)
    startTransition(async () => {
      const result = await signUp({ name: name.trim(), email, password })
      if (result.error) {
        setError(result.error)
      } else {
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`)
      }
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

        <h1 style={styles.title}>Criar sua conta</h1>

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Fields */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Nome</label>
          <input
            className="input"
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            autoComplete="name"
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>E-mail</label>
          <input
            className="input"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            autoComplete="email"
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Senha</label>
          <input
            className="input"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
            disabled={isPending}
            autoComplete="new-password"
          />
          <span style={styles.hint}>mín. 6 caracteres</span>
        </div>

        {/* Submit */}
        <button
          className="btn bp bfull"
          style={{ marginTop: 4 }}
          onClick={handleSignUp}
          disabled={isPending}
        >
          {isPending ? 'Criando conta…' : 'Criar conta'}
        </button>

        {/* Footer */}
        <p style={styles.footer}>
          Já tem conta?{' '}
          <Link href="/auth/login" style={styles.link}>
            Entrar
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
  hint: {
    fontSize: 11,
    color: 'var(--mu)',
    marginTop: -2,
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
