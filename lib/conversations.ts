/**
 * A conversa como coisa (COMMS-T11 / D-188).
 *
 * Módulo PURO: sem rede, sem Supabase, sem React. Tudo o que decide identidade,
 * ordem e não-lido mora aqui, porque é exatamente o tipo de regra que, espalhada
 * pela tela e pela rota, produz duas respostas para a mesma pergunta — o defeito
 * que se repetiu cinco vezes nesta frente (D-129, D-179, D-181, D-182, D-187).
 */

export type ConversationKind = 'circle' | 'direct'

export type ConversationRow = {
  id: string
  circleId: string
  kind: ConversationKind
  directKey: string | null
  /** Participantes, exceto quem está lendo. */
  others: Array<{ userId: string; name: string }>
  lastMessageAt: string | null
  lastMessageBody: string | null
  lastMessageSenderId: string | null
  lastMessageSenderName: string | null
  lastReadAt: string | null
  hiddenAt: string | null
}

/**
 * A chave natural da conversa individual.
 *
 * Ordenar é o ponto inteiro: sem isso, (A,B) e (B,A) seriam conversas
 * diferentes, cada lado abriria a sua e as duas pessoas conversariam sozinhas
 * achando que a outra não responde. É o mesmo raciocínio de `requirementNaturalKey`
 * em PREP-T05 — a chave existe para que a segunda tentativa ENCONTRE a primeira.
 */
export function directKey(a: string, b: string): string {
  if (!a || !b) throw new Error('directKey exige dois participantes')
  if (a === b) throw new Error('não existe conversa direta consigo mesmo')
  return [a, b].sort().join(':')
}

/** Os dois lados de uma chave direta, na ordem em que foram guardados. */
export function directPair(key: string): [string, string] {
  const parts = key.split(':')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`chave direta malformada: ${key}`)
  }
  return [parts[0], parts[1]]
}

/**
 * O nome que a linha mostra.
 *
 * A conversa do círculo usa o nome do círculo; a direta usa o nome da outra
 * pessoa. Uma conversa direta sem a outra pessoa carregada NÃO inventa nome —
 * devolve `null`, e a tela decide o que fazer. Chutar "Alguém" aqui esconderia
 * dado faltando, que é a armadilha de `unknown ≠ zero` de novo.
 */
export function conversationTitle(
  conversa: Pick<ConversationRow, 'kind' | 'others'>,
  nomeDoCirculo: string | null,
): string | null {
  if (conversa.kind === 'circle') return nomeDoCirculo
  return conversa.others[0]?.name ?? null
}

/**
 * Não lidas de uma conversa.
 *
 * Sem `lastReadAt` a conversa nunca foi aberta: **tudo** é não-lido, e não
 * zero. Zero ali seria a mesma inversão que fez o Pilot dizer "autonomia zero"
 * quando na verdade não sabia (D-174).
 */
export function unreadCount(
  mensagens: Array<{ createdAt: string; senderId: string }>,
  lastReadAt: string | null,
  meuId: string,
): number {
  const corte = lastReadAt ? Date.parse(lastReadAt) : null
  return mensagens.filter(m => {
    // O que eu mesmo mandei nunca conta como não lido.
    if (m.senderId === meuId) return false
    if (corte === null) return true
    return Date.parse(m.createdAt) > corte
  }).length
}

/**
 * A conversa tem algo que a pessoa ainda não viu?
 *
 * Três recusas, nesta ordem, e cada uma por um motivo diferente:
 *  1. sem mensagem nenhuma não há o que ler;
 *  2. a última ser **minha** nunca é não-lido — a bolinha vermelha no que eu
 *     mesmo acabei de escrever é o defeito clássico desta lista;
 *  3. sem `lastReadAt` a conversa nunca foi aberta, então TUDO é não-lido — e
 *     não zero, que seria a inversão de D-174 outra vez.
 */
export function hasUnread(conversa: ConversationRow, meuId: string): boolean {
  if (!conversa.lastMessageAt) return false
  if (conversa.lastMessageSenderId === meuId) return false
  if (!conversa.lastReadAt) return true
  return Date.parse(conversa.lastMessageAt) > Date.parse(conversa.lastReadAt)
}

/**
 * A conversa aparece na lista?
 *
 * Escondida some — **até chegar mensagem nova**. Esconder é arrumar a lista, e
 * não bloquear alguém: se a pessoa escreveu de novo, a conversa volta. Bloquear
 * de verdade é outra decisão, com outra coluna.
 */
export function isVisible(conversa: Pick<ConversationRow, 'hiddenAt' | 'lastMessageAt'>): boolean {
  if (!conversa.hiddenAt) return true
  if (!conversa.lastMessageAt) return false
  return Date.parse(conversa.lastMessageAt) > Date.parse(conversa.hiddenAt)
}

/**
 * A ordem da lista: atividade mais recente primeiro.
 *
 * Conversa sem nenhuma mensagem vai para o fim, **não** para o topo. Uma
 * conversa recém-criada e vazia no topo empurraria para baixo a mensagem que
 * acabou de chegar — que é o oposto do que a lista existe para fazer.
 *
 * A do círculo desempata na frente: quando nada aconteceu ainda, ela é a que a
 * família procura.
 */
export function orderConversations(lista: ConversationRow[]): ConversationRow[] {
  return [...lista].sort((a, b) => {
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : null
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : null
    if (ta !== null && tb !== null && ta !== tb) return tb - ta
    if (ta !== null && tb === null) return -1
    if (ta === null && tb !== null) return 1
    if (a.kind !== b.kind) return a.kind === 'circle' ? -1 : 1
    return a.id.localeCompare(b.id)
  })
}

/**
 * A prévia de uma linha da lista.
 *
 * Corta por CARACTERE e sinaliza o corte. Uma prévia truncada em silêncio faz a
 * pessoa achar que a mensagem acabou ali — e numa emergência o fim da frase é
 * onde costuma estar a instrução.
 */
export function preview(body: string | null, limite = 60): string {
  if (!body) return ''
  const limpo = body.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  return `${limpo.slice(0, limite - 1)}…`
}
