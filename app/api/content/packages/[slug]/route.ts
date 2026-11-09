/**
 * Porta do pipeline de conteúdo (CONTENT-001 §3.1, §4.4).
 *
 * PUT recebe a pauta: valida inteira e, só se válida, guarda a versão em
 * `content_packages`. Receber não é publicar (D-P2): nada do que a família vê
 * muda aqui, exceto arquivar. GET devolve onde a pauta parou.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizePipeline } from '@/lib/content-pipeline-auth'
import { MAX_PACKAGE_BYTES, packageHash, packageProblems, type ContentPackage } from '@/lib/content-package'
import { afterArchive, packageState } from '@/lib/content-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore })

type Ctx = { params: { slug: string } }

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = authorizePipeline(req.headers)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  const raw = await req.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_PACKAGE_BYTES) return json({ error: `pauta acima de ${MAX_PACKAGE_BYTES / 1024} KB` }, 413)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'corpo não é JSON válido' }, 400)
  }

  const problems = packageProblems(body)
  const bodySlug = (body as { slug?: unknown } | null)?.slug
  if (bodySlug !== params.slug) problems.unshift(`slug do corpo ("${String(bodySlug)}") diferente do da rota ("${params.slug}")`)
  if (problems.length) return json({ error: 'pauta inválida: nada foi gravado', problems }, 422)

  const admin = createAdminClient()
  if (!admin) return json({ error: 'serviço indisponível' }, 503)

  const pkg = body as ContentPackage
  if (auth.scope === 'review' && pkg.status !== 'review') {
    return json({ error: 'credencial de entrega permite apenas pautas em revisão' }, 403)
  }
  const { data, error } = await admin.rpc('receive_content_package', {
    p_slug: pkg.slug,
    p_version: pkg.version,
    p_status: pkg.status,
    p_payload: pkg,
    p_hash: packageHash(pkg),
  })
  if (error) return json({ error: error.message }, 500)

  const outcome = (data as { outcome: string; latest?: number }).outcome
  if (outcome === 'conflict') return json({ error: `versão ${pkg.version} já recebida com outro conteúdo; envie uma versão maior`, outcome }, 409)
  if (outcome === 'stale') return json({ error: `versão ${pkg.version} menor que a última recebida (${(data as { latest: number }).latest})`, outcome }, 409)

  // Reenviar uma pauta de arquivo tenta de novo o resumo histórico, se ele ficou pendente.
  const archiveRag = pkg.status === 'archived' ? await afterArchive(admin, pkg.slug) : undefined
  const state = await packageState(admin, pkg.slug)
  return json({ outcome, ...state, ...(archiveRag && archiveRag !== 'none' ? { archiveRag } : {}) })
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = authorizePipeline(req.headers)
  if (!auth.ok) return json({ error: auth.error }, auth.status)
  const admin = createAdminClient()
  if (!admin) return json({ error: 'serviço indisponível' }, 503)
  const state = await packageState(admin, params.slug)
  if (state.latestVersion === null && state.signal === 'none') return json({ error: 'pauta não encontrada' }, 404)
  return json(state)
}
