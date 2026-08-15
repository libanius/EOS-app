/**
 * As conversas de quem está lendo (COMMS-T12 / D-188).
 *
 * `GET`  — a lista, já ordenada e com prévia. É a primeira tela do Comms.
 * `POST` — abre a conversa direta com alguém do círculo (acha ou cria).
 * `PATCH`— marca como lida, esconde e desesconde.
 *
 * ── A pergunta do guarda ──────────────────────────────────────────────────
 *
 * `/api/comms/messages` pergunta "você é do círculo?". Aqui a pergunta é
 * **"você participa desta conversa?"** — ser do círculo não dá acesso à conversa
 * de duas outras pessoas dentro dele. É a distinção que separa 1:1 de "grupo
 * com menos gente à vista".
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isVisible, orderConversations } from '@/lib/conversations'
import {
  ensureCircleConversation,
  findOrCreateDirect,
  listConversations,
  requireParticipant,
} from '@/lib/conversations-store'

export const dynamic = 'force-dynamic'

async function contexto() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { erro: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient()
  if (!admin) return { erro: NextResponse.json({ error: 'Service role not configured' }, { status: 503 }) }

  return { user, admin, supabase }
}

export async function GET() {
  const ctx = await contexto()
  if ('erro' in ctx) return ctx.erro

  /*
   * Antes de listar, garantir a conversa de cada círculo de que a pessoa
   * participa. Círculo criado DEPOIS da migração não passou pelo backfill, e
   * sem isto ele nasceria sem chat — a pior primeira impressão possível para
   * quem acabou de criar o círculo.
   */
  const { data: circulos } = await ctx.supabase
    .from('circle_members')
    .select('circle_id')
    .eq('user_id', ctx.user.id)

  for (const linha of circulos ?? []) {
    await ensureCircleConversation(ctx.admin, linha.circle_id as string)
  }

  const todas = await listConversations(ctx.admin, ctx.user.id)

  // Nomes dos círculos, para a conversa de grupo ter título.
  const idsDeCirculo = Array.from(new Set(todas.map(c => c.circleId)))
  const { data: nomes } = idsDeCirculo.length
    ? await ctx.admin.from('circles').select('id, name').in('id', idsDeCirculo)
    : { data: [] as Array<{ id: string; name: string | null }> }
  const nomePorCirculo = Object.fromEntries(
    (nomes ?? []).map(c => [c.id as string, (c.name as string | null) ?? 'Círculo']),
  )

  // Esconder é do lado de cá: a regra de visibilidade é pura e testada, e
  // mensagem nova reabre a conversa escondida (D-188 §4).
  const visiveis = orderConversations(todas.filter(isVisible))

  return NextResponse.json({ conversations: visiveis, circleNames: nomePorCirculo, me: ctx.user.id })
}

/** Abre a conversa direta com alguém do círculo. */
export async function POST(req: NextRequest) {
  const ctx = await contexto()
  if ('erro' in ctx) return ctx.erro

  let body: { circleId?: string; userId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }

  const { circleId, userId: outro } = body
  if (!circleId || !outro) {
    return NextResponse.json({ error: 'circleId e userId são obrigatórios.' }, { status: 400 })
  }
  if (outro === ctx.user.id) {
    return NextResponse.json({ error: 'Não existe conversa consigo mesmo.' }, { status: 400 })
  }

  /*
   * A regra de permissão do EOS, e ela é UMA só (D-073): você fala com quem
   * divide círculo com você. Os DOIS lados precisam ser membros — sem checar o
   * outro, alguém poderia abrir conversa com um id qualquer e criar uma linha
   * que a outra pessoa passaria a ver.
   */
  const { data: euMembro } = await ctx.supabase
    .from('circle_members').select('user_id')
    .eq('circle_id', circleId).eq('user_id', ctx.user.id).maybeSingle()
  if (!euMembro) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: eleMembro } = await ctx.admin
    .from('circle_members').select('user_id')
    .eq('circle_id', circleId).eq('user_id', outro).maybeSingle()
  if (!eleMembro) return NextResponse.json({ error: 'Essa pessoa não está neste círculo.' }, { status: 403 })

  const conversa = await findOrCreateDirect(ctx.admin, circleId, ctx.user.id, outro)
  if (!conversa) return NextResponse.json({ error: 'Não foi possível abrir a conversa.' }, { status: 500 })

  return NextResponse.json({ conversation: conversa })
}

/** Marca como lida, esconde, desesconde. */
export async function PATCH(req: NextRequest) {
  const ctx = await contexto()
  if ('erro' in ctx) return ctx.erro

  let body: { conversationId?: string; read?: boolean; hidden?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }

  const { conversationId } = body
  if (!conversationId) return NextResponse.json({ error: 'conversationId obrigatório.' }, { status: 400 })

  const conversa = await requireParticipant(ctx.admin, conversationId, ctx.user.id)
  if (!conversa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const patch: Record<string, string | null> = {}
  if (body.read === true) patch.last_read_at = new Date().toISOString()
  /*
   * `hidden: false` grava NULL, e não a hora de agora. Desesconder tem que
   * apagar a marca — deixá-la com data faria `isVisible` comparar contra um
   * carimbo que já não significa nada.
   */
  if (body.hidden === true) patch.hidden_at = new Date().toISOString()
  if (body.hidden === false) patch.hidden_at = null

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nada a atualizar.' }, { status: 400 })
  }

  const { error } = await ctx.admin
    .from('conversation_members')
    .update(patch)
    .eq('conversation_id', conversationId)
    .eq('user_id', ctx.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
