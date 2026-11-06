/**
 * A pauta: o pacote que o pipeline do dono entrega ao EOS.
 *
 * Spec: `specs/CONTENT-001-pipeline-de-conteudo.md` (§4.1, §4.5, §5).
 *
 * Tudo aqui é PURO: sem banco, sem rede, sem React. As rotas validam com
 * `packageProblems()` antes de gravar qualquer coisa (tudo ou nada, §5.2), e as
 * telas recebem o tipo `Signal` que já usam (`rowToSignal`).
 */

import { createHash } from 'crypto'
import { MIN_EDU_RAG_INSTRUCTION_CHARS } from './edu-rag'
import {
  DEGREES,
  MODULE_ORDER,
  signalProblems,
  type Bilingual,
  type Protocol,
  type Signal,
  type SignalLevel,
  type SignalSource,
} from './signals'

export const CONTENT_SCHEMA = 'eos.content/1'
/** §7 E13: acima disso a rota responde 413. */
export const MAX_PACKAGE_BYTES = 256 * 1024

/** O que o pipeline pode pedir. Publicar é no EOS (D-P2). */
export type PackageStatus = 'draft' | 'review' | 'archived'
export const PACKAGE_STATUSES: PackageStatus[] = ['draft', 'review', 'archived']

/** O bloco `signal`: o tipo Signal sem os quatro campos que o EOS preenche. */
export type PackageSignal = Omit<Signal, 'slug' | 'status' | 'publishedOn' | 'reviewedByCurator'>

export type PackageLesson = {
  title: Bilingual
  summary: Bilingual
  body: Bilingual
  scenarioTags: string[]
}

export type VideoRef = { youtubeId: string; durationSec?: number }
export type PackageVideo = { pt?: VideoRef; en?: VideoRef }

