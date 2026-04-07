'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import NumericStepper from '@/components/NumericStepper'

type FamilyMember = {
  id: string
  profile_id: string
  name: string
  age: number | null
  medical_conditions: string[]
  mobility_impaired: boolean
  is_infant: boolean
  created_at: string
}

type MemberForm = {
  name: string
  age: number | null
  medical_conditions: string[]
  mobility_impaired: boolean
  is_infant: boolean
}

type CardProps = {
  member: FamilyMember
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  confirmingDelete: boolean
  isPending: boolean
}

type GaugeProps = {
  label: string
  value: number
  tone?: 'green' | 'orange' | 'red'
}

const CONDITIONS = [
  'diabetes',
  'pressao alta',
  'medicacao continua',
  'cadeira de rodas',
  'outros',
] as const

const EMPTY_FORM: MemberForm = {
  name: '',
  age: null,
  medical_conditions: [],
  mobility_impaired: false,
  is_infant: false,
}

const TOKENS = {
  backgroundPrimary: '#040404',
  backgroundSecondary: '#0A0A0A',
  glass: 'rgba(255, 255, 255, 0.05)',
  neonGreen: '#0DE864',
  mutedGreen: '#68C38E',
  darkGreen: '#1A5534',
  danger: '#E8410D',
  warning: '#E8A30D',
  safe: '#0DE864',
  textHigh: '#D7DAD9',
  textMedium: '#A3A4A4',
  textLow: '#727272',
  border: 'rgba(255, 255, 255, 0.1)',
  glow: '0px 0px 15px rgba(13, 232, 100, 0.4)',
  displayFont: "'DM Mono', 'Geist Mono', monospace",
  bodyFont: "'DM Sans', 'Geist Sans', sans-serif",
  dataFont: "'DM Mono', 'Geist Mono', monospace",
} as const

