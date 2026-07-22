export const DECISION_STYLES = ['concise', 'balanced', 'detailed', 'checklist'] as const
export const RISK_TOLERANCES = ['conservative', 'balanced', 'flexible'] as const

export type DecisionStyle = (typeof DECISION_STYLES)[number]
export type RiskTolerance = (typeof RISK_TOLERANCES)[number]

export type ProfilePersonalization = {
  profile_id?: string
  avatar_url: string | null
  avatar_path?: string | null
  user_context_md: string
  pilot_memory_md: string
  decision_style: DecisionStyle
  risk_tolerance: RiskTolerance
  updated_at?: string
  pilot_memory_updated_at?: string | null
  configured?: boolean
}

export const DEFAULT_PERSONALIZATION: ProfilePersonalization = {
  avatar_url: null,
  user_context_md: '',
  pilot_memory_md: '',
  decision_style: 'balanced',
  risk_tolerance: 'balanced',
  configured: true,
}

export function isDecisionStyle(value: unknown): value is DecisionStyle {
  return typeof value === 'string' && DECISION_STYLES.includes(value as DecisionStyle)
}

export function isRiskTolerance(value: unknown): value is RiskTolerance {
  return typeof value === 'string' && RISK_TOLERANCES.includes(value as RiskTolerance)
}

export function normalizeOptionalText(value: unknown, maxLength: number) {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

export function normalizeMarkdown(value: unknown, maxLength = 20000) {
  if (typeof value !== 'string') return undefined
  return value.slice(0, maxLength)
}
