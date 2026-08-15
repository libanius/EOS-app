/**
 * O lado servidor da conversa (COMMS-T12 / D-188).
 *
 * `lib/conversations.ts` decide identidade, ordem e não-lido — puro e testado.
 * Este arquivo é a parte que fala com o banco, e existe separado pelo mesmo
 * motivo de `lib/holdings-store.ts`: regra pura não deve precisar de Supabase
 * para ser exercida.
 *
 * ── O guarda mudou de pergunta ────────────────────────────────────────────
 *
 * `/api/comms/messages` pergunta *"você é do círculo?"*. Isso bastava quando
 * existia uma conversa por círculo. Com conversa direta, a pergunta certa passa
 * a ser **"você participa DESTA conversa?"** — ser do círculo não dá acesso à
 * conversa de duas outras pessoas dentro dele.
 *
 * É a distinção que separa 1:1 de "grupo com menos gente à vista".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { directKey, type ConversationKind, type ConversationRow } from '@/lib/conversations'

type Admin = SupabaseClient

export type ConversationRecord = {
  id: string
  circle_id: string
  kind: ConversationKind
  direct_key: string | null
}

/**
 * Quem participa desta conversa?
 *
 * Devolve `null` quando a pessoa **não** participa — e quem chama trata isso
 * como 403. Nunca devolve a conversa "meio autorizada": ou você está dentro, ou
 * a resposta é a mesma de uma conversa inexistente.
 */
export async function requireParticipant(
  admin: Admin,
  conversationId: string,
  userId: string,
): Promise<ConversationRecord | null> {
  const { data: membro } = await admin
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membro) return null

  const { data: conversa } = await admin
    .from('conversations')
    .select('id, circle_id, kind, direct_key')
    .eq('id', conversationId)
    .maybeSingle()

  return (conversa as ConversationRecord | null) ?? null
}

/**
 * A conversa do círculo, criada sob demanda.
 *
 * Um círculo criado DEPOIS da migração de D-188 não passou pelo backfill. Sem
 * isto, ele nasceria sem conversa e o chat sumiria para quem acabou de criar o
 * círculo — a pior primeira impressão possível.
 */
export async function ensureCircleConversation(
  admin: Admin,
  circleId: string,
): Promise<ConversationRecord | null> {
  const { data: existente } = await admin
    .from('conversations')
    .select('id, circle_id, kind, direct_key')
    .eq('circle_id', circleId)
    .eq('kind', 'circle')
    .maybeSingle()

  if (existente) {
    await syncCircleMembers(admin, existente.id as string, circleId)
    return existente as ConversationRecord
  }

  const { data: criada } = await admin
    .from('conversations')
    .insert({ circle_id: circleId, kind: 'circle', direct_key: null })
    .select('id, circle_id, kind, direct_key')
    .maybeSingle()

  // Corrida: outro pedido criou entre o SELECT e o INSERT. O índice único
  // recusou, e a resposta certa é ler o que ele criou — não falhar.
  if (!criada) {
    const { data: agora } = await admin
      .from('conversations')
      .select('id, circle_id, kind, direct_key')
      .eq('circle_id', circleId)
      .eq('kind', 'circle')
      .maybeSingle()
    if (!agora) return null
    await syncCircleMembers(admin, agora.id as string, circleId)
    return agora as ConversationRecord
  }

  await syncCircleMembers(admin, criada.id as string, circleId)
  return criada as ConversationRecord
}

/**
 * Todo membro do círculo participa da conversa do círculo.
 *
 * Roda a cada leitura porque entrar num círculo não passa por aqui. Sem isso,
 * quem acabou de ser aceito veria a conversa vazia — e o silêncio pareceria
 * falta de mensagem, não falta de cadastro.
 */
async function syncCircleMembers(admin: Admin, conversationId: string, circleId: string) {
  const [{ data: doCirculo }, { data: daConversa }] = await Promise.all([
    admin.from('circle_members').select('user_id').eq('circle_id', circleId),
    admin.from('conversation_members').select('user_id').eq('conversation_id', conversationId),
  ])

  const jaTem = new Set((daConversa ?? []).map(r => r.user_id as string))
  const faltando = (doCirculo ?? [])
    .map(r => r.user_id as string)
    .filter(id => !jaTem.has(id))

  if (faltando.length) {
    await admin
      .from('conversation_members')
      .insert(faltando.map(user_id => ({ conversation_id: conversationId, user_id })))
  }
}

/**
 * A conversa direta entre duas pessoas do mesmo círculo — achando ou criando.
 *
 * `directKey` é simétrica, então quem abrir por segundo ENCONTRA a primeira em
 * vez de criar a segunda. Ler-então-escrever com o índice único como rede é o
 * mesmo desenho de `syncRequirement` (D-172): o `on_conflict` do PostgREST não
 * alcança índice parcial.
 */
