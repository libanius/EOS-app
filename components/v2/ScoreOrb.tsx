'use client'

import { STATE_TOKENS, type RiskState } from './tokens'

/**
 * Survival Score Orb — one number for "how ready is this household".
 * Core radius and arc length are the data; the tick ring is the identity.
 */
export default function ScoreOrb({
  score,
  state,
  size = 150,
}: {
  score: number
  state: RiskState
  size?: number
}) {
  const hex = STATE_TOKENS[state].hex
  const C = 2 * Math.PI * 52
  const clamped = Math.max(0, Math.min(100, Math.round(score)))

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 150 150"
      role="img"
      aria-label={`Survival score ${clamped} / 100`}
    >
      <circle cx="75" cy="75" r="70" stroke="var(--e2-line-soft)" fill="none" strokeWidth="1" />
      <circle cx="75" cy="75" r="62" stroke="var(--e2-line)" fill="none" strokeWidth="9" strokeDasharray="1 5" />
      <circle
        cx="75" cy="75" r="52" fill="none"
        stroke={hex} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * C} ${C}`}
        transform="rotate(-90 75 75)"
        style={{ transition: 'stroke 600ms cubic-bezier(.2,.8,.2,1), stroke-dasharray 800ms cubic-bezier(.2,.8,.2,1)' }}
      />
      <circle
        cx="75" cy="75"
        r={20 + clamped * 0.12}
        fill={hex} opacity=".92"
        style={{ transition: 'fill 600ms cubic-bezier(.2,.8,.2,1), r 800ms cubic-bezier(.2,.8,.2,1)' }}
      />
      <text
        x="75" y="75" textAnchor="middle" dominantBaseline="central"
        fontFamily="DM Mono" fontSize="24" fontWeight="500" fill="#0A0A0F"
      >
        {clamped}
      </text>
    </svg>
  )
}
