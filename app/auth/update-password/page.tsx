'use client'

import { useState, useTransition } from 'react'
import { updatePassword } from '@/lib/auth/actions'

export default function UpdatePasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    // Client-side validation
    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await updatePassword({ newPassword })
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

        <h1 style={styles.title}>Criar nova senha</h1>

        {/* Error */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Fields */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Nova senha</label>
          <input
            className="input"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isPending}
            autoComplete="new-password"
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Confirmar nova senha</label>
          <input
            className="input"
            type="password"
            placeholder="Repita a senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            disabled={isPending}
            autoComplete="new-password"
          />
        </div>

        {/* Submit */}
        <button
          className="btn bp bfull"
          style={{ marginTop: 4 }}
          onClick={handleSubmit}
          disabled={isPending}
        >
          {isPending ? 'Salvando…' : 'Salvar nova senha'}
        </button>
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
}
