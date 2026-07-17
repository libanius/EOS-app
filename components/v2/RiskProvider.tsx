'use client'

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import type { WeatherSnapshot, HourlyForecast } from '@/lib/weather/types'
import { riskToState, type RiskState } from './tokens'

/**
 * RiskProvider — the app-wide risk state machine.
 * Bootstraps location (profile → GPS), polls weather-intelligence,
 * derives the composite risk index, and exposes it to every screen —
 * the Global Risk Island and the dashboard both read from here.
 */

export type RiskFactor = {
  key: 'wind' | 'rain' | 'vis' | 'night' | 'alerts' | 'quake'
  value: { pt: string; en: string }
  weight: number
}

export type Escalation = { inHours: number; to: RiskState }

type RiskCtx = {
  snapshot: WeatherSnapshot | null
  score: number | null
  factors: RiskFactor[]
  state: RiskState
  escalation: Escalation | null
  /** true while the ESCALADA brief is on screen in the island ticker —
      instruments (dial LED) light up in sync with it */
  escFlash: boolean
  setEscFlash: (on: boolean) => void
  loading: boolean
  error: boolean
  hasCoords: boolean
  requestGps: () => void
  refresh: () => void
}

const Ctx = createContext<RiskCtx | null>(null)

export function useRisk() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRisk must be used within RiskProvider')
  return ctx
}

const toKmh = (mph: number) => Math.round(mph * 1.609)
const toKmTxt = (mi: number) => (mi * 1.609).toFixed(1)

export function deriveRisk(s: WeatherSnapshot): { score: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = []
  let r = 6

  const gust = s.current.wind_gust_mph
  const wWind = Math.pow(Math.min(1, gust / 70), 1.3) * 34
  r += wWind
  factors.push({ key: 'wind', weight: wWind, value: { pt: `${toKmh(gust)} km/h`, en: `${Math.round(gust)} mph` } })

  const prob = Math.max(s.current.precip_prob_pct, ...s.hourly.slice(0, 6).map(h => h.precip_prob_pct))
  const wRain = (prob / 100) * 18
  r += wRain
  factors.push({ key: 'rain', weight: wRain, value: { pt: `${Math.round(prob)}%`, en: `${Math.round(prob)}%` } })

  const vis = s.current.visibility_mi
  const wVis = vis < 6 ? ((6 - vis) / 6) * 12 : 0
  if (wVis > 0) {
    r += wVis
    factors.push({ key: 'vis', weight: wVis, value: { pt: `${toKmTxt(vis)} km`, en: `${vis.toFixed(1)} mi` } })
  }

  if (!s.current.is_daytime) {
    r += 6
    factors.push({ key: 'night', weight: 6, value: { pt: '+6', en: '+6' } })
  }

  const sev = { MODERATE: 8, WATCH: 12, HIGH: 24, CRITICAL: 42 } as const
  const wAlerts = s.alerts.reduce((acc, a) => acc + (sev[a.severity] ?? 6), 0)
  if (wAlerts > 0) {
    const w = Math.min(46, wAlerts)
    r += w
    factors.push({ key: 'alerts', weight: w, value: { pt: String(s.alerts.length), en: String(s.alerts.length) } })
  }

  const quake = s.earthquakes.some(q => q.severity === 'CRITICAL') ? 22
    : s.earthquakes.some(q => q.severity === 'HIGH') ? 12 : 0
  if (quake) {
    r += quake
    factors.push({ key: 'quake', weight: quake, value: { pt: String(s.earthquakes.length), en: String(s.earthquakes.length) } })
  }

  factors.sort((a, b) => b.weight - a.weight)
  return { score: Math.max(2, Math.min(99, Math.round(r))), factors }
}

/** worst 3-hour stretch in the next 24h — the "risk window" */
export function riskWindow(hourly: HourlyForecast[]): { hour: number; level: number } | null {
  const H = hourly.slice(0, 24)
  if (H.length < 3) return null
  const hz = (h: HourlyForecast) => {
    const hr = new Date(h.time_iso).getHours()
    return Math.min(1, (h.precip_prob_pct / 100) * 0.55 + Math.min(1, h.wind_gust_mph / 60) * 0.4 + (hr < 6 || hr >= 19 ? 0.12 : 0))
  }
  let worst = 0
  let idx = -1
  for (let i = 0; i + 2 < H.length; i++) {
    const v = hz(H[i]) + hz(H[i + 1]) + hz(H[i + 2])
    if (v > worst) { worst = v; idx = i + 1 }
  }
  if (idx < 0 || worst / 3 <= 0.42) return null
  return { hour: new Date(H[idx].time_iso).getHours(), level: worst / 3 }
}

