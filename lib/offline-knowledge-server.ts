/** Server only: publication snapshots, never draft packages, vectors or household data. */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPilotCatalog } from './pilot-content'
import { MAX_KNOWLEDGE_BYTES, type KnowledgePack, type OfflineDocument } from './offline-knowledge'

const LABELS: Record<string, [string, string]> = {
  title: ['Título', 'Title'], eventDate: ['Data do acontecimento', 'Event date'], publishedOn: ['Publicado em', 'Published on'],
  summary: ['Resumo', 'Summary'], whatItIs: ['O que é', 'What it is'], whatItIsNot: ['O que não é', 'What it is not'],
  curatorNote: ['Orientação da curadoria', 'Curator guidance'], sourceLine: ['Referência', 'Reference'], sources: ['Fontes', 'Sources'],
  protocol: ['Opções de preparação', 'Preparedness options'], degrees: ['Degraus', 'Levels'], recommendedDegree: ['Degrau sugerido', 'Suggested level'],
  items: ['Itens', 'Items'], label: ['Opção', 'Option'], hint: ['Observação', 'Note'], url: ['Link externo', 'External link'],
  level: ['Classificação editorial', 'Editorial level'], officialAlert: ['Marcado como alerta oficial na publicação', 'Marked as official alert in publication'],
}
function readable(value: unknown, pt: boolean, prefix = ''): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') {
    const text = typeof value === 'boolean' ? (value ? (pt ? 'sim' : 'yes') : (pt ? 'não' : 'no')) : String(value).replace(/^D(3|14|30|90)$/, '$1 ' + (pt ? 'dias' : 'days'))
    return `${prefix}${text}`
  }
  if (Array.isArray(value)) return value.map(v => readable(v, pt, prefix)).join('\n')
  return Object.entries(value).filter(([k]) => k !== 'resourceKey').map(([k, v]) => readable(v, pt, `${prefix}${LABELS[k]?.[pt ? 0 : 1] ?? k}: `)).join('\n\n')
}
export async function buildKnowledgePack(admin: SupabaseClient, now = new Date()): Promise<KnowledgePack> {
  const documents: OfflineDocument[] = []
  const [pt, en] = await Promise.all([loadPilotCatalog(admin, true, true), loadPilotCatalog(admin, false, true)])
  if (pt.unavailable.length || en.unavailable.length) throw new Error('editorial_source_unavailable')
  const revisions = (docs: typeof pt.docs) => docs.map(d => `${d.id}:${d.version}`).sort().join('\n')
  if (revisions(pt.docs) !== revisions(en.docs)) throw new Error('editorial_changed_during_download')
  for (const [catalog, lang] of [[pt, 'pt'], [en, 'en']] as const) {
    for (const d of catalog.docs) documents.push({ id: d.id, kind: d.kind, lang, title: d.title,
      text: d.kind === 'signal' ? readable(JSON.parse(d.text), lang === 'pt') : d.text,
      source: d.kind === 'signal' ? 'EOS Sinais · fontes no texto / sources in text' : 'EOS EDU · fontes no texto / sources in text',
      version: d.version, href: d.href })
  }
  // Stable unique ordering and pages <= PostgREST cap. No embeddings leave the server.
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.from('knowledge_base')
      .select('id,content,source,source_version,chunk_index').order('id').range(offset, offset + 99)
    if (error || !data) throw new Error('manual_source_unavailable')
    for (const row of data) {
      // Current editorial publications above are authoritative; never export obsolete vector text.
      if (/^(edu|signal):/i.test(row.source ?? '')) continue
      documents.push({ id: `manual:${row.id}`, kind: 'manual', lang: 'en',
        title: `${row.source} · ${Number(row.chunk_index ?? 0) + 1}`, text: row.content,
        source: row.source, version: row.source_version || 'imported' })
    }
    if (data.length < 100) break
  }
  documents.sort((a, b) => `${a.lang}:${a.id}`.localeCompare(`${b.lang}:${b.id}`))
  const serialized = JSON.stringify(documents)
  if (Buffer.byteLength(serialized) > MAX_KNOWLEDGE_BYTES - 1000) throw new Error('knowledge_pack_too_large')
  return { schema: 1, version: createHash('sha256').update(serialized).digest('hex'), syncedAt: now.toISOString(), documents }
}
