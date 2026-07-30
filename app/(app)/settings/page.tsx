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
  const [pushMsg, setPushMsg] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'logout' | 'delete'>(null)
  const [billingBusy, setBillingBusy] = useState<null | Plan | 'portal'>(null)
  const [billingMsg, setBillingMsg] = useState<'success' | 'cancelled' | null>(null)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemState, setRedeemState] = useState<null | 'sending' | 'ok' | 'err'>(null)
  const [redeemMsg, setRedeemMsg] = useState('')

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

  const handleRedeem = async () => {
    const code = redeemCode.trim()
    if (!code) return
    setRedeemState('sending'); setRedeemMsg('')
    try {
      const res = await fetch('/api/billing/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.plan) {
        setPlan(d.plan as Plan)
        setRedeemState('ok')
        setRedeemMsg(en ? `Redeemed: ${String(d.plan).toUpperCase()} for ${d.grantDays} days.` : `Resgatado: ${String(d.plan).toUpperCase()} por ${d.grantDays} dias.`)
        setRedeemCode('')
      } else {
        setRedeemState('err')
        setRedeemMsg(String(d.error ?? (en ? 'Could not redeem.' : 'Não foi possível resgatar.')))
      }
    } catch {
      setRedeemState('err'); setRedeemMsg(en ? 'Network error.' : 'Erro de rede.')
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
    getPushServiceWorkerRegistration()
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setPushEnabled(!!sub)).catch(() => {})
  }, [])

  const togglePush = async () => {
    setPushMsg('')
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushMsg(en ? 'Push is not supported in this browser.' : 'Push não é suportado neste navegador.')
      return
    }
    setPushBusy(true)
    try {
      const reg = await getPushServiceWorkerRegistration()
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          const res = await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
          await sub.unsubscribe()
        }
        setPushEnabled(false)
        setPushMsg(en ? 'Push alerts disabled on this device.' : 'Alertas push desativados neste dispositivo.')
      } else {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) throw new Error(en ? 'Push is not configured.' : 'Push não configurado (VAPID key ausente).')
        if ('Notification' in window) {
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') {
            setPushMsg(en ? 'Notification permission was not granted.' : 'Permissão de notificação não foi concedida.')
            return
          }
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
        const subJson = sub.toJSON()
        const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subJson) })
        if (!res.ok) {
          await sub.unsubscribe().catch(() => {})
          throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
        }
        setPushEnabled(true)
        setPushMsg(en ? 'Push alerts enabled on this device.' : 'Alertas push ativados neste dispositivo.')
      }
    } catch (e) {
      console.error('Push toggle error:', e)
      setPushMsg(e instanceof Error ? e.message : (en ? 'Could not update push alerts.' : 'Não foi possível atualizar alertas push.'))
    }
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

          {/* Gift code redemption (D-061) */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <label htmlFor="redeem" style={{ ...styles.help, display: 'block', margin: '0 0 8px' }}>
              {en ? 'Have a gift code?' : 'Tem um código presente?'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="redeem"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                placeholder={en ? 'Enter code' : 'Digite o código'}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={{ flex: 1, minHeight: 48, padding: '12px 14px', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: '#f5f5f5', fontSize: 15, fontFamily: 'inherit', letterSpacing: '0.04em' }}
              />
              <button
                onClick={handleRedeem}
                disabled={redeemState === 'sending' || !redeemCode.trim()}
                style={{ minHeight: 48, padding: '12px 18px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 14, color: '#22c55e', fontSize: 14, fontWeight: 650, cursor: redeemCode.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', opacity: redeemState === 'sending' || !redeemCode.trim() ? 0.5 : 1 }}
              >
                {redeemState === 'sending' ? '…' : (en ? 'Redeem' : 'Resgatar')}
              </button>
            </div>
            {redeemMsg && (
              <p role="status" style={{ marginTop: 8, fontSize: 13, color: redeemState === 'ok' ? '#22c55e' : '#f59e0b' }}>{redeemMsg}</p>
            )}
          </div>
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
            {pushMsg && (
              <p role="status" style={{ margin: '10px 0 0', color: pushEnabled ? '#22c55e' : '#f59e0b', fontSize: 13, lineHeight: 1.45 }}>
                {pushMsg}
              </p>
            )}
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
            style={{ ...styles.accountBtn, marginTop: 12, justifyContent: 'center', gap: 10, minHeight: 52, fontWeight: 700, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>{busy === 'logout' ? (en ? 'Signing out…' : 'Saindo…') : (en ? 'Log out' : 'Sair')}</span>
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(
      () => reject(new Error('Service Worker demorou demais. Recarregue a página e tente de novo.')),
      ms,
    )
    promise.then(
      value => { window.clearTimeout(id); resolve(value) },
      error => { window.clearTimeout(id); reject(error) },
    )
  })
}

/**
 * Get a registration that HAS an active service worker (D-074).
 *
 * This used to hand-roll the wait by watching `installing`/`waiting` state and
 * rejecting the moment the watched worker went `redundant`. That was wrong twice
 * over: redundant is a NORMAL outcome — it means the worker was superseded,
 * usually by a good one — and the worker being watched is not necessarily the
 * one that ends up serving the page. The toggle therefore failed with "Service
 * Worker ficou redundante" while a perfectly healthy worker was activating.
 *
 * `navigator.serviceWorker.ready` is the canonical wait: it resolves with a
 * registration that has an active worker, regardless of the churn on the way
 * there. Do not replace it with bespoke state watching again.
 */
async function getPushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  // `updateViaCache: 'none'` forces sw.js to come from the network instead of the
  // browser's HTTP cache. Without it, a stale sw.js cached before a deploy keeps
  // failing to install and the user is stuck with no way out.
  const register = () =>
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })

  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing?.active) {
    void existing.update().catch(() => {})
    return existing
  }

  await register()
  try {
    return await withTimeout(navigator.serviceWorker.ready, 15000)
  } catch {
    // A broken registration never heals on its own: tear every one down and
    // start from scratch. This is the escape hatch the user did not have.
    const all = await navigator.serviceWorker.getRegistrations().catch(() => [])
    await Promise.all(all.map(r => r.unregister().catch(() => {})))
    await register()
    return withTimeout(navigator.serviceWorker.ready, 20000)
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i)
  return output
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
