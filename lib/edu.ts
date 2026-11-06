export type EduSourceType = 'youtube' | 'manual' | 'pdf' | 'external'
export type EduStatus = 'draft' | 'approved' | 'archived'

export type EduContent = {
  id: string
  title: string
  source_type: EduSourceType
  source_url: string | null
  scenario_tags: string[]
  summary: string
  transcript: string
  status: EduStatus
  version: number
  view_count?: number
  rag_enabled: boolean
  rag_ingested_at: string | null
  updated_at: string | null
  approved_at: string | null
  /** CONTENT-001 §4.2b: só em itens vindos de uma pauta. */
  video?: { pt?: { youtubeId: string; durationSec?: number }; en?: { youtubeId: string; durationSec?: number } } | null
  lesson?: { title: { pt: string; en: string }; summary: { pt: string; en: string }; body: { pt: string; en: string } } | null
  content_slug?: string | null
}

export const DEFAULT_EDU_CONTENT: EduContent[] = [
  {
    id: 'default-fallout-basics',
    title: 'Fallout: preparação inicial da família',
    source_type: 'manual',
    source_url: null,
    scenario_tags: ['fallout', 'shelter', 'supplies'],
    summary: 'Primeiros pontos para transformar um vídeo/aula em preparação real: abrigo, água, alimento, comunicação e plano familiar.',
    transcript: [
      '1. Defina onde a família se abriga e por quanto tempo consegue permanecer ali.',
      '2. Verifique água, comida, rádio, baterias, medicamentos e higiene.',
      '3. Combine como o círculo se comunica se celular e internet falharem.',
      '4. Revise o plano da família e transforme lacunas em tarefas confirmadas.',
    ].join('\n'),
    status: 'approved',
    version: 1,
    view_count: 0,
    rag_enabled: false,
    rag_ingested_at: null,
    updated_at: null,
    approved_at: null,
  },
]

const SOURCE_TYPES: EduSourceType[] = ['youtube', 'manual', 'pdf', 'external']
const STATUSES: EduStatus[] = ['draft', 'approved', 'archived']

function cleanText(value: unknown, fallback = '', max = 4000) {
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, max)
}

export function normalizeTags(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  return Array.from(new Set(
    raw
      .filter((tag): tag is string => typeof tag === 'string')
      .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'))
      .map(tag => tag.replace(/-+/g, '-').replace(/^-|-$/g, ''))
      .filter(Boolean),
  )).slice(0, 12)
}

export function normalizeEduInput(input: unknown) {
  const value = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const sourceType = SOURCE_TYPES.includes(value.source_type as EduSourceType)
    ? value.source_type as EduSourceType
    : 'manual'
  const status = STATUSES.includes(value.status as EduStatus)
    ? value.status as EduStatus
    : 'draft'

  return {
    id: cleanText(value.id, '', 80) || null,
    title: cleanText(value.title, 'Untitled', 160),
    source_type: sourceType,
    source_url: cleanText(value.source_url, '', 500) || null,
    scenario_tags: normalizeTags(value.scenario_tags),
    summary: cleanText(value.summary, '', 1200),
    transcript: cleanText(value.transcript, '', 20000),
    status,
    rag_enabled: Boolean(value.rag_enabled),
  }
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** Embed sem cookies a partir do ID de 11 caracteres (CONTENT-001 §5.7). */
export function youtubeEmbedFromId(id: string | null | undefined): string | null {
  return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
}

export function youtubeThumbFromId(id: string | null | undefined): string | null {
  return id && YOUTUBE_ID.test(id) ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

export function youtubeEmbedUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null
  let url: URL
  try {
    url = new URL(sourceUrl)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  let videoId: string | null = null

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v')
    else {
      const parts = url.pathname.split('/').filter(Boolean)
      if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) videoId = parts[1] ?? null
    }
  }

  return youtubeEmbedFromId(videoId)
}

export function youtubeThumbnailUrl(sourceUrl: string | null | undefined): string | null {
  const embed = youtubeEmbedUrl(sourceUrl)
  if (!embed) return null
  const videoId = embed.split('/').pop()
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
}
