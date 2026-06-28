'use client'

import { useLanguage, type Language } from '@/lib/i18n'

const options: Array<{ value: Language; labelKey: 'settings.portuguese' | 'settings.english' }> = [
  { value: 'pt', labelKey: 'settings.portuguese' },
  { value: 'en', labelKey: 'settings.english' },
]

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <p style={styles.eyebrow}>{t('settings.eyebrow')}</p>
        <h1 style={styles.title}>{t('settings.title')}</h1>
        <p style={styles.description}>{t('settings.description')}</p>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>{t('settings.language')}</h2>
          <p style={styles.help}>{t('settings.languageHelp')}</p>
          <div style={styles.options} role="radiogroup" aria-label={t('settings.language')}>
            {options.map(({ value, labelKey }) => {
              const selected = language === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setLanguage(value)}
                  style={{
                    ...styles.option,
                    ...(selected ? styles.optionSelected : {}),
                  }}
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
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0a0f',
    color: '#f5f5f5',
    padding: '72px 20px 120px',
  },
  container: { width: '100%', maxWidth: 640, margin: '0 auto' },
  eyebrow: {
    margin: '0 0 12px',
    color: '#22c55e',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  title: { margin: 0, fontSize: 'clamp(32px, 8vw, 48px)', letterSpacing: '-0.04em' },
  description: { color: '#a1a1aa', fontSize: 16, lineHeight: 1.6, margin: '12px 0 32px' },
  card: {
    padding: 24,
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.03)',
  },
  sectionTitle: { margin: 0, fontSize: 20 },
  help: { color: '#a1a1aa', lineHeight: 1.5, margin: '8px 0 20px' },
  options: { display: 'grid', gap: 12 },
  option: {
    width: '100%',
    minHeight: 64,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: '#f5f5f5',
    background: '#111116',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    cursor: 'pointer',
  },
  optionSelected: { borderColor: '#22c55e', background: 'rgba(34,197,94,0.08)' },
  optionLabel: { fontSize: 16, fontWeight: 650 },
  status: { color: '#71717a', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' },
  statusSelected: { color: '#22c55e', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' },
}