const STATE_RANK: Record<RiskState, number> = { safe: 0, watch: 1, warning: 2, critical: 3 }

/**
 * Project the risk index hour by hour over the next 12h (assuming current
 * alerts persist). Returns the first hour where the projected state ranks
 * ABOVE the current one — the escalation the island announces in advance.
 */
export function projectEscalation(s: WeatherSnapshot, currentState: RiskState): Escalation | null {
  const sev = { MODERATE: 8, WATCH: 12, HIGH: 24, CRITICAL: 42 } as const
  const alertsW = Math.min(46, s.alerts.reduce((acc, a) => acc + (sev[a.severity] ?? 6), 0))
  const quakeW = s.earthquakes.some(q => q.severity === 'CRITICAL') ? 22
    : s.earthquakes.some(q => q.severity === 'HIGH') ? 12 : 0

  for (let i = 1; i <= Math.min(12, s.hourly.length - 1); i++) {
    const h = s.hourly[i]
    let r = 6 + alertsW + quakeW
    r += Math.pow(Math.min(1, h.wind_gust_mph / 70), 1.3) * 34
    r += (h.precip_prob_pct / 100) * 18
    if (h.visibility_mi < 6) r += ((6 - h.visibility_mi) / 6) * 12
    const hr = new Date(h.time_iso).getHours()
    if (hr < 6 || hr >= 19) r += 6
    const st = riskToState(Math.max(2, Math.min(99, Math.round(r))))
    if (STATE_RANK[st] > STATE_RANK[currentState]) return { inHours: i, to: st }
  }
  return null
}

const REFRESH_MS = 10 * 60 * 1000

export default function RiskProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [forced, setForced] = useState<RiskState | null>(null)
  const [escFlash, setEscFlash] = useState(false)
  const watchRef = useRef<number | null>(null)
  const pathname = usePathname()

  // preview overrides (?risk=critical, ?esc=3:warning) — read per navigation,
  // no useSearchParams bailout
  const [forcedEsc, setForcedEsc] = useState<Escalation | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const q = p.get('risk')
    setForced(q === 'safe' || q === 'watch' || q === 'warning' || q === 'critical' ? q : null)
    const e = p.get('esc')?.split(':')
    setForcedEsc(
      e && e.length === 2 && ['watch', 'warning', 'critical'].includes(e[1])
        ? { inHours: Math.max(1, parseInt(e[0], 10) || 3), to: e[1] as RiskState }
        : null,
    )
  }, [pathname])

  useEffect(() => {
    fetch('/api/profile/ficha')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const lat = d?.ficha?.location_lat
        const lng = d?.ficha?.location_lng
        if (typeof lat === 'number' && typeof lng === 'number') {
          setCoords(prev => prev ?? { lat, lng })
        } else {
          setLoading(l => (l && !coords ? false : l))
        }
      })
      .catch(() => setLoading(false))
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
      )
    }
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchSnapshot = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    setError(false)
    try {
      const r = await fetch(`/api/weather-intelligence?lat=${lat}&lng=${lng}`)
      if (!r.ok) { setError(true); return }
      setSnapshot(await r.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!coords) return
    fetchSnapshot(coords.lat, coords.lng)
    const id = setInterval(() => fetchSnapshot(coords.lat, coords.lng), REFRESH_MS)
    return () => clearInterval(id)
  }, [coords, fetchSnapshot])

  const derived = snapshot ? deriveRisk(snapshot) : null
  const state: RiskState = forced ?? (derived ? riskToState(derived.score) : 'safe')
  const escalation = forcedEsc ?? (snapshot && state !== 'critical' ? projectEscalation(snapshot, state) : null)

  const requestGps = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(p =>
      setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
    )
  }, [])

  const refresh = useCallback(() => {
    if (coords) fetchSnapshot(coords.lat, coords.lng)
  }, [coords, fetchSnapshot])

  return (
    <Ctx.Provider
      value={{
        snapshot,
        score: derived?.score ?? null,
        factors: derived?.factors ?? [],
        state,
        escalation,
        escFlash,
        setEscFlash,
        loading,
        error,
        hasCoords: coords !== null,
        requestGps,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
