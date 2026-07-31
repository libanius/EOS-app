'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n'
import { canAccess, type Plan } from '@/lib/feature-gates'
import { QRCodeSVG } from 'qrcode.react'
import QRScanner from '@/components/QRScanner'
import { parseScannedValue } from '@/lib/qr-parse'

type JoinRequest = { id: string; requester_id: string; name: string; location: string | null; message: string | null }
type MyRequest = { id: string; circle_id: string; status: string; circle_name: string }
type SearchResult = { id: string; name: string; member_count: number; is_member: boolean; request_status: string | null }

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
  share_inventory: boolean
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
}

interface ActionPlan {
  id: string
  title: string
  body: string
  author: string
  is_mine: boolean
  updated_at: string
}

interface CircleRow {
  id: string
  name: string
  invite_code: string
  leader_id: string
  is_admin: boolean
  role: CircleRole
  share_inventory: boolean
  shared_fields: string[]
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
  const [plan, setPlan] = useState<Plan>('free')
  const [monitoring, setMonitoring] = useState<Record<string, CircleMonitor>>({})
  const [plans, setPlans] = useState<Record<string, ActionPlan[]>>({})
  const [qrCircleId, setQrCircleId] = useState<string | null>(null)
  const [newPlan, setNewPlan] = useState<{ circleId: string; title: string; body: string } | null>(null)
  const [editPlan, setEditPlan] = useState<ActionPlan & { circleId: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [requests, setRequests] = useState<Record<string, JoinRequest[]>>({})
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [scanOpen, setScanOpen] = useState(false)

  const loadMyRequests = useCallback(async () => {
    try {
      const r = await fetch('/api/circles/my-requests', { cache: 'no-store' })
      const d = await r.json()
      if (r.ok) setMyRequests(d.requests ?? [])
    } catch { /* non-critical */ }
  }, [])

  const loadRequests = useCallback(async (circleId: string) => {
    try {
      const r = await fetch(`/api/circles/${circleId}/requests`, { cache: 'no-store' })
      const d = await r.json()
      if (r.ok) setRequests(prev => ({ ...prev, [circleId]: d.requests ?? [] }))
    } catch { /* non-critical */ }
  }, [])

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
    fetch('/api/profile/plan').then(r => r.ok ? r.json() : null).then(d => { if (d?.plan) setPlan(d.plan as Plan) }).catch(() => {})
  }, [])

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
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setJoinCode('')
      // With the approval flow, joining creates a pending request — the Admin
      // must approve before membership. Reflect that instead of expecting the
      // circle to appear immediately.
      if (j.status === 'pending') {
        setNotice(`Pedido enviado para "${j.circle?.name ?? ''}". Aguarde a aprovação do administrador.`)
      }
      await Promise.all([load(), loadMyRequests()])
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [joinCode, load, loadMyRequests, t])

  const decide = useCallback(async (circleId: string, reqId: string, action: 'approve' | 'reject') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/requests/${reqId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await Promise.all([loadRequests(circleId), load()])
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [load, loadRequests, t])

  const searchCircles = useCallback(async () => {
    const q = searchQ.trim()
    if (q.length < 2) { setSearchResults([]); return }
    try {
      const r = await fetch(`/api/circles/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
      const d = await r.json()
      if (r.ok) setSearchResults(d.circles ?? [])
    } catch { /* non-critical */ }
  }, [searchQ])

  const requestJoin = useCallback(async (circleId: string, name: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setNotice(j.status === 'member'
        ? `Você já faz parte de "${name}".`
        : `Pedido enviado para "${name}". Aguarde a aprovação.`)
      await Promise.all([loadMyRequests(), searchCircles()])
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [loadMyRequests, searchCircles, t])

  const onScan = useCallback((text: string) => {
    setScanOpen(false)
    const parsed = parseScannedValue(text)
    if (parsed.type === 'invite-code') {
      setJoinCode(parsed.code)
      setNotice(`Código lido: ${parsed.code}. Toque em "${t('circles.joinAction')}" para enviar o pedido.`)
    } else if (parsed.type === 'ficha') {
      window.location.href = `/ficha/${parsed.id}`
    } else {
      setError('QR não reconhecido. Escaneie um convite de círculo ou uma ficha EOS.')
    }
  }, [t])

  useEffect(() => { void loadMyRequests() }, [loadMyRequests])
  useEffect(() => {
    circles.forEach(c => { if (c.is_admin) void loadRequests(c.id) })
  }, [circles, loadRequests])

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

  const toggleField = useCallback(async (id: string, field: string, checked: boolean) => {
    // Empty shared_fields means "share all" (see render). So unchecking a field
    // from that default must first expand to the explicit full list, then remove
    // — otherwise [].filter() stays [] and the field re-checks itself.
    //
    // D-064: 'location' is deliberately NOT in this list. Expanding the legacy
    // default must never switch position sharing on behind the user's back.
    const ALL_FIELDS = ['water', 'food', 'medical', 'comms', 'emergency_contact']
    const nextFields = (current: string[]) => {
      const base = current.length === 0 ? ALL_FIELDS : current
      return checked ? Array.from(new Set([...base, field])) : base.filter(f => f !== field)
    }
    setCircles(prev => prev.map(c => (c.id === id ? { ...c, shared_fields: nextFields(c.shared_fields) } : c)))
    try {
      const circle = circles.find(c => c.id === id)
      if (!circle) return
      await fetch(`/api/circles/${id}/share`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared_fields: nextFields(circle.shared_fields) }),
      })
    } catch { await load() }
  }, [circles, load])

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

  /**
   * Renomear e excluir o círculo.
   *
   * Excluir é destrutivo e em cascata: leva membros, o plano de voo da família e
   * os treinos compartilhados. Por isso pede o nome exato — a diferença entre um
   * toque errado e perder o plano que a família combinou. Depois de excluir, a
   * tela diz o que foi apagado, em números.
   */
  const renameCircle = useCallback(async (circleId: string, current: string) => {
    const name = prompt('Novo nome do círculo:', current)?.trim()
    if (!name || name === current) return
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [load, t])

  const deleteCircle = useCallback(async (circleId: string, name: string) => {
    const typed = prompt(
      `Excluir "${name}" apaga o círculo para todo mundo, junto com o plano da família e os treinos compartilhados. Isso não tem volta.\n\nEscreva o nome exato para confirmar:`,
    )?.trim()
    if (!typed) return
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: typed }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      setNotice(`"${d.deleted?.name}" excluído · ${d.deleted?.members ?? 0} membro(s), ${d.deleted?.plans ?? 0} plano(s)`)
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


  const loadPlans = async (circleId: string) => {
    try {
      const res = await fetch(`/api/circles/${circleId}/plans`)
      const d = await res.json()
      if (res.ok) setPlans(prev => ({ ...prev, [circleId]: d.plans ?? [] }))
    } catch {}
  }

  useEffect(() => {
    circles.forEach(c => { void loadPlans(c.id) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circles])

  const savePlan = async (circleId: string, title: string, body: string, planId?: string) => {
    setBusy(true)
    try {
      const res = await fetch(planId ? `/api/circles/${circleId}/plans/${planId}` : `/api/circles/${circleId}/plans`, {
        method: planId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setNewPlan(null)
      setEditPlan(null)
      await loadPlans(circleId)
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }

  const deletePlan = async (circleId: string, planId: string) => {
    if (!confirm('Excluir este plano?')) return
    setBusy(true)
    try {
      await fetch(`/api/circles/${circleId}/plans/${planId}`, { method: 'DELETE' })
      await loadPlans(circleId)
    } catch {}
    finally { setBusy(false) }
  }

  // Joining a circle you were invited to (code / QR / search) is available to
  // everyone — being invited must never require a paid plan. Only CREATING a
  // circle is gated to the Família tier.
  const canCreateCircle = canAccess('circulos', plan)

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(20px, 5vw, 32px) clamp(16px, 5vw, 24px) calc(96px + env(safe-area-inset-bottom, 0px))', color: '#e6e6eb', fontFamily: 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif' }}>
      <header style={{ marginBottom: 28 }}>
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

      {notice && (
        <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.4)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, color: '#93c5fd', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* My pending join requests */}
      {myRequests.filter(r => r.status === 'pending').length > 0 && (
        <div style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.35)', padding: '12px 14px', borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#eab308', marginBottom: 6, letterSpacing: 0.5 }}>PEDIDOS AGUARDANDO APROVAÇÃO</div>
          {myRequests.filter(r => r.status === 'pending').map(r => (
            <div key={r.id} style={{ fontSize: 14, color: '#e6e6eb' }}>⏳ {r.circle_name}</div>
          ))}
        </div>
      )}

      {/* Create / join */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div style={{ border: '1px solid #222231', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#8a8a99', marginBottom: 8 }}>{t('circles.create')}</div>
          {canCreateCircle ? (
            <>
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
            </>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: '#8a8a99', lineHeight: 1.5, margin: '0 0 10px' }}>
                🔒 Criar um círculo faz parte do plano <strong style={{ color: '#e6e6eb' }}>Família</strong>. Entrar num círculo por convite é grátis — use o campo ao lado.
              </p>
              <button onClick={() => alert('Upgrade de plano em breve!')} style={{ padding: '8px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, color: '#22c55e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Fazer upgrade →
              </button>
            </div>
          )}
        </div>
        <div style={{ border: '1px solid #222231', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#8a8a99', marginBottom: 8 }}>{t('circles.join')}</div>
          <input
            placeholder="ABCDEF"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && join()}
            maxLength={6}
            style={{ width: '100%', padding: '8px 10px', background: '#0f0f17', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, marginBottom: 8, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: 4, textTransform: 'uppercase', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={join} disabled={busy || joinCode.length !== 6} style={{ padding: '8px 14px', background: busy || joinCode.length !== 6 ? '#2a2a3a' : '#3b82f6', color: busy || joinCode.length !== 6 ? '#8a8a99' : '#0a0a0f', border: 'none', borderRadius: 6, fontWeight: 600, cursor: busy || joinCode.length !== 6 ? 'default' : 'pointer' }}>
              {t('circles.joinAction')}
            </button>
            <button onClick={() => setScanOpen(true)} title="Escanear convite" style={{ padding: '8px 12px', background: 'transparent', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
              📷 Escanear
            </button>
          </div>
        </div>
      </section>

      {/* Search circles by name (request to join without a code) */}
      <section style={{ border: '1px solid #222231', borderRadius: 10, padding: 16, marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: '#8a8a99', marginBottom: 8 }}>Encontrar um círculo por nome</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Nome do círculo"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchCircles()}
            style={{ flex: 1, padding: '8px 10px', background: '#0f0f17', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, boxSizing: 'border-box' }}
          />
          <button onClick={searchCircles} disabled={searchQ.trim().length < 2} style={{ padding: '8px 14px', background: searchQ.trim().length < 2 ? '#2a2a3a' : '#3b82f6', color: searchQ.trim().length < 2 ? '#8a8a99' : '#0a0a0f', border: 'none', borderRadius: 6, fontWeight: 600, cursor: searchQ.trim().length < 2 ? 'default' : 'pointer' }}>Buscar</button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {searchResults.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: '#0f0f17', border: '1px solid #222231', borderRadius: 8 }}>
                <span style={{ fontSize: 14 }}>{r.name} <span style={{ color: '#8a8a99', fontSize: 12 }}>· {r.member_count} membro(s)</span></span>
                {r.is_member ? (
                  <span style={{ fontSize: 12, color: '#22c55e' }}>Você é membro</span>
                ) : r.request_status === 'pending' ? (
                  <span style={{ fontSize: 12, color: '#eab308' }}>Pedido enviado</span>
                ) : (
                  <button onClick={() => requestJoin(r.id, r.name)} disabled={busy} style={{ fontSize: 12, padding: '4px 10px', background: '#3b82f6', color: '#0a0a0f', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Pedir para entrar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Circles list */}
      {loading ? (
        <div style={{ color: '#8a8a99' }}>{t('common.loading')}</div>
      ) : circles.length === 0 ? (
        <div style={{ color: '#8a8a99', textAlign: 'center', padding: 40, border: '1px dashed #222231', borderRadius: 10 }}>
          {t('circles.empty')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {circles.map(c => (
            <article key={c.id} style={{ border: '1px solid #222231', borderRadius: 12, padding: 'clamp(16px, 4vw, 22px)' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: ROLE_COLOR[c.role], padding: '2px 8px', background: ROLE_COLOR[c.role] + '18', borderRadius: 999, border: '1px solid ' + ROLE_COLOR[c.role] + '44' }}>
                      {c.role}
                    </span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: '#8a8a99', letterSpacing: 2 }}>
                      {t('circles.invite')} · {c.invite_code}
                    </span>
                    <button onClick={() => setQrCircleId(qrCircleId === c.id ? null : c.id)} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', border: '1px solid #2a2a3a', borderRadius: 4, color: '#8a8a99', cursor: 'pointer' }}>
                      QR
                    </button>
                    {c.is_admin && (
                      <>
                        <button onClick={() => renameCircle(c.id, c.name)} disabled={busy} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', border: '1px solid #2a2a3a', borderRadius: 4, color: '#8a8a99', cursor: 'pointer' }}>
                          Renomear
                        </button>
                        <button onClick={() => deleteCircle(c.id, c.name)} disabled={busy} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4, color: '#ef4444', cursor: 'pointer' }}>
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                  {qrCircleId === c.id && (
                    <div style={{ marginTop: 12, padding: 16, background: '#fff', borderRadius: 10, display: 'inline-block' }}>
                      <QRCodeSVG value={c.invite_code} size={140} level="M" />
                      <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, color: '#111', fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: 3 }}>{c.invite_code}</div>
                    </div>
                  )}
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

              {/* Pending join requests (Admin only) */}
              {c.is_admin && (requests[c.id]?.length ?? 0) > 0 && (
                <div style={{ marginTop: 14, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#eab308', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
                    Pedidos de entrada ({requests[c.id].length})
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {requests[c.id].map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: '#e6e6eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                          {r.location && <div style={{ fontSize: 12, color: '#8a8a99' }}>{r.location}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => decide(c.id, r.id, 'approve')} disabled={busy} style={{ fontSize: 12, padding: '4px 10px', background: '#22c55e', color: '#0a0a0f', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Aprovar</button>
                          <button onClick={() => decide(c.id, r.id, 'reject')} disabled={busy} style={{ fontSize: 12, padding: '4px 10px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, cursor: 'pointer' }}>Recusar</button>
                        </div>
                      </div>
                    ))}
                  </div>
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
                        {m.emergency_contact_name && (
                          <a href={m.emergency_contact_phone ? `tel:${m.emergency_contact_phone}` : undefined} style={{ fontSize: 11, color: '#22c55e', textDecoration: 'none', flexShrink: 0, padding: '2px 8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6 }}>
                            📞 {m.emergency_contact_name}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Plans */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#8a8a99', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Planos de Ação ({plans[c.id]?.length ?? 0})
                  </div>
                  {(c.is_admin || c.role === 'Editor') && (
                    <button onClick={() => setNewPlan({ circleId: c.id, title: '', body: '' })} style={{ fontSize: 11, padding: '2px 10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6, color: '#22c55e', cursor: 'pointer' }}>
                      + Novo plano
                    </button>
                  )}
                </div>

                {newPlan?.circleId === c.id && (
                  <div style={{ padding: 12, background: '#0f0f17', borderRadius: 8, marginBottom: 10 }}>
                    <input value={newPlan.title} onChange={e => setNewPlan(p => p ? { ...p, title: e.target.value } : null)} placeholder="Título do plano" maxLength={100} style={{ width: '100%', padding: '6px 10px', background: '#1a1a24', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, marginBottom: 8, fontSize: 13, boxSizing: 'border-box' }} />
                    <textarea value={newPlan.body} onChange={e => setNewPlan(p => p ? { ...p, body: e.target.value } : null)} placeholder="Descreva os passos do plano de emergência…" rows={4} maxLength={5000} style={{ width: '100%', padding: '6px 10px', background: '#1a1a24', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, marginBottom: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => savePlan(c.id, newPlan.title, newPlan.body)} disabled={busy || !newPlan.title.trim() || !newPlan.body.trim()} style={{ padding: '6px 14px', background: '#22c55e', color: '#0a0a0f', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
                      <button onClick={() => setNewPlan(null)} style={{ padding: '6px 14px', background: 'transparent', color: '#8a8a99', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {(plans[c.id] ?? []).map(plan => (
                  <div key={plan.id} style={{ padding: 12, background: '#0f0f17', borderRadius: 8, marginBottom: 8 }}>
                    {editPlan?.id === plan.id ? (
                      <>
                        <input value={editPlan.title} onChange={e => setEditPlan(p => p ? { ...p, title: e.target.value } : null)} maxLength={100} style={{ width: '100%', padding: '6px 10px', background: '#1a1a24', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, marginBottom: 8, fontSize: 13, boxSizing: 'border-box' }} />
                        <textarea value={editPlan.body} onChange={e => setEditPlan(p => p ? { ...p, body: e.target.value } : null)} rows={4} maxLength={5000} style={{ width: '100%', padding: '6px 10px', background: '#1a1a24', color: '#e6e6eb', border: '1px solid #2a2a3a', borderRadius: 6, marginBottom: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => savePlan(c.id, editPlan.title, editPlan.body, plan.id)} disabled={busy} style={{ padding: '6px 14px', background: '#22c55e', color: '#0a0a0f', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
                          <button onClick={() => setEditPlan(null)} style={{ padding: '6px 14px', background: 'transparent', color: '#8a8a99', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{plan.title}</span>
                            <span style={{ fontSize: 11, color: '#52525b', marginLeft: 8 }}>{plan.author} · {new Date(plan.updated_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                          {(c.is_admin || plan.is_mine) && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => setEditPlan({ ...plan, circleId: c.id })} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', color: '#8a8a99', border: '1px solid #2a2a3a', borderRadius: 4, cursor: 'pointer' }}>Editar</button>
                              {c.is_admin && <button onClick={() => deletePlan(c.id, plan.id)} style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4, cursor: 'pointer' }}>×</button>}
                            </div>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#a5a5b5', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{plan.body}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Controls */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: c.share_inventory ? 10 : 0 }}>
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
                {/* D-064: location has its own consent, independent of inventory
                    sharing — it is a more sensitive fact than litres of water. */}
                <div style={{ paddingTop: 10, borderTop: '1px solid #1a1a24' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#a5a5b5', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={c.shared_fields.includes('location')}
                      onChange={e => toggleField(c.id, 'location', e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: '#22c55e' }}
                    />
                    📍 {t('circles.shareLocation')}
                  </label>
                  <p style={{ margin: '6px 0 0 22px', fontSize: 11, lineHeight: 1.4, color: '#6b6b8a' }}>
                    {t('circles.shareLocationHelp')}
                  </p>
                </div>
                {c.share_inventory && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTop: '1px solid #1a1a24' }}>
                    {(['water', 'food', 'medical', 'comms', 'emergency_contact'] as const).map(field => {
                      const checked = c.shared_fields.length === 0 || c.shared_fields.includes(field)
                      const labels: Record<string, string> = { water: '💧 Água', food: '🍲 Comida', medical: '⛑ Saúde', comms: '📻 Comms', emergency_contact: '📞 Contato' }
                      return (
                        <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: checked ? '#a5a5b5' : '#4a4a5a', cursor: 'pointer', padding: '4px 8px', background: checked ? 'rgba(34,197,94,0.06)' : '#0f0f17', borderRadius: 6, border: `1px solid ${checked ? 'rgba(34,197,94,0.2)' : '#1a1a24'}` }}>
                          <input type="checkbox" checked={checked} onChange={e => toggleField(c.id, field, e.target.checked)} style={{ width: 12, height: 12, accentColor: '#22c55e' }} />
                          {labels[field]}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {scanOpen && (
        <QRScanner
          title="Escanear convite ou ficha"
          hint="Aponte para o QR de convite de um círculo ou para a ficha de emergência de alguém."
          onScan={onScan}
          onClose={() => setScanOpen(false)}
        />
      )}
    </main>
  )
}
