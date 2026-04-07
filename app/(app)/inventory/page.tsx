'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import NumericStepper from '@/components/NumericStepper'

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

type ResourceState = 'critical' | 'high' | 'ok'
type ReadinessLevel = 'critical' | 'low' | 'adequate' | 'excellent'
type AIRiskLevel = 'baixo' | 'medio' | 'alto'

type AIReadinessBriefing = {
  overview: string
  risk_level: AIRiskLevel
  priorities: string[]
  strengths: string[]
  next_steps: string[]
}

// ─── Readiness score ──────────────────────────────────────────────────────────

function calcReadiness(
  inv: Inventory,
  memberCount: number,
): { score: number; level: ReadinessLevel } {
  const mc = Math.max(memberCount, 1)
  let score = 0

  // Water — 30 pts (most critical)
  const waterPP = inv.water_liters / mc
  if (waterPP >= 4) score += 30
  else if (waterPP >= 2) score += 15

  // Food — 25 pts
  if (inv.food_days >= 7) score += 25
  else if (inv.food_days >= 3) score += 13
  else if (inv.food_days >= 1) score += 5

  // Battery — 20 pts
  if (inv.battery_percent >= 60) score += 20
  else if (inv.battery_percent >= 30) score += 10

  // Medical kit — 15 pts
  if (inv.has_medical_kit) score += 15

  // Communication — 10 pts
  if (inv.has_communication_device) score += 10

  const level: ReadinessLevel =
    score >= 80 ? 'excellent' :
    score >= 50 ? 'adequate'  :
    score >= 25 ? 'low'       : 'critical'

  return { score, level }
}