export default function FamilyPage() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/family-members')
      if (!res.ok) throw new Error('Erro ao carregar membros.')
      const data = await res.json()
      setMembers(data.members ?? [])
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(member: FamilyMember) {
    setForm({
      name: member.name,
      age: member.age,
      medical_conditions: member.medical_conditions,
      mobility_impaired: member.mobility_impaired,
      is_infant: member.is_infant,
    })
    setEditingId(member.id)
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setFormError(null)
  }

  function toggleCondition(condition: string) {
    setForm((current) => ({
      ...current,
      medical_conditions: current.medical_conditions.includes(condition)
        ? current.medical_conditions.filter((item) => item !== condition)
        : [...current.medical_conditions, condition],
    }))
  }

  function handleSave() {
    if (!form.name.trim()) {
      setFormError('Informe o nome do membro.')
      return
    }

    setFormError(null)

    startTransition(async () => {
      const url = editingId ? `/api/family-members/${editingId}` : '/api/family-members'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          age: form.age,
          medical_conditions: form.medical_conditions,
          mobility_impaired: form.mobility_impaired,
          is_infant: form.is_infant,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFormError(data.error ?? 'Erro ao salvar membro.')
        return
      }

      const data = await res.json()
      setMembers((current) =>
        editingId
          ? current.map((member) => (member.id === editingId ? data.member : member))
          : [...current, data.member],
      )
      closeModal()
    })
  }

  function requestDelete(id: string) {
    setConfirmDeleteId(id)
  }

  function cancelDelete() {
    setConfirmDeleteId(null)
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/family-members/${id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setMembers((current) => current.filter((member) => member.id !== id))
      }
      setConfirmDeleteId(null)
    })
  }

  const totalMembers = members.length
  const vulnerableMembers = members.filter(
    (member) => member.mobility_impaired || member.is_infant || member.medical_conditions.length > 0,
  ).length
  const profiledMembers = members.filter(
    (member) => member.age !== null || member.medical_conditions.length > 0,
  ).length
  const riskSignals = members.reduce((total, member) => {
    return total + member.medical_conditions.length + (member.mobility_impaired ? 1 : 0) + (member.is_infant ? 1 : 0)
  }, 0)
  const coverageScore = totalMembers === 0 ? 0 : Math.round((profiledMembers / totalMembers) * 100)
  const activeAlerts = vulnerableMembers
  const safeMembers = Math.max(totalMembers - vulnerableMembers, 0)

  return (
    <>
      <div style={s.page}>
        <div style={s.bgGlowPrimary} />
        <div style={s.bgGlowSecondary} />

        <section style={s.topBar}>
          <button type="button" style={s.iconFrame} aria-label="Abrir menu">
            <span style={s.menuGlyph} />
          </button>

          <div style={s.connectionPill}>
            <span style={s.liveDot} />
            <span style={s.connectionText}>CONNECTED</span>
            <span style={s.connectionDivider} />
            <span style={s.connectionMeta}>Family Grid</span>
          </div>

          <button type="button" style={s.iconFrame} aria-label="Notificacoes">
            <span style={s.bellGlyph}>⌁</span>
            <span style={s.notificationDot} />
          </button>
        </section>

        <section style={s.hero}>
          <span style={s.eyebrow}>Family Management</span>
          <h1 style={s.heroTitle}>FAMILY VAULT</h1>
          <p style={s.heroSubtitle}>Seu nucleo familiar esta organizado em um painel de monitoramento continuo.</p>
        </section>

        <section style={s.heroGrid}>
          <div style={s.metricPanel}>
            <div style={s.metricHeader}>
              <div>
                <span style={s.metricLabel}>Security Score</span>
                <p style={s.metricCaption}>Cobertura do cadastro e sinais de atencao consolidados.</p>
              </div>
              <button type="button" style={s.primaryAction} onClick={openAdd} disabled={isPending}>
                + Add Member
              </button>
            </div>

            <div style={s.metricBody}>
              <div>
                <div style={s.scoreRow}>
                  <span style={s.metricValue}>{String(coverageScore).padStart(2, '0')}</span>
                  <span style={s.metricArrow}>↗</span>
                </div>
                <p style={s.metricFootnote}>Prontidao do cadastro familiar</p>
              </div>

              <div style={s.gauges}>
                <Gauge label="Members" value={totalMembers} tone="green" />
                <Gauge label="Alerts" value={activeAlerts} tone={activeAlerts > 0 ? 'orange' : 'green'} />
                <Gauge label="Signals" value={riskSignals} tone={riskSignals > 2 ? 'red' : 'green'} />
              </div>
            </div>
          </div>

          <div style={s.sideStack}>
            <div style={s.glassCard}>
              <span style={s.panelLabel}>Live Summary</span>
              <div style={s.summaryGrid}>
                <StatTile label="Active Profiles" value={totalMembers} helper="membros cadastrados" />
                <StatTile label="Protected" value={safeMembers} helper="sem flags criticas" />
                <StatTile label="Priority Care" value={vulnerableMembers} helper="requerem atencao" />
              </div>
            </div>

            <div style={s.glassCard}>
              <div style={s.feedHeader}>
                <span style={s.panelLabel}>Threat Feed</span>
                <span style={s.feedRange}>24H</span>
              </div>

              <div style={s.feedList}>
                <FeedItem
                  label={totalMembers === 0 ? 'Nenhum perfil registrado' : `${totalMembers} perfis ativos`}
                  severity={totalMembers === 0 ? 'Standby' : 'Safe'}
                  time="NOW"
                  tone="green"
                />
                <FeedItem
                  label={
                    vulnerableMembers === 0
                      ? 'Nenhum membro prioritario'
                      : `${vulnerableMembers} membro${vulnerableMembers > 1 ? 's' : ''} com cuidado especial`
                  }
                  severity={vulnerableMembers === 0 ? 'Nominal' : 'Monitor'}
                  time="SYNC"
                  tone={vulnerableMembers === 0 ? 'green' : 'orange'}
                />
                <FeedItem
                  label={
                    riskSignals === 0
                      ? 'Sem sinais adicionais'
                      : `${riskSignals} sinal${riskSignals > 1 ? 's' : ''} medico${riskSignals > 1 ? 's' : ''}`
                  }
                  severity={riskSignals > 2 ? 'High' : 'Medium'}
                  time="SCAN"
                  tone={riskSignals > 2 ? 'red' : 'orange'}
                />
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <section style={s.cardGrid}>
            {[1, 2, 3].map((item) => (
              <div key={item} style={s.skeletonCard} />
            ))}
          </section>
        )}

        {!loading && totalMembers === 0 && (
          <section style={s.emptyState}>
            <div style={s.emptyCore}>
              <div style={s.emptyRing}>
                <span style={s.emptyRingText}>00</span>
              </div>
              <span style={s.panelLabel}>No Members Registered</span>
              <h2 style={s.emptyTitle}>Inicie a malha de seguranca da familia</h2>
              <p style={s.emptyCopy}>
                Adicione cada pessoa relevante para montar um plano de emergencia com prioridades reais.
              </p>
              <button type="button" style={s.scanButton} onClick={openAdd} disabled={isPending}>
                SCAN + ADD
              </button>
            </div>
          </section>
        )}

        {!loading && totalMembers > 0 && (
          <section style={s.cardGrid}>
            {members.map((member, index) => (
              <MemberCard
                key={member.id}
                member={member}
                onEdit={() => openEdit(member)}
                onDelete={() => requestDelete(member.id)}
                onConfirmDelete={() => handleDelete(member.id)}
                onCancelDelete={cancelDelete}
                confirmingDelete={confirmDeleteId === member.id}
                isPending={isPending}
                styleDelay={index}
              />
            ))}
          </section>
        )}
      </div>

      {modalOpen && (
        <div className="overlay" onClick={(event) => event.target === event.currentTarget && closeModal()}>
          <div style={s.modal}>
            <div style={s.modalAccent} />
            <div style={s.modalHeader}>
              <div>
                <span style={s.panelLabel}>{editingId ? 'Edit Profile' : 'New Profile'}</span>
                <h2 style={s.modalTitle}>{editingId ? 'UPDATE MEMBER NODE' : 'CREATE MEMBER NODE'}</h2>
              </div>
              <button type="button" style={s.closeButton} onClick={closeModal} aria-label="Fechar">
                ✕
              </button>
            </div>

            {formError && (
              <div style={s.errorBox}>
                <span style={s.errorMarker} />
                <span>{formError}</span>
              </div>
            )}

            <div style={s.formGrid}>
              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Nome</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Nome do membro"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={isPending}
                  autoFocus
                  style={s.input}
                />
              </div>

              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Idade</label>
                <NumericStepper
                  value={form.age ?? 0}
                  step={1}
                  min={0}
                  max={120}
                  decimals={0}
                  unit="anos"
                  size="md"
                  disabled={isPending}
                  onChange={(v) =>
                    setForm((current) => ({ ...current, age: v === 0 ? null : v }))
                  }
                />
                {form.age !== null && (
                  <button
                    type="button"
                    style={s.clearLink}
                    onClick={() => setForm((current) => ({ ...current, age: null }))}
                    disabled={isPending}
                  >
                    limpar idade
                  </button>
                )}
              </div>
            </div>

            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Condições médicas</label>
              <div style={s.chipGrid}>
                {CONDITIONS.map((condition) => {
                  const active = form.medical_conditions.includes(condition)
                  return (
                    <button
                      key={condition}
                      type="button"
                      onClick={() => toggleCondition(condition)}
                      disabled={isPending}
                      style={active ? s.activeChip : s.chip}
                    >
                      {active ? '● ' : ''}
                      {condition}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={s.formGrid}>
              <button
                type="button"
                style={form.mobility_impaired ? s.toggleCardActive : s.toggleCard}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    mobility_impaired: !current.mobility_impaired,
                  }))
                }
                disabled={isPending}
              >
                <span style={s.toggleLabel}>Mobility</span>
                <strong style={s.toggleTitle}>Mobilidade reduzida</strong>
                <span style={s.toggleState}>{form.mobility_impaired ? 'ACTIVE' : 'INACTIVE'}</span>
              </button>

              <button
                type="button"
                style={form.is_infant ? s.toggleCardActive : s.toggleCard}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    is_infant: !current.is_infant,
                  }))
                }
                disabled={isPending}
              >
                <span style={s.toggleLabel}>Age Class</span>
                <strong style={s.toggleTitle}>Bebe</strong>
                <span style={s.toggleState}>{form.is_infant ? 'ACTIVE' : 'INACTIVE'}</span>
              </button>
            </div>

            <button type="button" style={s.scanButtonWide} onClick={handleSave} disabled={isPending}>
              {isPending ? 'SYNCING...' : editingId ? 'SAVE NODE' : 'REGISTER NODE'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function MemberCard({
  member,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  confirmingDelete,
  isPending,
  styleDelay,
}: CardProps & { styleDelay: number }) {
  const tags: Array<{ label: string; tone: 'green' | 'orange' | 'red' }> = []

  if (member.is_infant) tags.push({ label: 'Bebe', tone: 'orange' })
  if (member.mobility_impaired) tags.push({ label: 'Mobilidade', tone: 'red' })
  for (const condition of member.medical_conditions) {
    tags.push({ label: condition, tone: 'orange' })
  }

  const alertLevel = tags.length === 0 ? 'STABLE' : tags.length > 2 ? 'HIGH WATCH' : 'MONITOR'
  const alertTone = tags.length === 0 ? TOKENS.safe : tags.length > 2 ? TOKENS.danger : TOKENS.warning

  return (
    <article style={{ ...s.memberCard, animationDelay: `${styleDelay * 90}ms` }}>
      <div style={s.memberCardGlow} />

      <div style={s.memberHead}>
        <div>
          <span style={s.memberLabel}>Member Node</span>
          <h3 style={s.memberName}>{member.name}</h3>
        </div>
        <span style={{ ...s.levelPill, color: alertTone, borderColor: `${alertTone}44` }}>{alertLevel}</span>
      </div>

      <div style={s.memberMetrics}>
        <div style={s.metricBlock}>
          <span style={s.metricBlockLabel}>AGE</span>
          <span style={s.metricBlockValue}>{member.age === null ? '--' : String(member.age).padStart(2, '0')}</span>
        </div>
        <div style={s.metricBlock}>
          <span style={s.metricBlockLabel}>CONDITIONS</span>
          <span style={s.metricBlockValue}>{String(member.medical_conditions.length).padStart(2, '0')}</span>
        </div>
        <div style={s.metricBlock}>
          <span style={s.metricBlockLabel}>FLAGS</span>
          <span style={s.metricBlockValue}>
            {String(Number(member.mobility_impaired) + Number(member.is_infant)).padStart(2, '0')}
          </span>
        </div>
      </div>

      <div style={s.tagWrap}>
        {tags.length === 0 ? (
          <span style={s.safeTag}>sem alertas adicionais</span>
        ) : (
          tags.map((tag) => (
            <span key={`${member.id}-${tag.label}`} style={tag.tone === 'red' ? s.redTag : s.orangeTag}>
              {tag.label}
            </span>
          ))
        )}
      </div>

      <div style={s.cardActions}>
        {!confirmingDelete ? (
          <>
            <button type="button" style={s.secondaryButton} onClick={onEdit} disabled={isPending}>
              Editar
            </button>
            <button type="button" style={s.dangerButton} onClick={onDelete} disabled={isPending}>
              Remover
            </button>
          </>
        ) : (
          <>
            <button type="button" style={s.dangerButton} onClick={onConfirmDelete} disabled={isPending}>
              {isPending ? '...' : 'Confirmar'}
            </button>
            <button type="button" style={s.secondaryButton} onClick={onCancelDelete} disabled={isPending}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </article>
  )
}

function Gauge({ label, value, tone = 'green' }: GaugeProps) {
  const color = tone === 'red' ? TOKENS.danger : tone === 'orange' ? TOKENS.warning : TOKENS.neonGreen

  return (
    <div style={s.gaugeCard}>
      <div style={{ ...s.gaugeRing, borderColor: `${color}40`, boxShadow: `inset 0 0 0 1px ${color}22` }}>
        <span style={{ ...s.gaugeValue, color }}>{String(value).padStart(2, '0')}</span>
      </div>
      <span style={s.gaugeLabel}>{label}</span>
    </div>
  )
}

function StatTile({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div style={s.statTile}>
      <span style={s.statLabel}>{label}</span>
      <strong style={s.statValue}>{String(value).padStart(2, '0')}</strong>
      <span style={s.statHelper}>{helper}</span>
    </div>
  )
}

function FeedItem({
  label,
  severity,
  time,
  tone,
}: {
  label: string
  severity: string
  time: string
  tone: 'green' | 'orange' | 'red'
}) {
  const color = tone === 'red' ? TOKENS.danger : tone === 'orange' ? TOKENS.warning : TOKENS.neonGreen

  return (
    <div style={s.feedItem}>
      <span style={{ ...s.feedDot, background: color, boxShadow: `0 0 12px ${color}99` }} />
      <div style={s.feedContent}>
        <strong style={s.feedTitle}>{label}</strong>
        <span style={s.feedMeta}>
          {severity} / {time}
        </span>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    position: 'relative',
    minHeight: '100dvh',
    overflow: 'hidden',
    background:
      'radial-gradient(circle at top left, rgba(13, 232, 100, 0.12), transparent 28%), radial-gradient(circle at top right, rgba(104, 195, 142, 0.12), transparent 24%), linear-gradient(180deg, #040404 0%, #0A0A0A 100%)',
    padding: '22px 16px 120px',
    maxWidth: 760,
    margin: '0 auto',
    fontFamily: TOKENS.bodyFont,
  },
  bgGlowPrimary: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: '50%',
    background: 'rgba(13, 232, 100, 0.18)',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  bgGlowSecondary: {
    position: 'absolute',
    left: -120,
    top: 240,
    width: 220,
    height: 220,
    borderRadius: '50%',
    background: 'rgba(104, 195, 142, 0.12)',
    filter: 'blur(90px)',
    pointerEvents: 'none',
  },
  topBar: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: '48px minmax(0, 1fr) 48px',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  iconFrame: {
    width: 48,
    height: 48,
    borderRadius: 16,
    border: `1px solid ${TOKENS.border}`,
    background: TOKENS.glass,
    backdropFilter: 'blur(20px)',
    color: TOKENS.textHigh,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  menuGlyph: {
    width: 18,
    height: 2,
    background: TOKENS.textHigh,
    boxShadow: `0 6px 0 ${TOKENS.textHigh}, 0 -6px 0 ${TOKENS.textHigh}`,
  },
  bellGlyph: {
    fontSize: 18,
    lineHeight: 1,
    fontFamily: TOKENS.displayFont,
  },
  notificationDot: {
    position: 'absolute',
    top: 13,
    right: 13,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: TOKENS.danger,
    boxShadow: `0 0 12px ${TOKENS.danger}`,
  },
  connectionPill: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 999,
    border: `1px solid ${TOKENS.border}`,
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(20px)',
    color: TOKENS.textMedium,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: TOKENS.neonGreen,
    boxShadow: TOKENS.glow,
    flexShrink: 0,
  },
  connectionText: {
    color: TOKENS.textHigh,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  connectionDivider: {
    width: 1,
    height: 12,
    background: TOKENS.border,
  },
  connectionMeta: {
    fontSize: 11,
    color: TOKENS.textLow,
  },
  hero: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: TOKENS.mutedGreen,
    fontWeight: 700,
  },
  heroTitle: {
    fontFamily: TOKENS.displayFont,
    fontSize: 'clamp(2.2rem, 8vw, 3.5rem)',
    lineHeight: 0.94,
    letterSpacing: 3,
    color: TOKENS.textHigh,
    textTransform: 'uppercase',
    textShadow: '0 0 24px rgba(255,255,255,0.05)',
  },
  heroSubtitle: {
    maxWidth: 520,
    fontSize: 15,
    lineHeight: 1.6,
    color: TOKENS.neonGreen,
  },
  heroGrid: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
    marginBottom: 18,
  },
  metricPanel: {
    borderRadius: 28,
    padding: 22,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))',
    border: `1px solid ${TOKENS.border}`,
    backdropFilter: 'blur(20px)',
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), ${TOKENS.glow}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  metricLabel: {
    display: 'inline-block',
    marginBottom: 6,
    color: TOKENS.textMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  metricCaption: {
    fontSize: 13,
    lineHeight: 1.5,
    color: TOKENS.textLow,
    maxWidth: 280,
  },
  primaryAction: {
    border: 'none',
    clipPath: 'polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)',
    background: TOKENS.neonGreen,
    color: TOKENS.backgroundPrimary,
    padding: '13px 20px',
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    minWidth: 128,
    boxShadow: TOKENS.glow,
  },
  metricBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 18,
    alignItems: 'end',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  metricValue: {
    fontFamily: TOKENS.dataFont,
    fontSize: 'clamp(4rem, 16vw, 6.4rem)',
    lineHeight: 0.85,
    color: TOKENS.textHigh,
  },
  metricArrow: {
    marginTop: 16,
    fontSize: 28,
    lineHeight: 1,
    color: TOKENS.neonGreen,
    textShadow: TOKENS.glow,
  },
  metricFootnote: {
    marginTop: 10,
    color: TOKENS.textMedium,
    fontSize: 13,
  },
  gauges: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  gaugeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    minWidth: 74,
  },
  gaugeRing: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '1px solid',
    background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 60%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeValue: {
    fontFamily: TOKENS.dataFont,
    fontSize: 20,
    fontWeight: 700,
  },
  gaugeLabel: {
    color: TOKENS.textMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  sideStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  glassCard: {
    borderRadius: 24,
    padding: 18,
    background: TOKENS.glass,
    border: `1px solid ${TOKENS.border}`,
    backdropFilter: 'blur(20px)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  panelLabel: {
    display: 'inline-block',
    marginBottom: 12,
    color: TOKENS.textMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 10,
  },
  statTile: {
    borderRadius: 18,
    padding: 12,
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${TOKENS.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  statLabel: {
    color: TOKENS.textLow,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  statValue: {
    color: TOKENS.textHigh,
    fontFamily: TOKENS.dataFont,
    fontSize: 24,
    lineHeight: 1,
  },
  statHelper: {
    color: TOKENS.textMedium,
    fontSize: 11,
    lineHeight: 1.4,
  },
  feedHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feedRange: {
    color: TOKENS.neonGreen,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  feedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  feedItem: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
  feedDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginTop: 7,
    flexShrink: 0,
  },
  feedContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  feedTitle: {
    color: TOKENS.textHigh,
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 600,
  },
  feedMeta: {
    color: TOKENS.textLow,
    fontFamily: TOKENS.dataFont,
    fontSize: 11,
    letterSpacing: 0.7,
  },
  cardGrid: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 14,
  },
  skeletonCard: {
    minHeight: 220,
    borderRadius: 24,
    background: 'linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
    border: `1px solid ${TOKENS.border}`,
    animation: 'blink 1.4s ease-in-out infinite',
  },
  emptyState: {
    position: 'relative',
    zIndex: 1,
    borderRadius: 28,
    padding: '36px 24px',
    border: `1px solid ${TOKENS.border}`,
    background: TOKENS.glass,
    backdropFilter: 'blur(20px)',
  },
  emptyCore: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 12,
  },
  emptyRing: {
    width: 150,
    height: 150,
    borderRadius: '50%',
    border: `1px solid rgba(13, 232, 100, 0.4)`,
    boxShadow: `inset 0 0 0 16px rgba(13, 232, 100, 0.04), ${TOKENS.glow}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyRingText: {
    fontFamily: TOKENS.dataFont,
    fontSize: 48,
    color: TOKENS.neonGreen,
    lineHeight: 1,
  },
  emptyTitle: {
    color: TOKENS.textHigh,
    fontFamily: TOKENS.displayFont,
    fontSize: 28,
    letterSpacing: 1.8,
    lineHeight: 1,
    textTransform: 'uppercase',
  },
  emptyCopy: {
    maxWidth: 420,
    color: TOKENS.textMedium,
    fontSize: 14,
    lineHeight: 1.6,
  },
  scanButton: {
    marginTop: 6,
    border: 'none',
    clipPath: 'polygon(8% 0%, 100% 0%, 92% 100%, 0% 100%)',
    background: TOKENS.neonGreen,
    color: TOKENS.backgroundPrimary,
    padding: '15px 28px',
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    boxShadow: TOKENS.glow,
  },
  memberCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 26,
    padding: 18,
    border: `1px solid ${TOKENS.border}`,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))',
    backdropFilter: 'blur(20px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    animation: 'fadeUp 0.45s ease both',
  },
  memberCardGlow: {
    position: 'absolute',
    inset: 'auto -40px -60px auto',
    width: 140,
    height: 140,
    borderRadius: '50%',
    background: 'rgba(13, 232, 100, 0.08)',
    filter: 'blur(42px)',
    pointerEvents: 'none',
  },
  memberHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  memberLabel: {
    color: TOKENS.textLow,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  memberName: {
    marginTop: 6,
    color: TOKENS.textHigh,
    fontSize: 24,
    lineHeight: 1,
    fontFamily: TOKENS.displayFont,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    wordBreak: 'break-word',
  },
  levelPill: {
    flexShrink: 0,
    border: '1px solid',
    padding: '8px 10px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    background: 'rgba(255,255,255,0.03)',
  },
  memberMetrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
  },
  metricBlock: {
    borderRadius: 18,
    padding: 12,
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${TOKENS.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  metricBlockLabel: {
    color: TOKENS.textLow,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  metricBlockValue: {
    color: TOKENS.neonGreen,
    fontSize: 22,
    lineHeight: 1,
    fontFamily: TOKENS.dataFont,
  },
  tagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  safeTag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 999,
    background: 'rgba(13, 232, 100, 0.08)',
    border: '1px solid rgba(13, 232, 100, 0.22)',
    color: TOKENS.neonGreen,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 700,
  },
  orangeTag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 999,
    background: 'rgba(232, 163, 13, 0.08)',
    border: '1px solid rgba(232, 163, 13, 0.24)',
    color: TOKENS.warning,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 700,
  },
  redTag: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 999,
    background: 'rgba(232, 65, 13, 0.08)',
    border: '1px solid rgba(232, 65, 13, 0.24)',
    color: TOKENS.danger,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 700,
  },
  cardActions: {
    display: 'flex',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    border: `1px solid ${TOKENS.border}`,
    background: 'rgba(255,255,255,0.04)',
    color: TOKENS.textHigh,
    fontWeight: 700,
    fontSize: 13,
  },
  dangerButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    border: '1px solid rgba(232, 65, 13, 0.24)',
    background: 'rgba(232, 65, 13, 0.08)',
    color: TOKENS.danger,
    fontWeight: 700,
    fontSize: 13,
  },
  modal: {
    position: 'relative',
    width: '100%',
    maxWidth: 760,
    maxHeight: '92dvh',
    overflowY: 'auto',
    borderRadius: '28px 28px 0 0',
    padding: '24px 20px 32px',
    background: 'linear-gradient(180deg, #0A0A0A 0%, #040404 100%)',
    border: `1px solid ${TOKENS.border}`,
    boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  modalAccent: {
    width: 84,
    height: 5,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.14)',
    alignSelf: 'center',
    marginBottom: 6,
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  modalTitle: {
    color: TOKENS.textHigh,
    fontFamily: TOKENS.displayFont,
    fontSize: 28,
    lineHeight: 1,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    border: `1px solid ${TOKENS.border}`,
    background: 'rgba(255,255,255,0.04)',
    color: TOKENS.textHigh,
    fontSize: 16,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    padding: '14px 16px',
    background: 'rgba(232, 65, 13, 0.08)',
    border: '1px solid rgba(232, 65, 13, 0.25)',
    color: TOKENS.textHigh,
    fontSize: 13,
  },
  errorMarker: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: TOKENS.danger,
    boxShadow: `0 0 12px ${TOKENS.danger}`,
    flexShrink: 0,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  fieldLabel: {
    color: TOKENS.textMedium,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  input: {
    background: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.1)',
    color: TOKENS.textHigh,
    minHeight: 52,
  },
  agePanel: {
    display: 'grid',
    gridTemplateColumns: '48px minmax(0, 1fr) 48px',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    padding: 12,
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${TOKENS.border}`,
  },
  hudControl: {
    width: 48,
    height: 48,
    borderRadius: 16,
    border: `1px solid ${TOKENS.border}`,
    background: 'rgba(255,255,255,0.04)',
    color: TOKENS.textHigh,
    fontSize: 24,
    lineHeight: 1,
  },
  ageDisplay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  ageValue: {
    color: TOKENS.neonGreen,
    fontSize: 32,
    lineHeight: 1,
    fontFamily: TOKENS.dataFont,
  },
  ageLabel: {
    color: TOKENS.textLow,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  clearLink: {
    alignSelf: 'flex-start',
    border: 'none',
    background: 'transparent',
    color: TOKENS.textMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chipGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    padding: '10px 14px',
    borderRadius: 999,
    border: `1px solid ${TOKENS.border}`,
    background: 'rgba(255,255,255,0.04)',
    color: TOKENS.textMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: 700,
  },
  activeChip: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(13, 232, 100, 0.28)',
    background: 'rgba(13, 232, 100, 0.12)',
    color: TOKENS.neonGreen,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: 700,
    boxShadow: TOKENS.glow,
  },
  toggleCard: {
    minHeight: 118,
    borderRadius: 22,
    border: `1px solid ${TOKENS.border}`,
    background: 'rgba(255,255,255,0.03)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    color: TOKENS.textHigh,
  },
  toggleCardActive: {
    minHeight: 118,
    borderRadius: 22,
    border: '1px solid rgba(13, 232, 100, 0.24)',
    background: 'rgba(13, 232, 100, 0.08)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    color: TOKENS.textHigh,
    boxShadow: TOKENS.glow,
  },
  toggleLabel: {
    color: TOKENS.textLow,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  toggleTitle: {
    fontSize: 16,
    lineHeight: 1.2,
  },
  toggleState: {
    marginTop: 'auto',
    color: TOKENS.neonGreen,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  scanButtonWide: {
    width: '100%',
    minHeight: 56,
    border: 'none',
    clipPath: 'polygon(4% 0%, 100% 0%, 96% 100%, 0% 100%)',
    background: TOKENS.neonGreen,
    color: TOKENS.backgroundPrimary,
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    boxShadow: TOKENS.glow,
  },
}
