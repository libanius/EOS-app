'use client'

import { useState, type ReactNode } from 'react'
import { STATE_TOKENS, type RiskState } from './tokens'

/**
 * Dynamic Risk Island — sticky, always-visible system status.
 * Tap expands (Live-Activity style) to reveal the contributing factors.
 * Carries the colorblind-safe pattern line next to the state label.
 */
export default function RiskIsland({
  state,
  score,
  language,
  sublabel,
  detail,
}: {
  state: RiskState
  score: number | null
  language: 'pt' | 'en'
  sublabel?: string
  detail?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const t = STATE_TOKENS[state]

  return (
    <div className="e2-island-bar">
      <button
        type="button"
        className="e2-island"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`${t.label[language]} — ${t.message[language]}`}
      >
        <span className="e2-core" aria-hidden="true" />
        <span style={{ minWidth: 0 }}>
          <span className="e2-label" style={{ display: 'block' }}>
            RISK ISLAND{sublabel ? ` · ${sublabel}` : ''}
          </span>
          <span className="st">
            {t.label[language]}
            <svg width="30" height="8" viewBox="0 0 30 8" aria-hidden="true">
              <line
                x1="0" y1="4" x2="30" y2="4"
                stroke={t.hex} strokeWidth="2.5"
                strokeDasharray={t.pattern || undefined}
              />
            </svg>
          </span>
        </span>
        <span className="score">{score ?? '--'}</span>
      </button>
      <div className={`e2-exp${open ? ' open' : ''}`} aria-hidden={!open}>
        <div>
          <div
            className="e2-card"
            style={{ marginTop: 8, background: 'var(--e2-panel2)' }}
          >
            <p style={{ margin: 0, fontSize: 14, color: 'var(--e2-tx2)' }}>
              {t.message[language]}
            </p>
            {detail && <div style={{ marginTop: 10 }}>{detail}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
