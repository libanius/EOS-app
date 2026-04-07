'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import NumericStepper from '@/components/NumericStepper'

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [members, setMembers] = useState(2)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleContinue() {
    if (!name.trim()) {
      setError('Informe seu nome.')
      return
    }
    setError(null)

    startTransition(async () => {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          location: location.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erro ao salvar perfil.')
        return
      }

      // Pass member count as hint to family setup
      router.push(`/family?members=${members}`)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = isPending

  return (
    <div style={s.page}>
      <div style={{ ...s.card, opacity: isLoading ? 0.7 : 1, transition: 'opacity 0.2s' }}>

        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <div style={s.brand}>
          <span className="dot dot-green dot-pulse" style={s.dot} />
          <span style={s.brandName}>EOS</span>
        </div>

        {/* ── Headline ──────────────────────────────────────────────────── */}
        <div style={s.headline}>
          <h1 style={s.title}>Configure seu perfil</h1>
          <p style={s.sub}>Seus dados ficam salvos localmente.</p>
        </div>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <div style={s.errorBox}>
            <span style={s.errorDot}>●</span>
            {error}
          </div>
        )}

        {/* ── Divider label ─────────────────────────────────────────────── */}
        <span className="label">Identificação</span>

        {/* ── Name ──────────────────────────────────────────────────────── */}
        <div style={s.fieldGroup}>
          <label style={s.label}>Nome</label>
          <input
            className="input"
            type="text"
            placeholder="Seu nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
            disabled={isLoading}
            autoFocus
            autoComplete="name"
          />
        </div>

        {/* ── Location ──────────────────────────────────────────────────── */}
        <div style={s.fieldGroup}>
          <label style={s.label}>Localização</label>
          <input
            className="input"
            type="text"
            placeholder="Cidade, Estado"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
            disabled={isLoading}
            autoComplete="address-level2"
          />
          <span style={s.hint}>Usada para alertas e rotas de evacuação</span>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <hr />

        {/* ── Members counter ───────────────────────────────────────────── */}
        <span className="label">Família</span>

        <div style={s.membersCard}>
          <div style={s.membersText}>
            <span style={s.membersTitle}>Membros na família</span>
            <span style={s.membersHint}>Incluindo você</span>
          </div>
          <NumericStepper
            value={members}
            step={1}
            min={1}
            max={20}
            decimals={0}
            unit="pessoas"
            disabled={isLoading}
            onChange={setMembers}
          />
        </div>

        {/* ── Submit ────────────────────────────────────────────────────── */}
        <button
          className="btn bp bfull"
          onClick={handleContinue}
          disabled={isLoading}
        >
          {isLoading ? 'Salvando…' : 'Continuar →'}
        </button>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <p style={s.footer}>Seus dados ficam locais. Sempre.</p>

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
    padding: '32px 16px',
    background: 'var(--bg)',
  },

  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--sf)',
    border: '1px solid var(--bd)',
    borderRadius: 20,
    padding: '32px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
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
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 3,
    color: 'var(--tx)',
  },

  // headline
  headline: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: -4,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--tx)',
    lineHeight: 1.2,
  },
  sub: {
    fontSize: 13,
    color: 'var(--mu)',
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
    marginTop: -4,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--tx)',
  },
  hint: {
    fontSize: 11,
    color: 'var(--mu)',
  },

  // members counter
  membersCard: {
    background: 'var(--sf2)',
    border: '1px solid var(--bd)',
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: -4,
  },
  membersText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  membersTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--tx)',
  },
  membersHint: {
    fontSize: 11,
    color: 'var(--mu)',
  },
  counter: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  counterBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid var(--bd)',
    background: 'var(--bg)',
    color: 'var(--tx)',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.15s, border-color 0.15s',
    fontFamily: 'inherit',
    lineHeight: 1,
    padding: 0,
  },
  counterVal: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--ac)',
    minWidth: 40,
    textAlign: 'center' as const,
    lineHeight: 1,
  },

  // footer
  footer: {
    textAlign: 'center' as const,
    fontSize: 12,
    color: 'var(--mu)',
    letterSpacing: 0.3,
    marginTop: 4,
  },
}
