/**
 * Sinais e Protocolos — o modelo e as contas (SIGNAL-001, Marco 1 / D-233).
 *
 * Spec: `specs/SIGNAL-001-sinais-e-protocolos.md`.
 *
 * Tudo aqui é PURO: sem banco, sem rede, sem React. As telas entregam a casa
 * (de `/api/household`) e os requisitos (de `/api/checklist`); este arquivo
 * devolve o que o protocolo pede e o quanto a casa já cobre.
 *
 * ── Uma conta só ──────────────────────────────────────────────────────────
 *
 * Água e comida NÃO têm régua própria aqui. A água usa
 * `WATER_LITERS_PER_PERSON_DAY` e os dias vêm de `householdDays()` — a mesma
 * função do painel e do Pilot (D-174). Um protocolo que mostrasse "6 dias"
 * enquanto o painel mostra "5" seria a quinta verdade de prontidão que o
 * D-174 apagou.
 */

import { householdDays, type HouseholdDays } from '@/lib/household-days'
import { WATER_LITERS_PER_PERSON_DAY } from '@/lib/units'

export type Degree = 'D3' | 'D14' | 'D30' | 'D90'
export const DEGREES: Degree[] = ['D3', 'D14', 'D30', 'D90']
export const DEGREE_DAYS: Record<Degree, number> = { D3: 3, D14: 14, D30: 30, D90: 90 }

export type SignalLevel = 'MONITORAR' | 'PREPARAR' | 'AGIR' | 'CONTEXTO'

export type SignalModule =
  | 'agua' | 'comida' | 'saude' | 'energia' | 'comunicacao' | 'documentos' | 'casa'

export const MODULE_ORDER: SignalModule[] = [
  'agua', 'comida', 'saude', 'energia', 'comunicacao', 'documentos', 'casa',
]

/** Texto nos dois idiomas da tela (D-225: uma tela, um idioma). */
export type Bilingual = { pt: string; en: string }

/** Alternativas editoriais de um mesmo recurso; não mudam sua cobertura. */
export type ProtocolOption = {
  id: string
  label: Bilingual
  description: Bilingual
  advantage: Bilingual
  limitation: Bilingual
  brand?: string
  model?: string
  notes?: Bilingual
  imageUrl?: string
  sourceUrl?: string
  purchaseUrl?: string
}

export function optionUrlAllowed(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch { return false }
}

export function protocolOptionsProblems(options: unknown): string[] {
  if (options === undefined) return []
  if (!Array.isArray(options) || options.length > 12) return ['opções devem ser uma lista de até 12 alternativas']
  const problems: string[] = []
  const ids = new Set<string>()
  options.forEach((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) { problems.push(`opção ${index} inválida`); return }
    if (typeof option.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(option.id)) problems.push(`opção ${index} sem id válido`)
    else if (ids.has(option.id)) problems.push(`opção repetida: ${option.id}`)
    else ids.add(option.id)
    for (const field of ['label', 'description', 'advantage', 'limitation', ...(option.notes === undefined ? [] : ['notes'])]) {
      const value = option[field]
      if (!value || typeof value.pt !== 'string' || !value.pt.trim() || typeof value.en !== 'string' || !value.en.trim()) problems.push(`opção ${index}: ${field} deve ter pt e en`)
    }
    for (const field of ['brand', 'model']) if (option[field] !== undefined && typeof option[field] !== 'string') problems.push(`opção ${index}: ${field} inválido`)
    for (const field of ['imageUrl', 'sourceUrl', 'purchaseUrl']) if (option[field] !== undefined && !optionUrlAllowed(option[field])) problems.push(`opção ${index}: ${field} deve ser HTTPS`)
  })
  return problems
}

/**
 * Um item do protocolo.
 *
 * `ENGINE_WATER` e `ENGINE_FOOD` não carregam régua: leem as constantes e as
 * unidades do motor. `PRESENCE` é durável — ter um basta (docs/37 §15.1).
 */
export type ProtocolItem = {
  resourceKey: string
  module: SignalModule
  kind: 'ENGINE_WATER' | 'ENGINE_FOOD' | 'PRESENCE'
  minDegree: Degree
  label: Bilingual
  hint?: Bilingual
  options?: ProtocolOption[]
}

