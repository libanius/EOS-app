/**
 * Lista das pautas para a tela de revisão do dono (CONTENT-001 §3.6, T04).
 *
 * Para cada slug: a última versão recebida (com a pauta inteira, para a prévia),
 * o estado das saídas, a validação de hoje e o que mudou em relação à versão no
 * ar. É leitura: publicar e arquivar têm rotas próprias.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminUser } from '@/lib/admin-route'
import { changedBlocks, packageProblems, type ContentPackage } from '@/lib/content-package'
import { packageState } from '@/lib/content-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = { slug: string; version: number; status: string; payload: ContentPackage; received_at: string; applied_at: string | null }

export async function GET() {
  const user = await requireAdminUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const { data, error } = await admin
    .from('content_packages')
    .select('slug, version, status, payload, received_at, applied_at')
    .order('received_at', { ascending: false })
    .limit(500)
  if (error) {
    // Migração ainda não aplicada: a tela explica, não quebra.
    if (error.code === '42P01' || /content_packages/.test(error.message)) {
      return NextResponse.json({ migrationPending: true, packages: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const bySlug = new Map<string, Row[]>()
  for (const row of (data ?? []) as Row[]) {
    const list = bySlug.get(row.slug) ?? []
    list.push(row)
    bySlug.set(row.slug, list)
  }

  const packages = await Promise.all(
    Array.from(bySlug.entries()).map(async ([slug, rows]) => {
      rows.sort((a, b) => b.version - a.version)
      const latest = rows[0]
      const state = await packageState(admin, slug)
      const live = state.liveVersion !== null ? rows.find(r => r.version === state.liveVersion) ?? null : null
      return {
        slug,
        latest: { version: latest.version, status: latest.status, receivedAt: latest.received_at, payload: latest.payload },
        state,
        problems: packageProblems(latest.payload),
        changed: changedBlocks(live?.payload ?? null, latest.payload),
        versions: rows.map(r => ({ version: r.version, status: r.status, receivedAt: r.received_at, appliedAt: r.applied_at })),
      }
    }),
  )

  // Primeiro o que espera o dono; depois por data de recebimento.
  packages.sort((a, b) =>
    Number(b.state.awaitingApproval) - Number(a.state.awaitingApproval) ||
    b.latest.receivedAt.localeCompare(a.latest.receivedAt),
  )
  return NextResponse.json({ packages }, { headers: { 'Cache-Control': 'no-store' } })
}
