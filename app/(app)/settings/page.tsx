'use client'

import { useEffect, useState } from 'react'
import { useLanguage, type Language, type MessageKey } from '@/lib/i18n'
import { canAccess, type Plan } from '@/lib/feature-gates'

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
  const [plan, setPlan] = useState<Plan | null>(null)

  useEffect(() => {
    fetch('/api/profile/plan')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.plan && setPlan(d.plan as Plan))
      .catch(() => {})
  }, [])

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

          {userPlan !== 'premium' && (
            <button
              style={styles.upgradeBtn}
              onClick={() => alert(t('settings.planUpgradeHint'))}
            >
              {t('settings.planUpgrade')} →
            </button>
          )}
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
}
