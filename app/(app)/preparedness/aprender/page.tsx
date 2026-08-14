'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/lib/i18n'
import type { EduContent } from '@/lib/edu'
import { youtubeEmbedUrl, youtubeThumbnailUrl } from '@/lib/edu'
import { buildEduPreparednessProposals } from '@/lib/edu-actions'
import { Card, PillLink, SectionLabel } from '@/components/world-v2/primitives'
import PreparednessNav from '@/components/world-v2/PreparednessNav'
import '@/components/world-v2/world-v2.css'

const COPY = {
  pt: {
    eyebrow: 'EOS · EDU',
    title: 'Educação',
    loading: 'Carregando conteúdo...',
    empty: 'Nenhum conteúdo aprovado ainda.',
    all: 'Todos',
    source: 'Fonte',
    tags: 'Cenários',
    version: 'Versão',
    rag: 'Elegível para RAG futuro',
    admin: 'Admin EDU',
    preparedness: 'Preparação',
    more: 'Mais',
    less: 'Recolher',
    featured: 'Mais clicado no EOS',
    prepare: 'Adicionar à preparação',
    savingPrep: 'Salvando...',
    savedPrep: 'Salvo em Preparação',
    noActions: 'Sem ações detectadas',
    curating: 'Curando ações...',
  },
  en: {
    eyebrow: 'EOS · EDU',
    title: 'Education',
    loading: 'Loading content...',
    empty: 'No approved content yet.',
    all: 'All',
    source: 'Source',
    tags: 'Scenarios',
    version: 'Version',
    rag: 'Eligible for future RAG',
    admin: 'EDU Admin',
    preparedness: 'Preparedness',
    more: 'More',
    less: 'Collapse',
    featured: 'Most clicked in EOS',
    prepare: 'Add to preparedness',
    savingPrep: 'Saving...',
    savedPrep: 'Saved to Preparedness',
    noActions: 'No actions detected',
    curating: 'Curating actions...',
  },
} as const

type EduCopy = typeof COPY[keyof typeof COPY]

