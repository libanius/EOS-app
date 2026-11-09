/**
 * Leitura do estado de uma pauta e efeitos de arquivo (CONTENT-001 §4.3–§4.4).
 *
 * Servidor apenas: recebe o cliente service-role já autorizado pela rota.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PackageVideo } from './content-package'
import { archivedSignalSource, ingestArchivedSignal } from './edu-rag-ingest'

export class ContentStateReadError extends Error {
  constructor(readonly table: string, readonly code: string) {
    super(`Não foi possível consultar ${table} (${code}).`)
    this.name = 'ContentStateReadError'
  }
}

export type PackageState = {
  slug: string
  /** Última versão válida recebida do pipeline. */
  latestVersion: number | null
  latestStatus: 'draft' | 'review' | 'archived' | null
  /** Versão que a família vê; nula se nunca foi publicada. */
  liveVersion: number | null
  signal: 'none' | 'published' | 'archived'
  edu: 'none' | 'approved' | 'draft' | 'archived'
  eduVersion: number | null
  rag: 'none' | 'pending' | 'ingested'
  /** Resumo histórico do Sinal arquivado no RAG (E16/E18); `none` se não está arquivado. */
  archiveRag: 'none' | 'pending' | 'ingested'
  video: { pt: boolean; en: boolean }
  /** Há versão nova esperando o toque do dono. */
  awaitingApproval: boolean
}

export async function packageState(admin: SupabaseClient, slug: string): Promise<PackageState> {
  const results = await Promise.all([
    admin.from('content_packages').select('version, status').eq('slug', slug).order('version', { ascending: false }).limit(1).maybeSingle(),
    admin.from('signals').select('status, version, video').eq('slug', slug).maybeSingle(),
    admin.from('edu_content').select('status, version, rag_ingested_at').eq('content_slug', slug).maybeSingle(),
  ])
  const tables = ['content_packages', 'signals', 'edu_content']
  results.forEach((result, index) => {
    if (result.error) throw new ContentStateReadError(tables[index], result.error.code || 'unknown')
  })
  const [{ data: pkg }, { data: sig }, { data: edu }] = results
  let archiveRag: PackageState['archiveRag'] = 'none'
  if (sig?.status === 'archived') {
    const { count } = await admin
      .from('knowledge_base')
      .select('id', { count: 'exact', head: true })
      .eq('source', archivedSignalSource(slug))
    archiveRag = (count ?? 0) > 0 ? 'ingested' : 'pending'
  }
  const video = (sig?.video ?? null) as PackageVideo | null
  const latestVersion = (pkg?.version as number | undefined) ?? null
  const liveVersion = sig?.status === 'published' ? (sig.version as number) : null
  return {
    slug,
    latestVersion,
    latestStatus: (pkg?.status as PackageState['latestStatus']) ?? null,
    liveVersion,
    signal: (sig?.status as PackageState['signal']) ?? 'none',
    edu: (edu?.status as PackageState['edu']) ?? 'none',
    eduVersion: (edu?.version as number | undefined) ?? null,
    rag: !edu || edu.status !== 'approved' ? 'none' : edu.rag_ingested_at ? 'ingested' : 'pending',
    video: { pt: Boolean(video?.pt), en: Boolean(video?.en) },
    archiveRag,
    awaitingApproval: latestVersion !== null && pkg?.status === 'review' && latestVersion !== (sig?.version ?? null),
  }
}

/** Depois de arquivar: o resumo do Sinal entra no RAG como histórico (E16). */
export async function afterArchive(admin: SupabaseClient, slug: string): Promise<'ingested' | 'pending' | 'none'> {
  const { data: sig } = await admin
    .from('signals')
    .select('slug, status, occurred_on, archived_at, content')
    .eq('slug', slug)
    .maybeSingle()
  if (!sig || sig.status !== 'archived') return 'none'
  // Repetir o arquivo é o jeito de tentar de novo depois de uma falha da OpenAI;
  // se o resumo já está no RAG, não gera embeddings outra vez.
  const { count } = await admin
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('source', archivedSignalSource(slug))
  if ((count ?? 0) > 0) return 'ingested'
  const c = sig.content as Record<string, { pt: string; en: string }>
  return ingestArchivedSignal(admin, {
    slug,
    archivedOn: String(sig.archived_at ?? new Date().toISOString()).slice(0, 10),
    occurredOn: String(sig.occurred_on),
    title: c.title,
    summary: c.summary,
    whatItIs: c.whatItIs,
    whatItIsNot: c.whatItIsNot,
  })
}
