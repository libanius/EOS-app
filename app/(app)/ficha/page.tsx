'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useLanguage } from '@/lib/i18n'
import HomeAddress from '@/components/HomeAddress'
import { EMPTY_ADDRESS, type Address } from '@/lib/address'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { saveSnapshot, loadSnapshot } from '@/lib/sync'

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

type Personalization = {
  avatar_url: string | null
  avatar_path?: string | null
  user_context_md: string
  pilot_memory_md: string
  decision_style: 'concise' | 'balanced' | 'detailed' | 'checklist'
  risk_tolerance: 'conservative' | 'balanced' | 'flexible'
  configured?: boolean
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const DECISION_STYLE_OPTIONS: Personalization['decision_style'][] = ['balanced', 'concise', 'detailed', 'checklist']
const RISK_TOLERANCE_OPTIONS: Personalization['risk_tolerance'][] = ['balanced', 'conservative', 'flexible']

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

const EMPTY_PERSONALIZATION: Personalization = {
  avatar_url: null,
  avatar_path: null,
  user_context_md: '',
  pilot_memory_md: '',
  decision_style: 'balanced',
  risk_tolerance: 'balanced',
  configured: true,
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FichaPage() {
  const { t, language } = useLanguage()
  const pt = language === 'pt'

  /**
   * Quem depende de mim (D-123).
   *
   * `null` enquanto carrega — e não `[]`, que renderizaria "ninguém depende de
   * você" antes de a resposta chegar. Dizer que a pessoa não cuida de ninguém
   * quando ela cuida é o tipo de mentira momentânea que faz alguém fechar a
   * tela achando que cadastrou errado.
   */
  /** O endereço estruturado que veio do perfil (D-130). */
  const [endereco, setEndereco] = useState<Partial<Address>>(EMPTY_ADDRESS)
  /** Há convites guardados esperando um círculo? Então vale oferecer. */
  const [ofertaCirculo, setOfertaCirculo] = useState(false)
  const [ultimoSalvo, setUltimoSalvo] = useState<{ pendingInvites: number; dependents: number } | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const p = d?.profile ?? d
        if (!p) return
        setEndereco({
          country: p.address_country ?? '', line1: p.address_line1 ?? '',
          unit: p.address_unit ?? '', city: p.address_city ?? '',
          region: p.address_region ?? '', postal: p.address_postal ?? '',
        })
      })
      .catch(() => {})
  }, [])

  const [dependentes, setDependentes] = useState<Array<{
    id: string; name: string; relationship: string | null; care_notes: string | null
  }> | null>(null)

  useEffect(() => {
    fetch('/api/family-members')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setDependentes(Array.isArray(d?.members) ? d.members.filter((m: { linked_user_id: string | null }) => !m.linked_user_id) : []))
      .catch(() => setDependentes([]))
  }, [])
  const [ficha, setFicha] = useState<Ficha>(EMPTY)
  const [personalization, setPersonalization] = useState<Personalization>(EMPTY_PERSONALIZATION)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [personalizationSaved, setPersonalizationSaved] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [personalizationError, setPersonalizationError] = useState<string | null>(null)
  const [allergyInput, setAllergyInput] = useState('')
  const [medInput, setMedInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const isDirtyRef = useRef(false)
  const [isDirty, setIsDirty] = useState(false)

  const fichaUrl = typeof window !== 'undefined' && ficha.id
    ? `${window.location.origin}/ficha/${ficha.id}`
    : ''

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadFicha = useCallback(async (skipIfDirty = false) => {
    if (skipIfDirty && isDirtyRef.current) return
    setLoading(true)
    const snap = loadSnapshot<Ficha>('ficha')
    if (snap) setFicha(snap)
    try {
      const res = await fetch('/api/profile/ficha')
      if (res.status === 401) {
        window.location.href = '/auth/login?redirectTo=/ficha'
        return
      }
      if (res.ok) {
        const { ficha: data } = await res.json()
        const f: Ficha = {
          id: data.id ?? '',
          name: data.name ?? '',
          location: data.location ?? null,
          blood_type: data.blood_type ?? null,
          allergies: data.allergies ?? [],
          emergency_contact_name: data.emergency_contact_name ?? null,
          emergency_contact_phone: data.emergency_contact_phone ?? null,
          medical_notes: data.medical_notes ?? null,
          medications: data.medications ?? [],
        }
        setFicha(f)
        saveSnapshot('ficha', f)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPersonalization = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/personalization')
      if (res.status === 401) {
        window.location.href = '/auth/login?redirectTo=/ficha'
        return
      }
      if (res.ok) {
        const { personalization: data } = await res.json()
        setPersonalization({
          avatar_url: data.avatar_url ?? null,
          avatar_path: data.avatar_path ?? null,
          user_context_md: data.user_context_md ?? '',
          pilot_memory_md: data.pilot_memory_md ?? '',
          decision_style: data.decision_style ?? 'balanced',
          risk_tolerance: data.risk_tolerance ?? 'balanced',
          configured: data.configured ?? true,
        })
      }
    } catch {
      setPersonalizationError(language === 'pt' ? 'Não foi possível carregar a personalização.' : 'Could not load personalization.')
    }
  }, [language])

  useRealtimeSync(['profiles'], () => { void loadFicha(true) })

  useEffect(() => { loadFicha(); loadPersonalization() }, [loadFicha, loadPersonalization])

  // ── Save ─────────────────────────────────────────────────────────────────

  const save = useCallback((data: Ficha) => {
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
      if (res.ok) {
        isDirtyRef.current = false
        setIsDirty(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else if (res.status === 401) {
        // Session expired while editing — send the user to log in again.
        window.location.href = '/auth/login?redirectTo=/ficha'
      } else {
        const b = await res.json().catch(() => ({}))
        setSaveError(b.error ?? t('common.saveError'))
      }
    })
  }, [t])

  function update(patch: Partial<Ficha>, immediate = false) {
    const next = { ...ficha, ...patch }
    setFicha(next)
    isDirtyRef.current = true
    setIsDirty(true)
    if (immediate) save(next)
  }

  function handleBlur(patch?: Partial<Ficha>) {
    if (!isDirtyRef.current) return
    save(patch ? { ...ficha, ...patch } : ficha)
  }

  const savePersonalization = useCallback((data: Personalization) => {
    startTransition(async () => {
      setPersonalizationError(null)
      const res = await fetch('/api/profile/personalization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_url: data.avatar_url,
          user_context_md: data.user_context_md,
          pilot_memory_md: data.pilot_memory_md,
          decision_style: data.decision_style,
          risk_tolerance: data.risk_tolerance,
        }),
      })
      if (res.ok) {
        const { personalization: savedData } = await res.json()
        setPersonalization({
          avatar_url: savedData.avatar_url ?? null,
          avatar_path: savedData.avatar_path ?? null,
          user_context_md: savedData.user_context_md ?? '',
          pilot_memory_md: savedData.pilot_memory_md ?? '',
          decision_style: savedData.decision_style ?? 'balanced',
          risk_tolerance: savedData.risk_tolerance ?? 'balanced',
          configured: true,
        })
        setPersonalizationSaved(true)
        setTimeout(() => setPersonalizationSaved(false), 2000)
      } else if (res.status === 401) {
        window.location.href = '/auth/login?redirectTo=/ficha'
      } else {
        const b = await res.json().catch(() => ({}))
        setPersonalizationError(b.error ?? t('common.saveError'))
      }
    })
  }, [t])

  function updatePersonalization(patch: Partial<Personalization>, immediate = false) {
    const next = { ...personalization, ...patch }
    setPersonalization(next)
    if (immediate) savePersonalization(next)
  }

  async function uploadProfilePhoto(file: File | null) {
    if (!file) return
    setPhotoUploading(true)
    setPersonalizationError(null)
    try {
      const form = new FormData()
      form.append('photo', file)
      const res = await fetch('/api/profile/personalization/photo', {
        method: 'POST',
        body: form,
      })
      if (res.ok) {
        const { personalization: savedData } = await res.json()
        setPersonalization({
          avatar_url: savedData.avatar_url ?? null,
          avatar_path: savedData.avatar_path ?? null,
          user_context_md: savedData.user_context_md ?? '',
          pilot_memory_md: savedData.pilot_memory_md ?? '',
          decision_style: savedData.decision_style ?? 'balanced',
          risk_tolerance: savedData.risk_tolerance ?? 'balanced',
          configured: true,
        })
        setPersonalizationSaved(true)
        setTimeout(() => setPersonalizationSaved(false), 2000)
      } else if (res.status === 401) {
        window.location.href = '/auth/login?redirectTo=/ficha'
      } else {
        const b = await res.json().catch(() => ({}))
        setPersonalizationError(b.error ?? t('common.saveError'))
      }
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Allergy + Medication list ─────────────────────────────────────────────

  function addAllergy() {
    const a = allergyInput.trim()
    if (!a || ficha.allergies.includes(a)) return
    update({ allergies: [...ficha.allergies, a] }, true)
    setAllergyInput('')
  }

  function removeAllergy(a: string) {
    update({ allergies: ficha.allergies.filter((x) => x !== a) }, true)
  }

  function addMed() {
    const m = medInput.trim()
    if (!m || ficha.medications.includes(m)) return
    update({ medications: [...ficha.medications, m] }, true)
    setMedInput('')
  }

  function removeMed(m: string) {
    update({ medications: ficha.medications.filter((x) => x !== m) }, true)
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
            {isDirty && !isPending && !saved && (
              <button type="button" onClick={() => save(ficha)} style={S.saveBtn}>
                {t('common.save')}
              </button>
            )}
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
                onBlur={() => handleBlur()}
                disabled={isPending}
                autoComplete="name"
              />
            </div>
            {/*
              A oferta do círculo (D-130).

              Ela aparece DEPOIS do salvamento, e como uma linha — não um popup
              que bloqueia. O dono descreveu um pop-up ao salvar; a diferença é
              que aqui a pessoa já terminou o que veio fazer, e a oferta não
              sequestra a conclusão.

              E o preço vem na mesma frase do convite. No desenho original ela
              clicava em "sim", ia para Círculos e só lá descobria que precisa do
              plano Família — pedir o trabalho e cobrar pelo resultado dele. Um
              "sim" informado converte melhor e não irrita ninguém.

              Os nomes não se perdem se ela disser "agora não": ficam guardados
              como convites pendentes e saem com um toque quando o círculo
              existir.
            */}
            {ofertaCirculo && ultimoSalvo && (
              <div style={S.circleOffer}>
                <strong style={{ fontSize: 15 }}>
                  {pt
                    ? `${ultimoSalvo.pendingInvites} ${ultimoSalvo.pendingInvites === 1 ? 'pessoa espera' : 'pessoas esperam'} um convite`
                    : `${ultimoSalvo.pendingInvites} ${ultimoSalvo.pendingInvites === 1 ? 'person is waiting' : 'people are waiting'} for an invite`}
                </strong>
                <p style={{ margin: '6px 0 12px', fontSize: 13, lineHeight: 1.5, color: '#a1a1aa' }}>
                  {pt
                    ? 'Para elas aparecerem no mapa e receberem alerta, vocês precisam de um círculo. Guardei os nomes — se preferir deixar para depois, eles continuam aqui.'
                    : 'For them to appear on the map and receive alerts, you need a circle. I saved the names — if you would rather do it later, they stay here.'}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href="/circles" style={S.circleOfferPrimary}>
                    {pt ? 'Criar o círculo da casa · plano Família' : 'Create the household circle · Family plan'}
                  </a>
                  <button type="button" style={S.circleOfferGhost} onClick={() => setOfertaCirculo(false)}>
                    {pt ? 'Agora não' : 'Not now'}
                  </button>
                </div>
              </div>
            )}

            {/*
              Endereço estruturado (D-130).

              Era um campo de texto livre. Virou endereço com país, rua, unidade
              e CEP — e o campo de unidade é o que separa a casa de quem mora num
              condomínio onde vários prédios dividem o mesmo número de rua.

              É daqui que sai o ponto de casa: a origem das rotas e a referência
              de distância dos abrigos. E é aqui que o app pergunta quem mais
              mora ali, porque é o único momento em que a pessoa já está pensando
              na própria casa.
            */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{t('master.location')}</label>
              <HomeAddress
                pt={pt}
                initial={endereco}
                onSaved={r => {
                  setOfertaCirculo(r.pendingInvites > 0)
                  setUltimoSalvo(r)
                }}
              />
            </div>
          </div>
        </div>

        {/* Personalização do Pilot */}
        <div style={S.section}>
          <div style={S.sectionHeaderRow}>
            <div>
              <h2 style={S.sectionTitle}>
                {language === 'pt' ? 'Personalização do Pilot' : 'Pilot personalization'}
              </h2>
              <p style={S.sectionHint}>
                {language === 'pt'
                  ? 'Contexto privado que o Pilot pode consultar para adaptar recomendações.'
                  : 'Private context Pilot can read to adapt recommendations.'}
              </p>
            </div>
            {personalizationSaved && <span style={S.savedBadge}>✓ {t('common.saved')}</span>}
          </div>

          {personalization.configured === false && (
            <div style={S.warnBanner}>
              {language === 'pt'
                ? 'Migration profile_personalization pendente no Supabase. A leitura usa defaults até aplicar o SQL.'
                : 'Supabase profile_personalization migration is pending. Reads use defaults until SQL is applied.'}
            </div>
          )}
          {personalizationError && <div style={S.errorBanner}>{personalizationError}</div>}

          <div style={S.avatarRow}>
            <div style={S.avatarPreview}>
              {personalization.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={personalization.avatar_url} alt="" style={S.avatarImg} />
              ) : (
                <span>{initials(ficha.name || 'EOS')}</span>
              )}
            </div>
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{language === 'pt' ? 'Foto de perfil' : 'Profile photo'}</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={S.fileInput}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0] ?? null
                  void uploadProfilePhoto(file)
                  e.currentTarget.value = ''
                }}
                disabled={isPending || photoUploading}
              />
              <span style={S.fieldHelp}>
                {photoUploading
                  ? (language === 'pt' ? 'Enviando foto...' : 'Uploading photo...')
                  : personalization.avatar_path
                    ? (language === 'pt' ? 'Foto armazenada no EOS Storage privado.' : 'Photo stored in private EOS Storage.')
                    : (language === 'pt' ? 'JPG, PNG ou WebP até 5MB.' : 'JPG, PNG, or WebP up to 5MB.')}
              </span>
            </div>
          </div>

          <div style={{ ...S.fieldGroup, marginBottom: 14 }}>
            <label style={S.fieldLabel}>{language === 'pt' ? 'URL manual da foto (fallback)' : 'Manual photo URL (fallback)'}</label>
              <input
                type="url"
                style={S.input}
                placeholder="https://..."
                value={personalization.avatar_url ?? ''}
                onChange={(e) => updatePersonalization({ avatar_url: e.target.value || null })}
                onBlur={() => savePersonalization(personalization)}
                disabled={isPending || photoUploading}
              />
          </div>

          <div style={S.contactGrid}>
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{language === 'pt' ? 'Estilo de decisão' : 'Decision style'}</label>
              <select
                style={S.input}
                value={personalization.decision_style}
                onChange={(e) => updatePersonalization({ decision_style: e.target.value as Personalization['decision_style'] }, true)}
                disabled={isPending}
              >
                {DECISION_STYLE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{decisionStyleLabel(opt, language)}</option>
                ))}
              </select>
            </div>
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>{language === 'pt' ? 'Tolerância a risco' : 'Risk tolerance'}</label>
              <select
                style={S.input}
                value={personalization.risk_tolerance}
                onChange={(e) => updatePersonalization({ risk_tolerance: e.target.value as Personalization['risk_tolerance'] }, true)}
                disabled={isPending}
              >
                {RISK_TOLERANCE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{riskToleranceLabel(opt, language)}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...S.fieldGroup, marginTop: 12 }}>
            <label style={S.fieldLabel}>{language === 'pt' ? 'Preferências do usuário (Markdown)' : 'User preferences (Markdown)'}</label>
            <textarea
              style={{ ...S.textarea, minHeight: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              placeholder={language === 'pt'
                ? '- Prefiro recomendações conservadoras com família\n- Evitar sair depois do pôr do sol\n- Equipamentos importantes: rádio VHF, gerador, kit médico'
                : '- Prefer conservative family recommendations\n- Avoid leaving after sunset\n- Key equipment: VHF radio, generator, medical kit'}
              value={personalization.user_context_md}
              onChange={(e) => updatePersonalization({ user_context_md: e.target.value })}
              onBlur={() => savePersonalization(personalization)}
              disabled={isPending}
            />
          </div>

          <div style={{ ...S.fieldGroup, marginTop: 12 }}>
            <label style={S.fieldLabel}>{language === 'pt' ? 'Memória do Pilot (Markdown)' : 'Pilot memory (Markdown)'}</label>
            <textarea
              style={{ ...S.textarea, minHeight: 120, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              placeholder={language === 'pt'
                ? 'O Pilot usará este documento como memória explícita. No MVP, alterações são feitas por você.'
                : 'Pilot uses this document as explicit memory. In the MVP, you control edits.'}
              value={personalization.pilot_memory_md}
              onChange={(e) => updatePersonalization({ pilot_memory_md: e.target.value })}
              onBlur={() => savePersonalization(personalization)}
              disabled={isPending}
            />
          </div>

          <button
            type="button"
            style={{ ...S.saveBtn, marginTop: 12 }}
            onClick={() => savePersonalization(personalization)}
            disabled={isPending}
          >
            {t('common.save')}
          </button>
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

        {/*
          Quem depende de mim (D-123).
          Pedido do dono, nas palavras dele: "na ficha da cuidadora ela conta
          ela + 1, e tem que ter campo para descrever sobre o idoso". Um
          dependente não tem conta, não aparece no mapa e não recebe mensagem —
          quem responde por ele é esta pessoa, e a engine inteira soma assim.
        */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{pt ? 'Quem depende de mim' : 'Who depends on me'}</h2>
          {dependentes === null ? (
            <p style={{ fontSize: 13, color: '#8a8a99' }}>…</p>
          ) : dependentes.length === 0 ? (
            <p style={{ fontSize: 13, color: '#8a8a99', lineHeight: 1.5 }}>
              {pt
                ? 'Ninguém. Se você cuida de uma criança, de alguém idoso ou de quem não usa celular, cadastre — a conta de água, a lista de itens e o plano passam a contar essa pessoa.'
                : 'Nobody. If you care for a child, an older person or someone without a phone, add them — the water maths, the supplies list and the plan will all count them.'}
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <p style={{ fontSize: 13, color: '#22c55e', margin: 0 }}>
                {pt
                  ? `Você conta como ${dependentes.length + 1} pessoas na casa: você + ${dependentes.length}.`
                  : `You count as ${dependentes.length + 1} people in the household: you + ${dependentes.length}.`}
              </p>
              {dependentes.map(d => (
                <div key={d.id} style={{ padding: '10px 12px', background: '#0f0f17', border: '1px solid #252535', borderRadius: 10 }}>
                  <strong style={{ fontSize: 14 }}>{d.name}</strong>
                  {d.relationship && <span style={{ fontSize: 12, color: '#8a8a99' }}> · {d.relationship}</span>}
                  {d.care_notes && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#a1a1aa', lineHeight: 1.45 }}>{d.care_notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <a
            href="/family/cadastro"
            style={{ display: 'inline-block', marginTop: 10, fontSize: 13, color: '#22c55e', textDecoration: 'none' }}
          >
            {pt ? 'Gerenciar dependentes →' : 'Manage dependents →'}
          </a>
        </div>

        {/* Tipo sanguíneo */}
        <div style={S.section}>
          <h2 style={S.sectionTitle}>{t('card.bloodType')}</h2>
          <div style={S.bloodGrid}>
            {BLOOD_TYPES.map((bt) => (
              <button
                key={bt}
                type="button"
                style={ficha.blood_type === bt ? S.bloodActive : S.bloodBtn}
                onClick={() => update({ blood_type: ficha.blood_type === bt ? null : bt }, true)}
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
            onBlur={() => handleBlur()}
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
                onBlur={() => handleBlur()}
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
                onBlur={() => handleBlur()}
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'EO'
}

function decisionStyleLabel(value: Personalization['decision_style'], language: 'pt' | 'en') {
  const labels = {
    pt: { balanced: 'Equilibrado', concise: 'Conciso', detailed: 'Detalhado', checklist: 'Checklist' },
    en: { balanced: 'Balanced', concise: 'Concise', detailed: 'Detailed', checklist: 'Checklist' },
  }
  return labels[language][value]
}

function riskToleranceLabel(value: Personalization['risk_tolerance'], language: 'pt' | 'en') {
  const labels = {
    pt: { balanced: 'Equilibrada', conservative: 'Conservadora', flexible: 'Flexível' },
    en: { balanced: 'Balanced', conservative: 'Conservative', flexible: 'Flexible' },
  }
  return labels[language][value]
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
  /* D-130: a oferta do círculo. Uma faixa, não um popup — ela chega depois de
     a pessoa ter concluído o que veio fazer. */
  circleOffer: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    border: '1px solid rgba(34,197,94,0.3)',
    background: 'rgba(34,197,94,0.06)',
  },
  circleOfferPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 48,
    padding: '0 18px',
    borderRadius: 999,
    background: '#22c55e',
    color: '#06120b',
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
  },
  circleOfferGhost: {
    minHeight: 48,
    padding: '0 18px',
    borderRadius: 999,
    border: '1px solid #2a2a3a',
    background: 'transparent',
    color: '#a1a1aa',
    fontSize: 14,
    cursor: 'pointer',
  },
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
  saveBtn:     { fontSize: 13, fontWeight: 700, color: '#fff', background: AC, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' },
  errorBanner: { background: 'rgba(232,65,13,0.1)', border: `1px solid ${DNG}44`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: DNG, marginBottom: 16 },
  warnBanner:  { background: 'rgba(221,163,35,0.12)', border: '1px solid rgba(221,163,35,0.35)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#DDA323', marginBottom: 12, lineHeight: 1.45 },
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
  sectionHeaderRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 },
  sectionTitle:{ fontSize: 13, fontWeight: 700, color: TX, letterSpacing: 0.3, marginBottom: 14 },
  sectionHint: { fontSize: 11, color: MU, lineHeight: 1.45, marginTop: -8, maxWidth: 340 },
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
  fieldHelp:   { fontSize: 11, color: MU, lineHeight: 1.35 },
  fileInput:   { flex: 1, padding: '9px 10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 10, color: TX, fontSize: 12, fontFamily: 'inherit', outline: 'none' },
  avatarRow:   { display: 'grid', gridTemplateColumns: '72px 1fr', gap: 14, alignItems: 'center', marginBottom: 14 },
  avatarPreview: { width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'rgba(13,232,100,0.12)', border: `1px solid ${BD}`, color: AC, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800 },
  avatarImg:   { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
}
