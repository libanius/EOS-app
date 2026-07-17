'use client'

import { useMemo } from 'react'
import { STATE_TOKENS, ACCENTS, type RiskState } from './tokens'
import type { HourlyForecast } from '@/lib/weather/types'

/**
 * Living Timeline — the next 24 h drawn as one moving line.
 * The curve is an hourly hazard blend (precip probability + wind + darkness);
 * the worst stretch is marked as a RISK WINDOW before the user reaches it.
 */
export default function LivingTimeline({
  hourly,
  state,
  language,
}: {
  hourly: HourlyForecast[]
  state: RiskState
  language: 'pt' | 'en'
}) {
  const hex = STATE_TOKENS[state].hex

  const { path, area, ticks, windowX, windowLabel } = useMemo(() => {
    const H = hourly.slice(0, 24)
    if (H.length < 2) return { path: '', area: '', ticks: [] as { x: number; label: string }[], windowX: null as number | null, windowLabel: '' }

    const W = 320
    const X0 = 8
    const XW = W - 16
    const yFor = (v: number) => 78 - v * 54 // v: 0..1

    const hazard = (h: HourlyForecast) => {
      const wind = Math.min(1, h.wind_gust_mph / 60)
      const rain = h.precip_prob_pct / 100
      const hour = new Date(h.time_iso).getHours()
      const night = hour < 6 || hour >= 19 ? 0.12 : 0
      return Math.min(1, rain * 0.55 + wind * 0.4 + night)
    }

    const pts = H.map((h, i) => ({
      x: X0 + (i / (H.length - 1)) * XW,
      y: yFor(hazard(h)),
      v: hazard(h),
      iso: h.time_iso,
    }))

    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]
      const prev = pts[i - 1]
      const cx = (prev.x + p.x) / 2
      d += ` Q${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${cx.toFixed(1)} ${((prev.y + p.y) / 2).toFixed(1)}`
    }
    d += ` L${pts[pts.length - 1].x.toFixed(1)} ${pts[pts.length - 1].y.toFixed(1)}`

    const a = `${d} L${(X0 + XW).toFixed(1)} 86 L${X0} 86 Z`

    const tk: { x: number; label: string }[] = []
    for (let i = 0; i < H.length; i += 6) {
      const hr = new Date(H[i].time_iso).getHours()
      tk.push({ x: pts[i].x, label: `${String(hr).padStart(2, '0')}h` })
    }

    // worst 3-hour stretch
    let worst = 0
    let worstIdx: number | null = null
    for (let i = 0; i + 2 < pts.length; i++) {
      const s = pts[i].v + pts[i + 1].v + pts[i + 2].v
      if (s > worst) { worst = s; worstIdx = i + 1 }
    }
    const show = worstIdx != null && worst / 3 > 0.42
    const label = show && worstIdx != null
      ? `${String(new Date(pts[worstIdx].iso).getHours()).padStart(2, '0')}h`
      : ''

    return { path: d, area: a, ticks: tk, windowX: show && worstIdx != null ? pts[worstIdx].x : null, windowLabel: label }
  }, [hourly])

  if (!path) return null

  return (
    <svg
      viewBox="0 0 320 100"
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={language === 'pt' ? 'Linha do tempo de risco das próximas 24 horas' : 'Risk timeline for the next 24 hours'}
    >
      <defs>
        <linearGradient id="e2tlg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENTS.magenta} stopOpacity=".2" />
          <stop offset="100%" stopColor={ACCENTS.magenta} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="8" y1="86" x2="312" y2="86" stroke="var(--e2-line)" strokeWidth="1" />
      {ticks.map(t => (
        <g key={t.x}>
          <line x1={t.x} y1="83" x2={t.x} y2="89" stroke="var(--e2-line)" strokeWidth="1" />
          <text x={t.x} y="98" textAnchor="middle" fontFamily="DM Mono" fontSize="7.5" fill="var(--e2-tx3)">
            {t.label}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#e2tlg)" />
      <path d={path} fill="none" stroke={ACCENTS.magenta} strokeWidth="2" />
      {/* NOW cursor */}
      <g transform="translate(8,0)">
        <line x1="0" y1="12" x2="0" y2="86" stroke={ACCENTS.cyan} strokeWidth="1.5" />
        <path d="M-4 8 L4 8 L0 14 Z" fill={ACCENTS.cyan} />
        <text y="6" textAnchor="middle" fontFamily="DM Mono" fontSize="7.5" fill={ACCENTS.cyan} letterSpacing="1">
          {language === 'pt' ? 'AGORA' : 'NOW'}
        </text>
      </g>
      {windowX != null && (
        <g transform={`translate(${windowX},22)`}>
          <path d="M0 -7 7 0 0 7 -7 0Z" fill="none" stroke={hex} strokeWidth="1.5" />
          <text x="11" y="3" fontFamily="DM Mono" fontSize="7.5" fill={hex} letterSpacing="1">
            {language === 'pt' ? `JANELA DE RISCO ${windowLabel}` : `RISK WINDOW ${windowLabel}`}
          </text>
        </g>
      )}
    </svg>
  )
}
