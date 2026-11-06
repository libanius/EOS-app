/** Arquivar pelo botão (CONTENT-001 §3.6, §4.3). A lição continua no EDU e no RAG (E16). */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminUser } from '@/lib/admin-route'
import { afterArchive, packageState } from '@/lib/content-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await requireAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const { data, error } = await admin.rpc('archive_content_package', { p_slug: params.slug })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const outcome = (data as { outcome: string }).outcome
  if (outcome === 'not_found') return NextResponse.json({ error: 'Sinal não encontrado.' }, { status: 404 })

  const archiveRag = outcome === 'archived' ? await afterArchive(admin, params.slug) : 'none'
  return NextResponse.json({ outcome, archiveRag, ...(await packageState(admin, params.slug)) })
}
