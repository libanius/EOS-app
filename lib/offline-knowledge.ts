/** Portable document retrieval, without network, model, embeddings or personal data. D-242. */
export const KNOWLEDGE_KEY = 'eos.offline.knowledge.v1'
export const MAX_KNOWLEDGE_BYTES = 32 * 1024 * 1024
export type OfflineDocument = {
  id: string; kind: 'manual' | 'signal' | 'edu'; lang: 'pt' | 'en'
  title: string; text: string; source: string; version: string; href?: string
}
export type KnowledgePack = { schema: 1; version: string; syncedAt: string; documents: OfflineDocument[] }
export type KnowledgeHit = { document: OfflineDocument; excerpt: string; score: number }

export function validKnowledgePack(value: unknown): value is KnowledgePack {
  if (!value || typeof value !== 'object') return false
  const p = value as KnowledgePack
  return p.schema === 1 && /^[a-f0-9]{64}$/.test(p.version) && Number.isFinite(Date.parse(p.syncedAt)) &&
    Array.isArray(p.documents) && p.documents.every(d => d && typeof d.id === 'string' &&
      ['manual', 'signal', 'edu'].includes(d.kind) && ['pt', 'en'].includes(d.lang) &&
      ['title', 'text', 'source', 'version'].every(k => typeof d[k as keyof OfflineDocument] === 'string') &&
      (d.href === undefined || (typeof d.href === 'string' && d.href.startsWith('/') && !d.href.startsWith('//')))) &&
    new Set(p.documents.map(d => `${d.lang}:${d.id}`)).size === p.documents.length
}

const STOP = new Set('como fazer para uma um que com sem dos das por pelo pela quero saber tenho minha meu voce pode onde consigo sobre explicar explique isso isto the and how what does this that with from your have into can you tell about please'.split(' '))
const ALIASES: Record<string, string> = {
  agua: 'water', aguas: 'water', filtrar: 'filter', filtracao: 'filter', filtro: 'filter', filtering: 'filter', filtration: 'filter', filters: 'filter',
  purificar: 'purify', purificacao: 'purify', purification: 'purify', tratar: 'treat', tratamento: 'treat', treatment: 'treat',
  fogo: 'fire', fogueira: 'fire', acender: 'ignite', comida: 'food', alimentos: 'food', alimento: 'food',
  abrigo: 'shelter', abrigos: 'shelter', shelter: 'shelter', shelters: 'shelter', construir: 'build', montar: 'build',
  recursos: 'resources', encontrar: 'find', achar: 'find', psicologia: 'psychology', psicologico: 'psychological',
  medo: 'fear', ansiedade: 'anxiety', panico: 'panic', estresse: 'stress', emocional: 'emotional',
  sobrevivencia: 'survival', militar: 'military', energia: 'power', eletricidade: 'power',
  furacao: 'hurricane', enchente: 'flood', inundacao: 'flood', comunicacao: 'communication',
  primeiros: 'first', socorros: 'aid', ferimento: 'wound', sangramento: 'bleeding',
}
export function knowledgeTokens(text: string): string[] {
  return Array.from(new Set(text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP.has(t)).map(t => ALIASES[t] ?? t)))
}
function matches(text: string, terms: string[]) {
  const words = new Set(knowledgeTokens(text))
  return terms.reduce((n, t) => n + Number(words.has(t)), 0)
}
function passage(text: string, terms: string[]): string {
  // Keep paragraphs intact: arbitrary character cuts can lose a safety qualifier.
  const parts = text.split(/\n\s*\n/)
  let best = 0
  for (let i = 1; i < parts.length; i++) if (matches(parts[i], terms) > matches(parts[best], terms)) best = i
  return parts.slice(Math.max(0, best - 1), best + 2).join('\n\n')
}
export function searchKnowledge(pack: KnowledgePack, question: string, lang: 'pt' | 'en', limit = 3): KnowledgeHit[] {
  const terms = knowledgeTokens(question.slice(0, 2000))
  if (!terms.length) return []
  return pack.documents.filter(d => d.kind === 'manual' || d.lang === lang).map(document => {
    const excerpt = passage(document.text, terms)
    const coverage = matches(excerpt, terms)
    const title = matches(document.title, terms)
    return { document, excerpt, score: coverage + title * 5 }
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id)).slice(0, limit)
}
export function offlineKnowledgeReply(pack: KnowledgePack | null, question: string, pt: boolean) {
  const hits = pack ? searchKnowledge(pack, question, pt ? 'pt' : 'en') : []
  const header = pt
    ? 'Consulta offline · trechos da biblioteca salva. Não é uma análise gerada por IA nem uma atualização ao vivo.'
    : 'Offline lookup · excerpts from the saved library. This is not an AI-generated analysis or live update.'
  const empty = pack
    ? (pt ? 'Não encontrei um trecho correspondente. Abra a biblioteca para pesquisar por assunto ou ler as fontes.' : 'No matching passage found. Open the library to search by topic or read the sources.')
    : (pt ? 'A biblioteca ainda não foi salva neste aparelho. Conecte o EOS para baixar os manuais, Sinais e EDU aprovados.' : 'The library has not been saved on this device. Connect EOS to download manuals, published Signals and approved EDU.')
  const text = hits.length ? [header, ...hits.map(h => `${h.document.title} · ${h.document.version}\n${h.excerpt}\n${pt ? 'Fonte' : 'Source'}: ${h.document.source}${pt && h.document.lang === 'en' ? ' · original em inglês' : ''}`),
    `${pt ? 'Cópia salva em' : 'Copy saved on'}: ${pack!.syncedAt}`].join('\n\n') : empty
  return { text, hits }
}
