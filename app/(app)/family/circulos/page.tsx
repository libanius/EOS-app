'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLanguage } from '@/lib/i18n'
import { canAccess, type Plan } from '@/lib/feature-gates'
import { QRCodeSVG } from 'qrcode.react'
import QRScanner from '@/components/QRScanner'
import InviteShare from '@/components/InviteShare'
import { MemberSheet, CircleSettingsSheet } from '@/components/world-v2/CircleSheets'
import { haptic } from '@/components/world-v2/motion'
import '@/components/world-v2/world-v2.css'
import { parseScannedValue } from '@/lib/qr-parse'
import { formatGallons, GALLON_SHORT } from '@/lib/units'
import FamilyNav from '@/components/world-v2/FamilyNav'

type JoinRequest = { id: string; requester_id: string; name: string; location: string | null; message: string | null }
type MyRequest = { id: string; circle_id: string; status: string; circle_name: string }
type SearchResult = { id: string; name: string; member_count: number; is_member: boolean; request_status: string | null }

type CircleRole = 'Admin' | 'Editor' | 'Viewer'
type FamilyAccessStatus = 'none' | 'requested' | 'approved' | 'denied'
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
  family_access_status: FamilyAccessStatus
  family_access_requested_at: string | null
  family_access_requested_by: string | null
  family_access_approved_at: string | null
  family_access_approved_by: string | null
  /** Mora na mesma casa (D-123). Nada a ver com a ficha médica. */
  household_status: 'none' | 'requested' | 'confirmed'
  household_requested_by: string | null
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


