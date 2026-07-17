'use client'

import { useEffect, useRef } from 'react'

/**
 * Ambient wind-particle canvas. Intensity follows the risk state and the
 * real wind speed. Pauses off-screen and when the tab is hidden; renders a
 * single static frame under prefers-reduced-motion. DPR capped at 2.
 */
export default function ParticleField({
  windFactor = 0.2,
  rainFactor = 0,
  intensity = 1,
  density = 46,
}: {
  /** 0..1 — normalized wind speed */
  windFactor?: number
  /** 0..1 — normalized precipitation */
  rainFactor?: number
  /** state multiplier: safe .35 → critical 1.7 */
  intensity?: number
  density?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const params = useRef({ windFactor, rainFactor, intensity })
  params.current = { windFactor, rainFactor, intensity }

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const P = Array.from({ length: density }, () => ({
      x: Math.random(), y: Math.random(),
      v: 0.3 + Math.random() * 0.7, ph: Math.random() * 7,
    }))
    let raf = 0
    let visible = true
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting }, { rootMargin: '60px' })
    io.observe(cv)

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (!visible || document.hidden) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const r = cv.getBoundingClientRect()
      if (cv.width !== r.width * dpr || cv.height !== r.height * dpr) {
        cv.width = r.width * dpr
        cv.height = r.height * dpr
      }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      const { windFactor: wf, rainFactor: rf, intensity: k } = params.current
      const rgb = getComputedStyle(cv).getPropertyValue('--e2-state-rgb').trim() || '0,229,160'
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.lineCap = 'round'
      const speed = wf * 3 + k
      for (const p of P) {
        p.x += p.v * speed * 0.0016
        p.y += Math.sin(t * 0.0004 + p.ph) * 0.0004 + rf * 0.003
        if (p.x > 1.02) { p.x = -0.02; p.y = Math.random() }
        if (p.y > 1.02) p.y = -0.02
        const x = p.x * cv.width
        const y = p.y * cv.height
        const len = (6 + speed * 10 * p.v) * (cv.width / r.width)
        ctx.strokeStyle = `rgba(${rgb},${0.09 + p.v * 0.24})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - len, y + rf * len * 0.8)
        ctx.stroke()
      }
    }

    if (reduced) {
      draw(0)
      cancelAnimationFrame(raf)
    } else {
      raf = requestAnimationFrame(draw)
    }
    return () => { cancelAnimationFrame(raf); io.disconnect() }
  }, [density])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
