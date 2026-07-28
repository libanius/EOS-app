'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { KITS, type KitDef, type ChecklistTier } from '@/lib/checklist'

type Tier = ChecklistTier

interface ChecklistItem {
  id: string
  canonical_key: string
  item_name: string
  tier: Tier
  quantity: number
  unit: string | null
  acquired: boolean
  kit_type: string
  shared: boolean
}

const TIERS: Tier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']

const TIER_LABEL: Record<Tier, string> = {
  ESSENTIAL: 'Essencial',
  MODERATE: 'Moderado',
  EXCELLENT: 'Excelente',
}

const TIER_COLOR: Record<Tier, string> = {
  ESSENTIAL: '#ef4444',
  MODERATE: '#f59e0b',
  EXCELLENT: '#22c55e',
}

const TIER_DAYS: Record<Tier, number> = { ESSENTIAL: 3, MODERATE: 7, EXCELLENT: 30 }

const SCENARIOS = [
  { value: 'GENERAL',   label: 'Geral' },
  { value: 'HURRICANE', label: 'Furacão' },
  { value: 'EARTHQUAKE',label: 'Terremoto' },
  { value: 'PANDEMIC',  label: 'Pandemia' },
  { value: 'FIRE',      label: 'Incêndio' },
  { value: 'FLOOD',     label: 'Enchente' },
  { value: 'FALLOUT',   label: 'Queda Nuclear' },
]

