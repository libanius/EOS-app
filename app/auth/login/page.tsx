'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, signUp } from '@/lib/auth/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'login' | 'signup'

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Handlers ──────────────────────────────────────────────────────────────

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  function handleSubmit() {
    setError(null)

    if (mode === 'login') {
      if (!email || !password) {
        setError('Preencha e-mail e senha.')
        return
      }
      startTransition(async () => {
        const result = await signIn({ email, password })
        if (result?.error) setError(result.error)
      })
    } else {
      if (!name.trim()) { setError('Informe seu nome.'); return }
      if (!email)        { setError('Informe seu e-mail.'); return }
      if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.')
        return
      }
      startTransition(async () => {
        const result = await signUp({ name: name.trim(), email, password })
        if (result?.error) {
          setError(result.error)
        } else {
          router.push(`/auth/verify?email=${encodeURIComponent(email)}`)
        }
      })
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isLogin  = mode === 'login'
  const btnLabel = isPending
    ? isLogin ? 'Entrando…' : 'Criando conta…'
    : isLogin ? 'Entrar'   : 'Criar conta'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={{ ...s.card, opacity: isPending ? 0.7 : 1 }}>

        {/* ── Logo ────────────────────────────────────────────────────── */}
        <div style={s.brand}>
          <span className="dot dot-green dot-pulse" style={s.dot} />
          <span style={s.brandName}>EOS</span>
        </div>

        {/* ── Mode toggle ─────────────────────────────────────────────── */}
        <div style={s.toggleRow}>
          <button
            className={`chip${isLogin ? ' on' : ''}`}
            onClick={() => switchMode('login')}
            disabled={isPending}
          >
            Entrar
          </button>
          <button
            className={`chip${!isLogin ? ' on' : ''}`}
            onClick={() => switchMode('signup')}
            disabled={isPending}
          >
            Criar conta
          </button>
        </div>

        {/* ── Error banner ────────────────────────────────────────────── */}
        {error && (
          <div style={s.errorBox}>
            <span style={s.errorDot}>●</span>
            {error}
          </div>
        )}

        {/* ── Name field (signup only) ─────────────────────────────────── */}
        {!isLogin && (
          <div style={s.fieldGroup}>
            <label style={s.label}>Nome</label>
            <input
              className="input"
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isPending}
              autoComplete="name"
              autoFocus
            />
          </div>
        )}

        {/* ── Email ────────────────────────────────────────────────────── */}
        <div style={s.fieldGroup}>
          <label style={s.label}>E-mail</label>
          <input
            className="input"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isPending}
            autoComplete="email"
            autoFocus={isLogin}
          />
        </div>

        {/* ── Password ─────────────────────────────────────────────────── */}
        <div style={s.fieldGroup}>
          <div style={s.labelRow}>
            <label style={s.label}>Senha</label>
            {isLogin && (
              <Link href="/auth/forgot-password" style={s.linkSmall} tabIndex={isPending ? -1 : 0}>
                Esqueci minha senha
              </Link>
            )}
          </div>
          <input
            className="input"
            type="password"
            placeholder={isLogin ? '••••••••' : 'Mínimo 6 caracteres'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isPending}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {!isLogin && (
            <span style={s.hint}>mín. 6 caracteres</span>
          )}
        </div>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <button
          className="btn bp bfull"
          onClick={handleSubmit}
          disabled={isPending}
          style={{ marginTop: 4 }}
        >
          {btnLabel}
        </button>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <p style={s.footer}>
          Seus dados ficam locais. Sempre.
        </p>

      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
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
    transition: 'opacity 0.2s',
  },

  // brand
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    flexShrink: 0,
  },
  brandName: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: 3,
    color: 'var(--tx)',
  },

  // toggle
  toggleRow: {
    display: 'flex',
    gap: 8,
  },

  // error
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(255,107,107,0.08)',
    border: '1px solid rgba(255,107,107,0.28)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--ac3)',
    lineHeight: 1.4,
  },
  errorDot: {
    fontSize: 8,
    flexShrink: 0,
    color: 'var(--ac3)',
  },

  // fields
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
  hint: {
    fontSize: 11,
    color: 'var(--mu)',
    marginTop: -2,
  },

  // footer
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--mu)',
    letterSpacing: 0.3,
    marginTop: 4,
  },
}
