'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { saveSnapshot, loadSnapshot } from '@/lib/sync'
import NumericStepper from '@/components/NumericStepper'
import { useLanguage } from '@/lib/i18n'
import { formatGallons, gallonsToLiters, litersToGallons, GALLON_SHORT } from '@/lib/units'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistTier = 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'

interface ChecklistItem {
  id: string
  kit_type: string
  canonical_key: string
  item_name: string
  tier: ChecklistTier
  quantity: number
  unit: string | null
  acquired: boolean
}

const CHECKLIST_TIERS: ChecklistTier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']
const TIER_DAYS: Record<ChecklistTier, number> = { ESSENTIAL: 3, MODERATE: 7, EXCELLENT: 30 }
const TIER_COLOR: Record<ChecklistTier, string> = {
  ESSENTIAL: '#ef4444',
  MODERATE:  '#f59e0b',
  EXCELLENT: '#22c55e',
}

const KIT_LABEL: Record<string, { pt: string; en: string }> = {
  GERAL: { pt: 'Geral', en: 'General' },
  EDU_CONTENT: { pt: 'EDU', en: 'EDU' },
  SIMULATION_DEBRIEF: { pt: 'Debrief da simulação', en: 'Simulation debrief' },
  PILOT_RECOMMENDATION: { pt: 'Recomendação do Pilot', en: 'Pilot recommendation' },
  BUG_OUT: { pt: 'Bug Out', en: 'Bug Out' },
  ACAMPAMENTO: { pt: 'Acampamento', en: 'Camping' },
  PESCA: { pt: 'Pesca', en: 'Fishing' },
  CACA: { pt: 'Caça', en: 'Hunting' },
}

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

type ReadinessSummaryProps = {
  score: number
  level: ReadinessLevel
  memberCount: number
  autonomyDays: number
}

