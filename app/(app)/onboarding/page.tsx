'use client'

import { Suspense, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import NumericStepper from '@/components/NumericStepper'
import { useLanguage } from '@/lib/i18n'
import { simulationLabel, type SimulationConfig } from '@/lib/simulation'

const INVITE_KEY = 'eos-onboarding-sim-invite'

type InviteContext = {
  token: string
  ownerName: string
  config: SimulationConfig
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div style={s.page}><div style={s.card} /></div>}>
      <OnboardingContent />
    </Suspense>
  )
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language, t } = useLanguage()
  const pt = language === 'pt'

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [members, setMembers] = useState(2)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [invite, setInvite] = useState<InviteContext | null>(null)

  const redirectTo = searchParams.get('redirectTo')?.startsWith('/') ? searchParams.get('redirectTo')! : null
  const inviteToken = useMemo(() => {
    const match = redirectTo?.match(/^\/sim\/([^/?#]+)/)
    return match?.[1] ?? null
  }, [redirectTo])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem(INVITE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as InviteContext
        if (parsed?.token && parsed?.config) setInvite(parsed)
      } catch {
        localStorage.removeItem(INVITE_KEY)
      }
    }
    if (!inviteToken) return
    fetch(`/api/simulation/join/${inviteToken}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { session?: { config: SimulationConfig; ownerName: string } } | null) => {
        if (!data?.session) return
        const next = { token: inviteToken, ownerName: data.session.ownerName, config: data.session.config }
        setInvite(next)
        localStorage.setItem(INVITE_KEY, JSON.stringify(next))
      })
      .catch(() => {})
  }, [inviteToken])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleContinue() {
    if (!name.trim()) {
      setError(t('onboarding.nameRequired'))
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
        setError(data.error ?? t('onboarding.saveError'))
        return
      }

      if (invite?.token) {
        router.push(`/sim/${invite.token}`)
        return
      }
      if (redirectTo?.startsWith('/sim/')) {
        router.push(redirectTo)
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
          <h1 style={s.title}>{t('onboarding.title')}</h1>
          <p style={s.sub}>{t('onboarding.subtitle')}</p>
        </div>

        {invite && (
          <div style={s.contextBox}>
            <span style={s.contextLabel}>{pt ? 'Convite de simulação' : 'Simulation invite'}</span>
            <strong style={s.contextTitle}>
              {pt ? `${invite.ownerName} convidou você` : `${invite.ownerName} invited you`}
            </strong>
            <span style={s.contextText}>{simulationLabel(invite.config, pt)}</span>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <div style={s.errorBox}>
            <span style={s.errorDot}>●</span>
            {error}
          </div>
        )}

        {/* ── Divider label ─────────────────────────────────────────────── */}
        <span className="label">{t('onboarding.identification')}</span>

        {/* ── Name ──────────────────────────────────────────────────────── */}
        <div style={s.fieldGroup}>
          <label style={s.label}>{t('onboarding.name')}</label>
          <input
            className="input"
            type="text"
            placeholder={t('onboarding.namePlaceholder')}
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
          <label style={s.label}>{t('onboarding.location')}</label>
          <input
            className="input"
            type="text"
            placeholder={t('onboarding.locationPlaceholder')}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
            disabled={isLoading}
            autoComplete="address-level2"
          />
          <span style={s.hint}>{t('onboarding.locationHint')}</span>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <hr />

        {/* ── Members counter ───────────────────────────────────────────── */}
        <span className="label">{t('onboarding.family')}</span>

        <div style={s.membersCard}>
          <div style={s.membersText}>
            <span style={s.membersTitle}>{t('onboarding.members')}</span>
            <span style={s.membersHint}>{t('onboarding.membersHint')}</span>
          </div>
          <NumericStepper
            value={members}
            step={1}
            min={1}
            max={20}
            decimals={0}
            unit={t('onboarding.people')}
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
          {isLoading ? t('onboarding.saving') : t('onboarding.continue')}
        </button>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <p style={s.footer}>{t('onboarding.footer')}</p>

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

  contextBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'rgba(0,229,160,0.07)',
    border: '1px solid rgba(0,229,160,0.2)',
    borderRadius: 12,
    padding: '12px 14px',
  },
  contextLabel: {
    fontSize: 10,
    color: 'var(--mu)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  contextTitle: {
    color: 'var(--tx)',
    fontSize: 14,
  },
  contextText: {
    color: 'var(--mu)',
    fontSize: 13,
    lineHeight: 1.45,
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