export type Protocol = {
  degrees: Degree[]
  recommendedDegree: Degree
  items: ProtocolItem[]
}

export type SignalSource = { title: string; url: string }

export type SignalVideoRef = { youtubeId: string; durationSec?: number }
export type SignalVideo = { pt?: SignalVideoRef; en?: SignalVideoRef }

export type Signal = {
  slug: string
  status: 'published' | 'archived'
  level: SignalLevel
  /** Data do acontecimento (ISO, `AAAA-MM-DD`), não da publicação. */
  occurredOn: string
  publishedOn: string
  /** Nacional no Marco 1. Estado e condado entram com as tabelas. */
  region: 'national'
  /** `AGIR` só existe com alerta oficial correspondente (§5, regra 5). */
  officialAlert: boolean
  /** Falso quando foi ao ar sem a revisão do curador (D-233). */
  reviewedByCurator: boolean
  title: Bilingual
  summary: Bilingual
  whatItIs: Bilingual
  whatItIsNot: Bilingual
  curatorNote: Bilingual
  sourceLine: Bilingual
  sources: SignalSource[]
  protocol: Protocol
  /** Um vídeo por idioma (CONTENT-001 D-P5). Ausente no conteúdo do Marco 1. */
  video?: SignalVideo
}

/* ── Validação: as regras 3, 4 e 5 da §5 viram teste ───────────────────── */

/**
 * O que impede um Sinal de ir ao ar. Lista vazia = pode publicar.
 *
 * Roda no teste unitário sobre todo o conteúdo versionado: um Sinal sem "o que
 * não é" ou sem fonte quebra o build antes de chegar a alguém.
 */
export function signalProblems(s: Signal): string[] {
  const p: string[] = []
  const filled = (b: Bilingual | undefined) => Boolean(b && b.pt.trim() && b.en.trim())

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug)) p.push('slug inválido')
  if (!filled(s.title)) p.push('título vazio')
  if (!filled(s.whatItIs)) p.push('"o que é" vazio')
  if (!filled(s.whatItIsNot)) p.push('"o que não é" vazio')
  if (!filled(s.curatorNote)) p.push('orientação da curadoria vazia')
  if (!s.sources.length) p.push('sem fonte')
  for (const src of s.sources) {
    if (!src.title.trim() || !/^https:\/\//.test(src.url)) p.push(`fonte inválida: ${src.title || src.url}`)
  }
  if (s.level === 'AGIR' && !s.officialAlert) p.push('AGIR sem alerta oficial')
  if (!s.protocol.degrees.length) p.push('protocolo sem degraus')
  if (!s.protocol.degrees.includes(s.protocol.recommendedDegree)) p.push('degrau recomendado fora dos degraus')
  const keys = new Set<string>()
  for (const item of s.protocol.items) {
    if (keys.has(item.resourceKey)) p.push(`item repetido: ${item.resourceKey}`)
    keys.add(item.resourceKey)
    if (!filled(item.label)) p.push(`item sem rótulo: ${item.resourceKey}`)
    for (const problem of protocolOptionsProblems(item.options)) p.push(`item ${item.resourceKey}: ${problem}`)
  }
  return p
}

/* ── A casa, como as telas a recebem ───────────────────────────────────── */

export type HouseInput = {
  /** Contas + dependentes. 0 com `known` = casa sem gente contada. */
  size: number
  known: boolean
  waterLiters: number
  foodPersonDays: number
  hasMedicalKit: boolean
  hasCommunicationDevice: boolean
}

/**
 * Chaves que o inventário legado já sabe responder com um booleano.
 * São as mesmas de `RESOURCE_KEYS` (`lib/holdings.ts`).
 */
const LEGACY_PRESENCE: Record<string, (h: HouseInput) => boolean> = {
  'kit-medico': h => h.hasMedicalKit,
  'radio-comunicacao': h => h.hasCommunicationDevice,
}

/* ── Cobertura do protocolo ────────────────────────────────────────────── */

export type ItemStatus = 'covered' | 'partial' | 'missing' | 'unknown' | 'not_applicable'

export type ItemView = {
  item: ProtocolItem
  status: ItemStatus
  /** Só para água (L) e comida (dia-pessoa). */
  have: number | null
  need: number | null
  unit: 'L' | 'dia-pessoa' | null
  /** De onde veio a cobertura de um durável. */
  coveredBy: 'inventory' | 'requirement' | null
}