export default function CirclesPage() {
  const { t, language } = useLanguage()
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
  /** D-124: a decisão sobre uma pessoa mora numa folha, não na linha dela. */
  const [sheetMember, setSheetMember] = useState<{ circleId: string; userId: string } | null>(null)
  const [sheetSettings, setSheetSettings] = useState<string | null>(null)
  /**
   * Quem a pessoa declarou morar na casa dela lá na ficha, e ainda não recebeu
   * o link (D-130). Guardar o nome sem mostrar seria guardar para ninguém.
   */
  const [esperando, setEsperando] = useState<Array<{ id: string; name: string }>>([])

  const carregarEsperando = useCallback(async () => {
    const r = await fetch('/api/household/address').then(x => (x.ok ? x.json() : null)).catch(() => null)
    setEsperando(Array.isArray(r?.pending) ? r.pending : [])
  }, [])

  useEffect(() => { void carregarEsperando() }, [carregarEsperando])

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

  /**
   * Mora comigo (D-123).
   *
   * Pedir qualquer um do círculo pode; **confirmar, só a própria pessoa** — é o
   * que impede alguém de marcar o vizinho e passar a contar a água dele. O
   * servidor repete a regra; aqui a tela só não oferece o botão errado.
   */
  const householdAction = async (circleId: string, userId: string, action: 'pedir' | 'confirmar' | 'sair') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/household`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId }),
      })
      const data = await res.json().catch(() => ({}))
      // Erro dito na tela: "já mora em outra casa" é uma informação acionável,
      // e some se virar só um estado que não mudou.
      if (!res.ok) setError(data.error ?? 'Não foi possível mudar quem mora na casa.')
      else await load()
    } finally {
      setBusy(false)
    }
  }

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

  const respondFamilyAccess = useCallback(async (circleId: string, action: 'accept' | 'deny' | 'leave') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/family-access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')) }
    finally { setBusy(false) }
  }, [load, t])

  const inviteFamilyAccess = useCallback(async (circleId: string, userId: string, status: 'requested' | 'none') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/circles/${circleId}/members/${userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_access_status: status }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
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
  const pt = language === 'pt'

  /*
   * ── APRESENTAÇÃO RECONSTRUÍDA (D-124) ────────────────────────────────────
   *
   * A lógica acima não mudou uma linha. O que mudou é o que se vê.
   *
   * Antes: 139 blocos de estilo escritos à mão, 22 cores literais, zero uso do
   * design system do app, e DOZE controles no cartão de cada membro. O audit
   * deu 7/20, e a tela era a única do EOS fora da linguagem visual do resto.
   *
   * Agora: `wv2`, o mesmo sistema de Família, Preparação e Mundo. E a regra de
   * divisão é uma só — **a lista mostra estado, a folha guarda decisão**. Toca
   * na pessoa, abre tudo o que se decide sobre ela.
   *
   * A lista de membros passa a separar SUA CASA de NO CÍRCULO, que é o modelo
   * do D-123. Isso não é enfeite: quem mora junto soma despensa, quem está no
   * círculo não. Mostrar os dois na mesma lista foi o que fez o dono ler
   * "família íntima" como "mora comigo".
   */
  const membroAberto = sheetMember
    ? circles.find(c => c.id === sheetMember.circleId)?.members.find(m => m.user_id === sheetMember.userId) ?? null
    : null
  const circuloAberto = circles.find(c => c.id === (sheetMember?.circleId ?? sheetSettings)) ?? null

  return (
    <main className="wv2 wv2-circles-page">
      <div className="cir-scroll">
        <header className="cir-head">
          <p className="t-caps ink-3">{t('circles.eyebrow')}</p>
          <h1 className="cir-title">{pt ? 'Quem você alcança quando a rede cai' : 'Who you can reach when the network fails'}</h1>
        </header>

        {/* NAV-T05: Círculos e Ficha viraram seções de Família. */}
        <FamilyNav />

        {error && <p className="cir-banner danger" role="alert">{error}</p>}
        {notice && (
          <p className="cir-banner info" role="status">
            {notice}
            <button type="button" className="cir-close small" onClick={() => setNotice(null)} aria-label="Fechar">✕</button>
          </p>
        )}

        {myRequests.filter(r => r.status === 'pending').length > 0 && (
          <div className="wv2-card">
            <span className="t-caps ink-3">{pt ? 'Pedidos aguardando aprovação' : 'Requests awaiting approval'}</span>
            {myRequests.filter(r => r.status === 'pending').map(r => (
              <p key={r.id} className="t-body">⏳ {r.circle_name}</p>
            ))}
          </div>
        )}

        {/* ── Entrar num círculo ─────────────────────────────────────────── */}
        <div className="wv2-card cir-join">
          <span className="t-caps ink-3">{pt ? 'Entrar num círculo' : 'Join a circle'}</span>
          <label className="cir-field">
            <span className="t-foot ink-2">{pt ? 'Código de convite' : 'Invite code'}</span>
            <div className="row">
              <input
                className="cir-input code"
                placeholder="ABCDEF"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && join()}
                maxLength={6}
                inputMode="text"
                autoCapitalize="characters"
              />
              <button type="button" className="cir-btn primary" onClick={join} disabled={busy || joinCode.length !== 6}>
                {t('circles.joinAction')}
              </button>
            </div>
          </label>
          <button type="button" className="cir-btn" onClick={() => setScanOpen(true)}>
            {pt ? 'Escanear convite' : 'Scan invite'}
          </button>

          <label className="cir-field">
            <span className="t-foot ink-2">{pt ? 'Ou procurar pelo nome' : 'Or search by name'}</span>
            <div className="row">
              <input
                className="cir-input"
                placeholder={pt ? 'Nome do círculo' : 'Circle name'}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchCircles()}
              />
              <button type="button" className="cir-btn" onClick={searchCircles} disabled={searchQ.trim().length < 2}>
                {pt ? 'Buscar' : 'Search'}
              </button>
            </div>
          </label>

          {searchResults.length > 0 && (
            <ul className="cir-results">
              {searchResults.map(r => (
                <li key={r.id}>
                  <span className="t-body">{r.name}</span>
                  <span className="t-foot ink-3">{r.member_count} {pt ? 'pessoas' : 'people'}</span>
                  {r.is_member ? (
                    <span className="cir-state ok">{pt ? 'Você é membro' : 'You are a member'}</span>
                  ) : r.request_status === 'pending' ? (
                    <span className="cir-state warn">{pt ? 'Pedido enviado' : 'Request sent'}</span>
                  ) : (
                    <button type="button" className="cir-btn" onClick={() => requestJoin(r.id, r.name)} disabled={busy}>
                      {pt ? 'Pedir para entrar' : 'Ask to join'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Criar ──────────────────────────────────────────────────────── */}
        <div className="wv2-card">
          <span className="t-caps ink-3">{t('circles.create')}</span>
          {canCreateCircle ? (
            <label className="cir-field">
              <span className="t-foot ink-2">{pt ? 'Nome do círculo' : 'Circle name'}</span>
              <div className="row">
                <input
                  className="cir-input"
                  placeholder={t('circles.namePlaceholder')}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && create()}
                />
                <button type="button" className="cir-btn primary" onClick={create} disabled={busy || !newName.trim()}>
                  {t('circles.createAction')}
                </button>
              </div>
            </label>
          ) : (
            <>
              <p className="t-body ink-2">
                {pt
                  ? 'Criar um círculo faz parte do plano Família. Entrar num círculo por convite é grátis.'
                  : 'Creating a circle is part of the Family plan. Joining by invite is free.'}
              </p>
              <a className="cir-btn" href="/settings">{pt ? 'Ver planos' : 'See plans'}</a>
            </>
          )}
        </div>

        {/* ── Os círculos ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="wv2-card"><p className="t-body ink-2">{t('common.loading')}</p></div>
        ) : circles.length === 0 ? (
          <div className="wv2-card accented">
            <strong className="t-title2">{pt ? 'Nenhum círculo ainda' : 'No circle yet'}</strong>
            <p className="t-body ink-2">
              {pt
                ? 'Um círculo é quem você alcança quando o telefone não funciona. Sem ele, o EOS só sabe de você.'
                : 'A circle is who you reach when the phone is down. Without one, EOS only knows about you.'}
            </p>
          </div>
        ) : (
          circles.map(c => {
            /*
             * "Sua casa" é a MESMA definição do motor (D-129).
             *
             * Este filtro dizia "quem confirmou, mais eu" — e mostrava
             * "SUA CASA (3)" para o dono, que nunca tinha confirmado morar
             * ali. O `lib/household.ts` contava 1, porque a casa é o círculo
             * onde EU confirmei; sem a minha confirmação não existe casa.
             *
             * Duas definições de "sua casa" na mesma versão do app, e a tela
             * mostrava a mais generosa. Agora ela mostra a mesma do motor, e
             * diz o que falta quando eu ainda não confirmei.
             */
            const euConfirmei = c.members.some(m => m.is_me && m.household_status === 'confirmed')
            const casa = euConfirmei
              ? c.members.filter(m => m.household_status === 'confirmed')
              : c.members.filter(m => m.is_me)
            const fora = c.members.filter(m => !casa.includes(m))
            const pendentes = requests[c.id]?.length ?? 0

            const linha = (m: typeof c.members[number]) => {
              const marcas: string[] = []
              if (m.household_status === 'requested') marcas.push(pt ? 'aguardando confirmar' : 'awaiting confirmation')
              if (m.family_access_status === 'approved') marcas.push(pt ? 'ficha compartilhada' : 'record shared')
              if (m.family_access_status === 'requested') marcas.push(pt ? 'ficha solicitada' : 'record requested')
              return (
                <li key={m.user_id}>
                  <button
                    type="button"
                    className="cir-member"
                    onClick={() => { haptic.impact(); setSheetMember({ circleId: c.id, userId: m.user_id }) }}
                    aria-label={`${m.name} — ${pt ? 'abrir opções' : 'open options'}`}
                  >
                    <span className="face" aria-hidden="true">{m.name.slice(0, 2).toUpperCase()}</span>
                    <span className="id">
                      <strong className="t-sub">
                        {m.name}
                        {m.is_me && <span className="ink-3"> · {pt ? 'você' : 'you'}</span>}
                      </strong>
                      <span className="t-foot ink-3">
                        {m.role}{marcas.length ? ` · ${marcas.join(' · ')}` : ''}
                      </span>
                    </span>
                    <span className="chev" aria-hidden="true">›</span>
                  </button>
                </li>
              )
            }

            return (
              <article key={c.id} className="wv2-card cir-circle">
                <header className="cir-circle-head">
                  <div className="id">
                    <strong className="t-title2">{c.name}</strong>
                    <span className="t-foot ink-3">
                      {c.role} · {c.members.length} {pt ? 'pessoas' : 'people'}
                    </span>
                  </div>
                  <div className="score" aria-label={`${pt ? 'Prontidão' : 'Readiness'} ${c.score.total} / 100`}>
                    <b>{c.score.total}</b>
                    <span className="t-foot ink-3">/100</span>
                  </div>
                </header>

                {pendentes > 0 && c.is_admin && (
                  <div className="cir-requests">
                    <span className="t-caps warn">{pt ? `Pedidos de entrada (${pendentes})` : `Join requests (${pendentes})`}</span>
                    {requests[c.id].map(r => (
                      <div key={r.id} className="req">
                        <span className="t-body">{r.name}</span>
                        <span className="acts">
                          <button type="button" className="cir-btn primary" onClick={() => decide(c.id, r.id, 'approve')} disabled={busy}>
                            {pt ? 'Aprovar' : 'Approve'}
                          </button>
                          <button type="button" className="cir-btn" onClick={() => decide(c.id, r.id, 'reject')} disabled={busy}>
                            {pt ? 'Recusar' : 'Decline'}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {casa.length > 0 && (
                  <>
                    <span className="t-caps ink-3">{pt ? `Sua casa (${casa.length})` : `Your house (${casa.length})`}</span>
                    {!euConfirmei && (
                      <p className="t-foot warn">
                        {pt
                          ? 'Você ainda não confirmou que mora aqui — por isso a sua casa conta só você, e as despensas dos outros não somam.'
                          : 'You have not confirmed you live here — so your household counts only you, and the others\u2019 pantries do not pool.'}
                      </p>
                    )}
                    <ul className="cir-members">{casa.map(linha)}</ul>
                  </>
                )}

                {fora.length > 0 && (
                  <>
                    <span className="t-caps ink-3">{pt ? `No círculo (${fora.length})` : `In the circle (${fora.length})`}</span>
                    <ul className="cir-members">{fora.map(linha)}</ul>
                  </>
                )}

                {/*
                  O que o círculo tem, e a frase que impede a leitura errada.
                  Antes isto aparecia como um total somado, do lado da autonomia
                  da casa — o número que o dono rejeitou explicitamente. Água a
                  dois quilômetros não está na sua casa.
                */}
                {c.pooled && (
                  <div className="cir-pooled">
                    <span className="t-caps ink-3">{pt ? 'Recursos no círculo' : 'Resources in the circle'}</span>
                    <p className="t-foot ink-3">
                      {pt
                        ? 'Alcançável, não disponível: isto não entra na autonomia da sua casa.'
                        : 'Reachable, not available: this does not count toward your household autonomy.'}
                    </p>
                    <div className="nums">
                      <span>{formatGallons(Number(c.pooled.water_liters))} {GALLON_SHORT}</span>
                      <span>{Number(c.pooled.food_days).toFixed(0)} {t('circles.days')}</span>
                      <span>{c.pooled.medical_kit_count} {t('circles.kits')}</span>
                      <span>{c.pooled.communication_device_count} {t('circles.comms')}</span>
                    </div>
                  </div>
                )}

                {monitoring[c.id]?.members?.length > 0 && (
                  <div className="cir-monitor">
                    <span className="t-caps ink-3">{pt ? 'Clima onde cada um está' : 'Weather where each one is'}</span>
                    {monitoring[c.id].members.map(m => (
                      <div key={m.user_id} className="row">
                        <span className="dot" style={{ background: SEV_COLOR[m.severity] }} aria-hidden="true" />
                        <span className="t-body">{m.name}</span>
                        <span className="t-foot" style={{ color: SEV_COLOR[m.severity] }}>{SEV_LABEL[m.severity]}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/*
                  Planos de ação do círculo.
                  Estavam aqui antes e continuam: é o combinado escrito, e some
                  do produto se sumir da tela. O que mudou é o tamanho dos
                  botões — os antigos tinham 18px de altura.
                */}
                <div className="cir-plans">
                  <span className="t-caps ink-3">{pt ? 'Planos de ação' : 'Action plans'}</span>
                  {(plans[c.id] ?? []).length === 0 && !newPlan && (
                    <p className="t-foot ink-3">
                      {pt
                        ? 'Nada combinado por escrito ainda. Um plano é o que se executa sem discutir.'
                        : 'Nothing agreed in writing yet. A plan is what gets executed without debate.'}
                    </p>
                  )}
                  {(plans[c.id] ?? []).map(ap => (
                    <div key={ap.id} className="plan">
                      {editPlan?.id === ap.id ? (
                        <>
                          <input
                            className="cir-input"
                            value={editPlan.title}
                            onChange={e => setEditPlan({ ...editPlan, title: e.target.value })}
                            aria-label={pt ? 'Título do plano' : 'Plan title'}
                          />
                          <textarea
                            className="cir-textarea"
                            rows={4}
                            value={editPlan.body}
                            onChange={e => setEditPlan({ ...editPlan, body: e.target.value })}
                            aria-label={pt ? 'Conteúdo do plano' : 'Plan body'}
                          />
                          <span className="acts">
                            <button type="button" className="cir-btn primary" disabled={busy} onClick={() => savePlan(c.id, editPlan.title, editPlan.body, ap.id)}>
                              {pt ? 'Salvar' : 'Save'}
                            </button>
                            <button type="button" className="cir-btn" onClick={() => setEditPlan(null)}>
                              {pt ? 'Cancelar' : 'Cancel'}
                            </button>
                          </span>
                        </>
                      ) : (
                        <>
                          <strong className="t-sub">{ap.title}</strong>
                          <p className="t-body ink-2">{ap.body}</p>
                          <span className="t-foot ink-3">{ap.author}</span>
                          {(c.role === 'Admin' || c.role === 'Editor') && (
                            <span className="acts">
                              <button type="button" className="cir-btn" onClick={() => setEditPlan({ ...ap, circleId: c.id })}>
                                {pt ? 'Editar' : 'Edit'}
                              </button>
                              {c.is_admin && (
                                <button type="button" className="cir-btn danger" disabled={busy} onClick={() => deletePlan(c.id, ap.id)}>
                                  {pt ? 'Excluir' : 'Delete'}
                                </button>
                              )}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {newPlan?.circleId === c.id ? (
                    <div className="plan">
                      <input
                        className="cir-input"
                        placeholder={pt ? 'Título — ex.: Se faltar luz por mais de 6 h' : 'Title — e.g. If power is out over 6 h'}
                        value={newPlan.title}
                        onChange={e => setNewPlan({ ...newPlan, title: e.target.value })}
                        aria-label={pt ? 'Título do plano' : 'Plan title'}
                      />
                      <textarea
                        className="cir-textarea"
                        rows={4}
                        placeholder={pt ? 'Quem faz o quê, nesta ordem.' : 'Who does what, in this order.'}
                        value={newPlan.body}
                        onChange={e => setNewPlan({ ...newPlan, body: e.target.value })}
                        aria-label={pt ? 'Conteúdo do plano' : 'Plan body'}
                      />
                      <span className="acts">
                        <button type="button" className="cir-btn primary" disabled={busy || !newPlan.title.trim() || !newPlan.body.trim()} onClick={() => savePlan(c.id, newPlan.title, newPlan.body)}>
                          {pt ? 'Salvar' : 'Save'}
                        </button>
                        <button type="button" className="cir-btn" onClick={() => setNewPlan(null)}>
                          {pt ? 'Cancelar' : 'Cancel'}
                        </button>
                      </span>
                    </div>
                  ) : (c.role === 'Admin' || c.role === 'Editor') && (
                    <button type="button" className="cir-btn" onClick={() => setNewPlan({ circleId: c.id, title: '', body: '' })}>
                      {pt ? '+ Novo plano' : '+ New plan'}
                    </button>
                  )}
                </div>

                {/*
                  Quem está esperando o link (D-130).

                  A pessoa digitou estes nomes na ficha, ao preencher o
                  endereço, e disse "agora não" para o círculo. Agora o círculo
                  existe. Se a lista não aparecesse aqui, o trabalho dela teria
                  sido guardado para ninguém ver.

                  Marcar como "convidado" é ato dela, não do app: o convite é um
                  link que só ela sabe por onde mandar.
                */}
                {esperando.length > 0 && (
                  <div className="cir-waiting">
                    <span className="t-caps ink-3">
                      {pt ? `Esperando o convite (${esperando.length})` : `Waiting for an invite (${esperando.length})`}
                    </span>
                    <p className="t-foot ink-3">
                      {pt
                        ? 'Você listou estas pessoas ao preencher seu endereço. Mande o link para elas e marque aqui.'
                        : 'You listed these people when filling in your address. Send them the link and mark it here.'}
                    </p>
                    {esperando.map(e => (
                      <div key={e.id} className="row">
                        <span className="t-body">{e.name}</span>
                        <button
                          type="button"
                          className="cir-btn"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true)
                            await fetch('/api/household/address', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: e.id, status: 'sent' }),
                            }).catch(() => {})
                            await carregarEsperando()
                            setBusy(false)
                          }}
                        >
                          {pt ? 'Já convidei' : 'Invited'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="cir-actions">
                  <InviteShare circleId={c.id} circleName={c.name} inviteCode={c.invite_code} pt={pt} />
                  <button type="button" className="cir-btn" onClick={() => setQrCircleId(qrCircleId === c.id ? null : c.id)}>
                    {qrCircleId === c.id ? (pt ? 'Esconder QR' : 'Hide QR') : (pt ? 'Mostrar QR' : 'Show QR')}
                  </button>
                  <button type="button" className="cir-btn" onClick={() => setSheetSettings(c.id)}>
                    {pt ? 'Ajustes' : 'Settings'}
                  </button>
                </div>

                {qrCircleId === c.id && (
                  <div className="cir-qr">
                    <QRCodeSVG value={c.invite_code} size={148} level="M" />
                    <span className="code">{c.invite_code}</span>
                  </div>
                )}
              </article>
            )
          })
        )}
      </div>

      {membroAberto && circuloAberto && sheetMember && (
        <MemberSheet
          member={membroAberto as never}
          circleName={circuloAberto.name}
          isAdmin={circuloAberto.is_admin}
          busy={busy}
          pt={pt}
          onClose={() => setSheetMember(null)}
          onRole={r => changeRole(circuloAberto.id, membroAberto.user_id, r as CircleRole)}
          onHousehold={a => householdAction(circuloAberto.id, membroAberto.user_id, a)}
          onFamilyAccess={s => inviteFamilyAccess(circuloAberto.id, membroAberto.user_id, s)}
          onRespondFamilyAccess={a => respondFamilyAccess(circuloAberto.id, a)}
          onRemove={() => { removeMember(circuloAberto.id, membroAberto.user_id); setSheetMember(null) }}
        />
      )}

      {sheetSettings && circles.find(c => c.id === sheetSettings) && (() => {
        const c = circles.find(x => x.id === sheetSettings)!
        return (
          <CircleSettingsSheet
            circleName={c.name}
            isAdmin={c.is_admin}
            shareInventory={c.share_inventory}
            sharedFields={c.shared_fields ?? []}
            busy={busy}
            pt={pt}
            onClose={() => setSheetSettings(null)}
            onToggleShare={next => toggleShare(c.id, next)}
            onToggleField={(f, v) => toggleField(c.id, f, v)}
            onRename={() => renameCircle(c.id, c.name)}
            onDelete={() => { deleteCircle(c.id, c.name); setSheetSettings(null) }}
            onLeave={() => { leave(c.id); setSheetSettings(null) }}
          />
        )
      })()}

      {scanOpen && (
        <QRScanner
          title={pt ? 'Escanear convite ou ficha' : 'Scan invite or record'}
          hint={pt
            ? 'Aponte para o QR de convite de um círculo ou para a ficha de emergência de alguém.'
            : 'Point at a circle invite QR or someone’s emergency record.'}
          onScan={onScan}
          onClose={() => setScanOpen(false)}
        />
      )}
    </main>
  )
}
