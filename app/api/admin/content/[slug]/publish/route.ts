/**
 * Publicar uma versão da pauta: o toque do dono (CONTENT-001 D-P2, §3.6, §4.3).
 *
 * Body `{ version }`. Publica exatamente essa versão, se for a última recebida
 * (E10c). Depois do commit, a lição entra no RAG automaticamente (D-P4); se a
 * OpenAI falhar, o Sinal fica no ar e o RAG fica pendente (E6) — tocar de novo
 * na mesma versão tenta outra vez.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminUser } from '@/lib/admin-route'
import { packageProblems } from '@/lib/content-package'
import { packageState } from '@/lib/content-store'
import { ingestEduContent, removeArchivedSignal } from '@/lib/edu-rag-ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { slug: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const version = Number(body?.version)
  if (!Number.isInteger(version) || version < 1) return NextResponse.json({ error: 'version obrigatória.' }, { status: 400 })

  // Defesa: a regra pode ter mudado desde o recebimento.
  const { data: pkg } = await admin.from('content_packages').select('payload').eq('slug', params.slug).eq('version', version).maybeSingle()
  if (!pkg) return NextResponse.json({ error: 'Versão não encontrada.' }, { status: 404 })
  const problems = packageProblems(pkg.payload)
  if (problems.length) return NextResponse.json({ error: 'Esta versão não passa mais na validação.', problems }, { status: 422 })

  const { data, error } = await admin.rpc('publish_content_package', { p_slug: params.slug, p_version: version, p_approver: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data as { outcome: string; latest?: number; edu_id?: string }
  if (result.outcome === 'not_found') return NextResponse.json({ error: 'Pauta não encontrada.' }, { status: 404 })
  if (result.outcome === 'stale') {
    return NextResponse.json({ error: `Chegou a versão ${result.latest}. Revise de novo antes de publicar.`, latest: result.latest }, { status: 409 })
  }
  if (result.outcome === 'archived_version') return NextResponse.json({ error: 'A última versão pede arquivo, não publicação.' }, { status: 409 })

  await removeArchivedSignal(admin, params.slug)

  const before = await packageState(admin, params.slug)
  let ragError: string | undefined
  if (result.edu_id && before.rag !== 'ingested') {
    const ingest = await ingestEduContent(admin, result.edu_id, user.id)
    if (!ingest.ok) ragError = ingest.error
  }
  const state = await packageState(admin, params.slug)
  return NextResponse.json({ outcome: result.outcome, ...state, ...(ragError ? { ragError } : {}) })
}
