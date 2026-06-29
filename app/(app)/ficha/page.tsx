'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useLanguage } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

type Ficha = {
  id: string
  name: string
  location: string | null
  blood_type: string | null
  allergies: string[]
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  medical_notes: string | null
  medications: string[]
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const EMPTY: Ficha = {
  id: '',
  name: '',
  location: null,
  blood_type: null,
  allergies: [],
  emergency_contact_name: null,
  emergency_contact_phone: null,
  medical_notes: null,
  medications: [],
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FichaPage() {
  const { t } = useLanguage()
  const [ficha, setFicha] = useState<Ficha>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [allergyInput, setAllergyInput] = useState('')
  const [medInput, setMedInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fichaUrl = typeof window !== 'undefined' && ficha.id
    ? `${window.location.origin}/ficha/${ficha.id}`
    : ''

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadFicha = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/profile/ficha')
      if (res.ok) {
        const { ficha: data } = await res.json()
        setFicha({
          id: data.id ?? '',
          name: data.name ?? '',
          location: data.location ?? null,
          blood_type: data.blood_type ?? null,
          allergies: data.allergies ?? [],
          emergency_contact_name: data.emergency_contact_name ?? null,
          emergency_contact_phone: data.emergency_contact_phone ?? null,
          medical_notes: data.medical_notes ?? null,
          medications: data.medications ?? [],
        })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFicha() }, [loadFicha])

  // ── Save (debounced) ──────────────────────────────────────────────────────

  const save = useCallback((data: Ficha) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        setSaveError(null)
        const res = await fetch('/api/profile/ficha', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:                    data.name,
            location:                data.location,
            blood_type:              data.blood_type,
            allergies:               data.allergies,
            emergency_contact_name:  data.emergency_contact_name,
            emergency_contact_phone: data.emergency_contact_phone,
            medical_notes:           data.medical_notes,
            medications:             data.medications,
          }),
        })
        if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
        else { const b = await res.json(); setSaveError(b.error ?? t('common.saveError')) }
      })
    }, 700)
  }, [t])

  function update(patch: Partial<Ficha>) {
    const next = { ...ficha, ...patch }
    setFicha(next)
    save(next)
  }

  // ── Allergy + Medication list ─────────────────────────────────────────────

  function addAllergy() {
    const a = allergyInput.trim()
    if (!a || ficha.allergies.includes(a)) return
    update({ allergies: [...ficha.allergies, a] })
    setAllergyInput('')
  }

  function removeAllergy(a: string) {
    update({ allergies: ficha.allergies.filter((x) => x !== a) })
  }

  function addMed() {
    const m = medInput.trim()
    if (!m || ficha.medications.includes(m)) return
    update({ medications: [...ficha.medications, m] })
    setMedInput('')
  }

  function removeMed(m: string) {
    update({ medications: ficha.medications.filter((x) => x !== m) })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const completionSignals = [
    Boolean(ficha.name.trim()),
    Boolean(ficha.location?.trim()),
    Boolean(ficha.blood_type),
    Boolean(ficha.allergies.length || ficha.medical_notes?.trim() || ficha.medications.length),
    Boolean(ficha.emergency_contact_name?.trim()),
    Boolean(ficha.emergency_contact_phone?.trim()),
    Boolean(fichaUrl),
  ]
  const completion = Math.round(
    (completionSignals.filter(Boolean).length / completionSignals.length) * 100,
  )

  if (loading) {
    return (
      <div style={S.loading}>
        <span style={S.loadingDot} />
        <span style={S.loadingText}>{t('card.loading')}</span>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.width}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <p style={S.headerLabel}>{t('master.eyebrow')}</p>
            <h1 style={S.headerTitle}>{t('master.title')}</h1>
            <p style={S.headerSub}>{t('master.subtitle')}</p>
          </div>
          <div style={S.saveStatus}>
            {isPending && <span style={S.savingDot} />}
            {saved && !isPending && <span style={S.savedBadge}>✓ {t('common.saved')}</span>}
          </div>
        </div>

        {saveError && <div style={S.errorBanner}>⚠ {saveError}</div>}

        {/* Completion */}
        <div style={S.completionCard}>
          <div style={S.completionHeader}>
            <div>
              <p style={S.completionLabel}>{t('master.completion')}</p>
              <p style={S.completionHint}>{t('master.progressHint')}</p>
            </div>
            <strong style={S.completionValue}>{completion}%</strong>
          </div>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${completion}%` }} />
          </div>
        </div>

        {/* Identity */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{t('master.identity')}</h2>
          <div style={S.contactGrid}>
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{t('master.name')}</label>
              <input
                type="text"
                style={S.input}
                value={ficha.name}
                onChange={(e) => update({ name: e.target.value })}
                disabled={isPending}
                autoComplete="name"
              />
            </div>
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{t('master.location')}</label>
              <input
                type="text"
                style={S.input}
                placeholder={t('master.locationPlaceholder')}
                value={ficha.location ?? ''}
                onChange={(e) => update({ location: e.target.value || null })}
                disabled={isPending}
                autoComplete="address-level2"
              />
            </div>
          </div>
        </div>

        {/* QR Code */}
        {fichaUrl && (
          <div style={S.qrCard}>
            <div style={S.qrBox}>
              <QRCodeSVG
                value={fichaUrl}
                size={160}
                bgColor="transparent"
                fgColor="#0DE864"
                level="M"
              />
            </div>
            <div style={S.qrMeta}>
              <p style={S.qrLabel}>{t('card.qrTitle')}</p>
              <p style={S.qrHint}>
                {t('card.qrHint')}
              </p>
              <p style={S.qrUrl}>{fichaUrl}</p>
            </div>
          </div>
        )}

        {/* Tipo sanguíneo */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{t('card.bloodType')}</h2>
          <div style={S.bloodGrid}>
            {BLOOD_TYPES.map((bt) => (
              <button
                key={bt}
                type="button"
                style={ficha.blood_type === bt ? S.bloodActive : S.bloodBtn}
                onClick={() => update({ blood_type: ficha.blood_type === bt ? null : bt })}
                disabled={isPending}
              >
                {bt}
              </button>
            ))}
          </div>
        </div>

        {/* Alergias */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{t('card.allergies')}</h2>
          <div style={S.inputRow}>
            <input
              type="text"
              style={S.input}
              placeholder={t('card.allergiesPlaceholder')}
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAllergy())}
              disabled={isPending}
            />
            <button type="button" style={S.addBtn} onClick={addAllergy} disabled={isPending || !allergyInput.trim()}>
              + {t('common.add')}
            </button>
          </div>
          {ficha.allergies.length > 0 && (
            <div style={S.pillList}>
              {ficha.allergies.map((a) => (
                <div key={a} style={S.pillItem}>
                  <span style={S.pillWarn}>⚠ {a}</span>
                  <button type="button" style={S.removeBtn} onClick={() => removeAllergy(a)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Condições médicas */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{t('card.medicalConditions')}</h2>
          <textarea
            style={S.textarea}
            placeholder={t('card.medicalPlaceholder')}
            value={ficha.medical_notes ?? ''}
            onChange={(e) => update({ medical_notes: e.target.value || null })}
            rows={3}
            disabled={isPending}
          />
        </div>

        {/* Medicamentos */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{t('card.medications')}</h2>
          <div style={S.inputRow}>
            <input
              type="text"
              style={S.input}
              placeholder={t('card.medicationsPlaceholder')}
              value={medInput}
              onChange={(e) => setMedInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMed())}
              disabled={isPending}
            />
            <button type="button" style={S.addBtn} onClick={addMed} disabled={isPending || !medInput.trim()}>
              + {t('common.add')}
            </button>
          </div>
          {ficha.medications.length > 0 && (
            <div style={S.pillList}>
              {ficha.medications.map((m) => (
                <div key={m} style={S.pillItem}>
                  <span style={S.pillMed}>💊 {m}</span>
                  <button type="button" style={S.removeBtn} onClick={() => removeMed(m)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contato de emergência */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{t('card.emergencyContact')}</h2>
          <div style={S.contactGrid}>
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{t('card.contactName')}</label>
              <input
                type="text"
                style={S.input}
                placeholder={t('card.contactNamePlaceholder')}
                value={ficha.emergency_contact_name ?? ''}
                onChange={(e) => update({ emergency_contact_name: e.target.value || null })}
                disabled={isPending}
              />
            </div>
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{t('card.contactPhone')}</label>
              <input
                type="tel"
                style={S.input}
                placeholder="+55 11 99999-9999"
                value={ficha.emergency_contact_phone ?? ''}
                onChange={(e) => update({ emergency_contact_phone: e.target.value || null })}
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const AC  = '#0DE864'
const BG  = '#040404'
const SF  = '#0E0E0E'
const BD  = 'rgba(255,255,255,0.09)'
const TX  = '#D7DAD9'
const MU  = '#727272'
const DNG = '#E8410D'

const S: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100dvh', background: BG, paddingBottom: 80 },
  width:       { maxWidth: 480, margin: '0 auto', padding: '0 16px' },
  loading:     { minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: BG },
  loadingDot:  { width: 8, height: 8, borderRadius: '50%', background: AC, animation: 'pulse 1s infinite' },
  loadingText: { color: MU, fontSize: 13 },
  header:      { padding: '28px 0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 2, color: MU, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: 800, color: TX, letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: MU, marginTop: 4 },
  saveStatus:  { display: 'flex', alignItems: 'center', gap: 8 },
  savingDot:   { width: 6, height: 6, borderRadius: '50%', background: AC, opacity: 0.6 },
  savedBadge:  { fontSize: 11, color: AC, fontWeight: 700, letterSpacing: 0.5 },
  errorBanner: { background: 'rgba(232,65,13,0.1)', border: `1px solid ${DNG}44`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: DNG, marginBottom: 16 },
  completionCard: { background: SF, border: `1px solid ${BD}`, borderRadius: 16, padding: '16px 20px', marginBottom: 12 },
  completionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 12 },
  completionLabel: { fontSize: 12, fontWeight: 700, color: TX, marginBottom: 4 },
  completionHint: { fontSize: 11, color: MU, lineHeight: 1.45, maxWidth: 330 },
  completionValue: { color: AC, fontSize: 24, fontFamily: 'monospace' },
  progressTrack: { height: 7, overflow: 'hidden', borderRadius: 99, background: 'rgba(255,255,255,0.07)' },
  progressFill: { height: '100%', borderRadius: 99, background: AC, transition: 'width 240ms ease' },
  qrCard:      { background: SF, border: `1px solid ${BD}`, borderRadius: 20, padding: 20, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 },
  qrBox:       { flexShrink: 0, background: '#000', padding: 12, borderRadius: 12 },
  qrMeta:      { flex: 1 },
  qrLabel:     { fontSize: 12, fontWeight: 700, color: AC, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  qrHint:      { fontSize: 12, color: MU, lineHeight: 1.5, marginBottom: 8 },
  qrUrl:       { fontSize: 10, color: 'rgba(255,255,255,0.25)', wordBreak: 'break-all' as const, fontFamily: 'monospace' },
  section:     { background: SF, border: `1px solid ${BD}`, borderRadius: 16, padding: '16px 20px', marginBottom: 12 },
  sectionTitle:{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: 0.3, marginBottom: 14 },
  bloodGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  bloodBtn:    { padding: '12px 4px', borderRadius: 10, border: `1px solid ${BD}`, background: 'rgba(255,255,255,0.03)', color: MU, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  bloodActive: { padding: '12px 4px', borderRadius: 10, border: `1px solid ${DNG}55`, background: `rgba(232,65,13,0.15)`, color: DNG, fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: `0 0 12px rgba(232,65,13,0.2)` },
  inputRow:    { display: 'flex', gap: 8, marginBottom: 10 },
  input:       { flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 10, color: TX, fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  addBtn:      { padding: '10px 16px', borderRadius: 10, border: `1px solid ${BD}`, background: 'rgba(255,255,255,0.06)', color: MU, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  textarea:    { width: '100%', minHeight: 72, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 14px', color: TX, fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical' as const, outline: 'none', boxSizing: 'border-box' as const },
  pillList:    { display: 'flex', flexDirection: 'column', gap: 6 },
  pillItem:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}` },
  pillWarn:    { fontSize: 13, color: DNG, fontWeight: 600 },
  pillMed:     { fontSize: 13, color: TX },
  removeBtn:   { width: 24, height: 24, borderRadius: '50%', border: `1px solid ${BD}`, background: 'transparent', color: DNG, fontSize: 16, lineHeight: '1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  contactGrid: { display: 'flex', flexDirection: 'column', gap: 12 },
  fieldGroup:  { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel:  { fontSize: 11, fontWeight: 600, color: MU, letterSpacing: 0.5 },
}
