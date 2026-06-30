'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signUp } from '@/lib/auth/actions'
import { useLanguage } from '@/lib/i18n'

export default function SignUpPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSignUp() {
    // Client-side validation (RN-05)
    if (!name.trim()) { setError(t('auth.nameRequired')); return }
    if (!email.trim()) { setError(t('auth.emailRequired')); return }
    if (password.length < 6) { setError(t('auth.passwordLength')); return }

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

        <h1 style={styles.title}>{t('auth.signupTitle')}</h1>

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Fields */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>{t('auth.name')}</label>
          <input
            className="input"
            type="text"
            placeholder={t('auth.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
            autoComplete="name"
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>{t('auth.email')}</label>
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
          <label style={styles.label}>{t('auth.password')}</label>
          <input
            className="input"
            type="password"
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
            disabled={isPending}
            autoComplete="new-password"
          />
          <span style={styles.hint}>{t('auth.passwordHint')}</span>
        </div>

        {/* Submit */}
        <button
          className="btn bp bfull"
          style={{ marginTop: 4 }}
          onClick={handleSignUp}
          disabled={isPending}
        >
          {isPending ? t('auth.creating') : t('auth.signup')}
        </button>

        {/* Footer */}
        <p style={styles.footer}>
          {t('auth.hasAccount')}{' '}
          <Link href="/auth/login" style={styles.link}>
            {t('auth.login')}
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
