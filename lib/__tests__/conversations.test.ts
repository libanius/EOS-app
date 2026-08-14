/**
 * A conversa como coisa (COMMS-T11 / D-188).
 *
 * O que este arquivo protege é a identidade: se `directKey` deixar de ser
 * simétrica, cada lado abre a própria conversa e as duas pessoas conversam
 * sozinhas — sem erro, sem log, achando que a outra não responde. É a mesma
 * forma de defeito de D-179 e D-182, e a razão de a regra morar num módulo puro.
 */
import {
  directKey,
  directPair,
  conversationTitle,
  unreadCount,
  hasUnread,
  isVisible,
  orderConversations,
  preview,
  type ConversationRow,
} from '@/lib/conversations'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'

const conversa = (over: Partial<ConversationRow> = {}): ConversationRow => ({
  id: 'c1',
  circleId: 'circulo',
  kind: 'direct',
  directKey: directKey(A, B),
  others: [{ userId: B, name: 'Daniela' }],
  lastMessageAt: '2026-08-15T10:00:00Z',
  lastMessageBody: 'oi',
  lastMessageSenderId: B,
  lastMessageSenderName: 'Daniela',
  lastReadAt: null,
  hiddenAt: null,
  ...over,
})

describe('a chave da conversa direta é SIMÉTRICA', () => {
  it('os dois lados produzem a mesma chave', () => {
    expect(directKey(A, B)).toBe(directKey(B, A))
  })

  it('e é isso que impede dois threads para o mesmo par', () => {
    /*
     * Sem ordenação, quem abrisse primeiro criaria "A:B" e o outro criaria
     * "B:A". Duas linhas, duas conversas, e nenhuma das duas pessoas vendo a
     * mensagem da outra.
     */
    const euAbro = directKey(A, B)
    const elaAbre = directKey(B, A)
    expect(euAbro).toBe(elaAbre)
    expect(new Set([euAbro, elaAbre]).size).toBe(1)
  })

  it('pares diferentes não colidem', () => {
    expect(directKey(A, B)).not.toBe(directKey(A, C))
  })

  it('recusa conversa consigo mesmo', () => {
    expect(() => directKey(A, A)).toThrow(/consigo mesmo/)
  })

  it('recusa participante vazio em vez de gerar chave torta', () => {
    expect(() => directKey(A, '')).toThrow()
  })

  it('a volta devolve os dois lados', () => {
    const [x, y] = directPair(directKey(B, A))
    expect(new Set([x, y])).toEqual(new Set([A, B]))
  })

  it('chave malformada falha alto', () => {
    expect(() => directPair('só-um-lado')).toThrow(/malformada/)
  })
})

describe('o nome da linha', () => {
  it('a do círculo usa o nome do círculo', () => {
    expect(conversationTitle({ kind: 'circle', others: [] }, 'Família Libânio'))
      .toBe('Família Libânio')
  })

  it('a direta usa o nome da outra pessoa', () => {
    expect(conversationTitle({ kind: 'direct', others: [{ userId: B, name: 'Daniela' }] }, null))
      .toBe('Daniela')
  })

  it('sem a outra pessoa NÃO inventa nome', () => {
    // Chutar "Alguém" esconderia dado faltando — a armadilha de `unknown ≠ zero`.
    expect(conversationTitle({ kind: 'direct', others: [] }, 'Família')).toBeNull()
  })
})

describe('não lidas', () => {
  const msgs = [
    { createdAt: '2026-08-15T09:00:00Z', senderId: B },
    { createdAt: '2026-08-15T10:00:00Z', senderId: B },
    { createdAt: '2026-08-15T11:00:00Z', senderId: A },
  ]

  it('conta só o que chegou depois da última leitura', () => {
    expect(unreadCount(msgs, '2026-08-15T09:30:00Z', A)).toBe(1)
  })

  it('nunca conta o que eu mesmo mandei', () => {
    expect(unreadCount(msgs, null, A)).toBe(2)   // as duas dela, não a minha
    expect(unreadCount(msgs, null, B)).toBe(1)   // só a dele
  })

  it('conversa nunca aberta tem TUDO como não lido, não zero', () => {
    // Zero aqui seria a inversão de D-174: "não sei" virando "nada".
    expect(unreadCount(msgs, null, C)).toBe(3)
  })

  it('a bolinha não acende no que eu acabei de escrever', () => {
    expect(hasUnread(conversa({ lastMessageSenderId: A }), A)).toBe(false)
  })

  it('acende quando ela escreveu depois da minha leitura', () => {
    expect(hasUnread(conversa({ lastReadAt: '2026-08-15T09:00:00Z' }), A)).toBe(true)
  })

  it('apaga quando eu já li depois', () => {
    expect(hasUnread(conversa({ lastReadAt: '2026-08-15T11:00:00Z' }), A)).toBe(false)
  })

  it('conversa vazia não acende', () => {
    expect(hasUnread(conversa({ lastMessageAt: null, lastMessageSenderId: null }), A)).toBe(false)
  })
})

