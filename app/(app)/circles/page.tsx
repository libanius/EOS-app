'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n'

type CircleRole = 'Admin' | 'Editor' | 'Viewer'
type Severity = 'CRITICAL' | 'HIGH' | 'WATCH' | 'MODERATE' | 'CLEAR'

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', WATCH: '#eab308', MODERATE: '#3b82f6', CLEAR: '#22c55e',
}
const SEV_LABEL: Record<Severity, string> = {
  CRITICAL: 'CRÍTICO', HIGH: 'ALTO', WATCH: 'ALERTA', MODERATE: 'MODERADO', CLEAR: 'OK',
}

interface MemberMonitor {
  user_id: string
  name: string
  is_me: boolean
  severity: Severity
  alert_count: number
}

interface CircleMonitor {
  members: MemberMonitor[]
  fetched_at: string
}

interface CircleMember {
  user_id: string
  role: CircleRole
  name: string
  is_me: boolean
}

interface CircleRow {
  id: string
  name: string
  invite_code: string
  leader_id: string
  is_admin: boolean
  role: CircleRole
  share_inventory: boolean
  pooled: {
    water_liters: number
    food_days: number
    medical_kit_count: number
    communication_device_count: number
    member_count: number
  } | null
  score: {
    total: number
    band: 'FRAGILE' | 'BASIC' | 'SOLID' | 'RESILIENT'
    breakdown: { water: number; food: number; medical: number; comms: number; size: number }
  }
  members: CircleMember[]
}

const BAND_COLOR: Record<CircleRow['score']['band'], string> = {
  FRAGILE: '#ef4444', BASIC: '#f59e0b', SOLID: '#3b82f6', RESILIENT: '#22c55e',
}
const ROLE_COLOR: Record<CircleRole, string> = {
  Admin: '#f59e0b', Editor: '#3b82f6', Viewer: '#71717a',
}

