'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage, type Language, type MessageKey } from '@/lib/i18n'
import { canAccess, type Plan } from '@/lib/feature-gates'
import { createClient } from '@/lib/supabase/client'

// ─── Language selector ────────────────────────────────────────────────────────

const LANG_OPTIONS: Array<{ value: Language; labelKey: 'settings.portuguese' | 'settings.english' }> = [
  { value: 'pt', labelKey: 'settings.portuguese' },
  { value: 'en', labelKey: 'settings.english' },
]

// ─── Plan feature rows ────────────────────────────────────────────────────────

type FeatureRow = { key: MessageKey; requiredPlan: Plan }

const FREE_FEATURES: FeatureRow[] = [
  { key: 'settings.planFeatures.analise_ia', requiredPlan: 'free' },
  { key: 'settings.planFeatures.monitoring_weather', requiredPlan: 'free' },
  { key: 'settings.planFeatures.monitoring_earthquake', requiredPlan: 'free' },
]
const FAMILY_FEATURES: FeatureRow[] = [
  { key: 'settings.planFeatures.circulos', requiredPlan: 'family' },
  { key: 'settings.planFeatures.qr_emergencia', requiredPlan: 'family' },
  { key: 'settings.planFeatures.monitoring_aqi', requiredPlan: 'family' },
  { key: 'settings.planFeatures.monitoring_fire', requiredPlan: 'family' },
  { key: 'settings.planFeatures.monitoring_fema', requiredPlan: 'family' },
  { key: 'settings.planFeatures.monitoring_multilocal', requiredPlan: 'family' },
]
const PREMIUM_FEATURES: FeatureRow[] = [
  { key: 'settings.planFeatures.monitoring_push', requiredPlan: 'premium' },
  { key: 'settings.planFeatures.monitoring_history', requiredPlan: 'premium' },
  { key: 'settings.planFeatures.monitoring_cdc', requiredPlan: 'premium' },
  { key: 'settings.planFeatures.monitoring_fda', requiredPlan: 'premium' },
  { key: 'settings.planFeatures.exportar_ficha', requiredPlan: 'premium' },
]

const PLAN_NAME_KEY: Record<Plan, MessageKey> = {
  free: 'settings.planFree',
  family: 'settings.planFamily',
  premium: 'settings.planPremium',
}