export type ContentPackage = {
  schema: typeof CONTENT_SCHEMA
  slug: string
  version: number
  status: PackageStatus
  signal: PackageSignal
  lesson: PackageLesson
  video?: PackageVideo
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** §5.7: só o ID. URL inteira é rejeitada para não aceitar outro domínio. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const LEVELS: SignalLevel[] = ['MONITORAR', 'PREPARAR', 'AGIR', 'CONTEXTO']
const ITEM_KINDS = ['ENGINE_WATER', 'ENGINE_FOOD', 'PRESENCE'] as const
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isYoutubeId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_ID.test(value)
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isBilingual = (v: unknown): v is Bilingual => isObj(v) && typeof v.pt === 'string' && typeof v.en === 'string'
const filled = (v: unknown) => isBilingual(v) && Boolean(v.pt.trim() && v.en.trim())
const instructionChars = (text: string) => text.replace(/\s+/g, ' ').trim().length

/**
 * Tudo o que impede a pauta de ser recebida. Lista vazia = válida.
 *
 * Confere a forma antes de chamar `signalProblems()`, para que um pacote torto
 * vire uma lista de problemas e nunca uma exceção na rota.
 */
export function packageProblems(input: unknown): string[] {
  const p: string[] = []
  if (!isObj(input)) return ['pauta não é um objeto']

  if (input.schema !== CONTENT_SCHEMA) p.push(`schema deve ser "${CONTENT_SCHEMA}"`)
  if (typeof input.slug !== 'string' || !SLUG.test(input.slug)) p.push('slug inválido')
  if (!Number.isInteger(input.version) || (input.version as number) < 1) p.push('version deve ser inteiro ≥ 1')
  if (input.status === 'published') p.push('publicar é no EOS: envie "review" e aprove em /admin/content')
  else if (!PACKAGE_STATUSES.includes(input.status as PackageStatus)) p.push('status deve ser draft, review ou archived')

  // signal
  const s = input.signal
  if (!isObj(s)) {
    p.push('signal ausente')
  } else {
    if (!LEVELS.includes(s.level as SignalLevel)) p.push('signal.level inválido')
    if (typeof s.occurredOn !== 'string' || !ISO_DATE.test(s.occurredOn)) p.push('signal.occurredOn deve ser AAAA-MM-DD')
    if (s.region !== 'national') p.push('signal.region deve ser "national"')
    if (typeof s.officialAlert !== 'boolean') p.push('signal.officialAlert deve ser booleano')
    for (const k of ['title', 'summary', 'whatItIs', 'whatItIsNot', 'curatorNote', 'sourceLine'] as const) {
      if (!isBilingual(s[k])) p.push(`signal.${k} deve ter pt e en`)
      else if (!filled(s[k])) p.push(`signal.${k} vazio em um idioma`)
    }
    if (!Array.isArray(s.sources)) p.push('signal.sources deve ser lista')
    else if (s.sources.some(x => !isObj(x) || typeof x.title !== 'string' || typeof x.url !== 'string')) p.push('signal.sources com item inválido')

    const proto = s.protocol
    let protoOk = false
    if (!isObj(proto)) p.push('signal.protocol ausente')
    else if (!Array.isArray(proto.degrees) || proto.degrees.some(d => !DEGREES.includes(d))) p.push('protocol.degrees inválido')
    else if (!Array.isArray(proto.items)) p.push('protocol.items deve ser lista')
    else {
      protoOk = true
      proto.items.forEach((it, i) => {
        if (!isObj(it)) { p.push(`item ${i} inválido`); protoOk = false; return }
        const key = typeof it.resourceKey === 'string' && it.resourceKey ? it.resourceKey : `#${i}`
        if (typeof it.resourceKey !== 'string' || !it.resourceKey.trim()) p.push(`item ${i} sem resourceKey`)
        if (!MODULE_ORDER.includes(it.module as never)) p.push(`item ${key}: módulo inválido`)
        if (!ITEM_KINDS.includes(it.kind as never)) p.push(`item ${key}: kind inválido`)
        if (!DEGREES.includes(it.minDegree as never)) p.push(`item ${key}: minDegree inválido`)
        if (!isBilingual(it.label)) { p.push(`item ${key}: rótulo deve ter pt e en`); protoOk = false }
        if (it.hint !== undefined && !filled(it.hint)) p.push(`item ${key}: dica vazia em um idioma`)
      })
    }

    // As regras de conteúdo do Sinal (§5 do SIGNAL-001), só quando a forma permite.
    const sourcesOk = Array.isArray(s.sources) && s.sources.every(x => isObj(x) && typeof x.title === 'string' && typeof x.url === 'string')
    const shapeOk = protoOk && sourcesOk && ['title', 'whatItIs', 'whatItIsNot', 'curatorNote'].every(k => isBilingual(s[k]))
    if (shapeOk && typeof input.slug === 'string') {
      for (const problem of signalProblems(toSignal(input as unknown as ContentPackage, { status: 'published', publishedOn: '', reviewedByCurator: false }))) {
        if (!p.includes(problem)) p.push(problem)
      }
    }
  }

  // lesson
  const l = input.lesson
  if (!isObj(l)) {
    p.push('lesson ausente')
  } else {
    for (const k of ['title', 'summary', 'body'] as const) {
      if (!isBilingual(l[k])) p.push(`lesson.${k} deve ter pt e en`)
      else if (!filled(l[k])) p.push(`lesson.${k} vazio em um idioma`)
    }
    if (isBilingual(l.title) && (l.title.pt.length > 160 || l.title.en.length > 160)) p.push('lesson.title acima de 160 caracteres')
    if (isBilingual(l.body)) {
      for (const lang of ['pt', 'en'] as const) {
        if (instructionChars(l.body[lang]) < MIN_EDU_RAG_INSTRUCTION_CHARS) {
          p.push(`lesson.body.${lang} com menos de ${MIN_EDU_RAG_INSTRUCTION_CHARS} caracteres: não ensina o bastante para o RAG`)
        }
      }
    }
    if (!Array.isArray(l.scenarioTags) || l.scenarioTags.some(t => typeof t !== 'string')) p.push('lesson.scenarioTags deve ser lista de texto')
  }

  // video
  if (input.video !== undefined) {
    const v = input.video
    if (!isObj(v)) p.push('video inválido')
    else {
      for (const k of Object.keys(v)) if (k !== 'pt' && k !== 'en') p.push(`video.${k}: idioma desconhecido`)
      for (const lang of ['pt', 'en'] as const) {
        const ref = v[lang]
        if (ref === undefined) continue
        if (!isObj(ref) || !isYoutubeId(ref.youtubeId)) p.push(`video.${lang}.youtubeId inválido: envie só o ID de 11 caracteres`)
        else if (ref.durationSec !== undefined && !(Number.isInteger(ref.durationSec) && (ref.durationSec as number) > 0)) p.push(`video.${lang}.durationSec inválido`)
      }
    }
  }

  return p
}

/* ── Hash estável (§4.1, E1/E2) ────────────────────────────────────────── */

function normalize(value: unknown): unknown {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(normalize)
  if (isObj(value)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value).sort()) {
      if (value[k] !== undefined) out[k] = normalize(value[k])
    }
    return out
  }
  return value
}

/** sha256 do corpo normalizado: chaves ordenadas, texto sem espaço nas pontas. */
export function packageHash(pkg: unknown): string {
  return createHash('sha256').update(JSON.stringify(normalize(pkg))).digest('hex')
}

/* ── Da pauta para as saídas ───────────────────────────────────────────── */

