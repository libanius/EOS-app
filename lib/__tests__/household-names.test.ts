/**
 * HOUSEHOLD-FIX-001 — regra 5 e edge cases E1–E5, E15.
 *
 * O caso que guia tudo é o incidente de 2026-11-03: quatro convites para duas
 * pessoas. Ver o comentário no topo de `lib/household-names.ts`.
 */

import { similarNames, findSimilar, normalizeName, keeperOf, pairKeys, type NamedPerson } from '@/lib/household-names'

describe('regra 5 — quando perguntar "é a mesma pessoa?"', () => {
  it('E1: "Graziela" e "Graziela Letteriello" (nome incompleto)', () => {
    expect(similarNames('Graziela', 'Graziela Letteriello')).toBe(true)
    expect(similarNames('Graziela Letteriello', 'Graziela')).toBe(true)
  })

  it('E2: "Alexa Letteriello" e "Alexia Letteriello" (erro de digitação)', () => {
    expect(similarNames('Alexa Letteriello', 'Alexia Letteriello')).toBe(true)
  })

  it('E3: mãe e filha com o mesmo nome — avisa (e a tela deixa incluir)', () => {
    expect(similarNames('Maria Lima', 'maria lima')).toBe(true)
  })

  it('E4: "Ana" e "Anabela" não avisam (prefixo com menos de 4 letras)', () => {
    expect(similarNames('Ana', 'Anabela')).toBe(false)
  })

  it('E5: "Maria Silva" e "Maria Souza" não avisam (sobrenomes se contradizem)', () => {
    expect(similarNames('Maria Silva', 'Maria Souza')).toBe(false)
  })

  it('E15: acento não separa ninguém', () => {
    expect(similarNames('Grazielá', 'Graziela')).toBe(true)
    expect(normalizeName('  Grazielá   LETTERIELLO ')).toBe('graziela letteriello')
  })

  it('apelido por prefixo: "Grazi" e "Graziela Letteriello"', () => {
    expect(similarNames('Grazi', 'Graziela Letteriello')).toBe(true)
  })

  it('apelido com sobrenome diferente não avisa: "Grazi Souza" e "Graziela Letteriello"', () => {
    expect(similarNames('Grazi Souza', 'Graziela Letteriello')).toBe(false)
  })

  it('nomes diferentes não avisam', () => {
    expect(similarNames('Alexia Letteriello', 'Graziela Letteriello')).toBe(false)
    expect(similarNames('Paulo', 'Daniela')).toBe(false)
  })

  it('nome vazio nunca casa', () => {
    expect(similarNames('', 'Graziela')).toBe(false)
    expect(findSimilar('   ', [{ kind: 'invite', id: '1', name: 'Graziela' }])).toEqual([])
  })
})

describe('o incidente de 2026-11-03 termina com 2 convites, não 4', () => {
  it('cada redigitação é apanhada pela regra antes de entrar', () => {
    const casa: NamedPerson[] = []
    const digitados = ['Graziela', 'Graziela Letteriello', 'Alexia Letteriello', 'Alexa Letteriello']
    const perguntados: string[] = []

    digitados.forEach((nome, i) => {
      const parecidos = findSimilar(nome, casa)
      if (parecidos.length) {
        // A usuária responde "É a mesma". A segunda grafia de Graziela era
        // mais completa — "Corrigir nome" a guarda no lugar da primeira.
        perguntados.push(nome)
        const alvo = parecidos[0]
        if (normalizeName(nome).length > normalizeName(alvo.name).length) alvo.name = nome
        return
      }
      casa.push({ kind: 'invite', id: String(i), name: nome })
    })

    expect(perguntados).toEqual(['Graziela Letteriello', 'Alexa Letteriello'])
    expect(casa.map(p => p.name)).toEqual(['Graziela Letteriello', 'Alexia Letteriello'])
  })
})

describe('quem fica quando é a mesma pessoa (§3.6)', () => {
  type R = NamedPerson & { status?: string }
  const conta: R = { kind: 'account', id: 'a', name: 'Graziela' }
  const dep: R = { kind: 'dependent', id: 'd', name: 'Graziela Letteriello' }
  const enviado: R = { kind: 'invite', id: 'i1', name: 'Graziela', status: 'sent' }
  const pendente: R = { kind: 'invite', id: 'i2', name: 'Graziela Letteriello', status: 'pending' }

  it('conta > dependente > convite enviado > convite pendente', () => {
    expect(keeperOf(conta, dep)).toBe(conta)
    expect(keeperOf(dep, enviado)).toBe(dep)
    expect(keeperOf(pendente, enviado)).toBe(enviado)
  })

  it('no empate fica o nome mais completo', () => {
    const curto: R = { kind: 'invite', id: 'x', name: 'Graziela', status: 'pending' }
    expect(keeperOf(curto, pendente)).toBe(pendente)
  })

  it('a chave do par é a mesma nos dois sentidos', () => {
    expect(pairKeys(conta, dep)).toEqual(pairKeys(dep, conta))
  })
})
