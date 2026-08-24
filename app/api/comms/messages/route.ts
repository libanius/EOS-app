import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCommsNotifications, getCircleMemberIds, getCircleName, getProfileName } from '@/lib/comms-notifications'
import { ensureCircleConversation, requireParticipant } from '@/lib/conversations-store'

type MessageRow = {
  id: string
  circle_id: string
  sender_id: string
  body: string
  kind: 'text' | 'system' | 'alert'
  created_at: string
}

type ProfileRow = {
  id: string
  name: string | null
}

const MAX_BODY = 1000
const LIMIT = 80

async function requireMember(circleId: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: membership, error } = await supabase
    .from('circle_members')
    .select('role')
    .eq('circle_id', circleId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!membership) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const admin = createAdminClient()
  if (!admin) return { error: NextResponse.json({ error: 'Service role not configured' }, { status: 503 }) }

  return { user, admin }
}

/**
 * Resolve o alvo do pedido (COMMS-T12 / D-188).
 *
 * `conversationId` é o caminho novo e o único que alcança conversa direta.
 * `circleId` continua valendo: ele está em links guardados, no realtime e no
 * `href` de notificações **já gravadas no banco** — desligar aqui quebraria
 * histórico que ninguém pode reescrever.
 *
 * A pergunta do guarda muda com o caminho: por conversa é *"você participa
 * desta conversa?"*; por círculo é *"você é do círculo?"*, e ele resolve para a
 * conversa do círculo.
 */
async function resolverAlvo(req: NextRequest, corpo?: { conversationId?: string; circleId?: string }) {
  const conversationId = corpo?.conversationId ?? req.nextUrl.searchParams.get('conversationId')
  const circleId = corpo?.circleId ?? req.nextUrl.searchParams.get('circleId')

  if (conversationId) {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

    const admin = createAdminClient()
    if (!admin) return { error: NextResponse.json({ error: 'Service role not configured' }, { status: 503 }) }

    const conversa = await requireParticipant(admin, conversationId, user.id)
    // Mesma resposta para "não existe" e "não é sua": revelar a diferença
    // permitiria descobrir quais conversas existem.
    if (!conversa) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

    return { user, admin, conversa }
  }

  if (!circleId) return { error: NextResponse.json({ error: 'conversationId ou circleId required' }, { status: 400 }) }

  const guard = await requireMember(circleId)
  /*
   * `return guard` aqui deixava o tipo de retorno carregar também a forma
   * `{user, admin}` SEM conversa — porque `requireMember` devolve união com
   * `error?: undefined`, e `'error' in guard` não descarta esse membro.
   * Reconstruir o erro mantém as duas formas desta função realmente distintas.
   */
  if (guard.error) return { error: guard.error }
  const conversa = await ensureCircleConversation(guard.admin, circleId)
  if (!conversa) return { error: NextResponse.json({ error: 'Conversa indisponível.' }, { status: 500 }) }
  return { user: guard.user!, admin: guard.admin!, conversa }
}

export async function GET(req: NextRequest) {
  const alvo = await resolverAlvo(req)
  if ('error' in alvo) return alvo.error
  const guard = { user: alvo.user, admin: alvo.admin }

  const { data, error } = await guard.admin
    .from('circle_messages')
    .select('id, circle_id, sender_id, body, kind, created_at')
    .eq('conversation_id', alvo.conversa.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = ((data ?? []) as MessageRow[]).reverse()
  const senderIds = Array.from(new Set(rows.map(row => row.sender_id)))
  const names = new Map<string, string>()

  if (senderIds.length) {
    const { data: profiles } = await guard.admin
      .from('profiles')
      .select('id, name')
      .in('id', senderIds)

    for (const profile of (profiles ?? []) as ProfileRow[]) {
      names.set(profile.id, profile.name || '—')
    }
  }

  return NextResponse.json({
    messages: rows.map(row => ({
      id: row.id,
      circle_id: row.circle_id,
      sender_id: row.sender_id,
      sender_name: names.get(row.sender_id) ?? '—',
      is_me: row.sender_id === guard.user.id,
      body: row.body,
      kind: row.kind,
      created_at: row.created_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  let body: { circleId?: string; conversationId?: string; body?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'message too long' }, { status: 400 })

  const alvo = await resolverAlvo(req, body)
  if ('error' in alvo) return alvo.error
  const guard = { user: alvo.user, admin: alvo.admin }
  const conversa = alvo.conversa

  const { data, error } = await guard.admin
    .from('circle_messages')
    .insert({
      // As duas colunas são escritas: `circle_id` continua sendo a verdade do
      // legado até a retirada dele ter decisão própria (D-188).
      circle_id: conversa.circle_id,
      conversation_id: conversa.id,
      sender_id: guard.user.id,
      body: text,
      kind: 'text',
    })
    .select('id, circle_id, sender_id, body, kind, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /*
   * ── QUEM É AVISADO DEPENDE DO TIPO DA CONVERSA ──────────────────────────
   *
   * A versão anterior avisava o CÍRCULO INTEIRO, porque só existia conversa de
   * círculo. Mantido assim, uma mensagem direta chegaria como notificação para
   * todo mundo — vazando para o círculo inteiro que a conversa aconteceu, e
   * ainda com um trecho do texto no corpo do aviso.
   *
   * Conversa direta avisa só quem participa dela.
   */
  const destinatarios = conversa.kind === 'direct'
    ? await (async () => {
        const { data: membros } = await guard.admin
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', conversa.id)
        return (membros ?? []).map(m => m.user_id as string)
      })()
    : await getCircleMemberIds(guard.admin, conversa.circle_id)

  const [actorName, circleName] = await Promise.all([
    getProfileName(guard.admin, guard.user.id),
    getCircleName(guard.admin, conversa.circle_id),
  ])
  const onde = conversa.kind === 'direct' ? actorName : circleName
  await createCommsNotifications({
    admin: guard.admin,
    circleId: conversa.circle_id,
    actorId: guard.user.id,
    recipientIds: destinatarios,
    scope: 'circle',
    kind: 'message',
    title: `${actorName} enviou uma mensagem`,
    body: conversa.kind === 'direct'
      ? `${actorName}: "${text.slice(0, 120)}${text.length > 120 ? '...' : ''}"`
      : `${actorName} escreveu em ${onde}: "${text.slice(0, 120)}${text.length > 120 ? '...' : ''}"`,
    // O endereço novo. Os `href` já gravados no banco apontam para
    // `/comms?view=chat&circleId=…` e continuam funcionando pelo
    // redirecionamento em `/comms` — histórico não se reescreve.
    href: `/comms/${conversa.id}?messageId=${encodeURIComponent((data as MessageRow).id)}`,
    sourceKey: `message:${(data as MessageRow).id}`,
    metadata: { message_id: (data as MessageRow).id, conversation_id: conversa.id },
  })

  return NextResponse.json({
    message: {
      ...(data as MessageRow),
      sender_name: guard.user.user_metadata?.name ?? guard.user.email ?? '—',
      is_me: true,
    },
  }, { status: 201 })
}