type SignalMeta = Pick<Signal, 'status' | 'publishedOn' | 'reviewedByCurator'>

function toSignal(pkg: ContentPackage, meta: SignalMeta): Signal {
  const s = pkg.signal
  return {
    slug: pkg.slug,
    status: meta.status,
    level: s.level,
    occurredOn: s.occurredOn,
    publishedOn: meta.publishedOn,
    region: 'national',
    officialAlert: s.officialAlert,
    reviewedByCurator: meta.reviewedByCurator,
    title: s.title,
    summary: s.summary,
    whatItIs: s.whatItIs,
    whatItIsNot: s.whatItIsNot,
    curatorNote: s.curatorNote,
    sourceLine: s.sourceLine,
    sources: s.sources,
    protocol: s.protocol,
  }
}

/** Prévia do admin: o Sinal como a família o veria se fosse publicado agora. */
export function previewSignal(pkg: ContentPackage, today: string): Signal {
  return toSignal(pkg, { status: 'published', publishedOn: today, reviewedByCurator: true })
}

/** A linha de `signals` (§4.2) que a publicação grava. */
export type SignalRow = {
  slug: string
  status: 'published' | 'archived'
  version: number
  level: SignalLevel
  occurred_on: string
  published_on: string
  region: { scope: 'national' }
  official_alert: boolean
  reviewed_by_curator: boolean
  content: Pick<Signal, 'title' | 'summary' | 'whatItIs' | 'whatItIsNot' | 'curatorNote' | 'sourceLine'>
  sources: SignalSource[]
  protocol: Protocol
  video: PackageVideo | null
}

/** A linha que a tela lê, de volta no tipo que as telas já usam. */
export function rowToSignal(row: SignalRow): Signal {
  return {
    slug: row.slug,
    status: row.status,
    level: row.level,
    occurredOn: row.occurred_on,
    publishedOn: row.published_on,
    region: 'national',
    officialAlert: row.official_alert,
    reviewedByCurator: row.reviewed_by_curator,
    ...row.content,
    sources: row.sources,
    protocol: row.protocol,
  }
}

/** A linha de `edu_content` que a publicação grava (§3.4, §4.2b). */
export type EduRowFromPackage = {
  title: string
  summary: string
  transcript: string
  scenario_tags: string[]
  source_type: 'youtube' | 'manual'
  source_url: string
  video: PackageVideo | null
  lesson: Pick<PackageLesson, 'title' | 'summary' | 'body'>
  content_slug: string
}

export function lessonToEdu(pkg: ContentPackage): EduRowFromPackage {
  const l = pkg.lesson
  const hasVideo = Boolean(pkg.video?.pt || pkg.video?.en)
  return {
    // As colunas antigas são de um idioma só: recebem o PT (§4.2b, v1.1).
    title: l.title.pt.trim().slice(0, 160),
    summary: l.summary.pt.trim(),
    // O RAG é consultado em inglês (docs/32 §2.2): os dois idiomas entram.
    transcript: `## Português\n\n${l.body.pt.trim()}\n\n## English\n\n${l.body.en.trim()}`,
    scenario_tags: Array.from(new Set(l.scenarioTags.map(t => t.trim().toLowerCase()).filter(Boolean))),
    source_type: hasVideo ? 'youtube' : 'manual',
    // Aponta para o Sinal, não para um vídeo: o vídeo vive em `video`, por idioma.
    source_url: `/sinais/${pkg.slug}`,
    video: hasVideo ? pkg.video ?? null : null,
    lesson: { title: l.title, summary: l.summary, body: l.body },
    content_slug: pkg.slug,
  }
}

/* ── Vídeo por idioma (D-P5) ───────────────────────────────────────────── */

/** O vídeo do Sinal no idioma da pessoa, ou nulo. Nunca cai para o outro idioma. */
export function signalVideoFor(video: PackageVideo | null | undefined, lang: 'pt' | 'en'): string | null {
  const id = video?.[lang]?.youtubeId
  return isYoutubeId(id) ? id : null
}

/**
 * O vídeo de um item do EDU (§4.2b).
 *
 * Item da pauta (`video` preenchido): o do idioma, sem cair para o outro.
 * Item antigo (`video` nulo): o `source_url` de sempre, se for do YouTube.
 */
export function eduVideoFor(
  item: { video?: PackageVideo | null; source_type: string; source_url: string | null },
  lang: 'pt' | 'en',
): { kind: 'id'; youtubeId: string } | { kind: 'legacy'; url: string } | null {
  if (item.video) {
    const id = signalVideoFor(item.video, lang)
    return id ? { kind: 'id', youtubeId: id } : null
  }
  if (item.source_type === 'youtube' && item.source_url) return { kind: 'legacy', url: item.source_url }
  return null
}
