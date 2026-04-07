'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { forgotPassword } from '@/lib/auth/actions'
import { Suspense } from 'react'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get('error') === 'link_expired'

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!email.trim()) return
    startTransition(async () => {
      await forgotPassword({ email })
      setSent(true)
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

        {sent ? (
          // ── Success state ──────────────────────────────────────
          <>
            <h1 style={styles.title}>Link enviado</h1>
            <p style={styles.successMsg}>
              Se este e-mail estiver cadastrado, você receberá o link em
              instantes. Verifique também a pasta de spam.
            </p>
            <Link href="/auth/login" style={styles.backLink}>
              ← Voltar ao login
            </Link>
          </>
        ) : (
          // ── Form state ─────────────────────────────────────────
          <>
            <div>
              <h1 style={styles.title}>Recuperar senha</h1>
              <p style={styles.subtitle}>
                Informe seu e-mail e enviaremos um link para criar uma nova
                senha.
              </p>
            </div>

            {/* Link expired alert */}
            {linkExpired && (
              <div style={styles.errorBox}>
                Link expirado ou inválido. Solicite um novo.
              </div>
            )}

            <div style={styles.fieldGroup}>
              <label style={styles.label}>E-mail</label>
              <input
                className="input"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                disabled={isPending}
                autoComplete="email"
              />
            </div>

            <button
              className="btn bp bfull"
              onClick={handleSubmit}
              disabled={isPending || !email.trim()}
            >
              {isPending ? 'Enviando…' : 'Enviar link'}
            </button>

            <p style={styles.footer}>
              Lembrou a senha?{' '}
              <Link href="/auth/login" style={styles.link}>
                Entrar
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
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
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--mu)',
    marginTop: 6,
    lineHeight: 1.5,
  },
  errorBox: {
    background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--ac3)',
  },
  successMsg: {
    fontSize: 14,
    color: 'var(--mu)',
    lineHeight: 1.6,
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
  backLink: {
    fontSize: 13,
    color: 'var(--ac)',
    textDecoration: 'none',
    fontWeight: 600,
  },
}
