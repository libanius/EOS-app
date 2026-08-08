/**
 * A mesma pessoa, escrita de dois jeitos (D-135).
 *
 * Os casos vêm dos dados reais de produção, que é onde o problema apareceu:
 * uma conta "Isadora da Rosa Libanio" com um dependente "Isadora", e convites
 * "Daniela Oliveira Letteriello" / "Paola Letteriello Libanio" que continuaram
 * abertos depois que as duas já tinham entrado no círculo.
 *
 * A regra que estes testes protegem é a assimetria de risco: juntar duas
 * pessoas por engano tira uma boca da conta e faz a autonomia SUBIR — a família
 * lê que aguenta mais do que aguenta. Duplicar faz a autonomia CAIR. Só um dos
 * dois erros machuca, então `forte` tem que ser difícil.
 */

import { semelhanca, partes, normalizar, podeFecharConvite, podePerguntar } from '@/lib/same-person'

describe('normalizar tira o que é ruído', () => {
  it('acento, caixa e espaço não fazem duas pessoas', () => {
    expect(normalizar('  Avó   ANA  ')).toBe('avo ana')
    expect(normalizar('José da Silva')).toBe('jose da silva')
  })

  it('preposição não conta como parte do nome', () => {
    // "Isadora da Rosa" e "Isadora Rosa" são a mesma pessoa escrevendo com e
    // sem o "da".
    expect(partes('Isadora da Rosa Libanio')).toEqual(['isadora', 'rosa', 'libanio'])
  })
})

describe('os casos reais de produção', () => {
  it('"Isadora" e "Isadora da Rosa Libanio": dá para perguntar, não para concluir', () => {
    /*
     * Este é o caso que está inflando a casa dela hoje: a conta e o dependente
     * são a mesma pessoa, a casa conta 3 onde há 2, e a autonomia é dividida
     * por três. Mas "Isadora" sozinho é um primeiro nome — numa casa com mãe e
     * filha de mesmo nome, concluir sozinho apagaria uma delas.
     */
    expect(semelhanca('Isadora', 'Isadora da Rosa Libanio')).toBe('provavel')
    expect(podePerguntar('Isadora', 'Isadora da Rosa Libanio')).toBe(true)
    expect(podeFecharConvite('Isadora', 'Isadora da Rosa Libanio')).toBe(false)
  })

  it('"Daniela Oliveira Letteriello" e "Daniela Oliveira": fecha o convite', () => {
    // Duas partes que batem, dentro da mesma casa. Fechar um convite não muda
    // quantas pessoas a casa tem — só para de dizer que ela não está no EOS.
    expect(semelhanca('Daniela Oliveira Letteriello', 'Daniela Oliveira')).toBe('forte')
    expect(podeFecharConvite('Daniela Oliveira Letteriello', 'Daniela Oliveira')).toBe(true)
  })

  it('"Paola Letteriello Libanio" e "paola letteriello libanio": o mesmo nome', () => {
    expect(semelhanca('Paola Letteriello Libanio', 'paola letteriello libanio')).toBe('forte')
  })
})

describe('o que NÃO pode ser tratado como a mesma pessoa', () => {
  it('sobrenome igual e primeiro nome diferente são duas pessoas', () => {
    // Irmãos. É o caso mais comum de tudo numa família.
    expect(semelhanca('Paola Libanio', 'Pedro Libanio')).toBe('nenhuma')
    expect(podePerguntar('Paola Libanio', 'Pedro Libanio')).toBe(false)
  })

  it('o apelido cabe dentro do nome, e isso vale uma pergunta', () => {
    // "Ana" dentro de "Avó Ana" é como uma família escreve de verdade. Não
    // conclui nada — só abre a pergunta na tela.
    expect(semelhanca('Ana', 'Avó Ana')).toBe('provavel')
    expect(podeFecharConvite('Ana', 'Avó Ana')).toBe(false)
  })

  it('nomes sem nada em comum', () => {
    expect(semelhanca('Avó Ana', 'Fabinho')).toBe('nenhuma')
  })

  it('nome vazio nunca casa com nada', () => {
    expect(semelhanca('', 'Isadora')).toBe('nenhuma')
    expect(semelhanca('   ', '   ')).toBe('nenhuma')
  })

  it('só o primeiro nome igual não fecha convite', () => {
    // Pai e filho de mesmo nome moram na mesma casa o tempo todo.
    expect(podeFecharConvite('João', 'João Pedro Silva')).toBe(false)
    expect(podePerguntar('João', 'João Pedro Silva')).toBe(true)
  })
})

describe('a comparação é simétrica', () => {
  it('a ordem dos argumentos não muda o resultado', () => {
    const pares: Array<[string, string]> = [
      ['Isadora', 'Isadora da Rosa Libanio'],
      ['Daniela Oliveira Letteriello', 'Daniela Oliveira'],
      ['Paola Libanio', 'Pedro Libanio'],
      ['Avó Ana', 'Ana'],
      ['Libanio', 'Paola Libanio'],
    ]
    for (const [a, b] of pares) expect(semelhanca(a, b)).toBe(semelhanca(b, a))
  })
})
