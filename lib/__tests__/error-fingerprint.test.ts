/**
 * O agrupamento tem que errar para os dois lados com igual cuidado (D-121).
 *
 * Agrupar de menos devolve a lista crua que o agrupamento existia para evitar.
 * Agrupar de mais é PIOR: dois defeitos distintos viram um, e o segundo some da
 * tela sem nunca ter sido corrigido. Por isso metade destes casos prova que
 * coisas iguais juntam, e a outra metade prova que coisas diferentes NÃO
 * juntam.
 */

import { fingerprint, normalizarMensagem } from '@/lib/error-fingerprint'

const pilha = (arquivo: string, linha = 10) =>
  `Error: x\n    at handler (/var/task/${arquivo}:${linha}:5)\n    at run (node:internal/x:1:1)`

describe('normalizarMensagem', () => {
  it('remove o que muda entre duas ocorrências', () => {
    expect(normalizarMensagem('Usuário 481 não encontrado')).toBe('usuário <n> não encontrado')
    expect(normalizarMensagem('falha em 3f1a9c22-1111-4a2b-8c3d-aabbccddeeff')).toBe('falha em <id>')
    expect(normalizarMensagem('GET https://api.x.com/v1/y falhou')).toBe('get <url> falhou')
    expect(normalizarMensagem('coluna "email" ausente')).toBe('coluna <s> ausente')
  })

  it('não deixa o <n> comer os dígitos de dentro de um UUID', () => {
    // A ordem das substituições importa: se o número passasse primeiro, todo
    // UUID viraria uma sopa de <n> e defeitos distintos colidiriam.
    expect(normalizarMensagem('id 3f1a9c22-1111-4a2b-8c3d-aabbccddeeff')).toBe('id <id>')
  })
})

describe('fingerprint — o que DEVE juntar', () => {
  it('mesma falha com identificadores diferentes é um grupo só', () => {
    expect(fingerprint('api/x', 'Usuário 481 não encontrado', pilha('lib/x.ts', 10)))
      .toBe(fingerprint('api/x', 'Usuário 902 não encontrado', pilha('lib/x.ts', 41)))
  })

  it('a linha do arquivo não cria grupo novo a cada build', () => {
    // Se a linha entrasse na conta, o mesmo defeito viraria um grupo diferente
    // toda vez que alguém editasse o arquivo acima dele.
    expect(fingerprint('api/x', 'boom', pilha('lib/x.ts', 10)))
      .toBe(fingerprint('api/x', 'boom', pilha('lib/x.ts', 999)))
  })

  it('tempo de espera variável não separa o mesmo defeito', () => {
    expect(fingerprint('api/y', 'timeout after 30000ms')).toBe(fingerprint('api/y', 'timeout after 45000ms'))
  })
})

describe('fingerprint — o que NÃO pode juntar', () => {
  it('mensagens diferentes no mesmo lugar são defeitos diferentes', () => {
    expect(fingerprint('api/x', 'Conexão recusada', pilha('lib/x.ts')))
      .not.toBe(fingerprint('api/x', 'Usuário 481 não encontrado', pilha('lib/x.ts')))
  })

  it('a mesma frase genérica vinda de arquivos diferentes fica separada', () => {
    // `Failed to fetch` acontece em todo lugar; sem o quadro da pilha, meia
    // dúzia de defeitos distintos viraria um grupo inútil.
    expect(fingerprint('client/a', 'Failed to fetch', pilha('components/A.tsx')))
      .not.toBe(fingerprint('client/a', 'Failed to fetch', pilha('components/B.tsx')))
  })

  it('o mesmo erro em rotas diferentes fica separado', () => {
    expect(fingerprint('api/pilot/chat', 'boom')).not.toBe(fingerprint('api/plans', 'boom'))
  })

  it('quadro de node_modules é ignorado — o que importa é o código nosso', () => {
    const comRuido = `Error: x\n    at f (/var/task/node_modules/pg/lib/y.js:9:1)\n    at handler (/var/task/lib/x.ts:10:5)`
    expect(fingerprint('api/x', 'boom', comRuido)).toBe(fingerprint('api/x', 'boom', pilha('lib/x.ts')))
  })
})

describe('fingerprint — forma', () => {
  it('é curto e estável', () => {
    const fp = fingerprint('api/x', 'boom', pilha('lib/x.ts'))
    expect(fp).toMatch(/^[0-9a-f]{12}$/)
    expect(fp).toBe(fingerprint('api/x', 'boom', pilha('lib/x.ts')))
  })

  it('funciona sem pilha nenhuma', () => {
    expect(fingerprint('api/x', 'boom')).toMatch(/^[0-9a-f]{12}$/)
  })
})
