'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useMotionValue, animate } from 'framer-motion'
import { ACCENTS } from './tokens'

/**
 * Rotary bezel navigation — hold and turn the watch bezel to choose a
 * destination, exactly like turning a dive bezel. The ring carries the
 * engraved destination labels; a fixed lume triangle at 12 o'clock is the
 * index. Release → spring-snap to the nearest destination; tap the chip
 * to open it. Spring physics via framer-motion.
 */

export type BezelItem = { label: string; href: string }

export default function RotaryBezelNav({
  items,
  size,
  children,
  openLabel,
}: {
  items: BezelItem[]
  size: number
  children: ReactNode
  openLabel: string
}) {
  const router = useRouter()
  const rot = useMotionValue(0)
  const [active, setActive] = useState(0)
  const [engaged, setEngaged] = useState(false)
  const drag = useRef<{ last: number; moved: boolean } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const N = items.length
  const step = 360 / N

  const angleAt = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
  }

  const onDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { last: angleAt(e), moved: false }
    setEngaged(true)
    rot.stop()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const a = angleAt(e)
    let d = a - drag.current.last
    if (d > 180) d -= 360
    if (d < -180) d += 360
    if (Math.abs(d) > 0.5) drag.current.moved = true
    rot.set(rot.get() + d)
    drag.current.last = a
  }
  const onUp = () => {
    if (!drag.current) return
    drag.current = null
    const target = Math.round(rot.get() / step) * step
    const idx = ((-Math.round(target / step) % N) + N) % N
    setActive(idx)
    animate(rot, target, { type: 'spring', stiffness: 170, damping: 20 })
    setTimeout(() => setEngaged(false), 1600)
  }

  const R_LABEL = 151 // matches the dial bezel mid-radius in its 400 viewBox

  return (
    <div
      ref={boxRef}
      style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}
    >
      {children}

      {/* rotating engraved ring */}
      <motion.div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, rotate: rot,
          pointerEvents: 'none',
          opacity: engaged ? 1 : 0.55,
          transition: 'opacity 400ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <svg viewBox="0 0 400 400" width={size} height={size} style={{ display: 'block' }}>
          {items.map((it, i) => {
            const deg = i * step
            const rad = ((deg - 90) * Math.PI) / 180
            const x = 200 + R_LABEL * Math.cos(rad)
            const y = 200 + R_LABEL * Math.sin(rad)
            return (
              <g key={it.href} transform={`rotate(${deg} ${x} ${y})`}>
                <text
                  x={x} y={y}
                  textAnchor="middle" dominantBaseline="central"
                  fontFamily="DM Mono" fontSize="11" fontWeight="500" letterSpacing="1.5"
                  fill={i === active ? ACCENTS.cyan : 'rgba(255,255,255,.62)'}
                  style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.6)', strokeWidth: 2.4 }}
                >
                  {it.label.toUpperCase()}
                </text>
                <circle cx={x} cy={y - 13} r="1.6" fill={i === active ? ACCENTS.cyan : 'rgba(255,255,255,.3)'} />
              </g>
            )
          })}
        </svg>
      </motion.div>

      {/* fixed 12 o'clock index (lume triangle) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 400" width={size} height={size}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <path d="M200 20 L192 6 L208 6 Z" fill={ACCENTS.cyan} />
        <path d="M200 20 L192 6 L208 6 Z" fill="none" stroke="rgba(0,0,0,.5)" strokeWidth="1" />
      </svg>

      {/* grab surface: only the bezel annulus captures the gesture */}
      <svg
        viewBox="0 0 400 400" width={size} height={size}
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
        role="presentation"
      >
        <circle
          cx="200" cy="200" r="151"
          fill="none" stroke="rgba(0,0,0,0)" strokeWidth="46"
          style={{ pointerEvents: 'stroke', cursor: engaged ? 'grabbing' : 'grab' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </svg>

      {/* selection chip at the index */}
      <button
        type="button"
        onClick={() => router.push(items[active].href)}
        style={{
          position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--e2-mono)', fontSize: 10, letterSpacing: '.16em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          color: ACCENTS.cyan, background: 'rgba(10,10,15,.88)',
          border: `1px solid rgba(53,215,242,.5)`, borderRadius: 999,
          padding: '7px 14px', cursor: 'pointer',
          boxShadow: engaged ? `0 0 18px rgba(53,215,242,.3)` : 'none',
          transition: 'box-shadow 300ms',
          zIndex: 5,
        }}
      >
        {items[active].label}
        <span style={{ color: 'rgba(255,255,255,.5)' }}>· {openLabel}</span>
      </button>
    </div>
  )
}
