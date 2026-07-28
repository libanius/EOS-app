'use client'

/**
 * World v2 — motion foundations.
 *
 * Apple describes springs with two designer parameters instead of the physics
 * triplet: DAMPING RATIO (overshoot) and RESPONSE (how fast it reaches target,
 * in seconds). Framer Motion's `bounce` + `duration` spring API maps onto them
 * closely, so every token below is written in Apple's terms and translated once,
 * here — no ad-hoc easing values anywhere else in v2.
 *
 * Rules encoded here (WWDC 2018, "Designing Fluid Interfaces"):
 *  - default UI is critically damped (no overshoot);
 *  - bounce is earned only by a gesture that carried momentum;
 *  - a released gesture hands its velocity to the spring (no seam);
 *  - a flick lands where the momentum was *going*, not where the finger left;
 *  - boundaries resist progressively instead of stopping dead.
 */

export type SpringToken = { type: 'spring'; bounce: number; duration: number }

export const SPRING: Record<'move' | 'quick' | 'sheet' | 'pop', SpringToken> = {
  /** Reposition / reveal / hide. Damping 1.0, response 0.4 — never overshoots. */
  move: { type: 'spring', bounce: 0, duration: 0.4 },
  /** Small chrome (chips, badges, icon buttons). Damping 1.0, response 0.28. */
  quick: { type: 'spring', bounce: 0, duration: 0.28 },
  /** Drawers and sheets released from a drag. Damping ~0.8, response 0.3. */
  sheet: { type: 'spring', bounce: 0.2, duration: 0.32 },
  /** Momentum-driven emphasis. Damping ~0.8, response 0.4. */
  pop: { type: 'spring', bounce: 0.24, duration: 0.4 },
}

/** Cross-fade used wherever reduced-motion replaces a spatial transition. */
export const FADE = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const }

/**
 * Apple's momentum projection from the Fluid Interfaces sample code: where a
 * flick would come to rest under scroll-style exponential decay. NOT the
 * textbook v²/(2a) — this is the curve iOS actually ships.
 *
 * @param velocity px/s at release
 * @param decelerationRate 0.998 ≈ normal scroll feel, 0.99 ≈ snappier
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/**
 * Progressive resistance past a boundary. The further out the drag goes, the
 * less the surface follows — a hard stop reads as "frozen", this reads as
 * "responsive, but there is nothing more here".
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/**
 * Velocity in px/s from a short position history. Sampling only the last ~90ms
 * keeps a slow drag that ended with a flick from being averaged into stillness.
 */
export function velocityFrom(samples: Array<{ t: number; v: number }>) {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[0]
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 90) break
    first = samples[i]
  }
  const dt = (last.t - first.t) / 1000
  if (dt <= 0) return 0
  return (last.v - first.v) / dt
}

/**
 * Haptics — reserved for meaningful, causal moments (a detent snapping home, a
 * choice committing). Over-feedback trains people to ignore all of it, so there
 * are deliberately only two levels and no "hover" or "scroll" haptic.
 */
const buzz = (ms: number) => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  try {
    navigator.vibrate(ms)
  } catch {
    /* haptics are additive — never let them break an interaction */
  }
}

export const haptic = {
  /** A value changed under the finger: detent snap, segment change. */
  selection: () => buzz(6),
  /** An action committed: primary button, destructive confirm. */
  impact: () => buzz(12),
}
