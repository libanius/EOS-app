/**
 * Endereço estruturado, e o que ele serve para responder (D-130).
 *
 * O dono pediu "endereço completo no formato padrão dos EUA". Estruturei por
 * país em vez de fixar um formato: o app fala pt-BR e en, e um formato único
 * quebraria metade dos usuários.
 *
 * O CAMPO DE UNIDADE NÃO É DETALHE. O próprio dono mora num condomínio onde
 * vários prédios dividem o mesmo número de rua — é `Unit 4124` que separa a
 * casa dele da do vizinho. Sem esse campo, duas famílias diferentes escreveriam
 * exatamente o mesmo endereço.
 *
 * E é por isso que **endereço nunca vira vínculo automático** neste app. Se
 * casas fossem juntadas por endereço igual, os vizinhos entrariam na casa dele
 * e as despensas deles somariam na autonomia da família. O endereço dispara a
 * pergunta "quem mais mora aqui"; a resposta continua sendo confirmada pessoa a
 * pessoa (D-123).
 */

export type Address = {
  country: string   // ISO-3166 alpha-2
  line1: string
  unit: string
  city: string
  region: string
  postal: string
}

export const EMPTY_ADDRESS: Address = {
  country: '', line1: '', unit: '', city: '', region: '', postal: '',
}

/** Os países que o EOS atende hoje, com os rótulos que cada um usa. */
export const COUNTRIES: Array<{
  code: string
  pt: string
  en: string
  labels: { line1: string; unit: string; city: string; region: string; postal: string }
  labelsEn: { line1: string; unit: string; city: string; region: string; postal: string }
  /** Regiões conhecidas, para virar lista em vez de campo livre. */
  regions?: string[]
}> = [
  {
    code: 'US',
    pt: 'Estados Unidos',
    en: 'United States',
    labels: { line1: 'Rua e número', unit: 'Unidade / apto', city: 'Cidade', region: 'Estado', postal: 'ZIP' },
    labelsEn: { line1: 'Street address', unit: 'Unit / apt', city: 'City', region: 'State', postal: 'ZIP' },
    regions: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'],
  },
  {
    code: 'BR',
    pt: 'Brasil',
    en: 'Brazil',
    labels: { line1: 'Rua e número', unit: 'Complemento', city: 'Cidade', region: 'Estado', postal: 'CEP' },
    labelsEn: { line1: 'Street and number', unit: 'Unit', city: 'City', region: 'State', postal: 'Postcode' },
    regions: ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],
  },
]

export function countryOf(code: string) {
  return COUNTRIES.find(c => c.code === code) ?? null
}

/**
 * A forma legível, na ordem que cada país escreve.
 *
 * Nos EUA a unidade vem colada à rua e o CEP depois do estado; no Brasil o
 * complemento vem depois e o CEP no fim. Montar tudo com uma regra só produziria
 * um endereço que ninguém daquele país escreveria — e endereço mal formado é
 * endereço que o entregador, o vizinho ou o socorrista lê errado.
 */
export function formatAddress(a: Address): string {
  const limpo = (s: string) => s.trim()
  const rua = limpo(a.line1)
  const unidade = limpo(a.unit)
  const cidade = limpo(a.city)
  const regiao = limpo(a.region)
  const cep = limpo(a.postal)

  if (!rua && !cidade) return ''

  if (a.country === 'BR') {
    const primeiro = [rua, unidade].filter(Boolean).join(' — ')
    const segundo = [cidade, regiao].filter(Boolean).join(' - ')
    return [primeiro, segundo, cep].filter(Boolean).join(', ')
  }

  // Padrão americano, que também serve de fallback razoável.
  const primeiro = [rua, unidade && `Unit ${unidade}`].filter(Boolean).join(', ')
  const ultimo = [regiao, cep].filter(Boolean).join(' ')
  return [primeiro, cidade, ultimo].filter(Boolean).join(', ')
}

/**
 * Está completo o bastante para virar um ponto no mapa?
 *
 * Não exige tudo: um endereço sem complemento continua geocodificável, e exigir
 * campo que a pessoa não tem só faz ela abandonar o formulário. O que não dá
 * para dispensar é rua e cidade — sem os dois não há ponto.
 */
export function isGeocodable(a: Address): boolean {
  return Boolean(a.line1.trim() && a.city.trim() && a.country)
}

/**
 * A consulta que vai para o geocodificador.
 *
 * A UNIDADE FICA DE FORA de propósito: nenhum geocodificador sabe onde fica o
 * apartamento 4124, e mandá-la só piora o resultado — alguns devolvem o centro
 * da cidade quando não casam a string inteira. A unidade importa para a pessoa
 * que vai bater na porta, não para o mapa.
 */
export function geocodeQuery(a: Address): string {
  return [a.line1, a.city, a.region, a.postal, a.country].map(s => s.trim()).filter(Boolean).join(', ')
}

/** Separa a lista de nomes que a pessoa digitou, sem criar entradas vazias. */
export function parseNames(raw: string): string[] {
  return raw
    .split(/[,\n;]+/)
    .map(s => s.trim())
    .filter(Boolean)
    // Duas grafias do mesmo nome na mesma lista é engano de digitação, não
    // duas pessoas.
    .filter((nome, i, todos) => todos.findIndex(o => o.toLowerCase() === nome.toLowerCase()) === i)
}
