'use client'

/**
 * `/admin/content` — revisão das pautas do pipeline (CONTENT-001 §3.6, T04).
 *
 * O dono não escreve aqui: vê a prévia exata da página que a família verá, em PT
 * e EN, o resultado da validação e o que mudou desde a versão no ar, e toca em
 * "Publicar versão N" ou "Arquivar". A autorização de verdade está nas rotas
 * (`ADMIN_EMAILS`); o 403 aqui só troca a tela.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@/components/signals/signals.css'
import './content-admin.css'
import SignalPage from '@/components/signals/SignalPage'
import { previewSignal, signalVideoFor, type ContentPackage, type PackageBlock } from '@/lib/content-package'
import type { PackageState } from '@/lib/content-store'

type Item = {
  slug: string
  latest: { version: number; status: 'draft' | 'review' | 'archived'; receivedAt: string; payload: ContentPackage }
  state: PackageState
  problems: string[]
  changed: PackageBlock[]
  versions: Array<{ version: number; status: string; receivedAt: string; appliedAt: string | null }>
}

const BLOCK_LABEL: Record<PackageBlock, string> = {
  signal: 'Sinal e protocolo',
  lesson: 'Lição do EDU',
  video: 'Vídeos',
  status: 'Status',
}

const EDU_LABEL: Record<string, string> = { approved: 'aprovado', draft: 'rascunho', archived: 'arquivado' }

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  review: 'Em revisão',
  archived: 'Pedido de arquivo',
}

function when(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function todayNY() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export default function AdminContentPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [lang, setLang] = useState<'pt' | 'en'>('pt')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async (keep?: string | null) => {
    const res = await fetch('/api/admin/content', { cache: 'no-store' })
    if (res.status === 403) { setAuthorized(false); return }
    setAuthorized(true)
    const d = await res.json().catch(() => ({}))
    setMigrationPending(Boolean(d.migrationPending))
    const list: Item[] = d.packages ?? []
    setItems(list)
    setSelected(prev => {
      const want = keep ?? prev
      return want && list.some(i => i.slug === want) ? want : list[0]?.slug ?? null
    })
  }, [])
  useEffect(() => { void load() }, [load])

  const item = items.find(i => i.slug === selected) ?? null
  const preview = useMemo(() => (item ? previewSignal(item.latest.payload, todayNY()) : null), [item])

  const act = async (kind: 'publish' | 'archive') => {
    if (!item) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/content/${item.slug}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: kind === 'publish' ? JSON.stringify({ version: item.latest.version }) : '{}',
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        if (kind === 'publish') {
          const rag = d.rag === 'ingested' ? 'lição no RAG' : `RAG pendente${d.ragError ? `: ${d.ragError}` : ''} — toque de novo em Publicar para tentar outra vez`
          setMsg({ ok: d.rag === 'ingested', text: `Versão ${item.latest.version} no ar. ${rag}.` })
        } else {
          setMsg({ ok: true, text: `Arquivado. Resumo histórico: ${d.archiveRag === 'ingested' ? 'no RAG' : 'pendente — toque em "Tentar o resumo histórico de novo"'}.` })
        }
      } else {
        setMsg({ ok: false, text: String(d.error ?? 'Erro') + (d.problems ? ` — ${d.problems.join('; ')}` : '') })
      }
      await load(item.slug)
    } catch {
      setMsg({ ok: false, text: 'Erro de rede. Nada foi confirmado; recarregue antes de tentar de novo.' })
    } finally {
      setBusy(false)
    }
  }

  if (authorized === null) return <div className="sg ca"><div className="sg-wrap"><p className="sg-muted">Carregando…</p></div></div>
  if (!authorized) return <div className="sg ca"><div className="sg-wrap"><div className="sg-empty">Somente o dono do app acessa esta página.</div></div></div>

  const canPublish = Boolean(item && item.latest.status !== 'archived' && item.problems.length === 0 &&
    (item.state.liveVersion !== item.latest.version || item.state.rag === 'pending'))
  const republishRag = Boolean(item && item.state.liveVersion === item.latest.version && item.state.rag === 'pending')
  const lesson = item?.latest.payload.lesson
  const videoId = item ? signalVideoFor(item.latest.payload.video, lang) : null

  return (
    <div className="sg ca">
      <div className="sg-wrap ca-wrap">
        <header className="sg-stack" style={{ gap: 6 }}>
          <span className="sg-label mint">Pipeline de conteúdo</span>
          <h1 className="ca-title">Revisão das pautas</h1>
          <p className="sg-muted">O pipeline entrega; nada vai ao ar sem o seu toque em Publicar.</p>
        </header>

        {migrationPending && (
          <div className="ca-alert">A migração do pipeline ainda não foi aplicada no Supabase. Rode <code>20261106000000_content_pipeline.sql</code> no SQL Editor.</div>
        )}
        {!migrationPending && !items.length && (
          <div className="sg-empty">Nenhuma pauta recebida ainda. Quando o pipeline enviar a primeira, ela aparece aqui.</div>
        )}

        {items.length > 0 && (
          <nav className="ca-list" aria-label="Pautas">
            {items.map(i => (
              <button
                key={i.slug}
                type="button"
                className="ca-chip"
                aria-pressed={i.slug === selected}
                onClick={() => { setSelected(i.slug); setMsg(null) }}
              >
                <span className="ca-chip-slug">{i.slug}</span>
                <span className="ca-chip-meta">
                  v{i.latest.version}
                  {i.state.awaitingApproval && <b className="ca-dot" aria-label="esperando aprovação" />}
                  {i.problems.length > 0 && <b className="ca-dot bad" aria-label="com problemas" />}
                </span>
              </button>
            ))}
          </nav>
        )}

        {item && (
          <section className="sg-panel sg-stack" aria-labelledby="ca-pkg">
            <div className="sg-row" style={{ justifyContent: 'space-between' }}>
              <h2 id="ca-pkg" className="ca-h2">{item.latest.payload.signal.title[lang]}</h2>
              <div className="ca-lang" role="group" aria-label="Idioma da prévia">
                {(['pt', 'en'] as const).map(l => (
                  <button key={l} type="button" className="sg-pill" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
                ))}
              </div>
            </div>

            <dl className="ca-facts">
              <div><dt>No ar</dt><dd>{item.state.liveVersion ? `v${item.state.liveVersion}` : item.state.signal === 'archived' ? 'arquivado' : '—'}</dd></div>
              <div><dt>Recebida</dt><dd>v{item.latest.version} · {STATUS_LABEL[item.latest.status]} · {when(item.latest.receivedAt)}</dd></div>
              <div><dt>EDU</dt><dd>{item.state.edu === 'none' ? '—' : `${EDU_LABEL[item.state.edu] ?? item.state.edu} v${item.state.eduVersion}`}</dd></div>
              {item.state.signal === 'archived' && (
                <div><dt>Histórico no RAG</dt><dd className={item.state.archiveRag === 'pending' ? 'warn' : undefined}>{item.state.archiveRag === 'ingested' ? 'ingerido' : 'pendente'}</dd></div>
              )}
              <div><dt>RAG</dt><dd className={item.state.rag === 'pending' ? 'warn' : undefined}>{item.state.rag === 'none' ? '—' : item.state.rag === 'ingested' ? 'ingerido' : 'pendente'}</dd></div>
            </dl>

            {item.changed.length > 0 && item.state.liveVersion !== item.latest.version && (
              <p className="ca-changed">
                {item.state.liveVersion ? `Muda em relação à v${item.state.liveVersion}: ` : 'Primeira publicação: '}
                {item.changed.map(b => BLOCK_LABEL[b]).join(', ')}.
              </p>
            )}

            {item.problems.length > 0 && (
              <div className="ca-alert" role="alert">
                <strong>Esta versão não passa na validação e não pode ser publicada:</strong>
                <ul>{item.problems.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            )}

            <div className="sg-row ca-actions">
              <button type="button" className="sg-btn primary" disabled={busy || !canPublish} onClick={() => void act('publish')}>
                {republishRag ? `Tentar o RAG de novo (v${item.latest.version})` : `Publicar versão ${item.latest.version}`}
              </button>
              <button
                type="button"
                className="sg-btn"
                disabled={busy || !(item.state.signal === 'published' || (item.state.signal === 'archived' && item.state.archiveRag === 'pending'))}
                onClick={() => void act('archive')}
              >
                {item.state.signal === 'archived' && item.state.archiveRag === 'pending' ? 'Tentar o resumo histórico de novo' : 'Arquivar'}
              </button>
            </div>
            {!canPublish && !item.problems.length && item.latest.status !== 'archived' && item.state.liveVersion === item.latest.version && (
              <p className="sg-note">A versão {item.latest.version} já está no ar.</p>
            )}
            {item.latest.status === 'archived' && <p className="sg-note">A última versão pede arquivo. Para voltar ao ar, o pipeline envia uma versão nova em revisão.</p>}
            {msg && <p className={msg.ok ? 'ca-ok' : 'ca-err'} role="status">{msg.text}</p>}
          </section>
        )}

        {item && lesson && (
          <section className="sg-panel sg-stack" aria-labelledby="ca-lesson">
            <span className="sg-label amber">Lição do EDU · {lang.toUpperCase()}</span>
            <h2 id="ca-lesson" className="ca-h2">{lesson.title[lang]}</h2>
            <p className="sg-muted">{lesson.summary[lang]}</p>
            <div className="ca-body">{lesson.body[lang]}</div>
            <p className="sg-note">Tags: {lesson.scenarioTags.join(', ') || '—'}</p>
            <p className="sg-note">
              Vídeo {lang.toUpperCase()}:{' '}
              {videoId
                ? <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">{videoId}</a>
                : 'nenhum — neste idioma a página não mostra vídeo'}
            </p>
          </section>
        )}
      </div>

      {item && preview && (
        <div className="ca-preview" aria-label={`Prévia da página do Sinal em ${lang.toUpperCase()}`}>
          <div className="sg-wrap ca-preview-head"><span className="sg-label">Prévia · como a família verá</span></div>
          <SignalPage key={`${item.slug}:${item.latest.version}:${lang}`} slug={item.slug} preview={{ signal: preview, lang }} />
        </div>
      )}
    </div>
  )
}
