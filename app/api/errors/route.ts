/**
 * GET /api/errors — a lista de DEFEITOS, não de ocorrências (D-121).
 *
 * O `error_log` cru responde "o que aconteceu"; esta rota responde a pergunta
 * que se faz de verdade: **quais problemas existem, qual é o pior, e algum
 * deles é novo**. Quinhentas linhas do mesmo erro são uma linha aqui, com o
 * contador ao lado.
 *
 * Protegida pelo `CRON_SECRET`, igual ao `/api/health`: uma lista de onde o app
 * quebra é um mapa para quem quiser atacá-lo.
 *
 * NÃO devolve `stack` nem `user_id` por padrão. A pilha é útil ao corrigir e
 * inútil ao decidir o que corrigir — e quanto menos dado sensível transita,
 * menos chance de vazar. `?detalhe=<fp>` traz a pilha de um grupo específico.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Janela padrão. Sete dias cobre "o que quebrou desde a semana passada" sem
 *  varrer o histórico inteiro a cada consulta. */
const DIAS_PADRAO = 7

type Linha = {
  scope: string
  message: string
  stack: string | null
  created_at: string
  context: { fp?: string } | null
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  const url = new URL(request.url)
  const dias = Math.min(90, Math.max(1, Number(url.searchParams.get('dias') ?? DIAS_PADRAO) || DIAS_PADRAO))
  const detalhe = url.searchParams.get('detalhe')
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const { data, error } = await admin
    .from('error_log')
    .select('scope, message, stack, created_at, context')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(2_000)

  if (error) {
    const faltando = error.code === 'PGRST205' || error.code === '42P01'
    return NextResponse.json(
      { error: faltando ? 'migration_pending' : error.message },
      { status: faltando ? 503 : 500 },
    )
  }

  const linhas = (data ?? []) as Linha[]

  if (detalhe) {
    const doGrupo = linhas.filter(l => l.context?.fp === detalhe)
    if (!doGrupo.length) return NextResponse.json({ error: 'grupo não encontrado na janela' }, { status: 404 })
    return NextResponse.json({
      fp: detalhe,
      total: doGrupo.length,
      scope: doGrupo[0].scope,
      message: doGrupo[0].message,
      stack: doGrupo[0].stack,
      primeira: doGrupo[doGrupo.length - 1].created_at,
      ultima: doGrupo[0].created_at,
    })
  }

  const grupos = new Map<
    string,
    { fp: string; scope: string; message: string; total: number; primeira: string; ultima: string }
  >()
  for (const l of linhas) {
    // Linha gravada antes do D-121 não tem impressão digital. Cai num grupo por
    // escopo — pior que o ideal, melhor que sumir da lista.
    const fp = l.context?.fp ?? `legado:${l.scope}`
    const g = grupos.get(fp)
    if (g) {
      g.total += 1
      // A varredura vem do mais novo para o mais velho.
      g.primeira = l.created_at
    } else {
      grupos.set(fp, {
        fp,
        scope: l.scope,
        message: l.message.slice(0, 300),
        total: 1,
        primeira: l.created_at,
        ultima: l.created_at,
      })
    }
  }

  const lista = Array.from(grupos.values()).sort((a, b) => b.total - a.total)
  return NextResponse.json(
    {
      janelaDias: dias,
      ocorrencias: linhas.length,
      defeitos: lista.length,
      // Honesto sobre o corte: 2000 é o teto da varredura, e um número redondo
      // exatamente no teto quase sempre significa que havia mais.
      truncado: linhas.length >= 2_000,
      grupos: lista,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
