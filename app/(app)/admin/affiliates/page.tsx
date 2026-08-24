'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { money } from '@/lib/affiliate'

type Plan = 'family' | 'premium'

type AffiliateCode = {
  code: string
  tag: string
  active: boolean
  eligible_plans: Plan[]
  discount_percent_off: number
  commission_percent: number
  max_redemptions: number | null
  stripe_coupon_id: string | null
  stripe_promotion_code_id: string | null
  stripe_promotion_code: string | null
  referral_count: number
  conversion_count: number
  owed_cents: number
  paid_cents: number
  created_at: string
}

type Conversion = {
  id: string
  affiliate_code: string
  plan: Plan
  stripe_invoice_id: string
  amount_paid_cents: number
  currency: string
  commission_percent: number
  commission_cents: number
  status: 'owed' | 'paid' | 'void'
  occurred_at: string
}

export default function AdminAffiliatesPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [codes, setCodes] = useState<AffiliateCode[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [code, setCode] = useState('EOSPARTNER')
  const [tag, setTag] = useState('Teste Afiliado app')
  const [family, setFamily] = useState(true)
  const [premium, setPremium] = useState(true)
  const [commission, setCommission] = useState('70')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/affiliates')
    if (res.status === 403) { setAuthorized(false); return }
    setAuthorized(true)
    const data = await res.json().catch(() => ({}))
    setCodes(data.codes ?? [])
    setConversions(data.conversions ?? [])
    if (!res.ok) setMsg({ ok: false, text: String(data.error ?? 'Erro ao carregar afiliados.') })
  }, [])

  useEffect(() => { load() }, [load])

  const totals = useMemo(() => {
    return codes.reduce(
      (acc, item) => ({
        owed: acc.owed + item.owed_cents,
        paid: acc.paid + item.paid_cents,
        referrals: acc.referrals + item.referral_count,
        conversions: acc.conversions + item.conversion_count,
      }),
      { owed: 0, paid: 0, referrals: 0, conversions: 0 },
    )
  }, [codes])

  const create = async () => {
    setBusy(true); setMsg(null)
    try {
      const eligiblePlans: Plan[] = []
      if (family) eligiblePlans.push('family')
      if (premium) eligiblePlans.push('premium')
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          tag,
          eligiblePlans,
          commissionPercent: Number(commission),
          maxRedemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data.error ?? 'Erro'))
      setMsg({ ok: true, text: `Afiliado ${data.code} criado/sincronizado no Stripe.` })
      await load()
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : 'Erro de rede.' })
    } finally {
      setBusy(false)
    }
  }

  if (authorized === null) return <main style={s.page}><p style={{ color: '#71717a' }}>Carregando...</p></main>
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
      <h1 style={s.h1}>Afiliados</h1>
      <p style={s.copy}>
        Crie links/códigos Stripe com desconto e acompanhe quanto deve ser repassado manualmente ao parceiro.
      </p>

      <section style={s.grid}>
        <div style={s.metric}>
          <span style={s.label}>Comissão owed</span>
          <strong style={s.figure}>{money(totals.owed)}</strong>
        </div>
        <div style={s.metric}>
          <span style={s.label}>Comissão paga</span>
          <strong style={s.figure}>{money(totals.paid)}</strong>
        </div>
        <div style={s.metric}>
          <span style={s.label}>Referrals</span>
          <strong style={s.figure}>{totals.referrals}</strong>
        </div>
        <div style={s.metric}>
          <span style={s.label}>Conversões</span>
          <strong style={s.figure}>{totals.conversions}</strong>
        </div>
      </section>

      <section style={s.card}>
        <h2 style={s.h2}>Criar / sincronizar código</h2>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Código</span>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={s.input} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Tag</span>
            <input value={tag} onChange={e => setTag(e.target.value)} style={s.input} placeholder="Campanha / parceiro" />
          </label>
        </div>
        <div style={s.row}>
          <label style={s.check}><input type="checkbox" checked={family} onChange={e => setFamily(e.target.checked)} /> Family</label>
          <label style={s.check}><input type="checkbox" checked={premium} onChange={e => setPremium(e.target.checked)} /> Premium</label>
          <label style={{ ...s.field, maxWidth: 150 }}>
            <span style={s.label}>Comissão %</span>
            <input value={commission} onChange={e => setCommission(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" style={s.input} />
          </label>
          <label style={{ ...s.field, maxWidth: 190 }}>
            <span style={s.label}>Limite de usos</span>
            <input value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Ilimitado" inputMode="numeric" style={s.input} />
          </label>
        </div>
        <p style={s.help}>Desconto Stripe fixo nesta fase: 100% off uma vez. Tracker: 70% do primeiro valor real pago, ajustável por código.</p>
        <button onClick={create} disabled={busy || !code.trim() || !tag.trim() || (!family && !premium)} style={{ ...s.btn, opacity: busy || !code.trim() || !tag.trim() || (!family && !premium) ? 0.5 : 1 }}>
          {busy ? 'Sincronizando...' : 'Criar código Stripe'}
        </button>
        {msg && <p role="status" style={{ marginTop: 10, fontSize: 13, color: msg.ok ? '#22c55e' : '#f59e0b' }}>{msg.text}</p>}
      </section>

      <h2 style={{ ...s.h2, marginTop: 28 }}>Códigos ({codes.length})</h2>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Código', 'Tag', 'Planos', 'Limite', 'Stripe', 'Refs', 'Conv.', 'Owed'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {codes.map(item => (
              <tr key={item.code}>
                <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 800 }}>{item.code}</td>
                <td style={s.td}>{item.tag}</td>
                <td style={s.td}>{item.eligible_plans.join(', ')}</td>
                <td style={s.td}>{item.max_redemptions ?? 'ilimitado'}</td>
                <td style={{ ...s.td, color: item.stripe_promotion_code_id ? '#22c55e' : '#f59e0b' }}>
                  {item.stripe_promotion_code_id ? 'sync' : 'pendente'}
                </td>
                <td style={s.td}>{item.referral_count}</td>
                <td style={s.td}>{item.conversion_count}</td>
                <td style={{ ...s.td, color: item.owed_cents ? '#22c55e' : '#a1a1aa' }}>{money(item.owed_cents)}</td>
              </tr>
            ))}
            {codes.length === 0 && <tr><td colSpan={8} style={{ ...s.td, color: '#71717a' }}>Nenhum código ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 style={{ ...s.h2, marginTop: 28 }}>Conversões ({conversions.length})</h2>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Código', 'Plano', 'Invoice', 'Pago', 'Comissão', 'Status', 'Data'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {conversions.map(item => (
              <tr key={item.id}>
                <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 800 }}>{item.affiliate_code}</td>
                <td style={s.td}>{item.plan}</td>
                <td style={{ ...s.td, fontFamily: 'monospace' }}>{item.stripe_invoice_id}</td>
                <td style={s.td}>{money(item.amount_paid_cents, item.currency)}</td>
                <td style={s.td}>{money(item.commission_cents, item.currency)} · {item.commission_percent}%</td>
                <td style={s.td}>{item.status}</td>
                <td style={s.td}>{new Date(item.occurred_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {conversions.length === 0 && <tr><td colSpan={7} style={{ ...s.td, color: '#71717a' }}>Nenhuma conversão paga ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0f', color: '#f5f5f5', padding: '72px 20px 120px', maxWidth: 1040, margin: '0 auto' },
  eyebrow: { margin: 0, color: '#22c55e', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' },
  h1: { margin: '10px 0 0', fontSize: 'clamp(28px, 7vw, 44px)' },
  h2: { fontSize: 18, margin: '0 0 14px' },
  copy: { color: '#a1a1aa', margin: '8px 0 24px', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 },
  metric: { padding: 16, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, background: 'rgba(255,255,255,0.03)' },
  figure: { display: 'block', marginTop: 6, fontSize: 24 },
  card: { padding: 20, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, background: 'rgba(255,255,255,0.03)' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 170 },
  check: { minHeight: 46, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#d4d4d8' },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717a' },
  input: { minHeight: 46, padding: '10px 12px', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#f5f5f5', fontSize: 15, fontFamily: 'inherit' },
  help: { color: '#71717a', fontSize: 12, lineHeight: 1.5 },
  btn: { marginTop: 14, width: '100%', minHeight: 48, padding: '13px 18px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 14, color: '#22c55e', fontSize: 15, fontWeight: 650, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 },
  th: { textAlign: 'left', padding: '8px 10px', color: '#71717a', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' },
  td: { padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' },
}
