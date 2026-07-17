// EOS v2 design tokens — single source of truth for the risk-state machine.
// Mirror of the landing v3 language. When the iOS app lands, export this map
// as JSON and generate Swift tokens from it (same hex, same cadences).

export type RiskState = 'safe' | 'watch' | 'warning' | 'critical'

/**
 * Aviation instrument accents (Garmin MARQ language):
 * magenta = route/primary data (the flight-plan line), cyan = secondary data.
 * Risk-state colors stay reserved for SEMANTICS (state, zones, alerts).
 */
export const ACCENTS = {
  magenta: '#ED3CE9',
  magentaRgb: '237,60,233',
  cyan: '#35D7F2',
  cyanRgb: '53,215,242',
} as const

export const STATE_TOKENS: Record<
  RiskState,
  {
    hex: string
    rgb: string
    /** pulse cadence — the emotional intensity of the UI lives here */
    pulse: string
    /** colorblind-safe line pattern (SVG stroke-dasharray; '' = solid) */
    pattern: string
    label: { pt: string; en: string }
    message: { pt: string; en: string }
  }
> = {
  safe: {
    hex: '#00E5A0',
    rgb: '0,229,160',
    pulse: '4s',
    pattern: '',
    label: { pt: 'SEGURO', en: 'SAFE' },
    message: {
      pt: 'Prossiga. Monitore as condições.',
      en: 'Proceed. Monitor conditions.',
    },
  },
  watch: {
    hex: '#7C6BFF',
    rgb: '124,107,255',
    pulse: '2.6s',
    pattern: '10 5',
    label: { pt: 'ATENÇÃO', en: 'WATCH' },
    message: {
      pt: 'Condições mudando. Fique alerta.',
      en: 'Conditions shifting. Stay alert.',
    },
  },
  warning: {
    hex: '#FFB347',
    rgb: '255,179,71',
    pulse: '1.6s',
    pattern: '4 4',
    label: { pt: 'ALERTA', en: 'WARNING' },
    message: {
      pt: 'Prepare-se para mudar o plano.',
      en: 'Prepare to change plans.',
    },
  },
  critical: {
    hex: '#FF6B6B',
    rgb: '255,107,107',
    pulse: '.9s',
    pattern: '2 3',
    label: { pt: 'CRÍTICO', en: 'CRITICAL' },
    message: {
      pt: 'Aja agora. Siga o plano.',
      en: 'Act now. Follow the plan.',
    },
  },
}

export const RISK_THRESHOLDS = { watch: 30, warning: 55, critical: 75 } as const

export function riskToState(score: number): RiskState {
  if (score >= RISK_THRESHOLDS.critical) return 'critical'
  if (score >= RISK_THRESHOLDS.warning) return 'warning'
  if (score >= RISK_THRESHOLDS.watch) return 'watch'
  return 'safe'
}
