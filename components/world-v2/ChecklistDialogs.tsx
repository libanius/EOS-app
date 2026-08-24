'use client'

/**
 * Diálogos do checklist — editar e confirmar exclusão.
 *
 * Moram aqui desde PREP-T07 (D-164), quando o checklist saiu da Visão para
 * `/preparedness/o-que-falta`. **Não são código novo**: são exatamente os de
 * D-121 (PREP-T02), movidos junto com a lista que eles editam.
 *
 * Ter percebido isso importou: extrair a lista e deixar os diálogos para trás
 * teria removido em silêncio duas coisas entregues — a edição de item e a
 * confirmação antes de excluir. Mudança de arquitetura não pode custar
 * funcionalidade sem que alguém tenha decidido isso.
 */

import { useState } from 'react'

export type ChecklistTier = 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'

export interface ChecklistItem {
  id: string
  kit_type: string
  canonical_key: string
  item_name: string
  tier: ChecklistTier
  quantity: number
  unit: string | null
  acquired: boolean
  /** D-171. Derivado de `acquired` quando a migração ainda não rodou. */
  status?: 'proposed' | 'needed' | 'met' | 'not_applicable'
  /**
   * Campos AUTORITATIVOS do modelo novo (D-176). Vêm separados porque
   * `kit_type` só cabe uma dimensão — e adivinhar qual delas é o que o cutover
   * veio encerrar.
   */
  kit_slug?: string | null
  provenance?: 'MANUAL' | 'PILOT' | 'EDU' | 'SIMULATION' | 'OFFICIAL_ALERT' | 'PLAN_GAP'
}

const CHECKLIST_TIERS: ChecklistTier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']
const TIER_COLOR: Record<ChecklistTier, string> = {
  ESSENTIAL: '#ef4444',
  MODERATE: '#f59e0b',
  EXCELLENT: '#22c55e',
}

export function ChecklistEditDialog({
  item,
  language,
  onCancel,
  onSave,
}: {
  item: ChecklistItem
  language: 'pt' | 'en'
  onCancel: () => void
  onSave: (patch: Pick<ChecklistItem, 'item_name' | 'quantity' | 'unit' | 'tier'>) => void
}) {
  const [name, setName] = useState(item.item_name)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unit, setUnit] = useState(item.unit ?? '')
  const [tier, setTier] = useState<ChecklistTier>(item.tier)
  const canSave = name.trim().length > 0

  return (
    <div style={S.modalBackdrop} role="dialog" aria-modal="true" aria-label={language === 'pt' ? 'Editar item' : 'Edit item'}>
      <div style={S.modal}>
        <h3 style={S.modalTitle}>{language === 'pt' ? 'Editar item' : 'Edit item'}</h3>
        <label style={S.fieldLabel}>
          {language === 'pt' ? 'Nome' : 'Name'}
          <input value={name} onChange={event => setName(event.target.value)} style={S.textInput} autoFocus />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={S.fieldLabel}>
            {language === 'pt' ? 'Quantidade' : 'Quantity'}
            <input value={quantity} inputMode="decimal" onChange={event => setQuantity(event.target.value)} style={S.textInput} />
          </label>
          <label style={S.fieldLabel}>
            {language === 'pt' ? 'Unidade' : 'Unit'}
            <input value={unit} onChange={event => setUnit(event.target.value)} style={S.textInput} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CHECKLIST_TIERS.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setTier(value)}
              style={{
                ...S.tierButton,
                color: tier === value ? '#0a0a0f' : TIER_COLOR[value],
                background: tier === value ? TIER_COLOR[value] : 'transparent',
                borderColor: TIER_COLOR[value],
              }}
            >
              {value}
            </button>
          ))}
        </div>
        <div style={S.modalActions}>
          <button type="button" onClick={onCancel} style={S.secondaryButton}>{language === 'pt' ? 'Cancelar' : 'Cancel'}</button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave({
              item_name: name.trim(),
              quantity: Math.max(0, Number(quantity) || 0),
              unit: unit.trim() || null,
              tier,
            })}
            style={{ ...S.primaryButton, opacity: canSave ? 1 : 0.5 }}
          >
            {language === 'pt' ? 'Salvar' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirm,
  cancel,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirm: string
  cancel: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div style={S.modalBackdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div style={S.modal}>
        <h3 style={S.modalTitle}>{title}</h3>
        <p style={S.modalBody}>{body}</p>
        <div style={S.modalActions}>
          <button type="button" onClick={onCancel} style={S.secondaryButton}>{cancel}</button>
          <button
            type="button"
            onClick={onConfirm}
            style={{ ...S.primaryButton, background: destructive ? 'var(--ac3)' : 'var(--ac)' }}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>
  )
}


const S: Record<string, React.CSSProperties> = {
  modalBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 500,
    background: 'rgba(0,0,0,0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modal: {
    width: 'min(420px, 100%)',
    borderRadius: 16,
    border: '1px solid var(--bd)',
    background: 'var(--sf)',
    padding: 16,
    boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
  },
  modalTitle: {
    margin: '0 0 14px',
    color: 'var(--tx)',
    fontSize: 20,
    fontWeight: 700,
  },
  modalBody: {
    margin: '0 0 16px',
    color: 'var(--mu)',
    fontSize: 14,
    lineHeight: 1.5,
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    color: 'var(--mu)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: 12,
  },
  textInput: {
    width: '100%',
    border: '1px solid var(--bd)',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.18)',
    color: 'var(--tx)',
    padding: '10px 12px',
    fontSize: 15,
    outline: 'none',
  },
  tierButton: {
    border: '1px solid var(--bd)',
    borderRadius: 999,
    padding: '7px 10px',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.8px',
    cursor: 'pointer',
  },
  primaryButton: {
    border: 'none',
    borderRadius: 10,
    background: 'var(--ac)',
    color: '#0a0a0f',
    padding: '10px 14px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid var(--bd)',
    borderRadius: 10,
    background: 'transparent',
    color: 'var(--tx)',
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
}