export default function EduPage() {
  const { language } = useLanguage()
  const c = COPY[language]
  const [content, setContent] = useState<EduContent[]>([])
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [canAdmin, setCanAdmin] = useState(false)
  const [focusedContentId, setFocusedContentId] = useState('')
  const [expandedId, setExpandedId] = useState('')
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({})

  const tags = useMemo(() => Array.from(new Set(content.flatMap(item => item.scenario_tags))).sort(), [content])
  const featured = useMemo(() => {
    const videos = content.filter(item => item.source_type === 'youtube' && youtubeEmbedUrl(item.source_url))
    return [...videos].sort((a, b) => Number(b.view_count ?? 0) - Number(a.view_count ?? 0))[0] ?? videos[0] ?? null
  }, [content])
  const rest = useMemo(() => content.filter(item => item.id !== featured?.id), [content, featured])

  const load = useCallback(async (nextTag = '') => {
    setLoading(true)
    const suffix = nextTag ? `?tag=${encodeURIComponent(nextTag)}` : ''
    try {
      const response = await fetch(`/api/edu${suffix}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      setContent((data.content ?? []) as EduContent[])
      setCanAdmin(Boolean(data.canAdmin))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(tag) }, [load, tag])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('contentId')
    if (id) {
      setFocusedContentId(id)
      setExpandedId(id)
      setDetailsOpen(current => ({ ...current, [id]: true }))
    }
  }, [])

  useEffect(() => {
    if (!focusedContentId || !content.length) return
    window.setTimeout(() => {
      document.getElementById(`edu-${focusedContentId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 100)
  }, [focusedContentId, content])

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="list-title">{c.title}</h1>
        </header>

        {/* NAV-T04: o EDU tinha UMA porta em todo o app. Agora é subtópico. */}
        <PreparednessNav />

        <Card accented>
          <SectionLabel>{c.tags}</SectionLabel>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button type="button" className={`wv2-pill${tag ? '' : ' primary'}`} onClick={() => setTag('')}>{c.all}</button>
            {tags.map(value => (
              <button key={value} type="button" className={`wv2-pill${tag === value ? ' primary' : ''}`} onClick={() => setTag(value)}>
                {value}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <PillLink href="/preparedness">{c.preparedness}</PillLink>
            {canAdmin ? <PillLink href="/admin/edu" primary>{c.admin}</PillLink> : null}
          </div>
        </Card>

        {loading ? (
          <Card><p className="t-body ink-2" style={{ margin: 0 }}>{c.loading}</p></Card>
        ) : content.length === 0 ? (
          <Card><p className="t-body ink-2" style={{ margin: 0 }}>{c.empty}</p></Card>
        ) : (
          <>
            {featured ? (
              <EduCard
                item={featured}
                copy={c}
                focused={featured.id === focusedContentId}
                featured
                expanded
                detailsOpen={Boolean(detailsOpen[featured.id])}
                language={language}
                onExpand={id => {
                  setExpandedId(id)
                  void fetch('/api/edu/views', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                  }).catch(() => null)
                }}
                onToggleDetails={id => setDetailsOpen(current => ({ ...current, [id]: !current[id] }))}
              />
            ) : null}
            {rest.map(item => (
              <EduCard
                key={item.id}
                item={item}
                copy={c}
                focused={item.id === focusedContentId}
                expanded={expandedId === item.id}
                detailsOpen={Boolean(detailsOpen[item.id])}
                language={language}
                onExpand={id => {
                  setExpandedId(current => current === id ? '' : id)
                  void fetch('/api/edu/views', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                  }).catch(() => null)
                }}
                onToggleDetails={id => setDetailsOpen(current => ({ ...current, [id]: !current[id] }))}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function EduCard({
  item,
  copy,
  focused,
  featured = false,
  expanded = false,
  detailsOpen = false,
  onExpand,
  onToggleDetails,
  language,
}: {
  item: EduContent
  copy: EduCopy
  focused?: boolean
  featured?: boolean
  expanded?: boolean
  detailsOpen?: boolean
  language: 'pt' | 'en'
  onExpand: (id: string) => void
  onToggleDetails: (id: string) => void
}) {
  const embedUrl = item.source_type === 'youtube' ? youtubeEmbedUrl(item.source_url) : null
  const thumbUrl = item.source_type === 'youtube' ? youtubeThumbnailUrl(item.source_url) : null
  const fallbackProposals = useMemo(() => buildEduPreparednessProposals(item), [item])
  const [curatedProposals, setCuratedProposals] = useState(fallbackProposals)
  const [curating, setCurating] = useState(false)
  const [savingPrep, setSavingPrep] = useState(false)
  const [prepSaved, setPrepSaved] = useState(false)
  const proposals = curatedProposals.length ? curatedProposals : fallbackProposals

  useEffect(() => {
    setCuratedProposals(fallbackProposals)
  }, [fallbackProposals])

  useEffect(() => {
    if (!detailsOpen) return
    let cancelled = false
    setCurating(true)
    fetch('/api/edu/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language,
        item: {
          title: item.title,
          summary: item.summary,
          transcript: item.transcript,
        },
      }),
    })
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        if (cancelled || !Array.isArray(data.actions)) return
        setCuratedProposals(data.actions)
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setCurating(false)
      })
    return () => { cancelled = true }
  }, [detailsOpen, fallbackProposals, item.summary, item.title, item.transcript, language])

  async function savePreparedness() {
    if (proposals.length === 0) return
    setSavingPrep(true)
    setPrepSaved(false)
    try {
      const response = await fetch('/api/checklist/save-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kitType: 'EDU_CONTENT', items: proposals }),
      })
      if (response.ok) setPrepSaved(true)
    } finally {
      setSavingPrep(false)
    }
  }

  return (
    <Card id={`edu-${item.id}`} style={focused ? { borderColor: 'rgba(0,229,160,0.72)', background: 'rgba(0,229,160,0.08)' } : undefined}>
      <SectionLabel trailing={featured ? copy.featured : undefined}>{item.source_type.toUpperCase()}</SectionLabel>
      <button
        type="button"
        onClick={() => onExpand(item.id)}
        className="t-title2"
        style={{ width: '100%', margin: '0.6rem 0 0.4rem', padding: 0, border: 0, background: 'transparent', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}
      >
        {item.title}
      </button>
      {expanded && embedUrl && featured ? (
        <div style={{ margin: '0.85rem 0', aspectRatio: '16 / 9', width: '100%', overflow: 'hidden', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.12)', background: '#050507' }}>
          <iframe
            title={item.title}
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      ) : expanded && thumbUrl ? (
        <div
          aria-hidden="true"
          style={{
            margin: '0.85rem 0',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: '1rem',
            border: '1px solid rgba(255,255,255,0.12)',
            backgroundImage: `linear-gradient(rgba(0,0,0,0.08), rgba(0,0,0,0.28)), url(${thumbUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : null}
      {expanded ? (
        <button type="button" className="wv2-pill" onClick={() => onToggleDetails(item.id)}>
          {detailsOpen ? copy.less : copy.more}
        </button>
      ) : null}
      {expanded && detailsOpen ? (
        <div style={{ marginTop: '0.9rem' }}>
          <p className="t-body ink-2" style={{ margin: 0 }}>{item.summary}</p>
          <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="wv2-pill primary"
              onClick={savePreparedness}
              disabled={savingPrep || proposals.length === 0}
              style={proposals.length === 0 ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
            >
              {savingPrep ? copy.savingPrep : prepSaved ? copy.savedPrep : curating ? copy.curating : proposals.length === 0 ? copy.noActions : copy.prepare}
            </button>
            {proposals.slice(0, 3).map(proposal => (
              <span key={proposal.name} className="t-foot ink-3" style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '0.3rem 0.5rem' }}>
                {proposal.name}
              </span>
            ))}
          </div>
          {item.source_url ? (
            <a className="t-foot" href={item.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '0.75rem', color: 'var(--accent)' }}>
              {copy.source}
            </a>
          ) : null}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <span className="t-foot ink-3">{copy.version} {item.version}</span>
            {item.scenario_tags.map(value => (
              <span key={value} className="t-foot" style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '0.3rem 0.5rem' }}>{value}</span>
            ))}
            {item.rag_enabled ? <span className="t-foot ink-3">{copy.rag}</span> : null}
          </div>
          {item.transcript ? (
            <pre className="t-foot ink-2" style={{ whiteSpace: 'pre-wrap', margin: '0.9rem 0 0', fontFamily: 'inherit', lineHeight: 1.55 }}>
              {item.transcript}
            </pre>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
