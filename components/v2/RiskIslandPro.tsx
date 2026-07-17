'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n'
import { STATE_TOKENS, ACCENTS } from './tokens'
import { useRisk, riskWindow, type RiskFactor } from './RiskProvider'

/**
 * Risk Island Pro — a watch complication, not a pill.
 * Mini tick-ring dial with the pulsing state core, a recessed value window
 * cycling micro-briefings (state → risk window → top alert → sun event),
 * and the risk index as an oversized date window. Tap = expand factors.
 * Lives in the (app) layout: present on every screen.
 */

const FACTOR_LABEL: Record<RiskFactor['key'], { pt: string; en: string }> = {
  wind: { pt: 'Vento', en: 'Wind' },
  rain: { pt: 'Precipitação', en: 'Precipitation' },
  vis: { pt: 'Visibilidade', en: 'Visibility' },
  night: { pt: 'Período noturno', en: 'Night hours' },
  alerts: { pt: 'Alertas oficiais', en: 'Official alerts' },
  quake: { pt: 'Atividade sísmica', en: 'Seismic activity' },
}

type Brief = { tag: string; text: string }

export default function RiskIslandPro() {
  const { language } = useLanguage()
  const { snapshot, score, factors, state, escalation, setEscFlash, loading } = useRisk()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const t = STATE_TOKENS[state]

  // ── micro-briefings ticker ──
  const briefs = useMemo<Brief[]>(() => {
    const out: Brief[] = [
      {
        tag: language === 'pt' ? 'ESTADO' : 'STATE',
        text: `${t.label[language]} — ${t.message[language]}`,
      },
    ]
    if (escalation) {
      const to = STATE_TOKENS[escalation.to]
      out.push({
        tag: language === 'pt' ? 'ESCALADA' : 'RISING',
        text: language === 'pt'
          ? `${to.label.pt} em ~${escalation.inHours}h — prepare-se agora`
          : `${to.label.en} in ~${escalation.inHours}h — prepare now`,
      })
    }
    if (snapshot) {
      const win = riskWindow(snapshot.hourly)
      if (win) {
        out.push({
          tag: language === 'pt' ? 'JANELA' : 'WINDOW',
          text: language === 'pt'
            ? `Janela de risco ~${String(win.hour).padStart(2, '0')}h`
            : `Risk window ~${String(win.hour).padStart(2, '0')}h`,
        })
      }
      const alert = snapshot.alerts[0]
      if (alert) {
        out.push({
          tag: language === 'pt' ? 'ALERTA' : 'ALERT',
          text: alert.headline.length > 52 ? alert.headline.slice(0, 52) + '…' : alert.headline,
        })
      }
      const now = Date.now()
      const sunrise = new Date(snapshot.current.sunrise_iso).getTime()
      const sunset = new Date(snapshot.current.sunset_iso).getTime()
      const nextSun = snapshot.current.is_daytime
        ? { iso: snapshot.current.sunset_iso, pt: 'Pôr do sol', en: 'Sunset' }
        : { iso: snapshot.current.sunrise_iso, pt: 'Nascer do sol', en: 'Sunrise' }
      if (sunrise > 0 && sunset > now - 24 * 3600e3) {
        const hm = new Date(nextSun.iso).toLocaleTimeString(language === 'pt' ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
        out.push({
          tag: language === 'pt' ? 'SOL' : 'SUN',
          text: `${language === 'pt' ? nextSun.pt : nextSun.en} ${hm}`,
        })
      }
    }
    return out
  }, [snapshot, t, language, escalation])

  useEffect(() => {
    if (briefs.length < 2) return
    const id = setInterval(() => setTick(v => v + 1), 6000)
    return () => clearInterval(id)
  }, [briefs.length])
  const brief = briefs[tick % briefs.length]

  // the countdown ring only lives while the ESCALADA brief is on screen:
  // it sweeps in like a gauge, pulses with the text, then retracts
  const escTag = language === 'pt' ? 'ESCALADA' : 'RISING'
  const escActive = !!escalation && brief.tag === escTag
  const RING_C = 2 * Math.PI * 21

  // broadcast the flash so other instruments (dial LED) light up in sync
  useEffect(() => {
    setEscFlash(escActive)
    return () => setEscFlash(false)
  }, [escActive, setEscFlash])

  const vars = {
    '--i-hex': t.hex,
    '--i-rgb': t.rgb,
    '--i-pulse': t.pulse,
  } as React.CSSProperties

  return (
    <div className="e2i-bar" style={vars}>
      <div className="e2i">
        <button
          type="button"
          className="e2i-main"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label={`Risk Island — ${t.label[language]}`}
        >
          {/* mini complication dial */}
          <span className="e2i-dial" aria-hidden="true">
            <svg viewBox="0 0 44 44" width="44" height="44">
              {Array.from({ length: 12 }, (_, i) => {
                const a = ((i * 30 - 90) * Math.PI) / 180
                const r1 = i % 3 === 0 ? 15.5 : 17.5
                return (
                  <line
                    key={i}
                    x1={22 + r1 * Math.cos(a)} y1={22 + r1 * Math.sin(a)}
                    x2={22 + 20 * Math.cos(a)} y2={22 + 20 * Math.sin(a)}
                    stroke={i % 3 === 0 ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.3)'}
                    strokeWidth={i % 3 === 0 ? 1.6 : 1}
                  />
                )
              })}
              <circle cx="22" cy="22" r="21" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
              {escalation && (
                // countdown gauge: sweeps in while the ESCALADA brief shows
                // (12h horizon → full at 0h, TARGET state color), retracts after
                <circle
                  className={escActive ? 'e2i-escring' : undefined}
                  cx="22" cy="22" r="21" fill="none"
                  stroke={STATE_TOKENS[escalation.to].hex}
                  strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={`${(escActive ? Math.max(0.08, 1 - escalation.inHours / 12) : 0.0001) * RING_C} ${RING_C}`}
                  transform="rotate(-90 22 22)"
                  style={{
                    transition: 'stroke-dasharray 900ms cubic-bezier(.3,.9,.25,1), opacity 500ms ease',
                    opacity: escActive ? 1 : 0,
                  }}
                />
              )}
            </svg>
            <span className="e2i-core" />
          </span>

          {/* value window (recessed plate) — ticker lives here */}
          <span className="e2i-win">
            <span className="e2i-tag">
              RISK ISLAND{' '}
              <b style={escActive && escalation ? { color: STATE_TOKENS[escalation.to].hex } : undefined}>
                · {loading && !snapshot ? '· · ·' : brief.tag}
              </b>
            </span>
            <span className="e2i-line" key={brief.tag + brief.text}>
              {loading && !snapshot ? (language === 'pt' ? 'Lendo sensores…' : 'Reading sensors…') : brief.text}
            </span>
            <svg width="46" height="4" viewBox="0 0 46 4" aria-hidden="true" style={{ display: 'block', marginTop: 3 }}>
              <line x1="0" y1="2" x2="46" y2="2" stroke={t.hex} strokeWidth="2.5" strokeDasharray={t.pattern || undefined} />
            </svg>
          </span>

          {/* oversized date-window index */}
          <span className="e2i-num">{score ?? '--'}</span>
        </button>

        <div className={`e2-exp${open ? ' open' : ''}`} aria-hidden={!open}>
          <div>
            <div className="e2i-detail">
              <span className="e2i-tag" style={{ marginBottom: 6, display: 'block' }}>
                {language === 'pt' ? 'FATORES DO ÍNDICE' : 'INDEX FACTORS'}
              </span>
              {factors.slice(0, 4).map(f => (
                <div key={f.key} className="e2i-frow">
                  <span>{FACTOR_LABEL[f.key][language]}</span>
                  <b>{f.value[language]}</b>
                </div>
              ))}
              {factors.length === 0 && (
                <div className="e2i-frow"><span>{language === 'pt' ? 'Sem dados ainda' : 'No data yet'}</span></div>
              )}
              {pathname !== '/dashboard' && (
                <Link href="/dashboard" className="e2i-open">
                  {language === 'pt' ? 'Abrir painel vivo' : 'Open living dashboard'}
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M2 8 8 2M4 2h4v4" fill="none" stroke={ACCENTS.cyan} strokeWidth="1.5" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
