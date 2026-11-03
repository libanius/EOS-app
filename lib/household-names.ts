/**
 * Nomes parecidos dentro da mesma casa (HOUSEHOLD-FIX-001, regra 5).
 *
 * O INCIDENTE QUE GEROU ISTO. Em 2026-11-03 uma beta tester cadastrou duas
 * pessoas — Alexia e Grazi — e em 16 minutos a casa dela tinha quatro convites:
 * "Graziela", "Graziela Letteriello", "Alexia Letteriello" e "Alexa
 * Letteriello". A trava do banco só barrava nome idêntico, e o formulário
 * esvaziava a lista depois de salvar, então ela achava que não tinha salvado e
 * digitava de novo, cada vez de um jeito.
 *
 * Esta regra decide quando PERGUNTAR "é a mesma pessoa?". Ela nunca decide
 * sozinha: mãe e filha podem ter o mesmo nome, e juntar duas pessoas por engano
 * tira uma boca da conta e faz a autonomia subir (o erro que machuca — ver
 * `lib/same-person.ts`).
 *
 * É PURA de propósito: roda no formulário (cliente), na rota do endereço
 * (servidor) e no detector de duplicatas da casa, com a mesma resposta nos três.
 */

import { normalizar, partes } from '@/lib/same-person'

export type PersonKind = 'account' | 'dependent' | 'invite'

export type NamedPerson = { kind: PersonKind; id: string; name: string }

/** Minúsculas, sem acento, espaços colapsados. */
export function normalizeName(s: string): string {
  return normalizar(s)
}

/** Distância de edição clássica (inserir, apagar, trocar = 1). */
function distancia(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      const troca = a[i - 1] === b[j - 1] ? 0 : 1
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + troca)
    }
    anterior = atual
  }
  return anterior[b.length]
}

/** Prefixo mínimo para um apelido contar ("Grazi" ~ "Graziela"; "Ana" não). */
const PREFIXO_MINIMO = 4
/** Erro de digitação tolerado no nome completo ("Alexa" ~ "Alexia"). */
const DISTANCIA_MAXIMA = 2
/** Abaixo disso, duas letras de diferença já são outro nome. */
const TAMANHO_MINIMO_DISTANCIA = 5

/**
 * Dois nomes são parecidos o bastante para perguntar? (regra 5 do spec)
 *
 *   a. iguais depois de normalizar
 *   b. todas as palavras do mais curto estão no mais longo, com a primeira igual
 *   c. a primeira palavra de um é prefixo (≥ 4 letras) da primeira do outro, e
 *      os sobrenomes não se contradizem
 *   d. distância de edição ≤ 2 entre os nomes completos, ambos com ≥ 5 letras
 */
export function similarNames(a: string, b: string): boolean {
  const pa = partes(a)
  const pb = partes(b)
  if (!pa.length || !pb.length) return false

  const ja = pa.join(' ')
  const jb = pb.join(' ')

  // a.
  if (ja === jb) return true

  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa]

  // b.
  if (curto[0] === longo[0] && curto.every(p => longo.includes(p))) return true

  // c.
  const [p1, p2] = pa[0].length <= pb[0].length ? [pa[0], pb[0]] : [pb[0], pa[0]]
  if (p1.length >= PREFIXO_MINIMO && p2.startsWith(p1)) {
    const restoCurto = (curto === pa ? pa : pb).slice(1)
    const restoLongo = (curto === pa ? pb : pa).slice(1)
    // "Não se contradizem": um dos lados não tem sobrenome, ou os do mais curto
    // aparecem no mais longo.
    if (!restoCurto.length || !restoLongo.length || restoCurto.every(p => restoLongo.includes(p))) return true
  }

  // d.
  if (ja.length >= TAMANHO_MINIMO_DISTANCIA && jb.length >= TAMANHO_MINIMO_DISTANCIA) {
    if (distancia(ja, jb) <= DISTANCIA_MAXIMA) return true
  }

  return false
}

/** Quem, numa lista, se parece com este nome. Ordem da lista preservada. */
export function findSimilar<T extends NamedPerson>(name: string, people: T[]): T[] {
  if (!normalizeName(name)) return []
  return people.filter(p => similarNames(name, p.name))
}

/**
 * Chave estável de um par, para lembrar "são duas pessoas" (§4.3).
 * Sempre ordenada: o mesmo par gera a mesma chave dos dois lados.
 */
export function pairKeys(a: Pick<NamedPerson, 'kind' | 'id'>, b: Pick<NamedPerson, 'kind' | 'id'>): [string, string] {
  const ka = `${a.kind}:${a.id}`
  const kb = `${b.kind}:${b.id}`
  return ka < kb ? [ka, kb] : [kb, ka]
}

/**
 * Qual registro fica quando o usuário diz "é a mesma pessoa" (§3.6).
 *
 * Ordem: conta > dependente > convite enviado > convite pendente; no empate,
 * o nome mais longo (o mais completo).
 */
export function keeperOf<T extends NamedPerson & { status?: string | null }>(a: T, b: T): T {
  const peso = (p: T) =>
    p.kind === 'account' ? 3 : p.kind === 'dependent' ? 2 : p.status === 'sent' ? 1 : 0
  if (peso(a) !== peso(b)) return peso(a) > peso(b) ? a : b
  return normalizeName(b.name).length > normalizeName(a.name).length ? b : a
}
