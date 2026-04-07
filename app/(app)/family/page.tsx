'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const CONDITIONS = [
  'diabetes',
  'pressão alta',
  'medicação contínua',
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function FamilyPage() {
  const [members, setMembers]               = useState<FamilyMember[]>([])
  const [loading, setLoading]               = useState(true)
  const [modalOpen, setModalOpen]           = useState(false)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [form, setForm]                     = useState<MemberForm>(EMPTY_FORM)
  const [formError, setFormError]           = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isPending, startTransition]        = useTransition()

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/family-members')
      if (!res.ok) throw new Error('Erro ao carregar membros.')
      const data = await res.json()
      setMembers(data.members ?? [])
    } catch {
      // silently fail; user can retry
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(m: FamilyMember) {
    setForm({
      name:               m.name,
      age:                m.age,
      medical_conditions: m.medical_conditions,
      mobility_impaired:  m.mobility_impaired,
      is_infant:          m.is_infant,
    })
    setEditingId(m.id)
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setFormError(null)
  }

  // ── Form helpers ──────────────────────────────────────────────────────────

  function toggleCondition(cond: string) {
    setForm((f) => ({
      ...f,
      medical_conditions: f.medical_conditions.includes(cond)
        ? f.medical_conditions.filter((c) => c !== cond)
        : [...f.medical_conditions, cond],
    }))
  }

  function adjustAge(delta: number) {
    setForm((f) => {
      const current = f.age ?? 0
      const next = Math.max(0, Math.min(120, current + delta))
      return { ...f, age: next }
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function handleSave() {
    if (!form.name.trim()) {
      setFormError('Informe o nome do membro.')
      return
    }
    setFormError(null)

    startTransition(async () => {
      const url    = editingId ? `/api/family-members/${editingId}` : '/api/family-members'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               form.name.trim(),
          age:                form.age,
          medical_conditions: form.medical_conditions,
          mobility_impaired:  form.mobility_impaired,
          is_infant:          form.is_infant,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFormError(data.error ?? 'Erro ao salvar membro.')
        return
      }

      const data = await res.json()
      setMembers((prev) =>
        editingId
          ? prev.map((m) => (m.id === editingId ? data.member : m))
          : [...prev, data.member],
      )
      closeModal()
    })
  }

  // ── Delete ────────────────────────────────────────────────────────────────

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
        setMembers((prev) => prev.filter((m) => m.id !== id))
      }
      setConfirmDeleteId(null)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={s.page}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={s.header}>
          <div>
            <h1 style={s.pageTitle}>Família</h1>
            <p style={s.pageSub}>
              {loading ? '…' : `${members.length} membro${members.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button className="btn bp bsm" onClick={openAdd} disabled={isPending}>
            + Adicionar
          </button>
        </div>

        {/* ── Loading skeleton ─────────────────────────────────────────── */}
        {loading && (
          <div style={s.skeleton}>
            {[1, 2].map((i) => (
              <div key={i} style={s.skeletonCard} />
            ))}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!loading && members.length === 0 && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>👨‍👩‍👧‍👦</div>
            <p style={s.emptyTitle}>Nenhum membro ainda</p>
            <p style={s.emptySub}>Adicione os membros da sua família para personalizar seu plano de emergência.</p>
            <button className="btn bp" onClick={openAdd} style={{ marginTop: 8 }}>
              + Adicionar primeiro membro
            </button>
          </div>
        )}

        {/* ── Member cards ─────────────────────────────────────────────── */}
        {!loading && members.length > 0 && (
          <div style={s.list}>
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                onEdit={() => openEdit(m)}
                onDelete={() => requestDelete(m.id)}
                onConfirmDelete={() => handleDelete(m.id)}
                onCancelDelete={cancelDelete}
                confirmingDelete={confirmDeleteId === m.id}
                isPending={isPending}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── Bottom-sheet modal ──────────────────────────────────────────── */}
      {modalOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div style={s.modal}>

            {/* drag handle */}
            <div style={s.handle} />

            {/* modal header */}
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>
                {editingId ? 'Editar membro' : 'Adicionar membro'}
              </h2>
              <button style={s.closeBtn} onClick={closeModal} aria-label="Fechar">✕</button>
            </div>

            {/* form error */}
            {formError && (
              <div style={s.errorBox}>
                <span style={s.errorDot}>●</span>
                {formError}
              </div>
            )}

            {/* Name */}
            <div style={s.fieldGroup}>
              <label style={s.label}>Nome</label>
              <input
                className="input"
                type="text"
                placeholder="Nome do membro"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isPending}
                autoFocus
              />
            </div>

            {/* Age counter */}
            <div style={s.fieldGroup}>
              <label style={s.label}>Idade</label>
              <div style={s.ageRow}>
                <button
                  style={{ ...s.counterBtn, opacity: (form.age ?? 0) <= 0 ? 0.3 : 1 }}
                  onClick={() => adjustAge(-1)}
                  disabled={isPending || (form.age ?? 0) <= 0}
                >−</button>

                <span className="mono" style={s.ageVal}>
                  {form.age === null ? '—' : String(form.age).padStart(2, '0')}
                </span>

                <button
                  style={{ ...s.counterBtn, opacity: (form.age ?? 0) >= 120 ? 0.3 : 1 }}
                  onClick={() => adjustAge(1)}
                  disabled={isPending || (form.age ?? 0) >= 120}
                >+</button>

                {form.age !== null && (
                  <button
                    style={s.clearAge}
                    onClick={() => setForm((f) => ({ ...f, age: null }))}
                    disabled={isPending}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Medical conditions chips */}
            <div style={s.fieldGroup}>
              <label style={s.label}>Condições médicas</label>
              <div style={s.chipRow}>
                {CONDITIONS.map((cond) => {
                  const active = form.medical_conditions.includes(cond)
                  return (
                    <button
                      key={cond}
                      className={`chip${active ? ' on' : ''}`}
                      onClick={() => toggleCondition(cond)}
                      disabled={isPending}
                    >
                      {active && <span style={{ fontSize: 10 }}>✓</span>}
                      {cond}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Toggles row */}
            <div style={s.fieldGroup}>
              <label style={s.label}>Flags</label>
              <div style={s.toggleRow}>
                {/* Mobility toggle */}
                <button
                  className={`chip${form.mobility_impaired ? ' on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, mobility_impaired: !f.mobility_impaired }))}
                  disabled={isPending}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {form.mobility_impaired ? '✓ ' : ''}Mobilidade reduzida
                </button>

                {/* Infant toggle */}
                <button
                  className={`chip${form.is_infant ? ' on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, is_infant: !f.is_infant }))}
                  disabled={isPending}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {form.is_infant ? '✓ ' : ''}Bebê
                </button>
              </div>
            </div>

            {/* Save button */}
            <button
              className="btn bp bfull"
              onClick={handleSave}
              disabled={isPending}
              style={{ marginTop: 4, opacity: isPending ? 0.7 : 1 }}
            >
              {isPending
                ? 'Salvando…'
                : editingId ? 'Salvar alterações' : 'Adicionar membro'}
            </button>

          </div>
        </div>
      )}
    </>
  )
}

// ─── MemberCard ───────────────────────────────────────────────────────────────

type CardProps = {
  member: FamilyMember
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  confirmingDelete: boolean
  isPending: boolean
}

function MemberCard({
  member,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  confirmingDelete,
  isPending,
}: CardProps) {
  const { name, age, medical_conditions, mobility_impaired, is_infant } = member
  const hasBadges = is_infant || mobility_impaired || medical_conditions.length > 0

  return (
    <div className="card" style={s.memberCard}>
      {/* top row: name + age + actions */}
      <div style={s.cardTop}>
        <div style={s.cardIdentity}>
          <span style={s.memberName}>{name}</span>
          {age !== null && (
            <span className="mono" style={s.memberAge}>{age} anos</span>
          )}
        </div>

        <div style={s.cardActions}>
          {!confirmingDelete ? (
            <>
              <button className="btn bs bsm" onClick={onEdit} disabled={isPending} style={s.actionBtn}>
                Editar
              </button>
              <button className="btn br bsm" onClick={onDelete} disabled={isPending} style={s.actionBtn}>
                Remover
              </button>
            </>
          ) : (
            <>
              <button className="btn br bsm" onClick={onConfirmDelete} disabled={isPending} style={s.actionBtn}>
                {isPending ? '…' : 'Confirmar'}
              </button>
              <button className="btn bs bsm" onClick={onCancelDelete} disabled={isPending} style={s.actionBtn}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      {/* badges */}
      {hasBadges && (
        <div style={s.badgeRow}>
          {is_infant && (
            <span className="ebadge ebop">👶 Bebê</span>
          )}
          {mobility_impaired && (
            <span className="ebadge ebw">♿ Mobilidade</span>
          )}
          {medical_conditions.map((cond) => (
            <span key={cond} className="ebadge ebo">{cond}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  // page
  page: {
    minHeight: '100dvh',
    background: 'var(--bg)',
    padding: '24px 16px 100px',
    maxWidth: 600,
    margin: '0 auto',
  },

  // header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--tx)',
    lineHeight: 1.2,
  },
  pageSub: {
    fontSize: 12,
    color: 'var(--mu)',
    marginTop: 2,
  },

  // skeleton
  skeleton: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  skeletonCard: {
    height: 80,
    background: 'var(--sf)',
    border: '1px solid var(--bd)',
    borderRadius: 16,
    opacity: 0.5,
    animation: 'blink 1.4s ease-in-out infinite',
  },

  // empty state
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '60px 24px',
    textAlign: 'center' as const,
  },
  emptyIcon: {
    fontSize: 48,
    lineHeight: 1,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--tx)',
  },
  emptySub: {
    fontSize: 13,
    color: 'var(--mu)',
    maxWidth: 280,
    lineHeight: 1.5,
  },

  // list
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },

  // member card
  memberCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardIdentity: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    minWidth: 0,
  },
  memberName: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--tx)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  memberAge: {
    fontSize: 12,
    color: 'var(--mu)',
    flexShrink: 0,
  },
  cardActions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  actionBtn: {
    minWidth: 'auto',
    padding: '7px 12px',
    fontSize: 12,
  },

  // badges
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },

  // modal
  modal: {
    background: 'var(--sf)',
    borderTop: '1px solid var(--bd)',
    borderRadius: '16px 16px 0 0',
    padding: '16px 20px 32px',
    width: '100%',
    maxWidth: 600,
    maxHeight: '90dvh',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'var(--bd)',
    margin: '0 auto',
    flexShrink: 0,
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--tx)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--mu)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    fontFamily: 'inherit',
  },

  // form
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
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    color: 'var(--mu)',
  },

  // age counter
  ageRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  counterBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid var(--bd)',
    background: 'var(--sf2)',
    color: 'var(--tx)',
    fontSize: 20,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
  },
  ageVal: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--ac)',
    minWidth: 44,
    textAlign: 'center' as const,
    lineHeight: 1,
  },
  clearAge: {
    background: 'none',
    border: 'none',
    color: 'var(--mu)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    fontFamily: 'inherit',
    textDecoration: 'underline',
    marginLeft: 4,
  },

  // chips
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },

  // toggles
  toggleRow: {
    display: 'flex',
    gap: 8,
  },
}