function ReadinessSummary({ score, level, memberCount, autonomyDays }: ReadinessSummaryProps) {
  const { t } = useLanguage()
  const levelLabel: Record<ReadinessLevel, string> = {
    critical:  t('inventory.critical'),
    low:       t('inventory.low'),
    adequate:  t('inventory.adequate'),
    excellent: t('inventory.excellent'),
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
          {/*
            D-162: a nota mede CINCO recursos da casa (água, comida, bateria,
            kit médico, comunicação). Ela não sabe nada sobre plano, mochilas,
            treino ou cenário — e chamá-la de "prontidão" prometia um número que
            ela não entrega. O rótulo passa a dizer o que ela mede, e a linha
            abaixo diz o que ela NÃO mede: um número honesto sobre pouco vale
            mais que um número vago sobre tudo.
          */}
          <p style={S.summaryLabel}>{t('inventory.readiness')}</p>
          <p style={S.summaryHint}>{t('inventory.readinessHint')}</p>
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
              {memberCount} {t('inventory.members')}
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
        <span style={S.autonomyLabel}>{t('inventory.autonomy')}</span>
        <span style={S.autonomyValue}>
          <span style={{ color: levelColor[level], fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
            {autonomyDays}
          </span>
          {' '}{t('inventory.days')}
        </span>
      </div>
    </div>
  )
}

// ─── Checklist × Inventário ──────────────────────────────────────────────────
// `getInventoryDelta()` vivia aqui e foi retirado por D-156 / PREP-T11.
// A regra que o substitui — e o porquê — estão em `lib/checklist-inventory.ts`.

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

/** D-159: uma chave, um aviso, uma vez. */
const RULER_NOTICE_KEY = 'eos-water-ruler-fema-seen'

const DEFAULT_INVENTORY: Inventory = {
  water_liters: 0,
  food_days: 0,
  fuel_liters: 0,
  battery_percent: 0,
  has_medical_kit: false,
  has_communication_device: false,
  cash_amount: 0,
}

export default function PreparednessPage() {
  const { language, t } = useLanguage()
  const [inv, setInv] = useState<Inventory>(DEFAULT_INVENTORY)
  const [memberCount, setMemberCount] = useState(0)
  /**
   * A casa, vinda do servidor (D-123).
   *
   * O editor abaixo continua sendo a SUA despensa — você só pode mexer na sua.
   * Mas a nota e a autonomia passam a ser da casa: com quatro pessoas morando
   * juntas, avaliar a sua despensa sozinha contra quatro bocas dava uma nota
   * ruim que não correspondia a nada.
   */
  const [house, setHouse] = useState<{ size: number; autonomyDays: number | null; contributors: number; water: number; foodPersonDays: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiBriefing, setAiBriefing] = useState<AIReadinessBriefing | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  /**
   * O aviso da régua nova (D-159). Nasce escondido e só aparece depois de
   * montar: ler `localStorage` durante o render faria o servidor e o cliente
   * discordarem, e um aviso que pisca é pior que nenhum.
   */
  const [showRulerNotice, setShowRulerNotice] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(RULER_NOTICE_KEY) !== 'seen') setShowRulerNotice(true)
    } catch {
      /* Sem localStorage o aviso simplesmente não aparece. Ele é informativo. */
    }
  }, [])
  const dismissRulerNotice = useCallback(() => {
    setShowRulerNotice(false)
    try { localStorage.setItem(RULER_NOTICE_KEY, 'seen') } catch { /* idem */ }
  }, [])

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [checklistGenerating, setChecklistGenerating] = useState(false)
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<ChecklistItem | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setSaveError(null)
    // Show snapshot immediately
    const snap = loadSnapshot<{ inv: object; memberCount: number }>('inventory')
    if (snap) {
      if (snap.inv) setInv(prev => ({ ...prev, ...(snap.inv as typeof prev) }))
      if (snap.memberCount != null) setMemberCount(snap.memberCount)
    }
    try {
      const [invRes, famRes, clRes, hhRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/family-members'),
        fetch('/api/checklist', { cache: 'no-store' }),
        fetch('/api/household'),
      ])
      let parsedInv: Record<string, unknown> | null = null
      if (invRes.ok) {
        const { inventory } = await invRes.json()
        parsedInv = inventory
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
          setHouse({
            size: h.size,
            autonomyDays: typeof h.autonomyDays === 'number' ? h.autonomyDays : null,
            contributors: h.inventory?.contributors ?? 0,
            water: h.inventory?.waterLiters ?? 0,
            foodPersonDays: h.inventory?.foodPersonDays ?? 0,
          })
          setMemberCount(h.size)
          if (parsedInv) saveSnapshot('inventory', { inv: parsedInv, memberCount: h.size })
        }
      } else if (famRes.ok) {
        // Sem a casa, a contagem antiga é melhor que zero — mas nunca substitui
        // a autonomia, que fica nula em vez de virar palpite.
        const { members } = await famRes.json()
        const mc = Array.isArray(members) ? members.length : 0
        setMemberCount(mc)
        if (parsedInv) saveSnapshot('inventory', { inv: parsedInv, memberCount: mc })
      }
      if (clRes.ok) {
        const { items } = await clRes.json()
        setChecklistItems(Array.isArray(items) ? items : [])
      }
    } catch {
      setSaveError(t('inventory.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])
  useRealtimeSync(['resource_inventory', 'family_members', 'checklists'], () => { void loadData() })

  const loadAIBriefing = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai/readiness')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAiBriefing(null)
        setAiError(data.error ?? t('inventory.aiError'))
        return
      }

      setAiBriefing(data.briefing ?? null)
    } catch {
      setAiBriefing(null)
      setAiError(t('inventory.aiNetworkError'))
    } finally {
      setAiLoading(false)
    }
  }, [t])

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
            setSaveError(body.error ?? t('common.saveError'))
          } else {
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }
        } catch {
          setSaveError(t('inventory.networkSaveError'))
        }
      })
    }, 600)
  }, [t])

  const toggleChecklistItem = useCallback(async (canonicalKey: string, nextAcquired: boolean) => {
    // Optimistic UI update
    setChecklistItems((prev) =>
      prev.map((i) => i.canonical_key === canonicalKey ? { ...i, acquired: nextAcquired } : i)
    )

    /*
     * D-156 / PREP-T11: marcar item NÃO escreve no estoque da casa.
     *
     * Aqui existia uma sincronização que casava o nome do item por regex e
     * definia o escalar correspondente. Ela nunca reduzia o estoque (havia um
     * `Math.max`), mas fazia duas coisas erradas assim mesmo: tratava a
     * quantidade PLANEJADA como quantidade MEDIDA, e escrevia água de mochila
     * no estoque DA CASA, ignorando o `kit_type` do item.
     *
     * A regra e o porquê estão em `lib/checklist-inventory.ts`, com teste.
     */

    try {
      const res = await fetch('/api/checklist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalKey, acquired: nextAcquired }),
      })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      setChecklistItems((prev) =>
        prev.map((i) => i.canonical_key === canonicalKey ? { ...i, acquired: !nextAcquired } : i)
      )
    }
    /*
     * Sem dependências: `checklistItems`, `inv` e `save` existiam aqui só para
     * a sincronização removida acima. Marcar item agora é uma operação sobre o
     * checklist e nada mais — e as duas atualizações de estado usam a forma
     * funcional, que não precisa ler o valor atual pelo fecho.
     */
  }, [])

  const generateChecklist = useCallback(async () => {
    setChecklistGenerating(true)
    try {
      const res = await fetch('/api/checklist/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioType: 'GENERAL' }),
      })
      if (res.ok) {
        const clRes = await fetch('/api/checklist', { cache: 'no-store' })
        if (clRes.ok) {
          const { items } = await clRes.json()
          setChecklistItems(Array.isArray(items) ? items : [])
        }
      }
    } finally {
      setChecklistGenerating(false)
    }
  }, [])

  const removeChecklistItem = useCallback(async (item: ChecklistItem) => {
    setChecklistItems(prev => prev.filter(i => i.id !== item.id))
    setDeleteItem(null)
    try {
      const res = await fetch(`/api/checklist/${item.id}`, { method: 'DELETE' })
      if (!res.ok) await loadData()
    } catch {
      await loadData()
    }
  }, [loadData])

  const saveChecklistEdit = useCallback(async (
    item: ChecklistItem,
    patch: Pick<ChecklistItem, 'item_name' | 'quantity' | 'unit' | 'tier'>,
  ) => {
    setChecklistItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i))
    setEditingItem(null)
    try {
      const res = await fetch(`/api/checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) await loadData()
      else {
        const data = await res.json().catch(() => ({}))
        if (data.item) {
          setChecklistItems(prev => prev.map(i => i.id === item.id ? { ...i, ...data.item } : i))
        }
      }
    } catch {
      await loadData()
    }
  }, [loadData])

  function update<K extends keyof Inventory>(key: K, value: Inventory[K]) {
    const next = { ...inv, [key]: value }
    setInv(next)
    save(next)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  /*
   * Nota e autonomia olham a CASA; o editor continua pessoal.
   *
   * Antes: `Math.floor(inv.food_days)` — os meus dias de comida, sem dividir
   * por ninguém e sem somar a água de quem mora junto. Numa casa de quatro isso
   * errava para os dois lados ao mesmo tempo.
   */
  const invParaNota = house
    ? { ...inv, water_liters: house.water, food_days: house.size > 0 ? house.foodPersonDays / house.size : 0 }
    : inv
  const { score, level } = calcReadiness(invParaNota, memberCount)
  const autonomyDays = house?.autonomyDays != null ? Math.floor(house.autonomyDays) : Math.floor(inv.food_days)
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
        <span style={S.loadingText}>{t('inventory.loading')}</span>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.pageWidth}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <p style={S.headerLabel}>{t('inventory.eyebrow')}</p>
            <h1 style={S.headerTitle}>{t('inventory.title')}</h1>
          </div>
          <div style={S.headerStatus}>
            {isPending && <span style={S.savingDot} />}
            {saved && !isPending && <span style={S.savedBadge}>✓ salvo</span>}
          </div>
        </div>

        {saveError && (
          <div style={S.errorBanner}>⚠ {saveError}</div>
        )}

        {/*
          D-159: a régua da água mudou de 3 L para 1 galão (FEMA) por pessoa por
          dia, e a autonomia exibida caiu ~21% para todo mundo de uma vez.

          Um número de segurança que piora sozinho, sem explicação, é lido como
          perda de estoque ou como defeito — e a pessoa tira a conclusão errada
          justamente sobre o número que mais precisa ser confiável. Por isso o
          aviso existe, aparece uma vez e some para sempre.
        */}
        {showRulerNotice && (
          <div style={S.rulerNotice}>
            <p style={S.rulerNoticeText}>
              {language === 'pt'
                ? 'A régua da água passou a ser a da FEMA — 1 galão por pessoa por dia. Seu estoque não mudou; a conta ficou mais rigorosa.'
                : 'The water ruler is now FEMA’s — 1 gallon per person per day. Your supplies did not change; the math got stricter.'}
            </p>
            <button type="button" onClick={dismissRulerNotice} style={S.rulerNoticeButton}>
              {language === 'pt' ? 'Entendi' : 'Got it'}
            </button>
          </div>
        )}

        {/* ── Resumo de Prontidão ─────────────────────────────────────────── */}
        <ReadinessSummary
          score={score}
          level={level}
          memberCount={memberCount}
          autonomyDays={autonomyDays}
        />

        <a href="/edu" style={{ ...S.card, display: 'block', textDecoration: 'none', marginBottom: 18 }}>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--mu)', margin: 0 }}>EOS EDU</p>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx)', margin: '6px 0 4px' }}>
            {language === 'pt' ? 'Conteúdo educativo aprovado' : 'Approved educational content'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--mu)', margin: 0, lineHeight: 1.5 }}>
            {language === 'pt'
              ? 'Guias e vídeos versionados por cenário, com fonte visível antes de virarem tarefa ou RAG.'
              : 'Scenario-tagged guides and videos with visible source before becoming a task or RAG input.'}
          </p>
        </a>

        <div style={S.aiCard}>
          <div style={S.aiHeader}>
            <div>
              <p style={S.aiLabel}>OPENAI BRIEFING</p>
              <h2 style={S.aiTitle}>{t('inventory.aiTitle')}</h2>
            </div>
            <button
              className="btn bp bsm"
              onClick={loadAIBriefing}
              disabled={aiLoading}
              style={S.aiButton}
            >
              {aiLoading ? t('inventory.aiAnalyze') : aiBriefing ? t('inventory.aiRefresh') : t('inventory.aiGenerate')}
            </button>
          </div>

          {aiError && <div style={S.errorBanner}>⚠ {aiError}</div>}

          {!aiBriefing && !aiLoading && !aiError && (
            <p style={S.aiPlaceholder}>
              {t('inventory.aiPrompt')}
            </p>
          )}

          {aiLoading && (
            <p style={S.aiPlaceholder}>{t('inventory.aiLoading')}</p>
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
                  {t('inventory.risk')} {aiBriefing.risk_level}
                </span>
                <p style={S.aiOverview}>{aiBriefing.overview}</p>
              </div>

              <div style={S.aiGrid}>
                <AIList title={t('inventory.priorities')} items={aiBriefing.priorities} />
                <AIList title={t('inventory.strengths')} items={aiBriefing.strengths} />
              </div>

              <AIList title={t('inventory.nextSteps')} items={aiBriefing.next_steps} fullWidth />
            </div>
          )}
        </div>

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
          threshold={4}
          criticalThreshold={2}
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


        {/* ── Checklist de Preparação ──────────────────────────────────────── */}
        <div style={{ marginTop: 32, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--mu)', margin: 0 }}>{t('inventory.preparedness')}</p>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--tx)', margin: '4px 0 0' }}>Checklist</h2>
            </div>
            {checklistItems.length === 0 && (
              <button
                onClick={generateChecklist}
                disabled={checklistGenerating}
                style={{
                  padding: '8px 16px',
                  background: checklistGenerating ? 'var(--sf2)' : 'var(--ac)',
                  color: checklistGenerating ? 'var(--mu)' : '#0a0a0f',
                  border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13,
                  cursor: checklistGenerating ? 'default' : 'pointer',
                }}
              >
                {checklistGenerating ? t('checklist.generating') : t('inventory.generateChecklist')}
              </button>
            )}
          </div>

          {checklistItems.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' as const, color: 'var(--mu)', fontSize: 14 }}>
              {t('inventory.emptyChecklist')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
              {CHECKLIST_TIERS.map((tier) => {
                const tierItems = checklistItems.filter((i) => i.tier === tier)
                if (tierItems.length === 0) return null
                const done = tierItems.filter((i) => i.acquired).length
                const pct = Math.round((done / tierItems.length) * 100)
                const autonomy = Math.round((done / tierItems.length) * TIER_DAYS[tier])
                return (
                  <div
                    key={tier}
                    style={{ border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden', background: 'var(--sf)' }}
                  >
                    {/* Tier header */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--bd)' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: TIER_COLOR[tier], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: TIER_COLOR[tier] }}>
                        {tier === 'ESSENTIAL' ? t('checklist.essential') : tier === 'MODERATE' ? t('checklist.moderate') : t('checklist.excellent')}
                      </span>
                      <div style={{ flex: 1, height: 4, background: 'var(--sf2)', borderRadius: 2, overflow: 'hidden', marginLeft: 4 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: TIER_COLOR[tier], transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--mu)', fontFamily: 'ui-monospace,Menlo,monospace', flexShrink: 0 }}>
                        {done}/{tierItems.length} · ~{autonomy}d
                      </span>
                    </div>
                    {/* Items */}
                    {tierItems.map((item) => {
                      const kit = KIT_LABEL[item.kit_type] ?? { pt: item.kit_type, en: item.kit_type }
                      const showSource = item.kit_type !== 'GERAL'
                      return (
                        <div
                          key={item.id}
                          style={{
                            width: '100%', textAlign: 'left' as const,
                            padding: '11px 16px', background: 'transparent',
                            border: 'none', borderBottom: '1px solid var(--bd)',
                            color: 'var(--tx)',
                            display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)',
                            alignItems: 'flex-start', gap: 12,
                          }}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={item.acquired}
                            aria-label={item.item_name}
                            onClick={() => toggleChecklistItem(item.canonical_key, !item.acquired)}
                            style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${item.acquired ? TIER_COLOR[item.tier] : 'var(--bd)'}`,
                            background: item.acquired ? TIER_COLOR[item.tier] : 'transparent',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                          }}>
                            {item.acquired && (
                              <svg viewBox="0 0 10 10" width="11" height="11" aria-hidden>
                                <polyline points="1.5,5 4,7.5 8.5,2.5" fill="none" stroke="#0a0a0f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          <span style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, minWidth: 0 }}>
                            <span style={{ fontSize: 14, color: item.acquired ? 'var(--mu)' : 'var(--tx)', textDecoration: item.acquired ? 'line-through' : 'none' }}>
                              {item.item_name}
                            </span>
                            {showSource && (
                              <span style={{ fontSize: 11, color: 'var(--mu)' }}>
                                {language === 'pt' ? 'Fonte: ' : 'Source: '}{language === 'pt' ? kit.pt : kit.en}
                              </span>
                            )}
                            <span style={S.itemActionRow}>
                              <span style={{ fontSize: 12, color: 'var(--mu)', fontFamily: 'ui-monospace,Menlo,monospace', flexShrink: 0 }}>
                                {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                              </span>
                              <button
                                type="button"
                                aria-label={`${language === 'pt' ? 'Editar' : 'Edit'} ${item.item_name}`}
                                onClick={() => setEditingItem(item)}
                                style={S.actionButton}
                              >
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
                                  <path d="M4 20h4.8L19 9.8 14.2 5 4 15.2V20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                                  <path d="m13 6 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                </svg>
                                {language === 'pt' ? 'Editar' : 'Edit'}
                              </button>
                              <button
                                type="button"
                                aria-label={`${language === 'pt' ? 'Excluir' : 'Delete'} ${item.item_name}`}
                                onClick={() => setDeleteItem(item)}
                                style={{ ...S.actionButton, color: 'var(--ac3)', borderColor: 'rgba(255,107,107,0.28)', background: 'rgba(255,107,107,0.06)' }}
                              >
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
                                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                                </svg>
                                {language === 'pt' ? 'Excluir' : 'Delete'}
                              </button>
                            </span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ height: 24 }} />
      </div>
      {editingItem ? (
        <ChecklistEditDialog
          item={editingItem}
          language={language}
          onCancel={() => setEditingItem(null)}
          onSave={patch => saveChecklistEdit(editingItem, patch)}
        />
      ) : null}
      {deleteItem ? (
        <ConfirmDialog
          title={language === 'pt' ? 'Excluir item?' : 'Delete item?'}
          body={deleteItem.item_name}
          confirm={language === 'pt' ? 'Excluir' : 'Delete'}
          cancel={language === 'pt' ? 'Cancelar' : 'Cancel'}
          destructive
          onCancel={() => setDeleteItem(null)}
          onConfirm={() => removeChecklistItem(deleteItem)}
        />
      ) : null}
    </div>
  )
}

function ChecklistEditDialog({
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

function ConfirmDialog({
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