export async function findOrCreateDirect(
  admin: Admin,
  circleId: string,
  meuId: string,
  outroId: string,
): Promise<ConversationRecord | null> {
  const chave = directKey(meuId, outroId)

  const { data: existente } = await admin
    .from('conversations')
    .select('id, circle_id, kind, direct_key')
    .eq('circle_id', circleId)
    .eq('kind', 'direct')
    .eq('direct_key', chave)
    .maybeSingle()

  if (existente) return existente as ConversationRecord

  const { data: criada } = await admin
    .from('conversations')
    .insert({ circle_id: circleId, kind: 'direct', direct_key: chave, created_by: meuId })
    .select('id, circle_id, kind, direct_key')
    .maybeSingle()

  if (!criada) {
    const { data: agora } = await admin
      .from('conversations')
      .select('id, circle_id, kind, direct_key')
      .eq('circle_id', circleId)
      .eq('kind', 'direct')
      .eq('direct_key', chave)
      .maybeSingle()
    return (agora as ConversationRecord | null) ?? null
  }

  await admin.from('conversation_members').insert([
    { conversation_id: criada.id as string, user_id: meuId },
    { conversation_id: criada.id as string, user_id: outroId },
  ])

  return criada as ConversationRecord
}

/**
 * As conversas de uma pessoa, prontas para a lista.
 *
 * A última mensagem vem numa consulta só para todas as conversas, e não uma por
 * conversa: com dez threads isso seriam onze idas ao banco, e a lista é a
 * primeira coisa que a tela mostra.
 */
export async function listConversations(
  admin: Admin,
  userId: string,
): Promise<ConversationRow[]> {
  const { data: minhas } = await admin
    .from('conversation_members')
    .select('conversation_id, last_read_at, hidden_at')
    .eq('user_id', userId)

  const ids = (minhas ?? []).map(r => r.conversation_id as string)
  if (!ids.length) return []

  const [{ data: conversas }, { data: membros }, { data: mensagens }] = await Promise.all([
    admin.from('conversations').select('id, circle_id, kind, direct_key').in('id', ids),
    admin.from('conversation_members').select('conversation_id, user_id').in('conversation_id', ids),
    admin
      .from('circle_messages')
      .select('conversation_id, sender_id, body, created_at')
      .in('conversation_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const outrosIds = Array.from(
    new Set((membros ?? []).map(m => m.user_id as string).filter(id => id !== userId)),
  )
  const { data: perfis } = outrosIds.length
    ? await admin.from('profiles').select('id, name').in('id', outrosIds)
    : { data: [] as Array<{ id: string; name: string | null }> }

  const nomePorId = new Map((perfis ?? []).map(p => [p.id as string, (p.name as string | null) ?? '']))

  // A primeira de cada conversa é a mais recente: a consulta já veio ordenada.
  const ultima = new Map<string, { sender_id: string; body: string; created_at: string }>()
  for (const m of mensagens ?? []) {
    const id = m.conversation_id as string
    if (!ultima.has(id)) {
      ultima.set(id, {
        sender_id: m.sender_id as string,
        body: m.body as string,
        created_at: m.created_at as string,
      })
    }
  }

  const meuEstado = new Map(
    (minhas ?? []).map(r => [
      r.conversation_id as string,
      { lastReadAt: r.last_read_at as string | null, hiddenAt: r.hidden_at as string | null },
    ]),
  )

  const participantes = new Map<string, string[]>()
  for (const m of membros ?? []) {
    const id = m.conversation_id as string
    if (!participantes.has(id)) participantes.set(id, [])
    participantes.get(id)!.push(m.user_id as string)
  }

  return ((conversas ?? []) as ConversationRecord[]).map(c => {
    const u = ultima.get(c.id) ?? null
    const estado = meuEstado.get(c.id) ?? { lastReadAt: null, hiddenAt: null }
    return {
      id: c.id,
      circleId: c.circle_id,
      kind: c.kind,
      directKey: c.direct_key,
      others: (participantes.get(c.id) ?? [])
        .filter(id => id !== userId)
        .map(id => ({ userId: id, name: nomePorId.get(id) || '' })),
      lastMessageAt: u?.created_at ?? null,
      lastMessageBody: u?.body ?? null,
      lastMessageSenderId: u?.sender_id ?? null,
      lastMessageSenderName: u ? nomePorId.get(u.sender_id) ?? null : null,
      lastReadAt: estado.lastReadAt,
      hiddenAt: estado.hiddenAt,
    }
  })
}
