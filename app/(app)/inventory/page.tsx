'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Inventory = {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
  cash_amount: number
}

type WaterStatus = 'critical' | 'low' | 'ok'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_INVENTORY: Inventory = {
  water_liters: 0,
  food_days: 0,
  fuel_liters: 0,
  battery_percent: 0,
  has_medical_kit: false,
  has_communication_device: false,
  cash_amount: 0,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWaterStatus(waterLiters: number, memberCount: number): WaterStatus {
  if (memberCount === 0) return 'ok'
  const perPerson = waterLiters / memberCount
  if (perPerson < 2) return 'critical'
  if (perPerson < 4) return 'low'
  return 'ok'
}

function estimatedAutonomy(inv: Inventory): number {
  // Minimum between water autonomy (2L/person/day) and food days
  // Water: total liters / (2L * members) — but we don't know members here,
  // so we return food_days as the primary axis (water indicator is separate).
  return Math.floor(inv.food_days)
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type StepperProps = {
  value: number
  step: number
  min: number
  max?: number
  label: string
  unit: string
  accent?: boolean
  decimals?: number
  onChange: (v: number) => void
  disabled?: boolean
}

function Stepper({
  value,
  step,
  min,
  max,
  label,
  unit,
  accent = false,
  decimals = 0,
  onChange,
  disabled = false,
}: StepperProps) {
  const dec = () => onChange(Math.max(min, parseFloat((value - step).toFixed(2))))
  const inc = () =>
    onChange(
      max !== undefined
        ? Math.min(max, parseFloat((value + step).toFixed(2)))
        : parseFloat((value + step).toFixed(2)),
    )

  return (
    <div style={S.stepperRow}>
      <div style={S.stepperMeta}>
        <span style={S.stepperLabel}>{label}</span>
        <span style={S.stepperUnit}>{unit}</span>
      </div>
      <div style={S.stepperControls}>
        <button
          style={{ ...S.stepBtn, ...(disabled ? S.stepBtnDisabled : {}) }}
          onClick={dec}
          disabled={disabled || value <= min}
          aria-label={`Diminuir ${label}`}
        >
          −
        </button>
        <span
          style={{
            ...S.stepValue,
            ...(accent ? S.stepValueAccent : {}),
          }}
        >
          {fmt(value, decimals)}
        </span>
        <button
          style={{ ...S.stepBtn, ...(disabled ? S.stepBtnDisabled : {}) }}
          onClick={inc}
          disabled={disabled || (max !== undefined && value >= max)}
          aria-label={`Aumentar ${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

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

type WaterBadgeProps = { status: WaterStatus }

function WaterBadge({ status }: WaterBadgeProps) {
  if (status === 'ok') return null
  const isCritical = status === 'critical'
  return (
    <span
      style={{
        ...S.badge,
        background: isCritical ? 'rgba(255,107,107,0.15)' : 'rgba(255,179,71,0.15)',
        color: isCritical ? 'var(--ac3)' : 'var(--warn)',
        border: `1px solid ${isCritical ? 'rgba(255,107,107,0.3)' : 'rgba(255,179,71,0.3)'}`,
      }}
    >
      {isCritical ? '⚠ CRÍTICO' : '▲ BAIXO'}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [inv, setInv] = useState<Inventory>(DEFAULT_INVENTORY)
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Debounce timer for auto-save
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load inventory + family count ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setSaveError(null)
    try {
      const [invRes, famRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/family-members'),
      ])

      if (invRes.ok) {
        const { inventory } = await invRes.json()
        setInv({
          water_liters: Number(inventory.water_liters) || 0,
          food_days: Number(inventory.food_days) || 0,
          fuel_liters: Number(inventory.fuel_liters) || 0,
          battery_percent: Number(inventory.battery_percent) || 0,
          has_medical_kit: Boolean(inventory.has_medical_kit),
          has_communication_device: Boolean(inventory.has_communication_device),
          cash_amount: Number(inventory.cash_amount) || 0,
        })
      }

      if (famRes.ok) {
        const { members } = await famRes.json()
        setMemberCount(Array.isArray(members) ? members.length : 0)
      }
    } catch {
      setSaveError('Erro ao carregar inventário.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Auto-save with debounce ────────────────────────────────────────────────
  const save = useCallback((data: Inventory) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        setSaveError(null)
        setSaved(false)
        try {
          const res = await fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
          if (!res.ok) {
            const body = await res.json()
            setSaveError(body.error ?? 'Erro ao salvar.')
          } else {
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }
        } catch {
          setSaveError('Erro de rede ao salvar.')
        }
      })
    }, 600)
  }, [])

  // ── Field update helper ────────────────────────────────────────────────────
  function update<K extends keyof Inventory>(key: K, value: Inventory[K]) {
    const next = { ...inv, [key]: value }
    setInv(next)
    save(next)
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const waterStatus = getWaterStatus(inv.water_liters, memberCount)
  const autonomyDays = estimatedAutonomy(inv)

  const waterCardBorder =
    waterStatus === 'critical'
      ? '1px solid rgba(255,107,107,0.55)'
      : waterStatus === 'low'
        ? '1px solid rgba(255,179,71,0.55)'
        : '1px solid var(--bd)'

  const waterCardBg =
    waterStatus === 'critical'
      ? 'rgba(255,107,107,0.06)'
      : waterStatus === 'low'
        ? 'rgba(255,179,71,0.06)'
        : 'var(--sf)'

  // ── Battery bar color ──────────────────────────────────────────────────────
  const batteryColor =
    inv.battery_percent >= 60
      ? 'var(--ac)'
      : inv.battery_percent >= 30
        ? 'var(--warn)'
        : 'var(--ac3)'

  if (loading) {
    return (
      <div style={S.loadingWrap}>
        <span style={S.loadingDot} />
        <span style={S.loadingText}>Carregando inventário…</span>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.pageWidth}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={S.header}>
          <div>
            <p style={S.headerLabel}>INVENTÁRIO</p>
            <h1 style={S.headerTitle}>Recursos</h1>
          </div>
          <div style={S.headerStatus}>
            {isPending && <span style={S.savingDot} />}
            {saved && !isPending && (
              <span style={S.savedBadge}>✓ salvo</span>
            )}
          </div>
        </div>

        {saveError && (
          <div style={S.errorBanner}>
            <span>⚠ {saveError}</span>
          </div>
        )}

        {/* ── Autonomy summary ─────────────────────────────────────────── */}
        <div style={S.autonomyCard}>
          <div>
            <p style={S.autonomyLabel}>AUTONOMIA ESTIMADA</p>
            <p style={S.autonomyValue}>
              <span style={S.autonomyNumber}>{autonomyDays}</span>
              <span style={S.autonomyUnit}> dias</span>
            </p>
          </div>
          <div style={S.autonomyMeta}>
            {memberCount > 0 && (
              <span style={S.memberChip}>{memberCount} membro{memberCount !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* ── Água ─────────────────────────────────────────────────────── */}
        <div style={{ ...S.card, border: waterCardBorder, background: waterCardBg }}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>💧</span>
            <span style={S.cardTitle}>Água</span>
            <WaterBadge status={waterStatus} />
          </div>

          {/* Big mono value */}
          <div style={S.bigValueWrap}>
            <span style={S.bigValue}>{fmt(inv.water_liters, 1)}</span>
            <span style={S.bigValueUnit}>litros</span>
          </div>

          {memberCount > 0 && (
            <p style={S.perPersonHint}>
              {(inv.water_liters / memberCount).toFixed(1)} L / pessoa
            </p>
          )}

          <div style={S.stepperWrap}>
            <Stepper
              label="Água"
              unit="L"
              value={inv.water_liters}
              step={0.5}
              min={0}
              decimals={1}
              accent
              onChange={(v) => update('water_liters', v)}
              disabled={isPending}
            />
          </div>
        </div>

        {/* ── Comida ───────────────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>🍱</span>
            <span style={S.cardTitle}>Comida</span>
          </div>
          <Stepper
            label="Dias de suprimento"
            unit="dias"
            value={inv.food_days}
            step={1}
            min={0}
            decimals={0}
            onChange={(v) => update('food_days', v)}
            disabled={isPending}
          />
        </div>

        {/* ── Combustível ──────────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>⛽</span>
            <span style={S.cardTitle}>Combustível</span>
            <span style={S.optionalTag}>opcional</span>
          </div>
          <Stepper
            label="Combustível"
            unit="litros"
            value={inv.fuel_liters}
            step={1}
            min={0}
            decimals={1}
            onChange={(v) => update('fuel_liters', v)}
            disabled={isPending}
          />
        </div>

        {/* ── Bateria / Energia ─────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>🔋</span>
            <span style={S.cardTitle}>Bateria / Energia</span>
          </div>

          {/* Progress bar */}
          <div style={S.batteryBarTrack}>
            <div
              style={{
                ...S.batteryBarFill,
                width: `${inv.battery_percent}%`,
                background: batteryColor,
              }}
            />
          </div>

          <Stepper
            label="Carga"
            unit="%"
            value={inv.battery_percent}
            step={5}
            min={0}
            max={100}
            decimals={0}
            onChange={(v) => update('battery_percent', v)}
            disabled={isPending}
          />
        </div>

        {/* ── Toggles ───────────────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>🎒</span>
            <span style={S.cardTitle}>Equipamentos</span>
          </div>

          <ToggleRow
            label="Kit médico"
            description="Curativos, medicação básica, torniquete"
            value={inv.has_medical_kit}
            onChange={(v) => update('has_medical_kit', v)}
            disabled={isPending}
          />

          <div style={S.toggleDivider} />

          <ToggleRow
            label="Comunicação / Rádio"
            description="Rádio AM/FM, walkie-talkie ou celular reserva"
            value={inv.has_communication_device}
            onChange={(v) => update('has_communication_device', v)}
            disabled={isPending}
          />
        </div>

        {/* ── Dinheiro ─────────────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>💵</span>
            <span style={S.cardTitle}>Dinheiro em espécie</span>
          </div>
          <Stepper
            label="Valor disponível"
            unit="R$"
            value={inv.cash_amount}
            step={50}
            min={0}
            decimals={0}
            onChange={(v) => update('cash_amount', v)}
            disabled={isPending}
          />
        </div>

        {/* Bottom spacer for nav */}
        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as const,
    padding: '16px 16px 100px',
    background: 'var(--bg)',
    minHeight: '100dvh',
  },
  pageWidth: {
    maxWidth: 600,
    margin: '0 auto',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingTop: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '1.2px',
    color: 'var(--mu)',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--tx)',
    lineHeight: 1.1,
  },
  headerStatus: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: 8,
  },
  savingDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--ac)',
    animation: 'blink 1.4s ease-in-out infinite',
  },
  savedBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--ac)',
    fontFamily: "'DM Mono', monospace",
    letterSpacing: '0.5px',
  },

  // Error banner
  errorBanner: {
    background: 'rgba(255,107,107,0.1)',
    border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--ac3)',
    marginBottom: 12,
    fontWeight: 600,
  },

  // Autonomy card
  autonomyCard: {
    background: 'rgba(0,229,160,0.07)',
    border: '1px solid rgba(0,229,160,0.18)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autonomyLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '1.2px',
    color: 'var(--mu)',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
    fontFamily: "'DM Mono', monospace",
  },
  autonomyValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  autonomyNumber: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 36,
    fontWeight: 700,
    color: 'var(--ac)',
    lineHeight: 1,
  },
  autonomyUnit: {
    fontSize: 14,
    color: 'var(--mu)',
    fontWeight: 600,
  },
  autonomyMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  memberChip: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--ac2)',
    background: 'rgba(124,107,255,0.12)',
    border: '1px solid rgba(124,107,255,0.2)',
    borderRadius: 20,
    padding: '3px 10px',
    fontFamily: "'DM Mono', monospace",
  },

  // Card
  card: {
    background: 'var(--sf)',
    border: '1px solid var(--bd)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    transition: 'border-color 0.2s, background 0.2s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardIcon: {
    fontSize: 18,
    lineHeight: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--tx)',
    flex: 1,
  },
  optionalTag: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: 'var(--mu)',
    textTransform: 'uppercase' as const,
    background: 'var(--sf2)',
    border: '1px solid var(--bd)',
    borderRadius: 4,
    padding: '2px 7px',
    fontFamily: "'DM Mono', monospace",
  },

  // Big water value
  bigValueWrap: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 4,
  },
  bigValue: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 48,
    fontWeight: 700,
    color: 'var(--ac)',
    lineHeight: 1,
    letterSpacing: '-1px',
  },
  bigValueUnit: {
    fontSize: 16,
    color: 'var(--mu)',
    fontWeight: 600,
  },
  perPersonHint: {
    fontSize: 12,
    color: 'var(--mu)',
    marginBottom: 12,
    fontFamily: "'DM Mono', monospace",
  },
  stepperWrap: {
    marginTop: 8,
  },

  // Stepper row
  stepperRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepperMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--tx)',
  },
  stepperUnit: {
    fontSize: 11,
    color: 'var(--mu)',
    fontFamily: "'DM Mono', monospace",
  },
  stepperControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    background: 'var(--sf2)',
    borderRadius: 12,
    padding: '4px',
    border: '1px solid var(--bd)',
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--tx)',
    fontSize: 20,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.1s',
    lineHeight: 1,
    fontFamily: 'inherit',
    userSelect: 'none' as const,
  },
  stepBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  stepValue: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--tx)',
    minWidth: 52,
    textAlign: 'center' as const,
    letterSpacing: '-0.5px',
  },
  stepValueAccent: {
    color: 'var(--ac)',
  },

  // Battery bar
  batteryBarTrack: {
    height: 6,
    background: 'var(--sf2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 14,
    border: '1px solid var(--bd)',
  },
  batteryBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.25s ease, background 0.25s ease',
  },

  // Toggle
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '4px 0',
  },
  toggleMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--tx)',
  },
  toggleDesc: {
    fontSize: 11,
    color: 'var(--mu)',
    lineHeight: 1.4,
  },
  toggle: {
    position: 'relative' as const,
    width: 44,
    height: 26,
    borderRadius: 13,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.2s',
    padding: 0,
  },
  toggleOn: {
    background: 'var(--ac)',
  },
  toggleOff: {
    background: 'var(--sf2)',
    outline: '1px solid var(--bd)',
  },
  toggleDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  toggleThumb: {
    display: 'block',
    position: 'absolute' as const,
    top: '50%',
    marginTop: -10,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s ease',
  },
  toggleDivider: {
    height: 1,
    background: 'var(--bd)',
    margin: '12px 0',
  },

  // Water badge
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    padding: '3px 8px',
    borderRadius: 5,
    fontFamily: "'DM Mono', monospace",
    textTransform: 'uppercase' as const,
  },

  // Loading
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: '60vh',
    color: 'var(--mu)',
  },
  loadingDot: {
    display: 'block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'var(--ac)',
    animation: 'blink 1.4s ease-in-out infinite',
  },
  loadingText: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--mu)',
    fontFamily: "'DM Mono', monospace",
  },
}
