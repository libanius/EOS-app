'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/lib/i18n'
import type { EduContent } from '@/lib/edu'
import { youtubeEmbedUrl } from '@/lib/edu'
import { Card, PillLink, SectionLabel } from '@/components/world-v2/primitives'
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

  const tags = useMemo(() => Array.from(new Set(content.flatMap(item => item.scenario_tags))).sort(), [content])

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

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="list-title">{c.title}</h1>
        </header>

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
        ) : content.map(item => <EduCard key={item.id} item={item} copy={c} />)}
      </div>
    </div>
  )
}

function EduCard({ item, copy }: { item: EduContent; copy: EduCopy }) {
  const embedUrl = item.source_type === 'youtube' ? youtubeEmbedUrl(item.source_url) : null

  return (
    <Card>
      <SectionLabel trailing={`${copy.version} ${item.version}`}>{item.source_type.toUpperCase()}</SectionLabel>
      <h2 className="t-title2" style={{ margin: '0.6rem 0 0.4rem' }}>{item.title}</h2>
      {embedUrl ? (
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
      ) : null}
      <p className="t-body ink-2" style={{ margin: 0 }}>{item.summary}</p>
      {item.source_url ? (
        <a className="t-foot" href={item.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '0.75rem', color: 'var(--accent)' }}>
          {copy.source}
        </a>
      ) : null}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
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
    </Card>
  )
}
