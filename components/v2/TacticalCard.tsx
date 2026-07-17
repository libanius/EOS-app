'use client'

import { useState, type ReactNode } from 'react'

/**
 * EOS v2 tactical card — corner ticks, optional breathe, optional
 * Live-Activity expansion (tap to reveal `detail` with a spring-like
 * grid-rows transition; no JS measuring, no layout shift elsewhere).
 */
export default function TacticalCard({
  label,
  children,
  detail,
  breathe = false,
  className = '',
  defaultOpen = false,
}: {
  label?: string
  children: ReactNode
  detail?: ReactNode
  breathe?: boolean
  className?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const expandable = detail != null

  const body = (
    <>
      {label && (
        <div className="e2-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="e2-label">{label}</span>
          {expandable && (
            <svg
              width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
              style={{
                transform: open ? 'rotate(225deg)' : 'rotate(45deg)',
                transition: 'transform 320ms cubic-bezier(.2,.8,.2,1)',
                flex: 'none',
              }}
            >
              <path d="M2 6.5 5 3.5 8 6.5" fill="none" stroke="var(--e2-tx3)" strokeWidth="1.5" />
            </svg>
          )}
        </div>
      )}
      {children}
      {expandable && (
        <div className={`e2-exp${open ? ' open' : ''}`} aria-hidden={!open}>
          <div>
            <hr className="e2-divider" />
            {detail}
          </div>
        </div>
      )}
    </>
  )

  if (expandable) {
    return (
      <button
        type="button"
        className={`e2-card tap${breathe ? ' e2-breathe' : ''} ${className}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {body}
      </button>
    )
  }
  return <div className={`e2-card${breathe ? ' e2-breathe' : ''} ${className}`}>{body}</div>
}
