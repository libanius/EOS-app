/**
 * Sinais já vistos — por aparelho, no Marco 1 (spec §12.1).
 *
 * O selo da barra conta só Sinais publicados que esta pessoa ainda não abriu
 * (critério 19). Sem tabela no Marco 1, a memória fica no aparelho; o selo por
 * perfil chega com o pipeline. Falha de armazenamento (aba privada, cota) não
 * pode quebrar a navegação: tudo é envolto em try/catch.
 */

const KEY = 'eos-signals-seen'
export const SIGNALS_SEEN_EVENT = 'eos-signals-seen'

export function seenSlugs(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function markSeen(slug: string): void {
  try {
    const seen = seenSlugs()
    if (seen.has(slug)) return
    seen.add(slug)
    window.localStorage.setItem(KEY, JSON.stringify(Array.from(seen)))
    window.dispatchEvent(new Event(SIGNALS_SEEN_EVENT))
  } catch {
    /* O selo é aditivo; não ver o selo zerar não pode travar a tela. */
  }
}

export function unseenCount(publishedSlugs: string[]): number {
  const seen = seenSlugs()
  return publishedSlugs.filter(s => !seen.has(s)).length
}