// ─── Checkbox icon ────────────────────────────────────────────────────────────

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
      border: `1.5px solid ${checked ? '#22c55e' : '#3a3a4a'}`,
      background: checked ? '#22c55e' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all .15s',
    }}>
      {checked && (
        <svg viewBox="0 0 10 10" width="12" height="12" aria-hidden>
          <polyline points="1.5,5 4,7.5 8.5,2.5" fill="none"
            stroke="#0a0a0f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

// ─── Edit item modal ──────────────────────────────────────────────────────────

function EditModal({
  item, onClose, onSave,
}: {
  item: ChecklistItem
  onClose: () => void
  onSave: (patch: { item_name: string; quantity: number; unit: string | null; tier: Tier }) => void
}) {
  const [name, setName] = useState(item.item_name)
  const [qty, setQty] = useState(String(item.quantity))
  const [unit, setUnit] = useState(item.unit ?? '')
  const [tier, setTier] = useState<Tier>(item.tier)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#13131e', border: '1px solid #2a2a3a', borderRadius: 14,
        padding: 24, width: '100%', maxWidth: 400,
      }} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: '0 0 16px', fontWeight: 700, fontSize: 15, color: '#f0f0f8' }}>Editar item</p>

        <label style={{ fontSize: 12, color: '#8a8a99', display: 'block', marginBottom: 4 }}>Nome</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: '#0f0f17',
            border: '1px solid #2a2a3a', borderRadius: 8, color: '#e6e6eb', fontSize: 13, marginBottom: 12 }} />

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#8a8a99', display: 'block', marginBottom: 4 }}>Quantidade</label>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} min="0.01" step="0.01"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: '#0f0f17',
                border: '1px solid #2a2a3a', borderRadius: 8, color: '#e6e6eb', fontSize: 13 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#8a8a99', display: 'block', marginBottom: 4 }}>Unidade</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="litros, kg…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: '#0f0f17',
                border: '1px solid #2a2a3a', borderRadius: 8, color: '#e6e6eb', fontSize: 13 }} />
          </div>
        </div>

        <label style={{ fontSize: 12, color: '#8a8a99', display: 'block', marginBottom: 6 }}>Nível</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {TIERS.map((t) => (
            <button key={t} onClick={() => setTier(t)} style={{
              flex: 1, padding: '7px 0', borderRadius: 7,
              border: `1px solid ${tier === t ? TIER_COLOR[t] : '#2a2a3a'}`,
              background: tier === t ? `${TIER_COLOR[t]}22` : 'transparent',
              color: tier === t ? TIER_COLOR[t] : '#8a8a99',
              fontSize: 11, fontWeight: 700, letterSpacing: '.05em', cursor: 'pointer',
              textTransform: 'uppercase',
            }}>{TIER_LABEL[t]}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px 0', background: 'transparent', border: '1px solid #2a2a3a',
            borderRadius: 8, color: '#8a8a99', fontSize: 13, cursor: 'pointer',
          }}>Cancelar</button>
          <button onClick={() => {
            onSave({ item_name: name.trim(), quantity: parseFloat(qty) || 1,
              unit: unit.trim() || null, tier })
          }} style={{
            flex: 2, padding: '10px 0', background: '#6366f1', border: 'none',
            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChecklistPage() {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeKit, setActiveKit] = useState<string>('GERAL')
  const [tierFilter, setTierFilter] = useState<'ALL' | Tier>('ALL')
  const [scenarioType, setScenarioType] = useState('GENERAL')
  const [showGenerate, setShowGenerate] = useState(false)
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/checklist', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar')
      setItems(json.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  // Items for the currently selected kit
  const kitItems = useMemo(
    () => items.filter((i) => (i.kit_type ?? 'GERAL') === activeKit),
    [items, activeKit],
  )

  // De-duplicate within kit
  const uniq = useMemo(() => {
    const seen = new Map<string, ChecklistItem>()
    for (const it of kitItems) {
      if (!seen.has(it.canonical_key)) {
        seen.set(it.canonical_key, it)
      } else {
        const prev = seen.get(it.canonical_key)!
        seen.set(it.canonical_key, { ...prev, shared: true, acquired: prev.acquired || it.acquired })
      }
    }
    return Array.from(seen.values())
  }, [kitItems])

  const visible = useMemo(
    () => tierFilter === 'ALL' ? uniq : uniq.filter((i) => i.tier === tierFilter),
    [uniq, tierFilter],
  )

  const stats = useMemo(() => {
    const r: Record<Tier, { total: number; done: number }> = {
      ESSENTIAL: { total: 0, done: 0 }, MODERATE: { total: 0, done: 0 }, EXCELLENT: { total: 0, done: 0 },
    }
    for (const it of uniq) { r[it.tier].total++; if (it.acquired) r[it.tier].done++ }
    return r
  }, [uniq])

  const totalPct = useMemo(() => {
    const total = uniq.length
    const done = uniq.filter((i) => i.acquired).length
    return total > 0 ? Math.round((done / total) * 100) : 0
  }, [uniq])

  const kitDef: KitDef = KITS.find((k) => k.type === activeKit) ?? KITS[0]

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggle = useCallback(async (canonKey: string, next: boolean) => {
    setItems((prev) => prev.map((i) =>
      i.canonical_key === canonKey && (i.kit_type ?? 'GERAL') === activeKit
        ? { ...i, acquired: next } : i))
    try {
      const res = await fetch('/api/checklist/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalKey: canonKey, acquired: next }),
      })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      setItems((prev) => prev.map((i) =>
        i.canonical_key === canonKey && (i.kit_type ?? 'GERAL') === activeKit
          ? { ...i, acquired: !next } : i))
    }
  }, [activeKit])

  const generate = useCallback(async () => {
    setGenerating(true); setError(null)
    try {
      const res = await fetch('/api/checklist/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kitType: activeKit, scenarioType }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro na geração')
      setShowGenerate(false)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro desconhecido') }
    finally { setGenerating(false) }
  }, [activeKit, scenarioType, load])

  const deleteItem = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setConfirmDeleteId(null)
    try {
      const res = await fetch(`/api/checklist/${id}`, { method: 'DELETE' })
      if (!res.ok) { await load() }
    } catch { await load() }
  }, [load])

  const saveEdit = useCallback(async (
    item: ChecklistItem,
    patch: { item_name: string; quantity: number; unit: string | null; tier: Tier },
  ) => {
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...patch } : i))
    setEditItem(null)
    try {
      await fetch(`/api/checklist/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch { await load() }
  }, [load])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main style={{
      maxWidth: 640, margin: '0 auto', padding: '24px 16px 100px',
      fontFamily: 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif',
      color: '#e6e6eb',
    }}>
      {/* Header */}
      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#8a8a99' }}>
          Preparação
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 700 }}>Mochilas & Kits</h1>
      </header>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.35)',
          padding: '10px 14px', borderRadius: 8, marginBottom: 14, color: '#fca5a5', fontSize: 13,
        }}>{error}</div>
      )}

      {/* Kit tabs — horizontal scroll */}
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 18,
        scrollbarWidth: 'none',
      }}>
        {KITS.map((k) => {
          const kItems = items.filter((i) => (i.kit_type ?? 'GERAL') === k.type)
          const active = activeKit === k.type
          return (
            <button key={k.type} onClick={() => { setActiveKit(k.type); setTierFilter('ALL') }}
              style={{
                flexShrink: 0, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${active ? k.color : '#222231'}`,
                background: active ? `${k.color}18` : '#0f0f17',
                color: active ? k.color : '#8a8a99',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80,
              }}>
              <span style={{ fontSize: 22 }}>{k.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{k.label}</span>
              <span style={{ fontSize: 10, color: active ? `${k.color}99` : '#4a4a5a' }}>
                {kItems.filter((i) => i.acquired).length}/{kItems.length}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active kit header */}
      <div style={{
        border: `1px solid ${kitDef.color}33`, borderRadius: 14,
        background: `${kitDef.color}0a`, padding: '14px 16px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 20, marginRight: 8 }}>{kitDef.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f8' }}>{kitDef.label}</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: kitDef.color }}>{totalPct}%</span>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#8a8a99' }}>{kitDef.description}</p>

        {/* Progress bar */}
        <div style={{ height: 5, background: '#1a1a24', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            width: `${totalPct}%`, height: '100%', background: kitDef.color,
            transition: 'width .4s', borderRadius: 4,
          }} />
        </div>

        {/* Tier mini-stats */}
        <div style={{ display: 'flex', gap: 10 }}>
          {TIERS.map((t) => {
            const pct = stats[t].total > 0 ? Math.round((stats[t].done / stats[t].total) * 100) : 0
            return (
              <div key={t} style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: TIER_COLOR[t], fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                  {TIER_LABEL[t]}
                </div>
                <div style={{ fontSize: 12, color: '#d4d4d8' }}>
                  {stats[t].done}<span style={{ color: '#4a4a5a' }}>/{stats[t].total}</span>
                </div>
                <div style={{ fontSize: 10, color: '#6a6a7a' }}>
                  ~{Math.round(pct / 100 * TIER_DAYS[t])}d autonomia
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tier filter + generate button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['ALL', ...TIERS] as const).map((f) => (
            <button key={f} onClick={() => setTierFilter(f)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer',
              background: tierFilter === f ? (f === 'ALL' ? '#6366f1' : TIER_COLOR[f]) : 'transparent',
              color: tierFilter === f ? (f === 'ALL' ? '#fff' : '#0a0a0f') : '#8a8a99',
              border: `1px solid ${tierFilter === f ? (f === 'ALL' ? '#6366f1' : TIER_COLOR[f]) : '#2a2a3a'}`,
            }}>
              {f === 'ALL' ? 'Todos' : TIER_LABEL[f]}
            </button>
          ))}
        </div>
        <button onClick={() => setShowGenerate(!showGenerate)} style={{
          padding: '6px 14px', background: kitDef.color, border: 'none',
          borderRadius: 8, color: '#0a0a0f', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
          + Gerar IA
        </button>
      </div>

      {/* Generate panel */}
      {showGenerate && (
        <div style={{
          border: `1px solid ${kitDef.color}44`, borderRadius: 12, padding: 16,
          background: `${kitDef.color}08`, marginBottom: 14,
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#d4d4d8', fontWeight: 600 }}>
            Gerar checklist com IA para &quot;{kitDef.label}&quot;
          </p>
          {activeKit === 'GERAL' && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#8a8a99', display: 'block', marginBottom: 4 }}>Cenário de emergência</label>
              <select value={scenarioType} onChange={(e) => setScenarioType(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', background: '#0f0f17', color: '#e6e6eb',
                  border: '1px solid #2a2a3a', borderRadius: 7, fontSize: 13,
                }}>
                {SCENARIOS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowGenerate(false)} style={{
              flex: 1, padding: '9px 0', background: 'transparent', border: '1px solid #2a2a3a',
              borderRadius: 8, color: '#8a8a99', fontSize: 13, cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={generate} disabled={generating} style={{
              flex: 2, padding: '9px 0', background: generating ? '#2a2a3a' : kitDef.color,
              border: 'none', borderRadius: 8,
              color: generating ? '#8a8a99' : '#0a0a0f',
              fontSize: 13, fontWeight: 700, cursor: generating ? 'default' : 'pointer',
            }}>
              {generating ? 'Gerando…' : 'Gerar itens'}
            </button>
          </div>
        </div>
      )}

      {/* Item list */}
      <section style={{ border: '1px solid #1e1e2c', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#8a8a99' }}>Carregando…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#8a8a99', margin: '0 0 12px', fontSize: 14 }}>
              Nenhum item neste kit ainda.
            </p>
            <button onClick={() => setShowGenerate(true)} style={{
              padding: '9px 20px', background: kitDef.color, border: 'none', borderRadius: 8,
              color: '#0a0a0f', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              Gerar com IA
            </button>
          </div>
        ) : (
          visible.map((it, idx) => (
            <div key={it.id} style={{
              borderBottom: idx < visible.length - 1 ? '1px solid #1a1a24' : 'none',
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Checkbox */}
                <button onClick={() => void toggle(it.canonical_key, !it.acquired)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                  <Checkbox checked={it.acquired} />
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 14,
                    textDecoration: it.acquired ? 'line-through' : 'none',
                    color: it.acquired ? '#5a5a6a' : '#e6e6eb',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {it.item_name}
                  </span>
                  <span style={{ fontSize: 12, color: '#6a6a7a', fontFamily: 'ui-monospace, monospace' }}>
                    {it.quantity}{it.unit ? ` ${it.unit}` : ''}
                  </span>
                </div>

                {/* Tier badge */}
                <span style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 10, flexShrink: 0,
                  border: `1px solid ${TIER_COLOR[it.tier]}`,
                  color: TIER_COLOR[it.tier], fontWeight: 700, letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}>
                  {TIER_LABEL[it.tier]}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setEditItem(it)} title="Editar" style={{
                    background: 'transparent', border: '1px solid #2a2a3a', borderRadius: 6,
                    padding: '4px 8px', cursor: 'pointer', color: '#8a8a99', fontSize: 12,
                  }}>✎</button>
                  <button onClick={() => setConfirmDeleteId(it.id)} title="Excluir" style={{
                    background: 'transparent', border: '1px solid #3a1a1a', borderRadius: 6,
                    padding: '4px 8px', cursor: 'pointer', color: '#ef4444', fontSize: 12,
                  }}>✕</button>
                </div>
              </div>

              {/* Delete confirm */}
              {confirmDeleteId === it.id && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', background: 'rgba(239,68,68,.08)',
                  border: '1px solid rgba(239,68,68,.25)', borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <span style={{ fontSize: 12, color: '#fca5a5' }}>Excluir este item?</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setConfirmDeleteId(null)} style={{
                      padding: '4px 10px', background: 'transparent', border: '1px solid #3a3a4a',
                      borderRadius: 6, color: '#8a8a99', fontSize: 12, cursor: 'pointer',
                    }}>Não</button>
                    <button onClick={() => void deleteItem(it.id)} style={{
                      padding: '4px 10px', background: '#ef4444', border: 'none',
                      borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>Sim</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {/* Edit modal */}
      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(patch) => void saveEdit(editItem, patch)}
        />
      )}
    </main>
  )
}
