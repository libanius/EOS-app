'use client'

/**
 * Owner-only gift-code admin (D-060). Client gate is cosmetic — the real
 * authorization is /api/admin/gift-codes (ADMIN_EMAILS). Route is auth-protected
 * in middleware.
 */

import { useCallback, useEffect, useState } from 'react'

type Code = {
  code: string
  plan: 'family' | 'premium'
  grant_days: number
  note: string | null
  redeemed_by: string | null
  redeemed_at: string | null
  created_at: string
}

export default function AdminGiftCodesPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [codes, setCodes] = useState<Code[]>([])
  const [code, setCode] = useState('')
  const [plan, setPlan] = useState<'family' | 'premium'>('premium')
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/gift-codes')
    if (res.status === 403) { setAuthorized(false); return }
    setAuthorized(true)
    const d = await res.json().catch(() => ({}))
    setCodes(d.codes ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/gift-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), plan, grantDays: Number(days), note: note.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: true, text: `Criado: ${d.code} (${d.plan}, ${d.grantDays}d)` })
        setCode(''); setNote(''); load()
      } else {
        setMsg({ ok: false, text: String(d.error ?? 'Erro') })
      }
    } catch {
      setMsg({ ok: false, text: 'Erro de rede.' })
    } finally { setBusy(false) }
  }

  if (authorized === null) return <main style={s.page}><p style={{ color: '#71717a' }}>Carregando…</p></main>
  if (authorized === false) {
    return (
      <main style={s.page}>
        <h1 style={s.h1}>403</h1>
        <p style={{ color: '#a1a1aa' }}>Acesso restrito ao dono do app.</p>
      </main>
    )
  }

  return (
    <main style={s.page}>
      <p style={s.eyebrow}>EOS · ADMIN</p>
      <h1 style={s.h1}>Códigos presente</h1>
      <p style={{ color: '#a1a1aa', margin: '8px 0 24px', fontSize: 14 }}>
        Códigos personalizados de 1 uso que dão um plano temporário sem Stripe.
      </p>

      <div style={s.card}>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Código</span>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="PRESENTE-ANA" style={s.input} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          </label>
          <label style={{ ...s.field, maxWidth: 140 }}>
            <span style={s.label}>Plano</span>
            <select value={plan} onChange={e => setPlan(e.target.value as 'family' | 'premium')} style={s.input}>
              <option value="family">Family</option>
              <option value="premium">Premium</option>
            </select>
          </label>
          <label style={{ ...s.field, maxWidth: 110 }}>
            <span style={s.label}>Dias</span>
            <input value={days} onChange={e => setDays(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={s.input} />
          </label>
        </div>
        <label style={{ ...s.field, marginTop: 12 }}>
          <span style={s.label}>Nota (opcional)</span>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Para quem / campanha" style={s.input} />
        </label>
        <button onClick={create} disabled={busy || !code.trim() || !days} style={{ ...s.btn, opacity: busy || !code.trim() || !days ? 0.5 : 1 }}>
          {busy ? '…' : 'Criar código'}
        </button>
        {msg && <p role="status" style={{ marginTop: 10, fontSize: 13, color: msg.ok ? '#22c55e' : '#f59e0b' }}>{msg.text}</p>}
      </div>

      <h2 style={{ ...s.h2, marginTop: 28 }}>Códigos ({codes.length})</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Código', 'Plano', 'Dias', 'Status', 'Nota'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {codes.map(c => (
              <tr key={c.code}>
                <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</td>
                <td style={s.td}>{c.plan}</td>
                <td style={s.td}>{c.grant_days}</td>
                <td style={{ ...s.td, color: c.redeemed_by ? '#71717a' : '#22c55e' }}>{c.redeemed_by ? 'usado' : 'disponível'}</td>
                <td style={{ ...s.td, color: '#a1a1aa' }}>{c.note ?? '—'}</td>
              </tr>
            ))}
            {codes.length === 0 && <tr><td colSpan={5} style={{ ...s.td, color: '#71717a' }}>Nenhum código ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0f', color: '#f5f5f5', padding: '72px 20px 120px', maxWidth: 720, margin: '0 auto' },
  eyebrow: { margin: 0, color: '#22c55e', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' },
  h1: { margin: '10px 0 0', fontSize: 'clamp(28px, 7vw, 40px)', letterSpacing: '-0.03em' },
  h2: { fontSize: 18, margin: 0 },
  card: { padding: 20, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, background: 'rgba(255,255,255,0.03)' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 160 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717a' },
  input: { minHeight: 46, padding: '10px 12px', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#f5f5f5', fontSize: 15, fontFamily: 'inherit' },
  btn: { marginTop: 16, width: '100%', minHeight: 48, padding: '13px 18px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 14, color: '#22c55e', fontSize: 15, fontWeight: 650, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 },
  th: { textAlign: 'left', padding: '8px 10px', color: '#71717a', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' },
  td: { padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
}
