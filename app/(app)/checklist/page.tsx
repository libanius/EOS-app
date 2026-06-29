'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage, type MessageKey } from '@/lib/i18n'

type Tier = 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'

interface ChecklistItem {
  id: string
  canonical_key: string
  item_name: string
  tier: Tier
  quantity: number
  unit: string | null
  acquired: boolean
  scenario_id: string | null
  shared: boolean
}

const TIERS: Tier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']
const TIER_DAYS: Record<Tier, number> = {
  ESSENTIAL: 3,
  MODERATE: 7,
  EXCELLENT: 30,
}
const TIER_COLOR: Record<Tier, string> = {
  ESSENTIAL: '#ef4444',
  MODERATE: '#f59e0b',
  EXCELLENT: '#22c55e',
}

export default function ChecklistPage() {
  const { t } = useLanguage()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [filter, setFilter] = useState<'ALL' | Tier>('ALL')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scenarioType, setScenarioType] = useState('GENERAL')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/checklist', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t('checklist.loadError'))
      setItems(json.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('checklist.unknownError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/checklist/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t('checklist.generateError'))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('checklist.unknownError'))
    } finally {
      setGenerating(false)
    }
  }, [scenarioType, load, t])

  const tierLabel = useCallback((tier: Tier | 'ALL') => {
    const keys: Record<Tier | 'ALL', MessageKey> = {
      ALL: 'checklist.all',
      ESSENTIAL: 'checklist.essential',
      MODERATE: 'checklist.moderate',
      EXCELLENT: 'checklist.excellent',
    }
    return t(keys[tier])
  }, [t])

  const toggle = useCallback(
    async (canonicalKey: string, next: boolean) => {
      // Optimistic update
      setItems((prev) =>
        prev.map((i) =>
          i.canonical_key === canonicalKey ? { ...i, acquired: next } : i,
        ),
      )
      try {
        const res = await fetch('/api/checklist/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canonicalKey, acquired: next }),
        })
        if (!res.ok) throw new Error('toggle failed')
      } catch {
        // Roll back
        setItems((prev) =>
          prev.map((i) =>
            i.canonical_key === canonicalKey ? { ...i, acquired: !next } : i,
          ),
        )
      }
    },
    [],
  )

  // De-duplicate for UI (show one row per canonical_key)
  const uniq = useMemo(() => {
    const seen = new Map<string, ChecklistItem>()
    for (const it of items) {
      if (!seen.has(it.canonical_key)) {
        seen.set(it.canonical_key, it)
      } else {
        const prev = seen.get(it.canonical_key)!
        seen.set(it.canonical_key, {
          ...prev,
          shared: true,
          acquired: prev.acquired || it.acquired,
        })
      }
    }
    return Array.from(seen.values())
  }, [items])

  const visible = useMemo(
    () => (filter === 'ALL' ? uniq : uniq.filter((i) => i.tier === filter)),
    [uniq, filter],
  )

  const stats = useMemo(() => {
    const byTier: Record<Tier, { total: number; done: number }> = {
      ESSENTIAL: { total: 0, done: 0 },
      MODERATE: { total: 0, done: 0 },
      EXCELLENT: { total: 0, done: 0 },
    }
    for (const it of uniq) {
      byTier[it.tier].total += 1
      if (it.acquired) byTier[it.tier].done += 1
    }
    return byTier
  }, [uniq])

  const autonomyDays = useMemo(() => {
    const pct = (t: Tier) =>
      stats[t].total > 0 ? stats[t].done / stats[t].total : 0
    return {
      ESSENTIAL: Math.round(pct('ESSENTIAL') * TIER_DAYS.ESSENTIAL * 10) / 10,
      MODERATE: Math.round(pct('MODERATE') * TIER_DAYS.MODERATE * 10) / 10,
      EXCELLENT: Math.round(pct('EXCELLENT') * TIER_DAYS.EXCELLENT * 10) / 10,
    }
  }, [stats])

  return (
    <main
      style={{
        maxWidth: 920,
        margin: '0 auto',
        padding: '32px 20px',
        fontFamily:
          'system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif',
        color: '#e6e6eb',
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#8a8a99',
          }}
        >
          {t('checklist.eyebrow')}
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 600 }}>
          Checklist
        </h1>
      </header>

      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            color: '#fca5a5',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Generate controls */}
      <section
        style={{
          border: '1px solid #222231',
          borderRadius: 12,
          padding: 18,
          marginBottom: 22,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={scenarioType}
          onChange={(e) => setScenarioType(e.target.value)}
          style={{
            padding: '8px 12px',
            background: '#0f0f17',
            color: '#e6e6eb',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
          }}
        >
          <option value="GENERAL">{t('checklist.general')}</option>
          <option value="HURRICANE">{t('checklist.hurricane')}</option>
          <option value="EARTHQUAKE">{t('checklist.earthquake')}</option>
          <option value="PANDEMIC">{t('checklist.pandemic')}</option>
          <option value="FIRE">{t('checklist.fire')}</option>
          <option value="FLOOD">{t('checklist.flood')}</option>
          <option value="FALLOUT">{t('checklist.fallout')}</option>
        </select>
        <button
          onClick={generate}
          disabled={generating}
          style={{
            padding: '8px 18px',
            background: generating ? '#2a2a3a' : '#22c55e',
            color: generating ? '#8a8a99' : '#0a0a0f',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: generating ? 'default' : 'pointer',
          }}
        >
          {generating ? t('checklist.generating') : t('checklist.generate')}
        </button>
        <div style={{ fontSize: 13, color: '#8a8a99' }}>
          {t('checklist.dedupe')}
        </div>
      </section>

      {/* Stats */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 22,
        }}
      >
        {TIERS.map((tier) => {
          const pct = stats[tier].total
            ? Math.round((stats[tier].done / stats[tier].total) * 100)
            : 0
          return (
            <div
              key={tier}
              style={{
                border: '1px solid #222231',
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: TIER_COLOR[tier],
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {tierLabel(tier)}
              </div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 600 }}>
                {stats[tier].done}
                <span
                  style={{
                    color: '#4a4a5a',
                    fontWeight: 400,
                    fontSize: 14,
                  }}
                >
                  {' '}
                  / {stats[tier].total}
                </span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 6,
                  background: '#16161f',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: TIER_COLOR[tier],
                    transition: 'width .3s',
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: '#8a8a99',
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}
              >
                ~{autonomyDays[tier]} {t('checklist.autonomy')}
              </div>
            </div>
          )
        })}
      </section>

      {/* Filters */}
      <section style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['ALL', ...TIERS] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              background: filter === f ? '#22c55e' : 'transparent',
              color: filter === f ? '#0a0a0f' : '#8a8a99',
              border:
                filter === f ? '1px solid #22c55e' : '1px solid #2a2a3a',
              borderRadius: 6,
              fontSize: 12,
              letterSpacing: 1,
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {tierLabel(f)}
          </button>
        ))}
      </section>

      {/* List */}
      <section
        style={{
          border: '1px solid #222231',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div
            style={{
              padding: 24,
              color: '#8a8a99',
              textAlign: 'center',
            }}
          >
            {t('common.loading')}
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              padding: 24,
              color: '#8a8a99',
              textAlign: 'center',
            }}
          >
            {t('checklist.empty')}
          </div>
        ) : (
          visible.map((it) => (
            <button
              key={it.id}
              onClick={() => toggle(it.canonical_key, !it.acquired)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #1a1a24',
                color: '#e6e6eb',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '22px 1fr auto',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: `1.5px solid ${
                    it.acquired ? '#22c55e' : '#2a2a3a'
                  }`,
                  background: it.acquired ? '#22c55e' : 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {it.acquired && (
                  <svg
                    viewBox="0 0 10 10"
                    width="12"
                    height="12"
                    aria-hidden
                  >
                    <polyline
                      points="1.5,5 4,7.5 8.5,2.5"
                      fill="none"
                      stroke="#0a0a0f"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    textDecoration: it.acquired ? 'line-through' : 'none',
                    color: it.acquired ? '#6a6a7a' : '#e6e6eb',
                  }}
                >
                  {it.item_name}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: '#8a8a99',
                    fontFamily: 'ui-monospace, Menlo, monospace',
                    marginTop: 2,
                  }}
                >
                  {it.quantity}
                  {it.unit ? ` ${it.unit}` : ''}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                {it.shared && (
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: 1,
                      padding: '3px 8px',
                      background: '#22223a',
                      color: '#a5b4fc',
                      borderRadius: 12,
                      textTransform: 'uppercase',
                    }}
                  >
                    {t('checklist.shared')}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: 1,
                    padding: '3px 8px',
                    background: 'transparent',
                    color: TIER_COLOR[it.tier],
                    border: `1px solid ${TIER_COLOR[it.tier]}`,
                    borderRadius: 12,
                    textTransform: 'uppercase',
                  }}
                >
                  {tierLabel(it.tier)}
                </span>
              </span>
            </button>
          ))
        )}
      </section>
    </main>
  )
}
