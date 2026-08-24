/**
 * A telemetria do Pilot (PILOT-T04 / D-132).
 *
 * POST grava um evento. GET devolve o resumo, só para o dono.
 *
 * TRÊS COISAS QUE ESTA ROTA NÃO FAZ, de propósito:
 *
 *  1. Não aceita texto. O corpo passa por `parsePilotEvent`, que é allowlist:
 *     uma chave nova inventada no cliente é descartada e o motivo fica
 *     registrado. A tabela também não tem coluna de texto (ver a migration) —
 *     a linha está desenhada duas vezes porque telemetria é a tabela que mais
 *     cresce e a que menos gente audita.
 *  2. Não derruba nada. Se a migration não foi aplicada, se o limite estourou,
 *     se o banco recusou — a resposta é 200 e o app segue. Métrica que quebra
 *     produto é métrica que sai do produto na primeira madrugada.
 *  3. Não descarta em silêncio. Todo caminho de escape devolve um `skipped`
 *     dizendo por quê, e o teste lê esse campo. Foi um escape mudo que deixou
 *     o push quebrado por meses neste repositório.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceAiBudget } from '@/lib/rate-limit'
import { logError } from '@/lib/error-log'
import { parsePilotEvent, chavesEstranhas, resumirPilot, type PilotLinha } from '@/lib/pilot-metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A migration ainda não rodou. Vale calar o produto, não o log. */
const SEM_TABELA = new Set(['PGRST205', '42P01', '42703'])

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  /*
   * Um teto generoso, porque o custo de errar para baixo é perder o dado que
   * justifica o lançamento. 120/min cobre a sessão mais agitada que existe
   * (abrir, cinco intenções, três perguntas) com folga de vinte vezes, e ainda
   * assim impede um laço de render de inundar a tabela.
   */
  const estourou = await enforceAiBudget(`pilotmx:${auth.user.id}`, { perMinute: 120, perDay: 2000 })
  if (estourou) return NextResponse.json({ ok: true, skipped: `rate_limited:${estourou.scope}` })

  let bruto: unknown
  try {
    bruto = await request.json()
  } catch {
    return NextResponse.json({ ok: true, skipped: 'json_invalido' })
  }

  const estranhas = chavesEstranhas(bruto)
  const analise = parsePilotEvent(bruto)
  if (!analise.ok) {
    // Um evento recusado é um defeito de cliente, não ruído: alguém renomeou
    // algo de um lado só. Fica no log de erro, com o motivo e sem o conteúdo.
    await logError('api/pilot/metrics:recusado', new Error(analise.reason), { userId: auth.user.id })
    return NextResponse.json({ ok: true, skipped: analise.reason })
  }
  if (estranhas.length) {
    // O evento vale; as chaves extras não entram. Dizer isso alto é o que
    // impede alguém de "só passar a pergunta junto pra depurar".
    await logError('api/pilot/metrics:chaves', new Error(`descartadas: ${estranhas.join(',')}`), {
      userId: auth.user.id,
    })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ ok: true, skipped: 'sem_service_role' })

  const { error } = await admin.from('pilot_events').insert({ user_id: auth.user.id, ...analise.event })

  if (error) {
    if (SEM_TABELA.has(error.code ?? '')) return NextResponse.json({ ok: true, skipped: 'migration_pending' })
    await logError('api/pilot/metrics', error, { userId: auth.user.id, context: { event: analise.event.event } })
    return NextResponse.json({ ok: true, skipped: 'erro_no_banco' })
  }

  return NextResponse.json({ ok: true, recorded: analise.event.event })
}

/**
 * O resumo, só para quem já recebe os alertas de erro.
 *
 * Reaproveita `ERROR_ALERT_USER_IDS` em vez de inventar uma segunda lista de
 * donos: duas listas divergem, e a que fica velha é sempre a que guarda o
 * acesso. É o mesmo conjunto de pessoas — quem opera o app.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const donos = (process.env.ERROR_ALERT_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (!donos.includes(auth.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days') ?? 30), 1), 180)
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const { data, error } = await admin
    .from('pilot_events')
    .select('user_id, event, verdict, intent, surface, ms, created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(50_000)

  if (error) {
    if (SEM_TABELA.has(error.code ?? '')) {
      return NextResponse.json({ error: 'migration_pending', days: dias }, { status: 503 })
    }
    await logError('api/pilot/metrics:get', error, { userId: auth.user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ days: dias, summary: resumirPilot((data ?? []) as PilotLinha[]) })
}
