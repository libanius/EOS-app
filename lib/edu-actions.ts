import type { ChecklistTier } from './checklist'
import type { EduContent } from './edu'

export type EduPreparednessProposal = {
  name: string
  tier: ChecklistTier
  quantity: number
  unit: string | null
}

const MAX_ACTION_LENGTH = 96

const ACTION_VERBS = [
  'adquira',
  'adicione',
  'armazene',
  'combine',
  'compre',
  'confirme',
  'defina',
  'estabeleca',
  'estabeleça',
  'inclua',
  'prepare',
  'programe',
  'revise',
  'salve',
  'separe',
  'tenha',
  'verifique',
  'add',
  'buy',
  'check',
  'confirm',
  'define',
  'include',
  'prepare',
  'program',
  'review',
  'save',
  'set',
  'store',
]

export function cleanEduActionText(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/[*_`]/g, '')
    .replace(/[“”"']/g, '')
    .replace(/\((?:\d{1,2}:)?\d{1,2}:\d{2}\)/g, '')
    .replace(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g, '')
    .replace(/^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s*/i, '')
    .replace(/^\s*(?:item|step|passo|etapa)\s+\d+\s*[:.)-]\s*/i, '')
    .replace(/\s+([:;,.])/g, '$1')
    .replace(/\s*[:—-]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Exportado em PREP-T14: o briefing de prontidão usa o MESMO julgamento do
 * EDU sobre o que é ação e o que é prosa. Uma segunda lista de verbos seria a
 * quinta cópia de constante desta frente.
 */
export function looksActionable(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return ACTION_VERBS.some(verb => normalized.startsWith(`${verb} `))
}

function proposalName(value: string) {
  let trimmed = cleanEduActionText(value)
  trimmed = trimmed.replace(/^[.:;,-]+|[.;:,]+$/g, '').trim()
  const titleDescription = trimmed.match(/^(.{8,72}?)\s*:\s+(.{12,})$/)
  if (titleDescription) {
    const title = titleDescription[1].trim()
    const description = titleDescription[2].trim()
    if (!looksActionable(title) && looksActionable(description)) trimmed = description
    else if (!looksActionable(trimmed)) trimmed = `Revisar ${title}`
  }
  if (!trimmed) return ''
  return trimmed.length > MAX_ACTION_LENGTH ? `${trimmed.slice(0, MAX_ACTION_LENGTH - 3).trim()}...` : trimmed
}

export function buildEduPreparednessProposals(
  item: Pick<EduContent, 'summary' | 'transcript'>,
): EduPreparednessProposal[] {
  const source = [item.transcript, item.summary].filter(Boolean).join('\n')
  const candidates = source
    .split(/\n+/)
    .map(cleanEduActionText)
    .filter(line => line.length >= 12)
    .filter(line => /^\s*(?:[-*•]|\d+[.)]|[a-z][.)])/i.test(line) || looksActionable(line))
    .map(proposalName)
    .filter(Boolean)

  const seen = new Set<string>()
  const unique = candidates.filter(name => {
    const key = name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return unique.slice(0, 6).map(name => ({
    name,
    tier: 'ESSENTIAL',
    quantity: 1,
    unit: null,
  }))
}
