import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { getOpenAIClient } from '@/lib/openai'
import {
  buildEduRagText,
  chunkEduRagText,
  eduRagSource,
  eduRagSourceVersion,
  inferEduScenarioType,
} from '@/lib/edu-rag'
import type { EduContent } from '@/lib/edu'

export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

  const { data: item, error: readError } = await admin
    .from('edu_content')
    .select('id, title, source_type, source_url, scenario_tags, summary, transcript, status, version, rag_enabled, rag_ingested_at, updated_at, approved_at')
    .eq('id', id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: 'Conteúdo não encontrado.' }, { status: 404 })

  const content = item as EduContent
  if (content.status !== 'approved') {
    return NextResponse.json({ error: 'Somente conteúdo aprovado pode ser ingerido.' }, { status: 400 })
  }
  if (!content.rag_enabled) {
    return NextResponse.json({ error: 'Marque o conteúdo como elegível para RAG antes de ingerir.' }, { status: 400 })
  }

  const text = buildEduRagText(content)
  const chunks = chunkEduRagText(text)
  if (!chunks.length) return NextResponse.json({ error: 'Conteúdo sem texto suficiente para RAG.' }, { status: 400 })

  let embeddings: number[][]
  try {
    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks,
    })
    embeddings = response.data.map(row => row.embedding)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao gerar embeddings.' }, { status: 503 })
  }

  const source = eduRagSource(content.id)
  const sourceVersion = eduRagSourceVersion(content.version)
  const scenarioType = inferEduScenarioType(content.scenario_tags)

  const { error: deleteError } = await admin.from('knowledge_base').delete().eq('source', source)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const rows = chunks.map((chunk, index) => ({
    content: chunk,
    embedding: `[${embeddings[index].join(',')}]`,
    source,
    source_version: sourceVersion,
    scenario_type: scenarioType,
    chunk_index: index,
  }))

  const { error: insertError } = await admin.from('knowledge_base').insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const ingestedAt = new Date().toISOString()
  const { error: updateError } = await admin
    .from('edu_content')
    .update({ rag_ingested_at: ingestedAt, updated_by: user.id, updated_at: ingestedAt })
    .eq('id', content.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    id: content.id,
    source,
    sourceVersion,
    scenarioType,
    chunks: rows.length,
    ragIngestedAt: ingestedAt,
  })
}
