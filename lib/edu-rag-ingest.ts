/**
 * Ingestão de um item do EDU no RAG (docs/22 §4), extraída da rota de admin
 * para que a publicação de uma pauta (CONTENT-001 D-P4) use exatamente a mesma
 * regra: só aprovado, só elegível, só com 160 caracteres instrucionais, e a
 * reingestão substitui os pedaços da mesma fonte.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getOpenAIClient } from './openai'
import {
  buildEduRagText,
  chunkEduRagText,
  eduRagInstructionChars,
  eduRagReady,
  eduRagSource,
  eduRagSourceVersion,
  inferEduScenarioType,
  MIN_EDU_RAG_INSTRUCTION_CHARS,
} from './edu-rag'
import type { EduContent } from './edu'

export const EDU_INGEST_COLUMNS =
  'id, title, source_type, source_url, scenario_tags, summary, transcript, status, version, rag_enabled, rag_ingested_at, updated_at, approved_at'

export type IngestResult =
  | { ok: true; id: string; source: string; sourceVersion: string; scenarioType: string; chunks: number; ragIngestedAt: string }
  | { ok: false; status: 400 | 404 | 500 | 503; error: string; instructionChars?: number; requiredInstructionChars?: number }

export async function ingestEduContent(admin: SupabaseClient, id: string, userId: string | null): Promise<IngestResult> {
  const { data: item, error: readError } = await admin.from('edu_content').select(EDU_INGEST_COLUMNS).eq('id', id).maybeSingle()
  if (readError) return { ok: false, status: 500, error: readError.message }
  if (!item) return { ok: false, status: 404, error: 'Conteúdo não encontrado.' }

  const content = item as EduContent
  if (content.status !== 'approved') return { ok: false, status: 400, error: 'Somente conteúdo aprovado pode ser ingerido.' }
  if (!content.rag_enabled) return { ok: false, status: 400, error: 'Marque o conteúdo como elegível para RAG antes de ingerir.' }
  if (!eduRagReady(content)) {
    return {
      ok: false,
      status: 400,
      error: `Adicione resumo/notas com pelo menos ${MIN_EDU_RAG_INSTRUCTION_CHARS} caracteres instrucionais antes de ingerir no RAG.`,
      instructionChars: eduRagInstructionChars(content),
      requiredInstructionChars: MIN_EDU_RAG_INSTRUCTION_CHARS,
    }
  }

  const chunks = chunkEduRagText(buildEduRagText(content))
  if (!chunks.length) return { ok: false, status: 400, error: 'Conteúdo sem texto suficiente para RAG.' }

  let embeddings: number[][]
  try {
    const response = await getOpenAIClient().embeddings.create({ model: 'text-embedding-3-small', input: chunks })
    embeddings = response.data.map(row => row.embedding)
  } catch (error) {
    return { ok: false, status: 503, error: error instanceof Error ? error.message : 'Falha ao gerar embeddings.' }
  }

  const source = eduRagSource(content.id)
  const sourceVersion = eduRagSourceVersion(content.version)
  const scenarioType = inferEduScenarioType(content.scenario_tags)

  const { error: deleteError } = await admin.from('knowledge_base').delete().eq('source', source)
  if (deleteError) return { ok: false, status: 500, error: deleteError.message }

  const rows = chunks.map((chunk, index) => ({
    content: chunk,
    embedding: `[${embeddings[index].join(',')}]`,
    source,
    source_version: sourceVersion,
    scenario_type: scenarioType,
    chunk_index: index,
  }))
  const { error: insertError } = await admin.from('knowledge_base').insert(rows)
  if (insertError) return { ok: false, status: 500, error: insertError.message }

  const ragIngestedAt = new Date().toISOString()
  const { error: updateError } = await admin
    .from('edu_content')
    .update({ rag_ingested_at: ragIngestedAt, updated_by: userId, updated_at: ragIngestedAt })
    .eq('id', content.id)
  if (updateError) return { ok: false, status: 500, error: updateError.message }

  return { ok: true, id: content.id, source, sourceVersion, scenarioType, chunks: rows.length, ragIngestedAt }
}

/* ── Sinal arquivado vira contexto histórico no RAG (SIGNAL-001 D4, CONTENT-001 E16) ── */

export function archivedSignalSource(slug: string) {
  return `signal:${slug}`
}

export type ArchivedSignalText = {
  slug: string
  archivedOn: string
  occurredOn: string
  title: { pt: string; en: string }
  summary: { pt: string; en: string }
  whatItIs: { pt: string; en: string }
  whatItIsNot: { pt: string; en: string }
}

/** O texto que entra no RAG: sempre com a data, para o Pilot nunca tratar como atual. */
export function buildArchivedSignalText(s: ArchivedSignalText): string {
  return [
    `Archived EOS Signal (historical context, not current). Archived on ${s.archivedOn}. Event date: ${s.occurredOn}.`,
    `Title: ${s.title.en}`,
    `Summary: ${s.summary.en}`,
    `What it is: ${s.whatItIs.en}`,
    `What it is not: ${s.whatItIsNot.en}`,
    `Sinal EOS arquivado em ${s.archivedOn} (contexto histórico, não atual): ${s.title.pt}. ${s.summary.pt}`,
  ].join('\n\n')
}

export async function ingestArchivedSignal(admin: SupabaseClient, s: ArchivedSignalText): Promise<'ingested' | 'pending'> {
  const chunks = chunkEduRagText(buildArchivedSignalText(s))
  if (!chunks.length) return 'pending'
  try {
    const response = await getOpenAIClient().embeddings.create({ model: 'text-embedding-3-small', input: chunks })
    const source = archivedSignalSource(s.slug)
    const { error: deleteError } = await admin.from('knowledge_base').delete().eq('source', source)
    if (deleteError) return 'pending'
    const { error } = await admin.from('knowledge_base').insert(
      chunks.map((chunk, index) => ({
        content: chunk,
        embedding: `[${response.data[index].embedding.join(',')}]`,
        source,
        source_version: s.archivedOn,
        scenario_type: 'GENERAL',
        chunk_index: index,
      })),
    )
    return error ? 'pending' : 'ingested'
  } catch {
    return 'pending'
  }
}

/** Sinal que volta ao ar deixa de ser histórico (E10): o resumo arquivado sai do RAG. */
export async function removeArchivedSignal(admin: SupabaseClient, slug: string): Promise<void> {
  await admin.from('knowledge_base').delete().eq('source', archivedSignalSource(slug))
}
