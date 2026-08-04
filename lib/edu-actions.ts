import type { ChecklistTier } from './checklist'
import type { EduContent } from './edu'

export type EduPreparednessProposal = {
  name: string
  tier: ChecklistTier
  quantity: number
  unit: string | null
}

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

function cleanActionLine(value: string) {
  return value
    .replace(/^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksActionable(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return ACTION_VERBS.some(verb => normalized.startsWith(`${verb} `))
}

function proposalName(value: string) {
  const trimmed = value.replace(/[.;:]+$/g, '').trim()
  if (!trimmed) return ''
  return trimmed.length > 120 ? `${trimmed.slice(0, 117).trim()}...` : trimmed
}

export function buildEduPreparednessProposals(
  item: Pick<EduContent, 'summary' | 'transcript'>,
): EduPreparednessProposal[] {
  const source = [item.transcript, item.summary].filter(Boolean).join('\n')
  const candidates = source
    .split(/\n+/)
    .map(cleanActionLine)
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