// ─── Resource state helper ────────────────────────────────────────────────────

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
          <span style={{ ...S.badge, ...S.badgeCritical }}>⚠ CRÍTICO</span>
        )}
        {state === 'high' && (
          <span style={{ ...S.badge, ...S.badgeHigh }}>▲ BAIXO</span>
        )}
        {optional && state === 'ok' && (
          <span style={S.optionalTag}>opcional</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── ReadinessSummary ─────────────────────────────────────────────────────────

type ReadinessSummaryProps = {
  score: number
  level: ReadinessLevel
  memberCount: number
  autonomyDays: number
}

function ReadinessSummary({ score, level, memberCount, autonomyDays }: ReadinessSummaryProps) {
  const levelLabel: Record<ReadinessLevel, string> = {
    critical:  'CRÍTICO',
    low:       'BAIXO',
    adequate:  'ADEQUADO',
    excellent: 'EXCELENTE',
  }
  const levelColor: Record<ReadinessLevel, string> = {
    critical:  'var(--ac3)',
    low:       'var(--warn)',
    adequate:  'var(--ac)',
    excellent: 'var(--ac)',
  }
  const barColor: Record<ReadinessLevel, string> = {
    critical:  'var(--ac3)',
    low:       'var(--warn)',
    adequate:  'var(--ac)',
    excellent: 'var(--ac)',
  }
  const summaryBg: Record<ReadinessLevel, string> = {
    critical:  'rgba(255,107,107,0.07)',
    low:       'rgba(255,179,71,0.06)',
    adequate:  'rgba(0,229,160,0.07)',
    excellent: 'rgba(0,229,160,0.07)',
  }
  const summaryBorder: Record<ReadinessLevel, string> = {
    critical:  '1px solid rgba(255,107,107,0.25)',
    low:       '1px solid rgba(255,179,71,0.25)',
    adequate:  '1px solid rgba(0,229,160,0.18)',
    excellent: '1px solid rgba(0,229,160,0.18)',
  }

  return (
    <div
      style={{
        ...S.summaryCard,
        background: summaryBg[level],
        border: summaryBorder[level],
      }}
    >
      {/* Top row */}
      <div style={S.summaryTop}>
        <div>
          <p style={S.summaryLabel}>RESUMO DE PRONTIDÃO</p>
          <div style={S.summaryScoreRow}>
            <span
              style={{
                ...S.summaryScore,
                color: levelColor[level],
              }}
            >
              {String(score).padStart(2, '0')}
            </span>
            <span style={S.summaryScoreMax}>/100</span>
          </div>
        </div>

        <div style={S.summaryRight}>
          <span
            style={{
              ...S.levelBadge,
              color: levelColor[level],
              background:
                level === 'critical' ? 'rgba(255,107,107,0.15)' :
                level === 'low'      ? 'rgba(255,179,71,0.15)'  :
                                       'rgba(0,229,160,0.12)',
              border: `1px solid ${
                level === 'critical' ? 'rgba(255,107,107,0.3)' :
                level === 'low'      ? 'rgba(255,179,71,0.3)'  :
                                       'rgba(0,229,160,0.25)'
              }`,
            }}
          >
            {levelLabel[level]}
          </span>
          {memberCount > 0 && (
            <span style={S.memberChip}>
              {memberCount} membro{memberCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Score bar */}
      <div style={S.scoreBarTrack}>
        <div
          style={{
            ...S.scoreBarFill,
            width: `${score}%`,
            background: barColor[level],
            boxShadow: `0 0 8px ${barColor[level]}66`,
          }}
        />
      </div>

      {/* Autonomy row */}
      <div style={S.autonomyRow}>
        <span style={S.autonomyLabel}>AUTONOMIA ESTIMADA</span>
        <span style={S.autonomyValue}>
          <span style={{ color: levelColor[level], fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
            {autonomyDays}
          </span>
          {' dias'}
        </span>
      </div>
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

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

export default function InventoryPage() {
  const [inv, setInv] = useState<Inventory>(DEFAULT_INVENTORY)
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiBriefing, setAiBriefing] = useState<AIReadinessBriefing | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ───────────────────────────────────────────────────────────────────
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
          water_liters:             Number(inventory.water_liters)             || 0,
          food_days:                Number(inventory.food_days)                || 0,
          fuel_liters:              Number(inventory.fuel_liters)              || 0,
          battery_percent:          Number(inventory.battery_percent)          || 0,
          has_medical_kit:          Boolean(inventory.has_medical_kit),
          has_communication_device: Boolean(inventory.has_communication_device),
          cash_amount:              Number(inventory.cash_amount)              || 0,
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

  useEffect(() => { loadData() }, [loadData])

  const loadAIBriefing = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai/readiness')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAiBriefing(null)
        setAiError(data.error ?? 'Erro ao gerar análise com IA.')
        return
      }

      setAiBriefing(data.briefing ?? null)
    } catch {
      setAiBriefing(null)
      setAiError('Erro de rede ao consultar a OpenAI.')
    } finally {
      setAiLoading(false)
    }
  }, [])

  // ── Auto-save ──────────────────────────────────────────────────────────────
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

  function update<K extends keyof Inventory>(key: K, value: Inventory[K]) {
    const next = { ...inv, [key]: value }
    setInv(next)
    save(next)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const { score, level } = calcReadiness(inv, memberCount)
  const autonomyDays = Math.floor(inv.food_days)
  const batteryColor =
    inv.battery_percent >= 60 ? 'var(--ac)' :
    inv.battery_percent >= 30 ? 'var(--warn)' :
                                'var(--ac3)'
  const aiRiskColor: Record<AIRiskLevel, string> = {
    baixo: 'var(--ac)',
    medio: 'var(--warn)',
    alto: 'var(--ac3)',
  }

  // ── Loading ────────────────────────────────────────────────────────────────
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

        {/* Header */}
        <div style={S.header}>
          <div>
            <p style={S.headerLabel}>INVENTÁRIO</p>
            <h1 style={S.headerTitle}>Recursos</h1>
          </div>
          <div style={S.headerStatus}>
            {isPending && <span style={S.savingDot} />}
            {saved && !isPending && <span style={S.savedBadge}>✓ salvo</span>}
          </div>
        </div>

        {saveError && (
          <div style={S.errorBanner}>⚠ {saveError}</div>
        )}

        {/* ── Resumo de Prontidão ─────────────────────────────────────────── */}
        <ReadinessSummary
          score={score}
          level={level}
          memberCount={memberCount}
          autonomyDays={autonomyDays}
        />

        <div style={S.aiCard}>
          <div style={S.aiHeader}>
            <div>
              <p style={S.aiLabel}>OPENAI BRIEFING</p>
              <h2 style={S.aiTitle}>Análise tática da sua prontidão</h2>
            </div>
            <button
              className="btn bp bsm"
              onClick={loadAIBriefing}
              disabled={aiLoading}
              style={S.aiButton}
            >
              {aiLoading ? 'Analisando...' : aiBriefing ? 'Atualizar IA' : 'Gerar com IA'}
            </button>
          </div>

          {aiError && <div style={S.errorBanner}>⚠ {aiError}</div>}

          {!aiBriefing && !aiLoading && !aiError && (
            <p style={S.aiPlaceholder}>
              Gere um briefing com a OpenAI usando família e inventário reais para identificar riscos, pontos fortes e próximas ações.
            </p>
          )}

          {aiLoading && (
            <p style={S.aiPlaceholder}>Consultando a OpenAI e consolidando os dados da família...</p>
          )}

          {aiBriefing && (
            <div style={S.aiBody}>
              <div style={S.aiOverviewRow}>
                <span
                  style={{
                    ...S.aiRiskBadge,
                    color: aiRiskColor[aiBriefing.risk_level],
                    border: `1px solid ${aiRiskColor[aiBriefing.risk_level]}44`,
                    background: `${aiRiskColor[aiBriefing.risk_level]}14`,
                  }}
                >
                  risco {aiBriefing.risk_level}
                </span>
                <p style={S.aiOverview}>{aiBriefing.overview}</p>
              </div>

              <div style={S.aiGrid}>
                <AIList title="Prioridades" items={aiBriefing.priorities} />
                <AIList title="Pontos fortes" items={aiBriefing.strengths} />
              </div>

              <AIList title="Próximos passos" items={aiBriefing.next_steps} fullWidth />
            </div>
          )}
        </div>

        {/* ── Água — threshold: 2 L/pessoa CRÍTICO, 4 L/pessoa BAIXO ──────── */}
        <ResourceCard
          icon="💧"
          title="Água"
          value={inv.water_liters}
          threshold={4}
          criticalThreshold={2}
          membersCount={memberCount}
          perPerson
        >
          {/* Big display */}
          <div style={S.bigValueWrap}>
            <span style={S.bigValue}>
              {inv.water_liters.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span style={S.bigValueUnit}>litros</span>
          </div>
          {memberCount > 0 && (
            <p style={S.perPersonHint}>
              {(inv.water_liters / memberCount).toFixed(1)} L / pessoa
            </p>
          )}
          <div style={{ marginTop: 12 }}>
            <NumericStepper
              value={inv.water_liters}
              step={0.5}
              min={0}
              decimals={1}
              label="Água"
              unit="L"
              accent
              disabled={isPending}
              onChange={(v) => update('water_liters', v)}
            />
          </div>
        </ResourceCard>

        {/* ── Comida — threshold: 1 dia CRÍTICO, 3 dias BAIXO ─────────────── */}
        <ResourceCard
          icon="🍱"
          title="Comida"
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
            label="Dias de suprimento"
            unit="dias"
            disabled={isPending}
            onChange={(v) => update('food_days', v)}
          />
        </ResourceCard>

        {/* ── Combustível — opcional, 0 L = BAIXO ─────────────────────────── */}
        <ResourceCard
          icon="⛽"
          title="Combustível"
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
            label="Combustível"
            unit="litros"
            disabled={isPending}
            onChange={(v) => update('fuel_liters', v)}
          />
        </ResourceCard>

        {/* ── Bateria — threshold: 30% BAIXO, 10% CRÍTICO ─────────────────── */}
        <ResourceCard
          icon="🔋"
          title="Bateria / Energia"
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
            label="Carga"
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
            <span style={S.cardTitle}>Equipamentos</span>
            {!inv.has_medical_kit && !inv.has_communication_device && (
              <span style={{ ...S.badge, ...S.badgeHigh }}>▲ BAIXO</span>
            )}
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

        {/* ── Dinheiro ─────────────────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardIcon}>💵</span>
            <span style={S.cardTitle}>Dinheiro em espécie</span>
          </div>
          <NumericStepper
            value={inv.cash_amount}
            step={50}
            min={0}
            decimals={0}
            label="Valor disponível"
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

function AIList({
  title,
  items,
  fullWidth = false,
}: {
  title: string
  items: string[]
  fullWidth?: boolean
}) {
  if (items.length === 0) return null

  return (
    <div style={fullWidth ? S.aiListFull : S.aiListCard}>
      <p style={S.aiListTitle}>{title}</p>
      <div style={S.aiListWrap}>
        {items.map((item) => (
          <div key={`${title}-${item}`} style={S.aiListItem}>
            <span style={S.aiListDot} />
            <span style={S.aiListText}>{item}</span>
          </div>
        ))}
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
    fontFamily: "'DM Mono', monospace", marginBottom: 6,
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