describe('esconder é arrumar a lista, não bloquear', () => {
  it('escondida some', () => {
    expect(isVisible({ hiddenAt: '2026-08-15T12:00:00Z', lastMessageAt: '2026-08-15T10:00:00Z' }))
      .toBe(false)
  })

  it('mas MENSAGEM NOVA a traz de volta', () => {
    /*
     * A distinção que importa: esconder arruma a lista de hoje. Se a pessoa
     * escreveu de novo, a conversa volta — senão "excluir" viraria um bloqueio
     * silencioso, e alguém pediria socorro para uma tela que decidiu não mostrar.
     */
    expect(isVisible({ hiddenAt: '2026-08-15T10:00:00Z', lastMessageAt: '2026-08-15T12:00:00Z' }))
      .toBe(true)
  })

  it('escondida e sem mensagem nenhuma continua fora', () => {
    expect(isVisible({ hiddenAt: '2026-08-15T10:00:00Z', lastMessageAt: null })).toBe(false)
  })

  it('nunca escondida sempre aparece', () => {
    expect(isVisible({ hiddenAt: null, lastMessageAt: null })).toBe(true)
  })
})

describe('a ordem da lista', () => {
  it('atividade mais recente primeiro', () => {
    const ordenada = orderConversations([
      conversa({ id: 'velha', lastMessageAt: '2026-08-15T08:00:00Z' }),
      conversa({ id: 'nova', lastMessageAt: '2026-08-15T20:00:00Z' }),
    ])
    expect(ordenada.map(c => c.id)).toEqual(['nova', 'velha'])
  })

  it('conversa VAZIA vai para o fim, não para o topo', () => {
    /*
     * Uma conversa recém-criada e sem mensagem no topo empurraria para baixo
     * justamente a que acabou de chegar — o oposto do que a lista faz.
     */
    const ordenada = orderConversations([
      conversa({ id: 'vazia', lastMessageAt: null }),
      conversa({ id: 'com-msg', lastMessageAt: '2026-08-15T08:00:00Z' }),
    ])
    expect(ordenada.map(c => c.id)).toEqual(['com-msg', 'vazia'])
  })

  it('entre duas vazias, a do círculo vem antes', () => {
    const ordenada = orderConversations([
      conversa({ id: 'direta', kind: 'direct', lastMessageAt: null }),
      conversa({ id: 'circulo', kind: 'circle', directKey: null, lastMessageAt: null }),
    ])
    expect(ordenada[0].id).toBe('circulo')
  })

  it('não muda a lista original', () => {
    const original = [conversa({ id: 'a', lastMessageAt: null }), conversa({ id: 'b' })]
    orderConversations(original)
    expect(original.map(c => c.id)).toEqual(['a', 'b'])
  })
})

describe('a prévia', () => {
  it('passa curta inteira', () => {
    expect(preview('Estou bem')).toBe('Estou bem')
  })

  it('colapsa quebras de linha — a lista é de uma linha só', () => {
    expect(preview('vou\n  buscar\n\na Isadora')).toBe('vou buscar a Isadora')
  })

  it('SINALIZA o corte em vez de truncar em silêncio', () => {
    const longa = 'a'.repeat(200)
    const p = preview(longa, 20)
    expect(p).toHaveLength(20)
    expect(p.endsWith('…')).toBe(true)
  })

  it('sem corpo devolve vazio, não "null"', () => {
    expect(preview(null)).toBe('')
  })
})
