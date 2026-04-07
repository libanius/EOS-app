'use client'

/**
 * NumericStepper
 *
 * Três modos de interação:
 *  1. Botões ± nas laterais
 *  2. Arrastar horizontalmente sobre o número (← →) para incrementar/decrementar
 *  3. Tocar/clicar no número para digitar o valor exato
 *
 * Props:
 *  value      – valor atual
 *  step       – incremento dos botões e do drag (default 1)
 *  min        – mínimo permitido (default 0)
 *  max        – máximo permitido (opcional)
 *  decimals   – casas decimais exibidas (default 0)
 *  label      – rótulo exibido à esquerda (opcional)
 *  unit       – unidade exibida à direita do número (opcional)
 *  accent     – usa var(--ac) no número
 *  size       – 'sm' | 'md' | 'lg'
 *  disabled
 *  onChange   – callback chamado sempre que o valor muda
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type NumericStepperProps = {
  value: number
  step?: number
  min?: number
  max?: number
  decimals?: number
  label?: string
  unit?: string
  accent?: boolean
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  onChange: (v: number) => void
}

export default function NumericStepper({
  value,
  step = 1,
  min = 0,
  max,
  decimals = 0,
  label,
  unit,
  accent = false,
  size = 'md',
  disabled = false,
  onChange,
}: NumericStepperProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Drag state kept in a ref to avoid stale closures
  const drag = useRef<{
    startX: number
    startValue: number
    moved: boolean
    lastEmittedStep: number
  } | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  const clamp = useCallback(
    (v: number): number => {
      let r = v
      r = Math.max(min, r)
      if (max !== undefined) r = Math.min(max, r)
      return parseFloat(r.toFixed(decimals))
    },
    [min, max, decimals],
  )

  function fmt(n: number): string {
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }

  // ── ± buttons ────────────────────────────────────────────────────────────

  function dec() {
    onChange(clamp(value - step))
  }

  function inc() {
    onChange(clamp(value + step))
  }

  // ── Drag (pointer events) ─────────────────────────────────────────────────
  // pixelsPerStep: how many pixels of horizontal movement = 1 step
  // Smaller steps need less friction; larger steps a bit more.
  const pixelsPerStep = Math.max(6, Math.min(16, step * 12))

  function onPointerDown(e: React.PointerEvent<HTMLSpanElement>) {
    if (disabled || editing) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = {
      startX: e.clientX,
      startValue: value,
      moved: false,
      lastEmittedStep: 0,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    if (!drag.current || disabled) return
    const dx = e.clientX - drag.current.startX
    if (Math.abs(dx) > 4) {
      drag.current.moved = true
    }
    if (!drag.current.moved) return

    const steps = Math.round(dx / pixelsPerStep)
    if (steps !== drag.current.lastEmittedStep) {
      drag.current.lastEmittedStep = steps
      const raw = drag.current.startValue + steps * step
      onChange(clamp(raw))
    }
  }

  function onPointerUp(_e: React.PointerEvent<HTMLSpanElement>) {
    if (!drag.current) return
    const wasDrag = drag.current.moved
    drag.current = null

    if (!wasDrag && !disabled) {
      // Treat as tap → enter edit mode
      const raw = value.toFixed(decimals)
      // Use comma as decimal separator (pt-BR convention)
      setDraft(raw.replace('.', ','))
      setEditing(true)
    }
  }

  // ── Edit mode ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commitEdit() {
    // Accept both comma and period as decimal separator
    const normalized = draft.trim().replace(',', '.')
    const parsed = parseFloat(normalized)
    if (!isNaN(parsed)) {
      onChange(clamp(parsed))
    }
    setEditing(false)
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEdit()
    }
    if (event.key === 'Escape') {
      setEditing(false)
    }
  }

  // ── Sizing ───────────────────────────────────────────────────────────────

  const fontSize = size === 'lg' ? 48 : size === 'sm' ? 15 : 20
  const btnSize  = size === 'lg' ? 44 : size === 'sm' ? 30 : 36
  const btnFont  = size === 'lg' ? 22 : size === 'sm' ? 16 : 20
  const minValW  = size === 'lg' ? 90 : size === 'sm' ? 36 : 52

  const valueColor = accent ? 'var(--ac)' : 'var(--tx)'

  // Estimate input width: roughly 0.65× fontSize per char + some padding
  const inputWidth = Math.max(
    minValW,
    draft.length * fontSize * 0.65 + 16,
  )

  return (
    <div style={R.row}>
      {/* Optional left label */}
      {label && (
        <div style={R.meta}>
          <span style={R.labelText}>{label}</span>
          {unit && <span style={R.unitText}>{unit}</span>}
        </div>
      )}

      {/* Controls group */}
      <div style={R.controls}>
        {/* Decrement */}
        <button
          type="button"
          style={{
            ...R.btn,
            width: btnSize,
            height: btnSize,
            fontSize: btnFont,
            opacity: disabled || value <= min ? 0.3 : 1,
            cursor: disabled || value <= min ? 'not-allowed' : 'pointer',
          }}
          onClick={dec}
          disabled={disabled || value <= min}
          aria-label="Diminuir"
        >
          −
        </button>

        {/* Value or input */}
        <div style={R.valueWrap}>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={onInputKeyDown}
              style={{
                ...R.input,
                fontSize,
                color: valueColor,
                width: inputWidth,
                letterSpacing: size === 'lg' ? '-1px' : 'normal',
              }}
              aria-label="Digitar valor"
            />
          ) : (
            <span
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              title="Arraste ↔ ou toque para digitar"
              style={{
                ...R.value,
                fontSize,
                color: valueColor,
                minWidth: minValW,
                letterSpacing: size === 'lg' ? '-1px' : 'normal',
                cursor: disabled ? 'not-allowed' : 'ew-resize',
                opacity: disabled ? 0.45 : 1,
                // Subtle underline hint that it's editable
                borderBottom: disabled
                  ? 'none'
                  : `1px dashed ${accent ? 'rgba(0,229,160,0.35)' : 'rgba(240,240,248,0.2)'}`,
                paddingBottom: 1,
              }}
            >
              {fmt(value)}
            </span>
          )}

          {/* Unit shown inline if no label */}
          {!label && unit && !editing && (
            <span style={{ ...R.unitText, marginLeft: 6 }}>{unit}</span>
          )}
        </div>

        {/* Increment */}
        <button
          type="button"
          style={{
            ...R.btn,
            width: btnSize,
            height: btnSize,
            fontSize: btnFont,
            opacity: disabled || (max !== undefined && value >= max) ? 0.3 : 1,
            cursor: disabled || (max !== undefined && value >= max) ? 'not-allowed' : 'pointer',
          }}
          onClick={inc}
          disabled={disabled || (max !== undefined && value >= max)}
          aria-label="Aumentar"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ─── Internal styles ─────────────────────────────────────────────────────────

const R: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
  },
  meta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  labelText: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--tx)',
  },
  unitText: {
    fontSize: 11,
    color: 'var(--mu)',
    fontFamily: "'DM Mono', monospace",
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    background: 'var(--sf2)',
    borderRadius: 12,
    padding: 4,
    border: '1px solid var(--bd)',
    flexShrink: 0,
  },
  btn: {
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--tx)',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1,
    fontFamily: 'inherit',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    transition: 'background 0.1s',
  } as React.CSSProperties,
  valueWrap: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  value: {
    fontFamily: "'DM Mono', monospace",
    fontWeight: 700,
    textAlign: 'center',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none', // Prevent scroll interference during drag
    display: 'block',
  } as React.CSSProperties,
  input: {
    fontFamily: "'DM Mono', monospace",
    fontWeight: 700,
    textAlign: 'center',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '0 4px',
    borderBottom: '1px solid var(--ac)',
    minWidth: 40,
  } as React.CSSProperties,
}
