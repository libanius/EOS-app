'use client'

/**
 * Checklist — rebuilt on the World v2 design system.
 *
 * The list is where the Pilot's advice lands, so it had to stop looking like a
 * different product. Same materials, same type scale, same springs as the
 * dashboard and the simulator.
 *
 * Two structural choices worth stating:
 *
 *  - PROGRESS IS THE HEADLINE. The old page opened with controls; this one opens
 *    with how ready you actually are, because that is the question the screen
 *    exists to answer.
 *  - TIERS ARE HORIZONS, NOT LABELS. Essential/Moderate/Excellent map to 3, 7
 *    and 30 days of autonomy, so the UI names the horizon instead of an
 *    adjective that means nothing on its own.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { KITS, type ChecklistTier } from '@/lib/checklist'
import { useLanguage } from '@/lib/i18n'
import { Card, Pill, SectionLabel } from './primitives'
import { SPRING, haptic } from './motion'
import './world-v2.css'

type Item = {
  id: string
  item_name: string
  canonical_key: string
  tier: ChecklistTier
  quantity: number
  unit: string | null
  acquired: boolean
  kit_type: string | null
}

const TIERS: ChecklistTier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']
const TIER_DAYS: Record<ChecklistTier, number> = { ESSENTIAL: 3, MODERATE: 7, EXCELLENT: 30 }

const COPY = {
  pt: {
    eyebrow: 'Checklist',
    ready: 'Prontidão',
    ofItems: 'itens',
    all: 'Tudo',
    days: 'dias',
    horizon: 'Horizonte',
    empty: 'Nenhum item neste kit ainda.',
    emptyHint: 'Gere uma lista adaptada à sua família, ou peça ao Pilot — o que ele recomendar vira tarefa aqui.',
    generate: 'Gerar lista',
    generating: 'Montando…',
    remove: 'Remover',
    kits: 'Kits',
    loadError: 'Não foi possível carregar o checklist.',
    retry: 'Tentar de novo',
  },
  en: {
    eyebrow: 'Checklist',
    ready: 'Readiness',
    ofItems: 'items',
    all: 'All',
    days: 'days',
    horizon: 'Horizon',
    empty: 'No items in this kit yet.',
    emptyHint: 'Generate a list tailored to your household, or ask the Pilot — whatever it recommends lands here as a task.',
    generate: 'Generate list',
    generating: 'Building…',
    remove: 'Remove',
    kits: 'Kits',
    loadError: 'Could not load the checklist.',
    retry: 'Try again',
  },
} as const

export default function ChecklistPage() {
  const { language } = useLanguage()
  const reduceMotion = useReducedMotion()
  const c = COPY[language]

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [kit, setKit] = useState('GERAL')
  const [tierFilter, setTierFilter] = useState<'ALL' | ChecklistTier>('ALL')
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/checklist', { cache: 'no-store' })
      if (!response.ok) throw new Error('load')
      const data = (await response.json()) as { items?: Item[] }
      setItems(data.items ?? [])
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The same item can exist in several kits; within a kit it shows once.
  const kitItems = useMemo(() => {
    const seen = new Map<string, Item>()
    for (const item of items) {
      if ((item.kit_type ?? 'GERAL') !== kit) continue
      const previous = seen.get(item.canonical_key)
      if (!previous || (item.acquired && !previous.acquired)) seen.set(item.canonical_key, item)
    }
    return Array.from(seen.values())
  }, [items, kit])

  const visible = useMemo(
    () => (tierFilter === 'ALL' ? kitItems : kitItems.filter(i => i.tier === tierFilter)),
    [kitItems, tierFilter],
  )

  const stats = useMemo(() => {
    const done = kitItems.filter(i => i.acquired).length
    const total = kitItems.length
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
  }, [kitItems])

  const tierStats = useMemo(() => {
    const out: Record<ChecklistTier, { total: number; done: number }> = {
      ESSENTIAL: { total: 0, done: 0 },
      MODERATE: { total: 0, done: 0 },
      EXCELLENT: { total: 0, done: 0 },
    }
    for (const item of kitItems) {
      out[item.tier].total++
      if (item.acquired) out[item.tier].done++
    }
    return out
  }, [kitItems])

  const toggle = async (item: Item) => {
    haptic.selection()
    const next = !item.acquired
    setItems(current =>
      current.map(i =>
        i.canonical_key === item.canonical_key && (i.kit_type ?? 'GERAL') === kit ? { ...i, acquired: next } : i,
      ),
    )
    await fetch('/api/checklist/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonicalKey: item.canonical_key, acquired: next, kitType: kit }),
    }).catch(() => void load())
  }

  const remove = async (item: Item) => {
    haptic.impact()
    setItems(current => current.filter(i => i.id !== item.id))
    await fetch(`/api/checklist/${item.id}`, { method: 'DELETE' }).catch(() => void load())
  }

  const generate = async () => {
    haptic.impact()
    setGenerating(true)
    try {
      await fetch('/api/checklist/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kitType: kit, scenarioType: 'GENERAL' }),
      })
      await load()
    } finally {
      setGenerating(false)
    }
  }

  const activeKit = KITS.find(k => k.type === kit)

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="list-title">{activeKit?.label ?? kit}</h1>
        </header>

        {/* ── Readiness first: the question the screen exists to answer ── */}
        <Card accented>
          <SectionLabel trailing={`${stats.done}/${stats.total} ${c.ofItems}`}>{c.ready}</SectionLabel>
          <div className="list-progress">
            <span className="t-figure">{stats.pct}%</span>
            <span className="track" aria-hidden="true">
              <i style={{ width: `${stats.pct}%` }} />
            </span>
          </div>
          <div className="list-horizons">
            {TIERS.map(tier => {
              const s = tierStats[tier]
              const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
              return (
                <div key={tier} className="horizon">
                  <span className="t-caps ink-3">{TIER_DAYS[tier]} {c.days}</span>
                  <strong className="t-sub">{s.total ? `${pct}%` : '—'}</strong>
                </div>
              )
            })}
          </div>
        </Card>

        {/* ── Kits ── */}
        <div className="list-kits" role="group" aria-label={c.kits}>
          {KITS.map(k => (
            <button
              key={k.type}
              type="button"
              className={`list-kit${kit === k.type ? ' on' : ''}`}
              aria-pressed={kit === k.type}
              onClick={() => { haptic.selection(); setKit(k.type); setTierFilter('ALL') }}
            >
              <span aria-hidden="true">{k.icon}</span>
              {k.label}
            </button>
          ))}
        </div>

        {/* ── Horizon filter ── */}
        <div className="list-filter" role="group" aria-label={c.horizon}>
          {(['ALL', ...TIERS] as const).map(value => (
            <button
              key={value}
              type="button"
              className={tierFilter === value ? 'on' : ''}
              aria-pressed={tierFilter === value}
              onClick={() => { haptic.selection(); setTierFilter(value) }}
            >
              {value === 'ALL' ? c.all : `${TIER_DAYS[value]}d`}
            </button>
          ))}
        </div>

        {/* ── Items ── */}
        {failed ? (
          <Card>
            <p className="t-body ink-2">{c.loadError}</p>
            <div style={{ marginTop: '1rem' }}>
              <Pill onClick={() => void load()}>{c.retry}</Pill>
            </div>
          </Card>
        ) : loading ? (
          <Card><p className="t-body ink-3">…</p></Card>
        ) : visible.length === 0 ? (
          <Card>
            <p className="t-title2">{c.empty}</p>
            <p className="t-body ink-2" style={{ marginTop: '0.5rem' }}>{c.emptyHint}</p>
            <div style={{ marginTop: '1rem' }}>
              <Pill primary disabled={generating} onClick={generate}>
                {generating ? c.generating : c.generate}
              </Pill>
            </div>
          </Card>
        ) : (
          <Card>
            <AnimatePresence initial={false}>
              {visible.map(item => (
                <motion.div
                  key={item.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
                  transition={reduceMotion ? { duration: 0 } : SPRING.quick}
                  className={`list-item${item.acquired ? ' done' : ''}`}
                >
                  <button
                    type="button"
                    className="list-check"
                    role="checkbox"
                    aria-checked={item.acquired}
                    aria-label={item.item_name}
                    onClick={() => toggle(item)}
                  >
                    <span className="box" aria-hidden="true">
                      {item.acquired && (
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 7.4 L5.5 10.4 L11.5 3.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="label">
                      <strong className="t-body">{item.item_name}</strong>
                      <em className="t-foot ink-3">
                        {item.quantity}
                        {item.unit ? ` ${item.unit}` : ''} · {TIER_DAYS[item.tier]} {c.days}
                      </em>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="list-remove"
                    aria-label={`${c.remove}: ${item.item_name}`}
                    onClick={() => remove(item)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </Card>
        )}

        {visible.length > 0 && (
          <Pill wide disabled={generating} onClick={generate}>
            {generating ? c.generating : c.generate}
          </Pill>
        )}
      </div>
    </div>
  )
}
