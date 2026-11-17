/**
 * Endereço estruturado, e o que ele serve para responder (D-130).
 *
 * O dono pediu "endereço completo no formato padrão dos EUA". Estruturei por
 * país em vez de fixar um formato: o app fala pt-BR e en, e um formato único
 * quebraria metade dos usuários.
 *
 * O CAMPO DE UNIDADE NÃO É DETALHE. Em condomínios onde vários prédios
 * dividem o mesmo número de rua, é a unidade (ex.: `Unit 4B`) que separa uma
 * casa da do vizinho. Sem esse campo, duas famílias diferentes escreveriam
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

type Labels = { line1: string; unit: string; city: string; region: string; postal: string }

export type Country = {
  code: string
  pt: string
  en: string
  labels: Labels
  labelsEn: Labels
  /** Exemplos INVENTADOS para os placeholders — nunca dado real (ADDRESS-002). */
  examples: Labels
  examplesEn: Labels
  /** Regiões conhecidas, para virar lista em vez de campo livre. */
  regions?: string[]
}

/** Os dois países com formato próprio — ficam no topo da lista. */
const FEATURED: Country[] = [
  {
    code: 'US',
    pt: 'Estados Unidos',
    en: 'United States',
    labels: { line1: 'Rua e número', unit: 'Unidade / apto', city: 'Cidade', region: 'Estado', postal: 'ZIP' },
    labelsEn: { line1: 'Street address', unit: 'Unit / apt', city: 'City', region: 'State', postal: 'ZIP' },
    examples: { line1: '123 Main St', unit: 'Apt 4B', city: 'Springfield', region: '', postal: '12345' },
    examplesEn: { line1: '123 Main St', unit: 'Apt 4B', city: 'Springfield', region: '', postal: '12345' },
    regions: ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'],
  },
  {
    code: 'BR',
    pt: 'Brasil',
    en: 'Brazil',
    labels: { line1: 'Rua e número', unit: 'Complemento', city: 'Cidade', region: 'Estado', postal: 'CEP' },
    labelsEn: { line1: 'Street and number', unit: 'Unit', city: 'City', region: 'State', postal: 'Postcode' },
    examples: { line1: 'Rua das Flores, 100', unit: 'Apto 12', city: 'Campinas', region: '', postal: '00000-000' },
    examplesEn: { line1: 'Rua das Flores, 100', unit: 'Apt 12', city: 'Campinas', region: '', postal: '00000-000' },
    regions: ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],
  },
]

/** ISO-3166 alpha-2 — todos os outros países (ADDRESS-002). */
const OTHER_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

const GENERIC_LABELS: Labels = { line1: 'Endereço', unit: 'Complemento', city: 'Cidade', region: 'Estado / província', postal: 'Código postal' }
const GENERIC_LABELS_EN: Labels = { line1: 'Street address', unit: 'Unit / apt', city: 'City', region: 'State / province', postal: 'Postal code' }
const GENERIC_EXAMPLES: Labels = { line1: 'Rua Exemplo, 10', unit: 'Apto 1', city: 'Cidade', region: '', postal: '' }
const GENERIC_EXAMPLES_EN: Labels = { line1: '10 Example Street', unit: 'Apt 1', city: 'City', region: '', postal: '' }

/** Nome do país no idioma pedido; sem Intl.DisplayNames, o próprio código. */
function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

const OTHERS: Country[] = OTHER_CODES.map(code => ({
  code,
  pt: countryName(code, 'pt-BR'),
  en: countryName(code, 'en'),
  labels: GENERIC_LABELS,
  labelsEn: GENERIC_LABELS_EN,
  examples: GENERIC_EXAMPLES,
  examplesEn: GENERIC_EXAMPLES_EN,
}))

/** Todos os países: EUA e Brasil primeiro, o resto vem ordenado na tela. */
export const COUNTRIES: Country[] = [...FEATURED, ...OTHERS]

/** Quantos países abrem a lista antes do separador. */
export const FEATURED_COUNT = FEATURED.length

/** O resto da lista, em ordem alfabética no idioma da tela. */
export function otherCountriesSorted(pt: boolean): Country[] {
  const locale = pt ? 'pt-BR' : 'en'
  return [...OTHERS].sort((a, b) => (pt ? a.pt : a.en).localeCompare(pt ? b.pt : b.en, locale))
}

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
 * apartamento 4B, e mandá-la só piora o resultado — alguns devolvem o centro
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