export default function CirclesPage() {
  const { t } = useLanguage()
  const [circles, setCircles] = useState<CircleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [monitoring, setMonitoring] = useState<Record<string, CircleMonitor>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/circles', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? t('circles.loadError'))
      setCircles(j.circles ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!circles.length) return
    circles.forEach(c => {
      fetch(`/api/circles/${c.id}/monitoring`)
        .then(r => r.ok ? r.json() : null)
        .then((d: CircleMonitor | null) => {
          if (d) setMonitoring(prev => ({ ...prev, [c.id]: d }))
        })
        .catch(() => {})
    })
  }, [circles])

  const create = useCallback(async () => {
    if (!newName.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/circles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setNewName('')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [newName, load, t])

  const join = useCallback(async () => {
    if (joinCode.trim().length !== 6) return
    setBusy(true)
    try {
      const res = await fetch('/api/circles/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode.trim().toUpperCase() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setJoinCode('')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [joinCode, load, t])

  const toggleShare = useCallback(async (id: string, next: boolean) => {
    setCircles(prev => prev.map(c => c.id === id ? { ...c, share_inventory: next } : c))
    try {
      await fetch(`/api/circles/${id}/share`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share: next }),
      })
      await load()
    } catch { await load() }
  }, [load])

  const leave = useCallback(async (id: string) => {
    if (!confirm(t('circles.leaveConfirm'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${id}/leave`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [load, t])

  const changeRole = useCallback(async (circleId: string, userId: string, role: CircleRole) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/members/${userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [load, t])

  const removeMember = useCallback(async (circleId: string, userId: string) => {
    if (!confirm('Remover este membro?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/members/${userId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [load, t])

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 20px', color: '#e6e6eb', fontFamily: 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#8a8a99' }}>
          {t('circles.eyebrow')}
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 600 }}>{t('circles.title')}</h1>
      </header>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Create / join */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ border: '1px solid #222231', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#8a8a99', marginBottom: 8 }}>{t('circles.create')}</div>
          <input
            placeholder={t('circles.namePlaceholder')}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            style={{ width: '100%', padding: '8px 10px', background: '#0f0f17', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
          />
          <button onClick={create} disabled={busy || !newName.trim()} style={{ padding: '8px 14px', background: busy ? '#2a2a3a' : '#22c55e', color: '#0a0a0f', border: 'none', borderRadius: 6, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
            {t('circles.createAction')}
          </button>
        </div>
        <div style={{ border: '1px solid #222231', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#8a8a99', marginBottom: 8 }}>{t('circles.join')}</div>
          <input
            placeholder="ABCDEF"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && join()}
            maxLength={6}
            style={{ width: '100%', padding: '8px 10px', background: '#0f0f17', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, marginBottom: 8, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: 4, textTransform: 'uppercase', boxSizing: 'border-box' }}
          />
          <button onClick={join} disabled={busy || joinCode.length !== 6} style={{ padding: '8px 14px', background: busy || joinCode.length !== 6 ? '#2a2a3a' : '#3b82f6', color: busy || joinCode.length !== 6 ? '#8a8a99' : '#0a0a0f', border: 'none', borderRadius: 6, fontWeight: 600, cursor: busy || joinCode.length !== 6 ? 'default' : 'pointer' }}>
            {t('circles.joinAction')}
          </button>
        </div>
      </section>

      {/* Circles list */}
      {loading ? (
        <div style={{ color: '#8a8a99' }}>{t('common.loading')}</div>
      ) : circles.length === 0 ? (
        <div style={{ color: '#8a8a99', textAlign: 'center', padding: 40, border: '1px dashed #222231', borderRadius: 10 }}>
          {t('circles.empty')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {circles.map(c => (
            <article key={c.id} style={{ border: '1px solid #222231', borderRadius: 12, padding: 18 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: ROLE_COLOR[c.role], padding: '2px 8px', background: ROLE_COLOR[c.role] + '18', borderRadius: 999, border: '1px solid ' + ROLE_COLOR[c.role] + '44' }}>
                      {c.role}
                    </span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: '#8a8a99', marginTop: 4, letterSpacing: 2 }}>
                    {t('circles.invite')} · {c.invite_code}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: BAND_COLOR[c.score.band], fontWeight: 700 }}>{c.score.band}</div>
                  <div style={{ fontSize: 34, fontWeight: 700, color: BAND_COLOR[c.score.band], lineHeight: 1, marginTop: 2, fontFamily: 'ui-monospace, Menlo, monospace' }}>{c.score.total}</div>
                  <div style={{ fontSize: 11, color: '#4a4a5a', marginTop: 2 }}>/ 100</div>
                </div>
              </div>

              {/* Score breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 14 }}>
                {Object.entries(c.score.breakdown).map(([key, val]) => (
                  <div key={key} style={{ padding: 8, border: '1px solid #1a1a24', borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#8a8a99', textTransform: 'uppercase', letterSpacing: 1 }}>{key}</div>
                    <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600, marginTop: 2 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Member monitoring */}
              {monitoring[c.id]?.members && monitoring[c.id].members.length > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: '#0f0f17', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#8a8a99', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Monitoramento da rede
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {monitoring[c.id].members.map(m => (
                      <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[m.severity], flexShrink: 0, boxShadow: m.severity !== 'CLEAR' ? `0 0 6px ${SEV_COLOR[m.severity]}` : 'none' }} />
                        <span style={{ flex: 1, fontSize: 13 }}>{m.name}{m.is_me && <span style={{ color: '#52525b', marginLeft: 4 }}>(você)</span>}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: SEV_COLOR[m.severity] }}>{SEV_LABEL[m.severity]}</span>
                        {m.alert_count > 0 && <span style={{ fontSize: 11, color: '#52525b' }}>{m.alert_count} alerta{m.alert_count > 1 ? 's' : ''}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pooled inventory */}
              {c.pooled && (
                <div style={{ marginTop: 14, padding: 12, background: '#0f0f17', borderRadius: 8, fontSize: 13, color: '#a5a5b5', fontFamily: 'ui-monospace, Menlo, monospace', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  <span>👥 {c.pooled.member_count} {t('circles.members')}</span>
                  <span>💧 {Number(c.pooled.water_liters).toFixed(1)} L</span>
                  <span>🍲 {Number(c.pooled.food_days).toFixed(1)} {t('circles.days')}</span>
                  <span>⛑ {c.pooled.medical_kit_count} {t('circles.kits')}</span>
                  <span>📻 {c.pooled.communication_device_count} {t('circles.comms')}</span>
                </div>
              )}

              {/* Members list */}
              {c.members.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#8a8a99', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    {t('circles.members')}
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {c.members.map(m => (
                      <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#0f0f17', borderRadius: 8 }}>
                        <span style={{ flex: 1, fontSize: 14 }}>
                          {m.name}
                          {m.is_me && <span style={{ fontSize: 11, color: '#8a8a99', marginLeft: 6 }}>(você)</span>}
                        </span>
                        {c.is_admin && !m.is_me ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                              value={m.role}
                              onChange={e => changeRole(c.id, m.user_id, e.target.value as CircleRole)}
                              disabled={busy}
                              style={{ fontSize: 11, padding: '2px 6px', background: '#1a1a24', color: ROLE_COLOR[m.role], border: '1px solid #2a2a3a', borderRadius: 4, cursor: 'pointer' }}
                            >
                              <option value="Admin">Admin</option>
                              <option value="Editor">Editor</option>
                              <option value="Viewer">Viewer</option>
                            </select>
                            <button onClick={() => removeMember(c.id, m.user_id)} disabled={busy} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4, cursor: 'pointer' }}>
                              ×
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: ROLE_COLOR[m.role], padding: '2px 8px', background: ROLE_COLOR[m.role] + '18', borderRadius: 999 }}>
                            {m.role}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#a5a5b5', cursor: 'pointer' }}>
                  <input type="checkbox" checked={c.share_inventory} onChange={e => toggleShare(c.id, e.target.checked)} />
                  {t('circles.shareInventory')}
                </label>
                {!c.is_admin && (
                  <button onClick={() => leave(c.id)} disabled={busy} style={{ padding: '6px 14px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                    {t('circles.leave')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
