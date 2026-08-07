/**
 * Endereço estruturado (D-130).
 *
 * O caso que guia tudo é o do próprio dono: `5851 Holmberg Rd, Unit 4124,
 * Parkland, FL 33067`. Ele mora num condomínio onde vários prédios dividem o
 * mesmo número de rua — sem o campo de unidade, ele e o vizinho escreveriam
 * exatamente o mesmo endereço.
 */

import { formatAddress, isGeocodable, geocodeQuery, parseNames, countryOf, EMPTY_ADDRESS } from '@/lib/address'

const eua = { ...EMPTY_ADDRESS, country: 'US', line1: '5851 Holmberg Rd', unit: '4124', city: 'Parkland', region: 'FL', postal: '33067' }
const brasil = { ...EMPTY_ADDRESS, country: 'BR', line1: 'Rua das Laranjeiras, 120', unit: 'apto 501', city: 'Rio de Janeiro', region: 'RJ', postal: '22240-003' }

describe('cada país escreve do jeito dele', () => {
  it('o endereço do dono sai no formato americano', () => {
    expect(formatAddress(eua)).toBe('5851 Holmberg Rd, Unit 4124, Parkland, FL 33067')
  })

  it('o brasileiro sai com complemento e CEP no fim', () => {
    expect(formatAddress(brasil)).toBe('Rua das Laranjeiras, 120 — apto 501, Rio de Janeiro - RJ, 22240-003')
  })

  it('campo vazio não deixa vírgula solta', () => {
    const semUnidade = { ...eua, unit: '' }
    expect(formatAddress(semUnidade)).toBe('5851 Holmberg Rd, Parkland, FL 33067')
    expect(formatAddress(semUnidade)).not.toMatch(/,\s*,/)
  })

  it('endereço vazio devolve vazio, não pontuação', () => {
    expect(formatAddress(EMPTY_ADDRESS)).toBe('')
  })
})

describe('a unidade NÃO vai para o geocodificador', () => {
  it('a consulta ignora o apartamento', () => {
    /*
     * Nenhum geocodificador sabe onde fica o apartamento 4124, e mandá-lo piora
     * o resultado: alguns devolvem o centro da cidade quando não casam a string
     * inteira. A unidade importa para quem vai bater na porta, não para o mapa.
     */
    const q = geocodeQuery(eua)
    expect(q).not.toContain('4124')
    expect(q).toContain('5851 Holmberg Rd')
    expect(q).toContain('Parkland')
  })
})

describe('o que basta para virar um ponto', () => {
  it('rua e cidade bastam; complemento não é exigido', () => {
    expect(isGeocodable({ ...eua, unit: '', postal: '' })).toBe(true)
  })

  it('sem rua ou sem cidade não há ponto', () => {
    expect(isGeocodable({ ...eua, line1: '' })).toBe(false)
    expect(isGeocodable({ ...eua, city: '' })).toBe(false)
    expect(isGeocodable({ ...eua, country: '' })).toBe(false)
  })
})

describe('a lista de quem mora na casa', () => {
  it('separa por vírgula e por linha', () => {
    expect(parseNames('Daniela Oliveira Letteriello, Paola Letteriello Libanio'))
      .toEqual(['Daniela Oliveira Letteriello', 'Paola Letteriello Libanio'])
    expect(parseNames('Daniela\nPaola\n')).toEqual(['Daniela', 'Paola'])
  })

  it('não cria entradas vazias com pontuação solta', () => {
    expect(parseNames(' , ,  ')).toEqual([])
    expect(parseNames('Ana,,Bruno')).toEqual(['Ana', 'Bruno'])
  })

  it('o mesmo nome duas vezes é erro de digitação, não duas pessoas', () => {
    expect(parseNames('Daniela, daniela')).toEqual(['Daniela'])
  })
})

describe('os países atendidos', () => {
  it('EUA e Brasil têm rótulos e estados próprios', () => {
    const us = countryOf('US')
    const br = countryOf('BR')
    expect(us?.labels.postal).toBe('ZIP')
    expect(br?.labels.postal).toBe('CEP')
    expect(us?.regions).toContain('FL')
    expect(br?.regions).toContain('RJ')
  })

  it('país desconhecido não quebra', () => {
    expect(countryOf('XX')).toBeNull()
    expect(() => formatAddress({ ...eua, country: 'XX' })).not.toThrow()
  })
})