const PLAN_COLOR: Record<Plan, string> = {
  free: '#71717a',
  family: '#22c55e',
  premium: '#f59e0b',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage()
  const en = language === 'en'
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'logout' | 'delete'>(null)
  const [billingBusy, setBillingBusy] = useState<null | Plan | 'portal'>(null)
  const [billingMsg, setBillingMsg] = useState<'success' | 'cancelled' | null>(null)

  useEffect(() => {
    fetch('/api/profile/plan')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.plan && setPlan(d.plan as Plan))
      .catch(() => {})
  }, [])

  useEffect(() => {
    createClient().auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const b = params.get('billing')
    if (b === 'success' || b === 'cancelled') {
      setBillingMsg(b)
      // Clean the URL so a refresh doesn't re-show the banner.
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleCheckout = async (targetPlan: Plan) => {
    setBillingBusy(targetPlan)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.url) {
        window.location.href = d.url
        return
      }
      alert((en ? 'Could not start checkout: ' : 'Não foi possível iniciar o pagamento: ') + (d.error ?? res.status))
    } catch {
      alert(en ? 'Network error.' : 'Erro de rede.')
    } finally {
      setBillingBusy(null)
    }
  }

  const handlePortal = async () => {
    setBillingBusy('portal')
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.url) {
        window.location.href = d.url
        return
      }
      alert((en ? 'Could not open billing portal: ' : 'Não foi possível abrir o portal: ') + (d.error ?? res.status))
    } catch {
      alert(en ? 'Network error.' : 'Erro de rede.')
    } finally {
      setBillingBusy(null)
    }
  }

  const handleLogout = async () => {
    setBusy('logout')
    try {
      await createClient().auth.signOut()
      window.location.href = '/auth/login'
    } catch {
      setBusy(null)
    }
  }

  const handleDeleteAccount = async () => {
    const msg = en
      ? 'Delete your account permanently? This erases your profile, family, inventory and checklist. This cannot be undone.'
      : 'Excluir sua conta permanentemente? Isso apaga seu perfil, família, inventário e checklist. Não dá para desfazer.'
    if (!window.confirm(msg)) return
    setBusy('delete')
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert((en ? 'Error deleting account: ' : 'Erro ao excluir conta: ') + (d.error ?? res.status))
        setBusy(null)
        return
      }
      window.location.href = '/auth/login'
    } catch {
      alert(en ? 'Network error.' : 'Erro de rede.')
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription())
      .then(sub => setPushEnabled(!!sub)).catch(() => {})
  }, [])

  const togglePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
          await sub.unsubscribe()
          setPushEnabled(false)
        }
      } else {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) { alert('Push não configurado (VAPID key ausente)'); return }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey })
        const subJson = sub.toJSON()
        await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subJson) })
        setPushEnabled(true)
      }
    } catch (e) { console.error('Push toggle error:', e) }
    finally { setPushBusy(false) }
  }

  const userPlan: Plan = plan ?? 'free'

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <p style={styles.eyebrow}>{t('settings.eyebrow')}</p>
        <h1 style={styles.title}>{t('settings.title')}</h1>
        <p style={styles.description}>{t('settings.description')}</p>

        {/* Language */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>{t('settings.language')}</h2>
          <p style={styles.help}>{t('settings.languageHelp')}</p>
          <div style={styles.options} role="radiogroup" aria-label={t('settings.language')}>
            {LANG_OPTIONS.map(({ value, labelKey }) => {
              const selected = language === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setLanguage(value)}
                  style={{ ...styles.option, ...(selected ? styles.optionSelected : {}) }}
                >
                  <span style={styles.optionLabel}>{t(labelKey)}</span>
                  <span style={selected ? styles.statusSelected : styles.status}>
                    {selected ? t('settings.selected') : value.toUpperCase()}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Plan */}
        <div style={{ ...styles.card, marginTop: 20 }}>
          <div style={styles.planHeader}>
            <div>
              <h2 style={styles.sectionTitle}>{t('settings.plan')}</h2>
              <p style={styles.help}>{t('settings.planHelp')}</p>
            </div>
            {plan !== null && (
              <span style={{ ...styles.planBadge, background: PLAN_COLOR[userPlan] + '22', color: PLAN_COLOR[userPlan], borderColor: PLAN_COLOR[userPlan] + '55' }}>
                {t(PLAN_NAME_KEY[userPlan])}
                <span style={styles.planBadgeCurrent}> · {t('settings.planCurrent')}</span>
              </span>
            )}
          </div>

          <div style={styles.featureList}>
            {[...FREE_FEATURES, ...FAMILY_FEATURES, ...PREMIUM_FEATURES].map(({ key, requiredPlan }) => {
              const accessible = canAccess(
                key.replace('settings.planFeatures.', '') as Parameters<typeof canAccess>[0],
                userPlan,
              )
              return (
                <div key={key} style={styles.featureRow}>
                  <span style={accessible ? styles.featureCheck : styles.featureLock}>
                    {accessible ? '✓' : '🔒'}
                  </span>
                  <span style={{ ...styles.featureName, ...(accessible ? {} : styles.featureNameLocked) }}>
                    {t(key)}
                  </span>
                  {!accessible && (
                    <span style={{ ...styles.featurePlan, color: PLAN_COLOR[requiredPlan] }}>
                      {t(PLAN_NAME_KEY[requiredPlan])}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {billingMsg && (
            <div style={{ ...styles.billingBanner, ...(billingMsg === 'success' ? styles.billingSuccess : styles.billingCancelled) }}>
              {billingMsg === 'success' ? t('settings.billingSuccess') : t('settings.billingCancelled')}
            </div>
          )}

          {userPlan === 'free' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <button style={styles.upgradeBtn} disabled={billingBusy !== null} onClick={() => handleCheckout('family')}>
                {billingBusy === 'family' ? (en ? 'Redirecting…' : 'Redirecionando…') : `${t('settings.planUpgrade')} · ${t('settings.planFamily')} →`}
              </button>
              <button style={{ ...styles.upgradeBtn, background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }} disabled={billingBusy !== null} onClick={() => handleCheckout('premium')}>
                {billingBusy === 'premium' ? (en ? 'Redirecting…' : 'Redirecionando…') : `${t('settings.planUpgrade')} · ${t('settings.planPremium')} →`}
              </button>
            </div>
          )}

          {userPlan === 'family' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <button style={{ ...styles.upgradeBtn, background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }} disabled={billingBusy !== null} onClick={() => handleCheckout('premium')}>
                {billingBusy === 'premium' ? (en ? 'Redirecting…' : 'Redirecionando…') : `${t('settings.planUpgrade')} · ${t('settings.planPremium')} →`}
              </button>
              <button style={{ ...styles.accountBtn, justifyContent: 'center' }} disabled={billingBusy !== null} onClick={handlePortal}>
                {billingBusy === 'portal' ? (en ? 'Opening…' : 'Abrindo…') : t('settings.planManage')}
              </button>
            </div>
          )}

          {userPlan === 'premium' && (
            <button style={{ ...styles.accountBtn, justifyContent: 'center' }} disabled={billingBusy !== null} onClick={handlePortal}>
              {billingBusy === 'portal' ? (en ? 'Opening…' : 'Abrindo…') : t('settings.planManage')}
            </button>
          )}
        </div>

        {/* Push notifications */}
        {'serviceWorker' in (typeof navigator !== 'undefined' ? navigator : {}) && (
          <div style={{ ...styles.card, marginTop: 20 }}>
            <div style={styles.planHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Alertas Push</h2>
                <p style={styles.help}>Receba notificações de emergência do seu círculo mesmo com o app fechado.</p>
              </div>
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: pushEnabled ? '#22c55e' : '#71717a', padding: '4px 12px', background: (pushEnabled ? '#22c55e' : '#71717a') + '18', border: '1px solid ' + (pushEnabled ? '#22c55e' : '#71717a') + '44', borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {pushEnabled ? 'Ativado' : 'Desativado'}
              </span>
            </div>
            <button
              onClick={togglePush}
              disabled={pushBusy}
              style={{ ...styles.upgradeBtn, marginTop: 16, background: pushEnabled ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderColor: pushEnabled ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)', color: pushEnabled ? '#ef4444' : '#22c55e' }}
            >
              {pushBusy ? 'Aguarde…' : pushEnabled ? 'Desativar alertas push' : 'Ativar alertas push'}
            </button>
          </div>
        )}

        {/* Account */}
        <div style={{ ...styles.card, marginTop: 20 }}>
          <h2 style={styles.sectionTitle}>{en ? 'Account' : 'Conta'}</h2>
          <p style={styles.help}>{en ? 'Manage your login and personal data.' : 'Gerencie seu login e seus dados pessoais.'}</p>

          {email && (
            <div style={styles.accountRow}>
              <span style={styles.accountLabel}>{en ? 'Signed in as' : 'Conectado como'}</span>
              <span style={styles.accountValue}>{email}</span>
            </div>
          )}

          <Link href="/ficha" style={{ ...styles.accountBtn, textDecoration: 'none', display: 'flex' }}>
            <span>{en ? 'Edit my data (Master Card)' : 'Editar meus dados (Ficha Master)'}</span>
            <span aria-hidden>→</span>
          </Link>

          <button
            onClick={handleLogout}
            disabled={busy !== null}
            style={{ ...styles.accountBtn, marginTop: 12 }}
          >
            <span>{busy === 'logout' ? (en ? 'Signing out…' : 'Saindo…') : (en ? 'Log out' : 'Sair')}</span>
            <span aria-hidden>⏻</span>
          </button>
        </div>

        {/* Danger zone */}
        <div style={{ ...styles.card, marginTop: 20, borderColor: 'rgba(239,68,68,0.3)' }}>
          <h2 style={{ ...styles.sectionTitle, color: '#ef4444' }}>{en ? 'Danger zone' : 'Zona de perigo'}</h2>
          <p style={styles.help}>
            {en
              ? 'Permanently delete your account and all data. This cannot be undone.'
              : 'Excluir permanentemente sua conta e todos os dados. Não pode ser desfeito.'}
          </p>
          <button
            onClick={handleDeleteAccount}
            disabled={busy !== null}
            style={{ ...styles.upgradeBtn, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }}
          >
            {busy === 'delete' ? (en ? 'Deleting…' : 'Excluindo…') : (en ? 'Delete my account' : 'Excluir minha conta')}
          </button>
        </div>
      </section>
    </main>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0f', color: '#f5f5f5', padding: '72px 20px 120px' },
  container: { width: '100%', maxWidth: 640, margin: '0 auto' },
  eyebrow: { margin: '0 0 12px', color: '#22c55e', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' },
  title: { margin: 0, fontSize: 'clamp(32px, 8vw, 48px)', letterSpacing: '-0.04em' },
  description: { color: '#a1a1aa', fontSize: 16, lineHeight: 1.6, margin: '12px 0 32px' },
  card: { padding: 24, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, background: 'rgba(255,255,255,0.03)' },
  sectionTitle: { margin: 0, fontSize: 20 },
  help: { color: '#a1a1aa', lineHeight: 1.5, margin: '8px 0 20px' },
  options: { display: 'grid', gap: 12 },
  option: { width: '100%', minHeight: 64, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#f5f5f5', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, cursor: 'pointer' },
  optionSelected: { borderColor: '#22c55e', background: 'rgba(34,197,94,0.08)' },
  optionLabel: { fontSize: 16, fontWeight: 650 },
  status: { color: '#71717a', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' },
  statusSelected: { color: '#22c55e', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' },
  planHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  planBadge: { flexShrink: 0, padding: '4px 12px', borderRadius: 999, border: '1px solid', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  planBadgeCurrent: { fontWeight: 400, opacity: 0.7 },
  featureList: { display: 'grid', gap: 10, marginBottom: 20 },
  featureRow: { display: 'flex', alignItems: 'center', gap: 10 },
  featureCheck: { fontSize: 13, color: '#22c55e', width: 18, flexShrink: 0 },
  featureLock: { fontSize: 13, width: 18, flexShrink: 0, filter: 'grayscale(1)', opacity: 0.5 },
  featureName: { fontSize: 14, flex: 1, color: '#f5f5f5' },
  featureNameLocked: { color: '#52525b' },
  featurePlan: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 },
  upgradeBtn: { width: '100%', padding: '14px 24px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 14, color: '#22c55e', fontSize: 15, fontWeight: 650, cursor: 'pointer', letterSpacing: '-0.01em' },
  billingBanner: { padding: '12px 16px', borderRadius: 14, fontSize: 14, fontWeight: 600, marginBottom: 16, border: '1px solid' },
  billingSuccess: { background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.35)', color: '#22c55e' },
  billingCancelled: { background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.35)', color: '#f59e0b' },
  accountRow: { display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, marginBottom: 16 },
  accountLabel: { color: '#71717a', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
  accountValue: { color: '#f5f5f5', fontSize: 15, fontWeight: 600, wordBreak: 'break-all' },
  accountBtn: { width: '100%', minHeight: 52, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: '#f5f5f5', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: 'inherit' },
}
