'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EduContent, EduSourceType, EduStatus } from '@/lib/edu'

const SOURCE_TYPES: EduSourceType[] = ['youtube', 'manual', 'pdf', 'external']
const STATUSES: EduStatus[] = ['draft', 'approved', 'archived']

const EMPTY = {
  id: '',
  title: '',
  source_type: 'youtube' as EduSourceType,
  source_url: '',
  scenario_tags: 'hurricane, fallout, blackout',
  summary: '',
  transcript: '',
  status: 'draft' as EduStatus,
  rag_enabled: false,
}

export default function AdminEduPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [items, setItems] = useState<EduContent[]>([])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/edu?admin=1', { cache: 'no-store' })
    if (response.status === 403) { setAuthorized(false); return }
    const data = await response.json().catch(() => ({}))
    setAuthorized(Boolean(data.canAdmin))
    setItems((data.content ?? []) as EduContent[])
  }, [])

  useEffect(() => { void load() }, [load])

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const response = await fetch('/api/edu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          id: form.id || undefined,
          scenario_tags: form.scenario_tags,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.error === 'migration_pending') throw new Error(data.error ?? 'Erro')
      setMsg({ ok: true, text: form.id ? 'Conteúdo atualizado.' : 'Conteúdo criado.' })
      setForm(EMPTY)
      await load()
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : 'Erro ao salvar.' })
    } finally {
      setBusy(false)
    }
  }

  function edit(item: EduContent) {
    setForm({
      id: item.id,
      title: item.title,
      source_type: item.source_type,
      source_url: item.source_url ?? '',
      scenario_tags: item.scenario_tags.join(', '),
      summary: item.summary,
      transcript: item.transcript,
      status: item.status,
      rag_enabled: item.rag_enabled,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (authorized === null) return <main style={s.page}><p style={s.muted}>Carregando...</p></main>
  if (!authorized) {
    return (
      <main style={s.page}>
        <h1 style={s.h1}>403</h1>
        <p style={s.muted}>Acesso restrito ao dono do app.</p>
      </main>
    )
  }

  return (
    <main style={s.page}>
      <p style={s.eyebrow}>EOS · ADMIN</p>
      <h1 style={s.h1}>EDU</h1>
      <p style={s.muted}>Catálogo aprovado para conteúdo educativo. RAG futuro só ingere o que estiver aprovado e versionado.</p>

      <section style={s.card}>
        <div style={s.grid}>
          <label style={s.field}>
            <span style={s.label}>Título</span>
            <input style={s.input} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Fonte</span>
            <select style={s.input} value={form.source_type} onChange={event => setForm({ ...form, source_type: event.target.value as EduSourceType })}>
              {SOURCE_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label style={s.field}>
            <span style={s.label}>Status</span>
            <select style={s.input} value={form.status} onChange={event => setForm({ ...form, status: event.target.value as EduStatus })}>
              {STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <label style={s.field}>
          <span style={s.label}>URL da fonte</span>
          <input style={s.input} value={form.source_url} onChange={event => setForm({ ...form, source_url: event.target.value })} placeholder="https://youtube.com/..." />
        </label>

        <label style={s.field}>
          <span style={s.label}>Tags de cenário</span>
          <input style={s.input} value={form.scenario_tags} onChange={event => setForm({ ...form, scenario_tags: event.target.value })} />
        </label>

        <label style={s.field}>
          <span style={s.label}>Resumo</span>
          <textarea style={s.textarea} rows={3} value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })} />
        </label>

        <label style={s.field}>
          <span style={s.label}>Transcript / notas</span>
          <textarea style={s.textarea} rows={8} value={form.transcript} onChange={event => setForm({ ...form, transcript: event.target.value })} />
        </label>

        <label style={s.check}>
          <input type="checkbox" checked={form.rag_enabled} onChange={event => setForm({ ...form, rag_enabled: event.target.checked })} />
          <span>Elegível para RAG futuro</span>
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={{ ...s.btn, opacity: busy || !form.title.trim() ? 0.5 : 1 }} onClick={save} disabled={busy || !form.title.trim()}>
            {busy ? 'Salvando...' : form.id ? 'Salvar versão' : 'Criar conteúdo'}
          </button>
          {form.id ? <button style={s.secondary} onClick={() => setForm(EMPTY)}>Novo</button> : null}
        </div>
        {msg ? <p style={{ color: msg.ok ? '#22c55e' : '#f59e0b', fontSize: 13 }}>{msg.text}</p> : null}
      </section>

      <h2 style={s.h2}>Conteúdos ({items.length})</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {items.map(item => (
          <article key={item.id} style={s.item}>
            <div>
              <strong>{item.title}</strong>
              <p style={s.muted}>{item.status} · v{item.version} · {item.source_type} · {item.scenario_tags.join(', ') || 'sem tags'}</p>
            </div>
            <button style={s.secondary} onClick={() => edit(item)}>Editar</button>
          </article>
        ))}
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0f', color: '#f5f5f5', padding: '72px 20px 120px', maxWidth: 860, margin: '0 auto' },
  eyebrow: { margin: 0, color: '#22c55e', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' },
  h1: { margin: '10px 0 8px', fontSize: 'clamp(28px, 7vw, 40px)' },
  h2: { margin: '28px 0 12px', fontSize: 18 },
  muted: { color: '#a1a1aa', fontSize: 14, margin: '6px 0 18px' },
  card: { padding: 20, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 12 },
  grid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717a' },
  input: { minHeight: 46, padding: '10px 12px', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#f5f5f5', fontSize: 15, fontFamily: 'inherit' },
  textarea: { padding: '10px 12px', background: '#111116', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#f5f5f5', fontSize: 15, fontFamily: 'inherit', resize: 'vertical' },
  check: { display: 'flex', gap: 8, alignItems: 'center', color: '#d4d4d8', fontSize: 14 },
  btn: { minHeight: 48, padding: '13px 18px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 14, color: '#22c55e', fontSize: 15, fontWeight: 650, cursor: 'pointer' },
  secondary: { minHeight: 40, padding: '10px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, color: '#e5e7eb', cursor: 'pointer' },
  item: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 14, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, background: 'rgba(255,255,255,0.03)' },
}
