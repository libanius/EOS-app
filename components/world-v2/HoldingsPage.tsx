'use client'

/**
 * "O que eu tenho" — o estoque da casa (PREP-T07 fase 2 / D-165).
 *
 * Os seis editores saíram da Visão. Eles são MANUTENÇÃO — cadência mensal, ou
 * depois de comprar — e ocupavam o meio de uma tela que precisa responder
 * "estamos prontos?" em segundos. A tarefa mais lenta ficava entre a pessoa e
 * a mais urgente.
 *
 * ── Sobre a localização ────────────────────────────────────────────────────
 *
 * O modelo já sabe representar lugar (`locations`, D-160), mas enquanto os
 * holdings não forem preenchidos existe UMA localização: a casa. Um filtro com
 * uma opção só é ruído ocupando a primeira dobra — ele aparece quando houver a
 * segunda, pela mesma regra do filtro de kits em "O que falta".
 *
 * ── Água em galão, banco em litro ─────────────────────────────────────────
 *
 * D-158: a conversão acontece na borda, aqui. `water_liters` continua guardando
 * litros até PREP-T04 renomear o campo.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { saveSnapshot, loadSnapshot } from '@/lib/sync'
import NumericStepper from '@/components/NumericStepper'
import { useLanguage } from '@/lib/i18n'
import {
  formatGallons,
  gallonsToLiters,
  litersToGallons,
  GALLON_SHORT,
  WATER_ADEQUATE_LITERS_PER_PERSON,
  WATER_CRITICAL_LITERS_PER_PERSON,
} from '@/lib/units'
import PreparednessNav from './PreparednessNav'

type Inventory = {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
  cash_amount: number
}


type ResourceState = 'critical' | 'high' | 'ok'

function getResourceState(
  value: number,
  threshold: number,
  criticalThreshold: number,
  membersCount: number,
  perPerson: boolean,
): ResourceState {
  const mc = Math.max(membersCount, 1)
  const effective = perPerson && membersCount > 0 ? value / mc : value
  if (effective < criticalThreshold) return 'critical'
  if (effective < threshold) return 'high'
  return 'ok'
}

// ─── ResourceCard ─────────────────────────────────────────────────────────────


type ResourceCardProps = {
  icon: string
  title: string
  value: number
  threshold: number           // per-person (or absolute) threshold for LOW
  criticalThreshold: number   // threshold for CRITICAL
  membersCount: number
  perPerson?: boolean         // divide by membersCount before comparing?
  optional?: boolean
  children: React.ReactNode
}

function ResourceCard({
  icon,
  title,
  value,
  threshold,
  criticalThreshold,
  membersCount,
  perPerson = false,
  optional = false,
  children,
}: ResourceCardProps) {
  const { t } = useLanguage()
  const state = getResourceState(
    value, threshold, criticalThreshold, membersCount, perPerson,
  )

  const border =
    state === 'critical' ? '1px solid rgba(255,107,107,0.4)' :
    state === 'high'     ? '1px solid rgba(255,179,71,0.4)'  :
                           '1px solid var(--bd)'

  const bg =
    state === 'critical' ? 'rgba(255,107,107,0.06)' :
    state === 'high'     ? 'rgba(255,179,71,0.04)'  :
                           'var(--sf)'

  return (
    <div style={{ ...S.card, border, background: bg }}>
      <div style={S.cardHeader}>
        <span style={S.cardIcon}>{icon}</span>
        <span style={S.cardTitle}>{title}</span>

        {state === 'critical' && (
          <span style={{ ...S.badge, ...S.badgeCritical }}>⚠ {t('inventory.critical')}</span>
        )}
        {state === 'high' && (
          <span style={{ ...S.badge, ...S.badgeHigh }}>▲ {t('inventory.low')}</span>
        )}
        {optional && state === 'ok' && (
          <span style={S.optionalTag}>{t('inventory.optional')}</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── ReadinessSummary ─────────────────────────────────────────────────────────


type ToggleRowProps = {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function ToggleRow({ label, description, value, onChange, disabled = false }: ToggleRowProps) {
  return (
    <div style={S.toggleRow}>
      <div style={S.toggleMeta}>
        <span style={S.toggleLabel}>{label}</span>
        <span style={S.toggleDesc}>{description}</span>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => !disabled && onChange(!value)}
        style={{
          ...S.toggle,
          ...(value ? S.toggleOn : S.toggleOff),
          ...(disabled ? S.toggleDisabled : {}),
        }}
        aria-label={label}
        disabled={disabled}
      >
        <span
          style={{
            ...S.toggleThumb,
            transform: value ? 'translateX(20px)' : 'translateX(2px)',
          }}
        />
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DEFAULT_INVENTORY: Inventory = {
  water_liters: 0,
  food_days: 0,
  fuel_liters: 0,
  battery_percent: 0,
  has_medical_kit: false,
  has_communication_device: false,
  cash_amount: 0,
}

export default function HoldingsPage() {
  const { language, t } = useLanguage()
  const [inv, setInv] = useState<Inventory>(DEFAULT_INVENTORY)
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setSaveError(null)
    const snap = loadSnapshot<{ inv: object; memberCount: number }>('inventory')
    if (snap) {
      if (snap.inv) setInv(prev => ({ ...prev, ...(snap.inv as typeof prev) }))
      if (snap.memberCount != null) setMemberCount(snap.memberCount)
    }
    try {
      const [invRes, hhRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/household'),
      ])
      let parsed: Record<string, unknown> | null = null
      if (invRes.ok) {
        const { inventory } = await invRes.json()
        parsed = inventory
        setInv({
          water_liters:             Number(inventory.water_liters)             || 0,
          food_days:                Number(inventory.food_days)                || 0,
          fuel_liters:              Number(inventory.fuel_liters)              || 0,
          battery_percent:          Number(inventory.battery_percent)          || 0,
          has_medical_kit:          Boolean(inventory.has_medical_kit),
          has_communication_device: Boolean(inventory.has_communication_device),
          cash_amount:              Number(inventory.cash_amount)              || 0,
        })
      }
      if (hhRes?.ok) {
        const h = await hhRes.json()
        if (h?.known) {
          setMemberCount(h.size)
          if (parsed) saveSnapshot('inventory', { inv: parsed, memberCount: h.size })
        }
      }
    } catch {
      setSaveError(t('inventory.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void loadData() }, [loadData])
  useRealtimeSync(['resource_inventory', 'family_members'], () => { void loadData() })

  const save = useCallback((data: Inventory) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        setSaveError(null)
        setSaved(false)
        try {
          const res = await fetch('/api/inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
          if (!res.ok) setSaveError(t('common.saveError'))
          else {
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }
        } catch {
          setSaveError(t('inventory.networkSaveError'))
        }
      })
    }, 600)
  }, [t])

  function update<K extends keyof Inventory>(key: K, value: Inventory[K]) {
    const next = { ...inv, [key]: value }
    setInv(next)
    save(next)
  }

  const batteryColor =
    inv.battery_percent >= 60 ? 'var(--ac)' :
    inv.battery_percent >= 30 ? 'var(--warn)' :
                                'var(--ac3)'

  if (loading) {
    return (
      <div style={S.loadingWrap}>
        <span style={S.loadingDot} />
        <span style={S.loadingText}>{t('inventory.loading')}</span>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.pageWidth}>
        <div style={S.header}>
          <div>
            <p style={S.headerLabel}>{t('inventory.eyebrow')}</p>
            <h1 style={S.headerTitle}>{language === 'pt' ? 'O que eu tenho' : 'What I have'}</h1>
          </div>
          <div style={S.headerStatus}>
            {isPending && <span style={S.savingDot} />}
            {saved && !isPending && <span style={S.savedBadge}>✓ salvo</span>}
          </div>
        </div>

        <PreparednessNav />

        {saveError && <div style={S.errorBanner}>⚠ {saveError}</div>}

        {/*
          ── Água ────────────────────────────────────────────────────────────
          D-158/D-159: a pessoa vê GALÕES; o banco continua guardando LITROS.
          A conversão acontece só aqui, na borda.

          Os limiares seguem em litros e com os mesmos valores de antes (4/2 por
          pessoa) de propósito: PREP-T11 troca a unidade e a régua da autonomia,
          e NÃO mexe no rigor da nota. Rever "adequado = ~1 dia de água" contra
          o mínimo de 3 dias da FEMA é PREP-T13 — duas mudanças de severidade
          não viajam na mesma entrega.
        */}
        <ResourceCard
          icon="💧"
          title={t('inventory.water')}
          value={inv.water_liters}
          threshold={WATER_ADEQUATE_LITERS_PER_PERSON}
          criticalThreshold={WATER_CRITICAL_LITERS_PER_PERSON}
          membersCount={memberCount}
          perPerson
        >
          {/* Big display */}
          <div style={S.bigValueWrap}>
            <span style={S.bigValue}>
              {litersToGallons(inv.water_liters).toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span style={S.bigValueUnit}>{t('inventory.gallons')}</span>
          </div>
          {memberCount > 0 && (
            <p style={S.perPersonHint}>
              {formatGallons(inv.water_liters / memberCount)} {GALLON_SHORT} / {t('inventory.perPerson')}
            </p>
          )}
          <div style={{ marginTop: 12 }}>
            <NumericStepper
              value={Number(litersToGallons(inv.water_liters).toFixed(1))}
              step={0.5}
              min={0}
              decimals={1}
              label={t('inventory.water')}
              unit={GALLON_SHORT}
              accent
              disabled={isPending}
              onChange={(v) => update('water_liters', Number(gallonsToLiters(v).toFixed(2)))}
            />
          </div>
        </ResourceCard>

        {/* ── Comida — threshold: 1 dia CRÍTICO, 3 dias BAIXO ─────────────── */}
        <ResourceCard
          icon="🍱"
          title={t('inventory.food')}
          value={inv.food_days}
          threshold={3}
          criticalThreshold={1}
          membersCount={memberCount}
          perPerson={false}
        >
          <NumericStepper
            value={inv.food_days}
            step={1}
            min={0}
            decimals={0}
            label={t('inventory.supplyDays')}
            unit={t('inventory.days')}
            disabled={isPending}
            onChange={(v) => update('food_days', v)}
          />
        </ResourceCard>

        {/* ── Combustível — opcional, 0 L = BAIXO ─────────────────────────── */}
        <ResourceCard
          icon="⛽"
          title={t('inventory.fuel')}
          value={inv.fuel_liters}
          threshold={5}
          criticalThreshold={0.001}   // essentially 0 = critical
          membersCount={memberCount}
          perPerson={false}
          optional
        >
          <NumericStepper
            value={inv.fuel_liters}
            step={1}
            min={0}
            decimals={1}
            label={t('inventory.fuel')}
            unit={t('inventory.liters')}
            disabled={isPending}
            onChange={(v) => update('fuel_liters', v)}
          />
        </ResourceCard>

        {/* ── Bateria — threshold: 30% BAIXO, 10% CRÍTICO ─────────────────── */}
        <ResourceCard
          icon="🔋"
          title={t('inventory.battery')}
          value={inv.battery_percent}
          threshold={30}
          criticalThreshold={10}
          membersCount={memberCount}
          perPerson={false}
        >
          <div style={S.batteryBarTrack}>
            <div
              style={{
                ...S.batteryBarFill,
                width: `${inv.battery_percent}%`,
                background: batteryColor,
              }}
            />
          </div>
          <NumericStepper
            value={inv.battery_percent}
            step={5}
            min={0}
            max={100}
            decimals={0}
            label={t('inventory.charge')}
            unit="%"
            disabled={isPending}
            onChange={(v) => update('battery_percent', v)}
          />
        </ResourceCard>

        {/* ── Equipamentos ─────────────────────────────────────────────────── */}
        <div
          style={{
            ...S.card,
            border:
              !inv.has_medical_kit && !inv.has_communication_device
                ? '1px solid rgba(255,179,71,0.4)'
                : '1px solid var(--bd)',
            background:
              !inv.has_medical_kit && !inv.has_communication_device
                ? 'rgba(255,179,71,0.04)'
                : 'var(--sf)',
          }}
        >
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>🎒</span>
            <span style={S.cardTitle}>{t('inventory.equipment')}</span>
            {!inv.has_medical_kit && !inv.has_communication_device && (
              <span style={{ ...S.badge, ...S.badgeHigh }}>▲ {t('inventory.low')}</span>
            )}
          </div>
          <ToggleRow
            label={t('inventory.medicalKit')}
            description={t('inventory.medicalKitDesc')}
            value={inv.has_medical_kit}
            onChange={(v) => update('has_medical_kit', v)}
            disabled={isPending}
          />
          <div style={S.toggleDivider} />
          <ToggleRow
            label={t('inventory.communication')}
            description={t('inventory.communicationDesc')}
            value={inv.has_communication_device}
            onChange={(v) => update('has_communication_device', v)}
            disabled={isPending}
          />
        </div>

        {/* ── Dinheiro ─────────────────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>💵</span>
            <span style={S.cardTitle}>{t('inventory.cash')}</span>
          </div>
          <NumericStepper
            value={inv.cash_amount}
            step={50}
            min={0}
            decimals={0}
            label={t('inventory.availableAmount')}
            unit="R$"
            disabled={isPending}
            onChange={(v) => update('cash_amount', v)}
          />
        </div>



        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as const,
    padding: '16px 16px 100px',
    background: 'var(--bg)',
    minHeight: '100dvh',
  },
  pageWidth: { maxWidth: 600, margin: '0 auto' },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20, paddingTop: 8,
  },
  headerLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--mu)',
    textTransform: 'uppercase' as const, marginBottom: 4,
  },
  headerTitle: { fontSize: 28, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.1 },
  headerStatus: { display: 'flex', alignItems: 'center', paddingTop: 8 },
  savingDot: {
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: 'var(--ac)', animation: 'blink 1.4s ease-in-out infinite',
  },
  savedBadge: {
    fontSize: 11, fontWeight: 700, color: 'var(--ac)',
    fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px',
  },
  errorBanner: {
    background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--ac3)',
    marginBottom: 12, fontWeight: 600,
  },
  /*
    Aviso da régua (D-159). Informativo, não alarme: usa a superfície neutra e
    não o vermelho de erro nem o verde de acento. Nada quebrou e nada melhorou —
    a conta ficou mais rigorosa, e a cor não deve dizer outra coisa.
  */
  rulerNotice: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: 'var(--sf)', border: '1px solid var(--bd)',
    borderRadius: 12, padding: '12px 14px', marginBottom: 16,
  },
  rulerNoticeText: {
    flex: 1, margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--mu)',
  },
  rulerNoticeButton: {
    flexShrink: 0, alignSelf: 'center',
    background: 'transparent', border: '1px solid var(--bd)', borderRadius: 8,
    padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--tx)',
    cursor: 'pointer',
  },
  aiCard: {
    background: 'rgba(0,229,160,0.05)',
    border: '1px solid rgba(0,229,160,0.18)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  aiHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  aiLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '1.2px',
    color: 'var(--ac)',
    textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace",
    marginBottom: 6,
  },
  aiTitle: {
    fontSize: 20,
    lineHeight: 1.2,
    color: 'var(--tx)',
    fontWeight: 700,
  },
  aiButton: {
    minWidth: 124,
    flexShrink: 0,
  },
  aiPlaceholder: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--mu)',
  },
  aiBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  aiOverviewRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  aiRiskBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace",
  },
  aiOverview: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--tx)',
  },
  aiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  aiListCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--bd)',
    borderRadius: 12,
    padding: 14,
  },
  aiListFull: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--bd)',
    borderRadius: 12,
    padding: 14,
  },
  aiListTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '1px',
    color: 'var(--mu)',
    textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace",
    marginBottom: 10,
  },
  aiListWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  aiListItem: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  },
  aiListDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--ac)',
    marginTop: 6,
    flexShrink: 0,
  },
  aiListText: {
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--tx)',
  },
  itemActionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  actionButton: {
    minHeight: 30,
    borderRadius: 8,
    border: '1px solid var(--bd)',
    background: 'rgba(255,255,255,0.03)',
    color: 'var(--mu)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '6px 9px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
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
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
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
  primaryButton: {
    border: 'none',
    borderRadius: 10,
    background: 'var(--ac)',
    color: '#0a0a0f',
    padding: '10px 14px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  // ── ReadinessSummary ──────────────────────────────────────────────────────
  summaryCard: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    transition: 'border-color 0.3s, background 0.3s',
  },
  summaryTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '1.2px',
    color: 'var(--mu)', textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace", marginBottom: 2,
  },
  porta: {
    display: 'flex', alignItems: 'center', gap: 12, marginTop: 24,
    padding: '16px', borderRadius: 12, border: '1px solid var(--bd)',
    background: 'var(--sf)', textDecoration: 'none', minHeight: 44,
  },
  portaTexto: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 3, minWidth: 0 },
  portaTitulo: { fontSize: 16, fontWeight: 700, color: 'var(--tx)' },
  portaEstado: { fontSize: 13, color: 'var(--mu)' },
  portaSeta: { fontSize: 22, color: 'var(--mu)', lineHeight: 1 },
  /* O que a nota NÃO mede. Discreto: é ressalva, não manchete. */
  summaryHint: {
    fontSize: 11, lineHeight: 1.4, color: 'var(--mu)',
    margin: '0 0 6px', opacity: 0.75,
  },
  summaryScoreRow: { display: 'flex', alignItems: 'baseline', gap: 3 },
  summaryScore: {
    fontFamily: "'DM Mono', monospace", fontSize: 44, fontWeight: 700,
    lineHeight: 1, letterSpacing: '-2px', transition: 'color 0.3s',
  },
  summaryScoreMax: { fontSize: 14, color: 'var(--mu)', fontWeight: 600 },
  summaryRight: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 6,
  },
  levelBadge: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
    padding: '4px 10px', borderRadius: 6,
    fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' as const,
  },
  memberChip: {
    fontSize: 11, fontWeight: 700, color: 'var(--ac2)',
    background: 'rgba(124,107,255,0.12)', border: '1px solid rgba(124,107,255,0.2)',
    borderRadius: 20, padding: '3px 10px', fontFamily: "'DM Mono', monospace",
  },
  scoreBarTrack: {
    height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3,
    overflow: 'hidden', marginBottom: 12,
  },
  scoreBarFill: {
    height: '100%', borderRadius: 3,
    transition: 'width 0.5s ease, background 0.3s',
  },
  autonomyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  autonomyLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: 'var(--mu)',
    textTransform: 'uppercase' as const, fontFamily: "'DM Mono', monospace",
  },
  autonomyValue: { fontSize: 13, color: 'var(--mu)', fontWeight: 600 },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    background: 'var(--sf)', border: '1px solid var(--bd)',
    borderRadius: 16, padding: 16, marginBottom: 12,
    transition: 'border-color 0.2s, background 0.2s',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardIcon: { fontSize: 18, lineHeight: 1 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: 'var(--tx)', flex: 1 },
  optionalTag: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: 'var(--mu)',
    textTransform: 'uppercase' as const, background: 'var(--sf2)',
    border: '1px solid var(--bd)', borderRadius: 4, padding: '2px 7px',
    fontFamily: "'DM Mono', monospace",
  },

  // Badges
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
    padding: '3px 8px', borderRadius: 5,
    fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' as const,
  },
  badgeCritical: {
    background: 'rgba(255,107,107,0.15)', color: 'var(--ac3)',
    border: '1px solid rgba(255,107,107,0.3)',
  },
  badgeHigh: {
    background: 'rgba(255,179,71,0.15)', color: '#ffb347',
    border: '1px solid rgba(255,179,71,0.3)',
  },

  // Big water value
  bigValueWrap: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  bigValue: {
    fontFamily: "'DM Mono', monospace", fontSize: 48, fontWeight: 700,
    color: 'var(--ac)', lineHeight: 1, letterSpacing: '-1px',
  },
  bigValueUnit: { fontSize: 16, color: 'var(--mu)', fontWeight: 600 },
  perPersonHint: { fontSize: 12, color: 'var(--mu)', fontFamily: "'DM Mono', monospace" },

  // Battery bar
  batteryBarTrack: {
    height: 6, background: 'var(--sf2)', borderRadius: 3,
    overflow: 'hidden', marginBottom: 14, border: '1px solid var(--bd)',
  },
  batteryBarFill: {
    height: '100%', borderRadius: 3,
    transition: 'width 0.25s ease, background 0.25s ease',
  },

  // Toggles
  toggleRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '4px 0',
  },
  toggleMeta: { display: 'flex', flexDirection: 'column' as const, gap: 2, flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: 700, color: 'var(--tx)' },
  toggleDesc: { fontSize: 11, color: 'var(--mu)', lineHeight: 1.4 },
  toggle: {
    position: 'relative' as const, width: 44, height: 26, borderRadius: 13,
    border: 'none', cursor: 'pointer', flexShrink: 0,
    transition: 'background 0.2s', padding: 0,
  },
  toggleOn:       { background: 'var(--ac)' },
  toggleOff:      { background: 'var(--sf2)', outline: '1px solid var(--bd)' },
  toggleDisabled: { opacity: 0.45, cursor: 'not-allowed' as const },
  toggleThumb: {
    display: 'block', position: 'absolute' as const, top: '50%', marginTop: -10,
    width: 20, height: 20, borderRadius: '50%',
    background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s ease',
  },
  toggleDivider: { height: 1, background: 'var(--bd)', margin: '12px 0' },

  // Loading
  loadingWrap: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    justifyContent: 'center', gap: 12, minHeight: '60vh',
  },
  loadingDot: {
    display: 'block', width: 10, height: 10, borderRadius: '50%',
    background: 'var(--ac)', animation: 'blink 1.4s ease-in-out infinite',
  },
  loadingText: {
    fontSize: 13, fontWeight: 600, color: 'var(--mu)',
    fontFamily: "'DM Mono', monospace",
  },
}
