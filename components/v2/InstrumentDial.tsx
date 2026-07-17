'use client'

import { useEffect, useMemo, useState } from 'react'
import { STATE_TOKENS, ACCENTS, type RiskState } from './tokens'

/**
 * Instrument Dial — the dashboard's hero, styled like a luxury tool watch
 * (Garmin MARQ language): brushed-titanium bezel with engraved scale,
 * ceramic dial face, a state-colored needle sweeping the risk index, and
 * two watch-style complications (readiness + wind).
 *
 * Photoreal textures live in /public/v2 (Higgsfield); all geometry —
 * ticks, numerals, needle — is crisp SVG driven by real data.
 */

const R_BEZEL_OUT = 170
const R_BEZEL_IN = 132
const R_TICKS = 124
const R_NUM = 104

// gauge arc: 0 at 220°, 100 at 500° (=140°), i.e. 280° sweep — like a diver bezel
const A0 = 220
const SWEEP = 280
const angleFor = (v: number) => A0 + (Math.max(0, Math.min(100, v)) / 100) * SWEEP
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180
const px = (r: number, deg: number) => ({
  x: 200 + r * Math.cos(rad(deg)),
  y: 200 + r * Math.sin(rad(deg)),
})

function arcPath(r: number, from: number, to: number) {
  const a = px(r, from)
  const b = px(r, to)
  const large = to - from > 180 ? 1 : 0
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

function SubDial({
  cx, cy, value, max, label, display, hex,
}: {
  cx: number; cy: number; value: number; max: number
  label: string; display: string; hex: string
}) {
  const R = 40
  const a0 = 210
  const sweep = 300
  const ang = a0 + (Math.max(0, Math.min(1, value / max))) * sweep
  const ticks = Array.from({ length: 13 }, (_, i) => a0 + (i / 12) * sweep)
  const p = (r: number, deg: number) => ({
    x: cx + r * Math.cos(((deg - 90) * Math.PI) / 180),
    y: cy + r * Math.sin(((deg - 90) * Math.PI) / 180),
  })
  return (
    <g>
      {/* recessed face, slightly lighter than the dial so it reads */}
      <circle cx={cx} cy={cy} r={R + 7} fill="rgba(28,28,36,.92)" stroke="rgba(255,255,255,.14)" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={R + 4} fill="none" stroke="rgba(0,0,0,.65)" strokeWidth="2" />
      {ticks.map((t, i) => {
        const o = p(R, t)
        const inn = p(R - (i % 3 === 0 ? 8 : 4.5), t)
        return (
          <line
            key={t} x1={inn.x} y1={inn.y} x2={o.x} y2={o.y}
            stroke={i % 3 === 0 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.4)'}
            strokeWidth={i % 3 === 0 ? 1.8 : 1}
          />
        )
      })}
      {/* value plate keeps the readout clear of the needle */}
      <rect x={cx - 22} y={cy + 8} width="44" height="17" rx="3.5" fill="rgba(8,8,12,.85)" stroke="rgba(255,255,255,.1)" strokeWidth=".5" />
      {/* needle */}
      <g style={{ transition: 'transform 1.1s cubic-bezier(.3,.9,.25,1)', transform: `rotate(${ang}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
        <line x1={cx} y1={cy + 5} x2={cx} y2={cy - R + 9} stroke={hex} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3.2" fill={hex} />
      </g>
      <text x={cx} y={cy + 17} textAnchor="middle" dominantBaseline="central" fontFamily="DM Mono" fontSize="12.5" fontWeight="500" fill={ACCENTS.cyan}>
        {display}
      </text>
      <text x={cx} y={cy + 33} textAnchor="middle" fontFamily="DM Mono" fontSize="6.5" letterSpacing="1.2" fill="rgba(255,255,255,.72)"
        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.7)', strokeWidth: 2 }}
      >
        {label}
      </text>
    </g>
  )
}

export default function InstrumentDial({
  score,
  state,
  readiness,
  wind,
  windUnit,
  language,
  size = 340,
  led = null,
}: {
  score: number
  state: RiskState
  readiness: number
  wind: number
  windUnit: string
  language: 'pt' | 'en'
  size?: number
  /** escalation LED between the complications — lights in the TARGET
      state color, in sync with the island's ESCALADA brief */
  led?: RiskState | null
}) {
  const t = STATE_TOKENS[state]
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const shown = mounted ? score : 0
  const needleAngle = angleFor(shown)

  // bezel scale: engraved numerals every 10, ticks every 2
  const ticks = useMemo(() => {
    const out: { deg: number; major: boolean; num?: number }[] = []
    for (let v = 0; v <= 100; v += 2) {
      out.push({ deg: angleFor(v), major: v % 10 === 0, num: v % 20 === 0 ? v : undefined })
    }
    return out
  }, [])

  const zoneFrom = (v0: number, v1: number) => arcPath(R_TICKS - 8, angleFor(v0), angleFor(v1))

  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-label={`${language === 'pt' ? 'Índice de risco' : 'Risk index'} ${score} / 100 — ${t.label[language]}`}
      style={{ display: 'block', filter: 'drop-shadow(0 18px 40px rgba(0,0,0,.6))' }}
    >
      <defs>
        {/* photoreal textures (Higgsfield) */}
        <pattern id="idl-metal" patternUnits="userSpaceOnUse" width="400" height="400">
          <image href="/v2/bezel-titanium.webp" x="0" y="0" width="400" height="400" preserveAspectRatio="xMidYMid slice" />
        </pattern>
        <pattern id="idl-ceramic" patternUnits="userSpaceOnUse" width="400" height="400">
          <image href="/v2/dial-ceramic.webp" x="0" y="0" width="400" height="400" preserveAspectRatio="xMidYMid slice" />
        </pattern>
        {/* lighting */}
        <radialGradient id="idl-glass" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".10" />
          <stop offset="38%" stopColor="#fff" stopOpacity=".02" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="idl-bezel-light" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity=".28" />
          <stop offset="30%" stopColor="#fff" stopOpacity=".04" />
          <stop offset="70%" stopColor="#000" stopOpacity=".25" />
          <stop offset="100%" stopColor="#000" stopOpacity=".45" />
        </linearGradient>
        <radialGradient id="idl-inner-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor="#000" stopOpacity="0" />
          <stop offset="96%" stopColor="#000" stopOpacity=".55" />
          <stop offset="100%" stopColor="#000" stopOpacity=".8" />
        </radialGradient>
        <radialGradient id="idl-needle-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ACCENTS.magenta} stopOpacity=".5" />
          <stop offset="100%" stopColor={ACCENTS.magenta} stopOpacity="0" />
        </radialGradient>
        {/* escalation LED optics */}
        <radialGradient id="idl-led-collar" cx="34%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#4c4c58" />
          <stop offset="55%" stopColor="#1d1d25" />
          <stop offset="100%" stopColor="#0a0a0f" />
        </radialGradient>
        <radialGradient id="idl-led-off" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".09" />
          <stop offset="38%" stopColor="#16161c" />
          <stop offset="100%" stopColor="#08080c" />
        </radialGradient>
        <radialGradient id="idl-led-on" cx="42%" cy="36%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset="32%" stopColor={led ? STATE_TOKENS[led].hex : '#FFB347'} />
          <stop offset="100%" stopColor={led ? STATE_TOKENS[led].hex : '#FFB347'} stopOpacity=".55" />
        </radialGradient>
        <radialGradient id="idl-led-bloom" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={led ? STATE_TOKENS[led].hex : '#FFB347'} stopOpacity=".45" />
          <stop offset="100%" stopColor={led ? STATE_TOKENS[led].hex : '#FFB347'} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── bezel: brushed titanium + engraved scale ── */}
      <circle cx="200" cy="200" r={R_BEZEL_OUT} fill="url(#idl-metal)" />
      <circle cx="200" cy="200" r={R_BEZEL_OUT} fill="url(#idl-bezel-light)" />
      <circle cx="200" cy="200" r={R_BEZEL_OUT} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
      <circle cx="200" cy="200" r={R_BEZEL_IN + 2} fill="none" stroke="rgba(0,0,0,.7)" strokeWidth="3" />

      {/* bezel numerals removed — the outer bezel is the rotary NAV ring;
          the risk scale lives on the inner rehaut + colored zones */}
      {/* bezel minor marks */}
      {ticks.filter(k => !k.major).map(k => {
        const a = px(R_BEZEL_OUT - 6, k.deg)
        const b = px(R_BEZEL_OUT - 14, k.deg)
        return <line key={`b${k.deg}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,.35)" strokeWidth="1.2" />
      })}

      {/* ── dial face: black ceramic ── */}
      <circle cx="200" cy="200" r={R_BEZEL_IN} fill="url(#idl-ceramic)" />
      <circle cx="200" cy="200" r={R_BEZEL_IN} fill="rgba(6,6,10,.35)" />

      {/* rehaut ticks */}
      {ticks.map(k => {
        const a = px(R_TICKS, k.deg)
        const b = px(R_TICKS - (k.major ? 12 : 6), k.deg)
        return (
          <line
            key={`t${k.deg}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={k.major ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.28)'}
            strokeWidth={k.major ? 2 : 1}
          />
        )
      })}
      {/* inner numerals (0 and 100 skipped — the complications live there) */}
      {ticks.filter(k => k.num !== undefined && k.num % 20 === 0 && k.num !== 0 && k.num !== 100).map(k => {
        const p = px(R_NUM, k.deg)
        return (
          <text
            key={`in${k.num}`} x={p.x} y={p.y}
            textAnchor="middle" dominantBaseline="central"
            fontFamily="DM Mono" fontSize="11" fill="rgba(255,255,255,.5)"
          >
            {k.num}
          </text>
        )
      })}

      {/* state zones on the scale (colorblind-safe by position) */}
      <path d={zoneFrom(0, 30)} stroke="#00E5A0" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".55" />
      <path d={zoneFrom(30, 55)} stroke="#7C6BFF" strokeWidth="3" fill="none" opacity=".55" />
      <path d={zoneFrom(55, 75)} stroke="#FFB347" strokeWidth="3" fill="none" opacity=".55" />
      <path d={zoneFrom(75, 100)} stroke="#FF6B6B" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".55" />

      {/* progress arc up to current value */}
      {shown > 1 && (
        <path
          d={arcPath(R_TICKS - 8, A0, needleAngle)}
          stroke={ACCENTS.magenta} strokeWidth="5" fill="none" strokeLinecap="round"
          style={{ transition: 'all 1.1s cubic-bezier(.3,.9,.25,1)' }}
          opacity=".95"
        />
      )}

      {/* complications */}
      <SubDial
        cx={128} cy={252} value={readiness} max={100}
        label={language === 'pt' ? 'PRONTIDÃO' : 'READINESS'}
        display={String(Math.round(readiness))} hex={ACCENTS.cyan}
      />
      <SubDial
        cx={272} cy={252} value={Math.min(wind, 120)} max={120}
        label={`${language === 'pt' ? 'VENTO' : 'WIND'} ${windUnit.toUpperCase()}`}
        display={String(Math.round(wind))} hex={ACCENTS.cyan}
      />

      {/* center readout */}
      <text x="200" y="150" textAnchor="middle" fontFamily="DM Mono" fontSize="9" letterSpacing="3" fill="rgba(255,255,255,.5)">
        {language === 'pt' ? 'ÍNDICE DE RISCO' : 'RISK INDEX'}
      </text>
      <text
        x="200" y="196" textAnchor="middle" dominantBaseline="central"
        fontFamily="DM Mono" fontSize="58" fontWeight="500" fill="#F2F2F7"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {score}
      </text>
      <text x="200" y="230" textAnchor="middle" fontFamily="DM Mono" fontSize="10.5" letterSpacing="3" fill={t.hex} fontWeight="500">
        {t.label[language]}
      </text>
      {/* colorblind pattern under state label */}
      <line
        x1="180" y1="239" x2="220" y2="239"
        stroke={t.hex} strokeWidth="1.8"
        strokeDasharray={t.pattern || undefined}
      />

      {/* ── escalation LED: a jewel recessed between the complications ── */}
      <g>
        <circle cx="200" cy="274" r="7.5" fill="url(#idl-led-collar)" stroke="rgba(255,255,255,.16)" strokeWidth=".6" />
        <circle cx="200" cy="274" r="5.4" fill="#060609" />
        <circle cx="200" cy="274" r="4.6" fill="url(#idl-led-off)" />
        <g
          className={led ? 'idl-led-on' : undefined}
          style={{ opacity: led ? 1 : 0, transition: 'opacity 600ms ease' }}
        >
          <circle cx="200" cy="274" r="14" fill="url(#idl-led-bloom)" />
          <circle cx="200" cy="274" r="4.6" fill="url(#idl-led-on)" />
          <circle cx="198.5" cy="272.6" r="1.4" fill="#ffffff" opacity=".9" />
        </g>
      </g>

      {/* ── needle (aviation magenta — the route line) ── */}
      <circle cx="200" cy="200" r="40" fill="url(#idl-needle-glow)" opacity=".35" />
      <g
        style={{
          transition: 'transform 1.2s cubic-bezier(.3,.9,.25,1)',
          transform: `rotate(${needleAngle}deg)`,
          transformOrigin: '200px 200px',
        }}
      >
        <path d="M200 214 L195 200 L198.4 88 L200 82 L201.6 88 L205 200 Z" fill={ACCENTS.magenta} />
        <path d="M200 214 L195 200 L198.4 88 L200 82" fill="rgba(255,255,255,.35)" />
        <circle cx="200" cy="200" r="9" fill="#0C0C12" stroke={ACCENTS.magenta} strokeWidth="2.5" />
        <circle cx="200" cy="200" r="3" fill={ACCENTS.magenta} />
      </g>

      {/* glass + edge vignette */}
      <circle cx="200" cy="200" r={R_BEZEL_IN} fill="url(#idl-inner-shadow)" />
      <circle cx="200" cy="200" r={R_BEZEL_IN} fill="url(#idl-glass)" />
      <path
        d={arcPath(R_BEZEL_IN - 4, 300, 40)}
        stroke="rgba(255,255,255,.14)" strokeWidth="7" fill="none" strokeLinecap="round"
      />
    </svg>
  )
}
