'use client'

/**
 * DetentSheet — a bottom sheet that behaves like a physical object.
 *
 * This is the piece v1 faked: there, a grabber *looked* draggable but was a
 * button that cycled CSS `height` transitions. Here the surface is genuinely
 * grabbable, and every rule from Apple's fluid-interface talk is honoured:
 *
 *  §1  Feedback is continuous during the gesture, never only at the end.
 *  §2  1:1 tracking from where the finger actually grabbed.
 *  §3  Interruptible at any frame — a pointer-down stops the running spring and
 *      the next animation starts from the PRESENTATION value, so nothing jumps.
 *  §5  Release velocity is handed to the spring — no seam between drag and
 *      animation.
 *  §6  The landing detent comes from where the momentum was *going* (Apple's
 *      exponential projection), not from where the finger let go.
 *  §9  Past the first and last detent the surface rubber-bands instead of
 *      stopping dead.
 *  §11 Only `transform` is animated — never `height`.
 *
 * Drag lives on the header (grabber + summary), which is a generous ~84px
 * target; the content below scrolls natively. That split is deliberate: it
 * keeps the gesture unambiguous and never fights the browser's scroller.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion'
import { SPRING, haptic, projectMomentum, rubberband, velocityFrom } from './motion'

export type Detent = 'peek' | 'medium' | 'large'

const ORDER: Detent[] = ['peek', 'medium', 'large']
/** Movement before a drag commits to a direction (§10 hysteresis). */
const DRAG_THRESHOLD = 6
/** Below this release speed the gesture carried no momentum, so no bounce. */
const MOMENTUM_FLOOR = 40

type Props = {
  detent: Detent
  onDetentChange: (detent: Detent) => void
  /** Always-visible line inside the grabber — the sheet's answer at a glance. */
  summary: ReactNode
  label: string
  grabberLabel: string
  children: ReactNode
}

export default function DetentSheet({
  detent,
  onDetentChange,
  summary,
  label,
  grabberLabel,
  children,
}: Props) {
  const reduceMotion = useReducedMotion()

  const layerRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const grabberRef = useRef<HTMLButtonElement>(null)

  const y = useMotionValue(0)
  const playback = useRef<ReturnType<typeof animate> | null>(null)
  const metrics = useRef({ height: 0, peek: 120, medium: 320 })
  const current = useRef<Detent>(detent)
  const drag = useRef<{
    pointerId: number
    startPointer: number
    startY: number
    moved: boolean
    samples: Array<{ t: number; v: number }>
  } | null>(null)
  const suppressClick = useRef(false)

  /** Translate for a detent. `large` is 0 (fully open); `peek` is the deepest. */
  const yFor = useCallback((d: Detent) => {
    const { height, peek, medium } = metrics.current
    if (d === 'large') return 0
    return Math.max(0, height - (d === 'peek' ? peek : medium))
  }, [])

  /** Move the surface without announcing a change (external / resize sync). */
  const animateTo = useCallback(
    (d: Detent, velocity = 0) => {
      const target = yFor(d)
      playback.current?.stop()
      if (reduceMotion) {
        y.set(target)
        return
      }
      // Bounce is earned by momentum. A programmatic move settles critically damped.
      const spring = Math.abs(velocity) > MOMENTUM_FLOOR ? SPRING.sheet : SPRING.move
      playback.current = animate(y, target, { ...spring, velocity })
    },
    [reduceMotion, y, yFor],
  )

  /** Move AND announce — the user-initiated path. */
  const commit = useCallback(
    (next: Detent, velocity = 0) => {
      if (next !== current.current) {
        current.current = next
        haptic.selection()
        onDetentChange(next)
      }
      animateTo(next, velocity)
    },
    [animateTo, onDetentChange],
  )

  /** Progressive resistance outside the detent range instead of a hard stop. */
  const bound = useCallback((raw: number) => {
    const { height, peek } = metrics.current
    const max = Math.max(0, height - peek)
    if (raw < 0) return -rubberband(-raw, height)
    if (raw > max) return max + rubberband(raw - max, height)
    return raw
  }, [])

  const nearestDetent = useCallback(
    (position: number) =>
      ORDER.reduce((best, d) =>
        Math.abs(yFor(d) - position) < Math.abs(yFor(best) - position) ? d : best,
      ),
    [yFor],
  )

  // ── Measurement ─────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const measure = () => {
      const height = layer.clientHeight
      const grabber = grabberRef.current?.offsetHeight ?? 96
      metrics.current = {
        height,
        peek: Math.min(grabber + 8, height),
        medium: Math.round(Math.min(Math.max(height * 0.52, 300), height)),
      }
      playback.current?.stop()
      y.set(yFor(current.current))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(layer)
    if (grabberRef.current) observer.observe(grabberRef.current)
    return () => observer.disconnect()
  }, [y, yFor])

  // ── External detent changes (map interaction, deep links, keyboard) ──────
  useEffect(() => {
    if (detent === current.current) return
    current.current = detent
    animateTo(detent, 0)
  }, [detent, animateTo])

  // ── Gesture ─────────────────────────────────────────────────────────────
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const sheet = sheetRef.current
    if (!sheet) return

    // Interrupt: the running spring stops and whatever is on screen right now
    // becomes the new starting value. Reading the target instead would jump.
    playback.current?.stop()
    suppressClick.current = false

    try {
      sheet.setPointerCapture(event.pointerId)
    } catch {
      /* capture is an optimisation; tracking still works without it */
    }

    drag.current = {
      pointerId: event.pointerId,
      startPointer: event.clientY,
      startY: y.get(),
      moved: false,
      samples: [{ t: performance.now(), v: y.get() }],
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return

    const delta = event.clientY - state.startPointer
    if (!state.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return
      state.moved = true
      // The gesture won: the pointer-up must not also fire the cycle button.
      suppressClick.current = true
    }

    const raw = state.startY + delta
    y.set(bound(raw))
    state.samples.push({ t: performance.now(), v: raw })
    if (state.samples.length > 8) state.samples.shift()
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    drag.current = null

    try {
      sheetRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }

    // No movement — this was a tap. The click handler owns it.
    if (!state.moved) return

    const velocity = velocityFrom(state.samples)
    const projected = y.get() + projectMomentum(velocity)
    commit(nearestDetent(projected), velocity)
  }

  // Keyboard / assistive path: the grabber is a real button that cycles detents.
  const onGrabberClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    const next = ORDER[(ORDER.indexOf(current.current) + 1) % ORDER.length]
    commit(next, 0)
  }

  return (
    <div className="wv2-sheet-layer" ref={layerRef}>
      <motion.section
        ref={sheetRef}
        className="wv2-sheet"
        data-detent={detent}
        style={{ y }}
        aria-label={label}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <button
          ref={grabberRef}
          type="button"
          className="wv2-grabber"
          aria-expanded={detent !== 'peek'}
          aria-label={grabberLabel}
          onPointerDown={onPointerDown}
          onClick={onGrabberClick}
        >
          <span className="grip" aria-hidden="true" />
          <span className="summary">{summary}</span>
        </button>

        <div className="wv2-sheet-scroll">{children}</div>
      </motion.section>
    </div>
  )
}