export type ProtocolView = {
  degree: Degree
  days: number
  items: ItemView[]
  /** 0 a 1. `null` quando não há nada que conte (casa desconhecida, tudo descartado). */
  ready: number | null
  householdDays: HouseholdDays
  /** O recurso que limita a autonomia, quando se sabe. */
  limiting: 'agua' | 'comida' | null
}

export function itemsForDegree(protocol: Protocol, degree: Degree): ProtocolItem[] {
  const limite = DEGREE_DAYS[degree]
  return protocol.items.filter(i => DEGREE_DAYS[i.minDegree] <= limite)
}

/**
 * O protocolo lido contra a casa, sem gravar nada (§3.3, §12.1).
 *
 * - Casa desconhecida ou sem gente: água e comida ficam `unknown`, nunca
 *   calculadas com uma pessoa (E1). `unknown` não conta como pronto.
 * - Durável: coberto pelo inventário legado ou por requisito `met` com a mesma
 *   chave; `not_applicable` quando a família descartou a chave (E7).
 */
export function protocolView(
  protocol: Protocol,
  degree: Degree,
  house: HouseInput,
  metKeys: ReadonlySet<string>,
  notApplicableKeys: ReadonlySet<string> = new Set(),
): ProtocolView {
  const days = DEGREE_DAYS[degree]
  const sizeKnown = house.known && house.size > 0
  const hd = householdDays(
    { waterLiters: house.waterLiters, foodPersonDays: house.foodPersonDays, fuelLiters: 0, batteryPercent: 0 },
    house.size,
    house.known,
  )

  const items: ItemView[] = itemsForDegree(protocol, degree).map(item => {
    if (notApplicableKeys.has(item.resourceKey)) {
      return { item, status: 'not_applicable', have: null, need: null, unit: null, coveredBy: null }
    }

    if (item.kind === 'ENGINE_WATER' || item.kind === 'ENGINE_FOOD') {
      const unit = item.kind === 'ENGINE_WATER' ? 'L' : 'dia-pessoa'
      if (!sizeKnown) return { item, status: 'unknown', have: null, need: null, unit, coveredBy: null }
      const have = item.kind === 'ENGINE_WATER' ? house.waterLiters : house.foodPersonDays
      const need = item.kind === 'ENGINE_WATER'
        ? WATER_LITERS_PER_PERSON_DAY * house.size * days
        : house.size * days
      const status: ItemStatus = have <= 0 ? 'missing' : have >= need ? 'covered' : 'partial'
      return { item, status, have, need, unit, coveredBy: null }
    }

    const viaInventory = LEGACY_PRESENCE[item.resourceKey]?.(house) ?? false
    const viaRequirement = metKeys.has(item.resourceKey)
    const coveredBy = viaInventory ? 'inventory' : viaRequirement ? 'requirement' : null
    return { item, status: coveredBy ? 'covered' : 'missing', have: null, need: null, unit: null, coveredBy }
  })

  const counted = items.filter(v => v.status !== 'not_applicable')
  let ready: number | null = null
  if (sizeKnown && counted.length) {
    const score = counted.reduce((sum, v) => {
      if (v.status === 'covered') return sum + 1
      if (v.status === 'partial' && v.have !== null && v.need) return sum + Math.min(1, v.have / v.need)
      return sum
    }, 0)
    ready = score / counted.length
  }

  let limiting: ProtocolView['limiting'] = null
  if (hd.water !== null && hd.food !== null) limiting = hd.water <= hd.food ? 'agua' : 'comida'

  return { degree, days, items, ready, householdDays: hd, limiting }
}

/** O degrau seguinte ao que a casa já alcançou, dentro dos degraus do protocolo. */
export function nextDegree(protocol: Protocol, autonomy: number | null): Degree {
  if (autonomy === null) return protocol.recommendedDegree
  return protocol.degrees.find(d => DEGREE_DAYS[d] > autonomy) ?? protocol.degrees[protocol.degrees.length - 1]
}

/** Comida: 1 dia-pessoa = 3 refeições. A tela pode mostrar refeições; o dado é dia-pessoa (D-158). */
export const MEALS_PER_PERSON_DAY = 3
