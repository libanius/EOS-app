'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTIVITIES, CATEGORY_LABELS, generateRecommendations } from '@/lib/weather/engine'
import { KITS } from '@/lib/checklist'
import type { WeatherSnapshot, ActivityId, ActivityCategory, WeatherRecommendation, RiskLevel } from '@/lib/weather/types'
import LiveIntelligenceNetwork from '@/components/LiveIntelligenceNetwork'
import type { HazardEvent, HazardClass, UpcomingPrecipitationResult, HazardNetworkSnapshot } from '@/lib/hazards/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const AC = '#00e5a0'
const RISK_COLOR: Record<RiskLevel, string> = {
  low:      '#00e5a0',
  medium:   '#ffb347',
  high:     '#ff8c42',
  critical: '#ff6b6b',
}
const RISK_BG: Record<RiskLevel, string> = {
  low:      'rgba(0,229,160,0.07)',
  medium:   'rgba(255,179,71,0.08)',
  high:     'rgba(255,140,66,0.10)',
  critical: 'rgba(255,107,107,0.10)',
}
const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'LOW', medium: 'MEDIUM', high: 'HIGH', critical: 'CRITICAL',
}

// Visual classification (D-043) — official warnings must read differently from
// detected events, forecasts, and EOS analysis.
const HAZARD_CLASS_META: Record<HazardClass, { label: string; color: string }> = {
  OFFICIAL_WARNING: { label: 'OFFICIAL WARNING', color: '#ff6b6b' },
  WATCH:            { label: 'WATCH',            color: '#ffb347' },
  ADVISORY:         { label: 'ADVISORY',         color: '#7c6bff' },
  DETECTED_EVENT:   { label: 'DETECTED EVENT',   color: '#56c2e6' },
  FORECAST:         { label: 'FORECAST',         color: '#8b9dff' },
  EOS_RISK_ANALYSIS:{ label: 'EOS RISK ANALYSIS',color: '#00e5a0' },
}

const PRECIP_INTENSITY_LABEL: Record<string, string> = {
  none: '', light: 'leve', moderate: 'moderada', heavy: 'forte',
}

const CATEGORIES: ActivityCategory[] = [
  'outdoor_recreation', 'water', 'air_drone', 'field_work', 'survival_prep', 'emergency_planning',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
function fmtHour(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
}
function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function aqiColor(aqi: number | null): string {
  if (aqi == null) return '#71717a'
  if (aqi <= 50)  return '#00e5a0'
  if (aqi <= 100) return '#ffee58'
  if (aqi <= 150) return '#ffb347'
  if (aqi <= 200) return '#ff6b6b'
  return '#9c27b0'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
      padding: '3px 8px', borderRadius: 4,
      background: RISK_BG[risk], color: RISK_COLOR[risk],
      border: `1px solid ${RISK_COLOR[risk]}44`,
    }}>
      {RISK_LABEL[risk]}
    </span>
  )
}

function RecommendationCard({ rec, onSave }: { rec: WeatherRecommendation; onSave?: (items: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const color = RISK_COLOR[rec.risk]
  return (
    <div style={{
      border: `1px solid ${color}33`, borderRadius: 20,
      background: RISK_BG[rec.risk], marginBottom: 10, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f8', flex: 1 }}>{rec.activity_label}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <RiskBadge risk={rec.risk} />
            <span style={{ color: '#71717a', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: color, fontWeight: 600, lineHeight: 1.4 }}>{rec.title}</p>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${color}22` }}>
          <p style={{ margin: '10px 0 8px', fontSize: 13, color: '#a1a1aa', lineHeight: 1.6 }}>{rec.reason}</p>

          {rec.window && (
            <div style={{ background: `${color}12`, border: `1px solid ${color}33`, borderRadius: 14, padding: '6px 10px', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: color }}>⏱ {rec.window}</span>
            </div>
          )}

          {rec.factors.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Data Used</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {rec.factors.map((f, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 12,
                    background: f.is_concern ? 'rgba(255,107,107,0.12)' : 'rgba(255,255,255,0.05)',
                    color: f.is_concern ? '#ff8c8c' : '#a1a1aa',
                    border: `1px solid ${f.is_concern ? 'rgba(255,107,107,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    {f.label}: <strong>{f.value}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {rec.checklist.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Checklist</p>
                {onSave && (
                  <button onClick={() => onSave(rec.checklist)} style={{
                    fontSize: 10, padding: '3px 8px', background: `${AC}18`, border: `1px solid ${AC}44`,
                    borderRadius: 12, color: AC, fontWeight: 700, cursor: 'pointer',
                  }}>+ Salvar no Kit</button>
                )}
              </div>
              {rec.checklist.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                  <span style={{ color: AC, fontSize: 12, marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.4 }}>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Rain nowcast card (D-043) ────────────────────────────────────────────────

const CONFIDENCE_LABEL: Record<string, string> = { low: 'baixa', medium: 'média', high: 'alta' }

function RainNowcast({ precip }: { precip: UpcomingPrecipitationResult | null }) {
  if (!precip || precip.eventType === 'no_precipitation') return null
  const cyan = '#56c2e6'
  const prob = Math.round(precip.probability * 100)
  const intensity = PRECIP_INTENSITY_LABEL[precip.intensity] || ''
  let title: string
  if (precip.eventType === 'rain_starting_soon') {
    title = `Chuva prevista para começar em aproximadamente ${precip.startsInMinutes} minutos.`
  } else if (precip.eventType === 'rain_ongoing') {
    title = `Chuva em andamento${precip.expectedDurationMinutes ? ` — deve durar cerca de ${precip.expectedDurationMinutes} min` : ''}.`
  } else {
    title = 'Chuva diminuindo nos próximos minutos.'
  }
  return (
    <div style={{ background: 'rgba(86,194,230,0.08)', border: `1px solid ${cyan}44`, borderRadius: 18, padding: '10px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: cyan }}>RAIN NOWCAST</span>
        <span style={{ fontSize: 10, color: '#71717a', fontFamily: "'DM Mono', ui-monospace, monospace" }}>{precip.source}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#f0f0f8', fontWeight: 600, lineHeight: 1.4 }}>{title}</p>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#a1a1aa' }}>
        {intensity && `Intensidade ${intensity} · `}{prob}% de probabilidade · confiança {CONFIDENCE_LABEL[precip.confidence] ?? precip.confidence}
      </p>
    </div>
  )
}

// ─── Classified hazard event card (D-043) ──────────────────────────────────────

function HazardEventCard({ ev }: { ev: HazardEvent }) {
  const meta = HAZARD_CLASS_META[ev.visualClass] ?? HAZARD_CLASS_META.ADVISORY
  return (
    <div style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}44`, borderRadius: 16, padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: meta.color }}>
          {meta.label}
          <span style={{ color: '#71717a', fontWeight: 600, marginLeft: 6, textTransform: 'uppercase' }}>· {ev.source}</span>
        </span>
        <span style={{ fontSize: 10, color: '#71717a', flexShrink: 0 }}>
          {ev.distanceMiles != null ? `~${Math.round(ev.distanceMiles)} mi` : ev.expiresAt ? `expira ${fmtTime(ev.expiresAt)}` : ''}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#f0f0f8', fontWeight: 600, lineHeight: 1.4 }}>{ev.title}</p>
      {ev.summary && ev.summary !== ev.title && (
        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#a1a1aa', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.summary}</p>
      )}
      {ev.officialUrl && (
        <a href={ev.officialUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: meta.color, fontWeight: 700, textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
          Fonte oficial →
        </a>
      )}
    </div>
  )
}

export default function WeatherPage() {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [hazards, setHazards] = useState<HazardNetworkSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationSrc, setLocationSrc] = useState<'gps' | 'profile' | null>(null)
  const [activeActivities, setActiveActivities] = useState<Set<ActivityId>>(new Set())
  const [openCategories, setOpenCategories] = useState<Set<ActivityCategory>>(new Set(CATEGORIES))
  const [recommendations, setRecommendations] = useState<WeatherRecommendation[]>([])
  const watchRef = useRef<number | null>(null)
  const [customActivity, setCustomActivity] = useState('')
  const [customLoading, setCustomLoading] = useState(false)
  const [customResult, setCustomResult] = useState<{
    risk: 'low' | 'medium' | 'high' | 'critical'
    title: string; reason: string; checklist: string[]; best_time: string | null
  } | null>(null)
  const [kitPicker, setKitPicker] = useState<{ items: string[] } | null>(null)
  const [saveKit, setSaveKit] = useState('BUG_OUT')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  // ── Location ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // Fallback: saved profile coords
    fetch('/api/profile/ficha').then(r => r.ok ? r.json() : null).then(d => {
      const lat = d?.ficha?.location_lat, lng = d?.ficha?.location_lng
      if (typeof lat === 'number' && typeof lng === 'number') {
        setCoords(prev => prev ?? { lat, lng })
        setLocationSrc(src => src ?? 'profile')
      }
    }).catch(() => {})

    // Primary: device GPS
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        pos => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setLocationSrc('gps')
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 },
      )
    }
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }
  }, [])

  // ── Fetch weather data ────────────────────────────────────────────────────

  const fetchData = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    setError(null)
    try {
      // Rich forecast (existing) + unified hazard network (new, D-043) in parallel.
      const [wRes, hRes] = await Promise.all([
        fetch(`/api/weather-intelligence?lat=${lat}&lng=${lng}`),
        fetch(`/api/hazards?lat=${lat}&lng=${lng}`).catch(() => null),
      ])
      if (!wRes.ok) { setError('Could not load weather data.'); return }
      setSnapshot(await wRes.json())
      if (hRes && hRes.ok) setHazards(await hRes.json())
    } catch { setError('Network error.') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (coords) fetchData(coords.lat, coords.lng)
  }, [coords, fetchData])

  // ── Recommendations engine (instant, client-side) ─────────────────────────

  useEffect(() => {
    if (!snapshot) { setRecommendations([]); return }
    setRecommendations(generateRecommendations(snapshot, Array.from(activeActivities)))
  }, [snapshot, activeActivities])

  // ── Toggle helpers ────────────────────────────────────────────────────────

  function toggleActivity(id: ActivityId) {
    setActiveActivities(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleCategory(cat: ActivityCategory) {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) { next.delete(cat) } else { next.add(cat) }
      return next
    })
  }

  function selectAll(cat: ActivityCategory) {
    const ids = ACTIVITIES.filter(a => a.category === cat).map(a => a.id)
    setActiveActivities(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }

  async function handleCustomActivity() {
    if (!customActivity.trim() || !snapshot) return
    setCustomLoading(true)
    setCustomResult(null)
    try {
      const res = await fetch('/api/weather-intelligence/custom-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: customActivity.trim(),
          current: snapshot.current,
          alert_count: snapshot.alerts.length,
        }),
      })
      if (res.ok) setCustomResult(await res.json())
    } finally { setCustomLoading(false) }
  }

  async function saveToKit(items: string[]) {
    setSaving(true)
    try {
      const res = await fetch('/api/checklist/save-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kitType: saveKit, items: items.map((name) => ({ name })) }),
      })
      if (res.ok) {
        setSavedMsg(`${items.length} itens salvos em ${KITS.find(k => k.type === saveKit)?.label ?? saveKit}`)
        setKitPicker(null)
        setTimeout(() => setSavedMsg(null), 4000)
      }
    } finally { setSaving(false) }
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (!coords && !loading) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📍</div>
      <p style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 12 }}>
        Allow location access or set your location in your Emergency Profile.
      </p>
      <a href="/ficha" style={{ color: AC, fontSize: 13, fontWeight: 700 }}>Set Location →</a>
    </div>
  )

  const cur = snapshot?.current
  const aqi = snapshot?.air_quality

  // Scoped into .wv2 so the page inherits the v2 type stack and tokens without
  // touching a single inline style — and therefore without touching behaviour.
  return (
    <div className="wv2 wv2-weather" data-risk="safe" data-ready="true">

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#71717a', textTransform: 'uppercase' }}>
            Weather Intelligence
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: locationSrc === 'gps' ? AC : '#71717a', fontWeight: 700 }}>
              {locationSrc === 'gps' ? '◉ GPS' : '◎ Saved'}
            </span>
            {snapshot && (
              <span style={{ fontSize: 10, color: '#4b4b6a' }}>
                · Updated {fmtTime(snapshot.fetched_at)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => coords && fetchData(coords.lat, coords.lng)}
          disabled={loading}
          style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', color: AC, borderRadius: 14, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? '↻ Loading' : '↻ Refresh'}
        </button>
      </div>

      {error && <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 16, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#ff8c8c' }}>⚠ {error}</div>}

      {/* ── Live Intelligence Network (D-043) — real multi-channel status ── */}
      <div style={{ marginBottom: 12 }}>
        <LiveIntelligenceNetwork lat={coords?.lat ?? null} lng={coords?.lng ?? null} />
      </div>

      {/* ── Rain Nowcast (D-043) — honest, never absolute ── */}
      <RainNowcast precip={hazards?.precipitation ?? null} />

      {/* ── Unified hazard events (classified official vs detected vs forecast) ── */}
      {hazards && hazards.events.length > 0 ? (
        <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
          {hazards.events.slice(0, 6).map(ev => (
            <HazardEventCard key={ev.id} ev={ev} />
          ))}
        </div>
      ) : (
        // Fallback to the legacy alert list only if the hazard network is unavailable.
        (snapshot?.alerts ?? []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {snapshot!.alerts.map((alert, i) => (
              <div key={i} style={{ background: RISK_BG[alert.severity === 'CRITICAL' ? 'critical' : alert.severity === 'HIGH' ? 'high' : 'medium'], border: `1px solid ${RISK_COLOR[alert.severity === 'CRITICAL' ? 'critical' : alert.severity === 'HIGH' ? 'high' : 'medium']}44`, borderRadius: 16, padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: RISK_COLOR[alert.severity === 'CRITICAL' ? 'critical' : 'high'] }}>{alert.source} ALERT</span>
                  {alert.expires && <span style={{ fontSize: 10, color: '#71717a' }}>Expires {fmtTime(alert.expires)}</span>}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#f0f0f8', fontWeight: 600, lineHeight: 1.4 }}>{alert.headline}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Current Conditions Card ── */}
      {cur && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, padding: 16, marginBottom: 12 }}>
          {/* Big temp + condition */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 56, fontWeight: 800, color: '#f0f0f8', lineHeight: 1 }}>{Math.round(cur.temp_f)}°</span>
                <span style={{ fontSize: 22, color: '#71717a' }}>F</span>
              </div>
              <div style={{ fontSize: 28, marginTop: -4 }}>{cur.condition_icon}</div>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#a1a1aa' }}>{cur.condition}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#71717a' }}>Feels like {Math.round(cur.feels_like_f)}°F</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: 6 }}>
                {cur.is_daytime
                  ? <span style={{ fontSize: 11, color: '#ffee58', fontWeight: 700 }}>☀️ Daytime</span>
                  : <span style={{ fontSize: 11, color: '#7ec8e3', fontWeight: 700 }}>🌙 Nighttime</span>}
              </div>
              {cur.sunrise_iso && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#71717a' }}>🌅 {fmtTime(cur.sunrise_iso)}</p>}
              {cur.sunset_iso  && <p style={{ margin: '0 0 2px', fontSize: 11, color: '#71717a' }}>🌇 {fmtTime(cur.sunset_iso)}</p>}
            </div>
          </div>

          {/* Metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: 'Humidity',  value: `${cur.humidity_pct}%`,              icon: '💧' },
              { label: 'Dew Point', value: `${Math.round(cur.dew_point_f)}°F`,  icon: '🌡' },
              { label: 'Pressure',  value: `${Math.round(cur.pressure_hpa)} hPa`,icon: '⬇' },
              { label: 'Wind',      value: `${Math.round(cur.wind_mph)} mph ${cur.wind_dir_label}`, icon: '💨' },
              { label: 'Gusts',     value: `${Math.round(cur.wind_gust_mph)} mph`, icon: '🌬' },
              { label: 'UV Index',  value: String(cur.uv_index),                icon: '☀' },
              { label: 'Cloud',     value: `${cur.cloud_cover_pct}%`,           icon: '☁' },
              { label: 'Visibility',value: `${cur.visibility_mi.toFixed(1)} mi`,icon: '👁' },
              { label: 'Rain',      value: `${cur.precip_prob_pct}%`,           icon: '🌧' },
            ].map(({ label, value, icon }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '8px 10px' }}>
                <p style={{ margin: '0 0 2px', fontSize: 10, color: '#71717a' }}>{icon} {label}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f0f0f8' }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Air Quality */}
          {aqi && aqi.us_aqi != null && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#a1a1aa' }}>💨 Air Quality</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: aqiColor(aqi.us_aqi) }}>AQI {aqi.us_aqi} — {aqi.category}</span>
                {aqi.pm25 != null && <span style={{ fontSize: 10, color: '#71717a', marginLeft: 8 }}>PM2.5: {aqi.pm25.toFixed(1)}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Hourly Strip ── */}
      {snapshot && snapshot.hourly.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Next 12 Hours</p>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {snapshot.hourly.slice(0, 12).map((h, i) => (
              <div key={i} style={{ minWidth: 58, flexShrink: 0, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '8px 4px' }}>
                <p style={{ margin: '0 0 3px', fontSize: 10, color: '#71717a' }}>{fmtHour(h.time_iso)}</p>
                <div style={{ fontSize: 16 }}>{h.condition_icon}</div>
                <p style={{ margin: '3px 0 2px', fontSize: 13, fontWeight: 700, color: '#f0f0f8' }}>{Math.round(h.temp_f)}°</p>
                {h.precip_prob_pct > 0 && <p style={{ margin: 0, fontSize: 10, color: '#7ec8e3' }}>{h.precip_prob_pct}%</p>}
                {h.wind_gust_mph > 20 && <p style={{ margin: 0, fontSize: 9, color: '#ffb347' }}>{Math.round(h.wind_gust_mph)}g</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3-Day Forecast ── */}
      {snapshot && snapshot.daily.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>3-Day Outlook</p>
          {snapshot.daily.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: i < snapshot.daily.length - 1 ? 8 : 0, borderBottom: i < snapshot.daily.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginBottom: i < snapshot.daily.length - 1 ? 8 : 0 }}>
              <span style={{ fontSize: 13, color: '#a1a1aa', width: 80 }}>{i === 0 ? 'Today' : fmtDate(d.date)}</span>
              <span style={{ fontSize: 18 }}>{d.condition ? (d.weather_code >= 95 ? '⛈' : d.weather_code >= 80 ? '🌧' : d.weather_code >= 61 ? '🌧' : d.weather_code >= 51 ? '🌦' : d.weather_code >= 45 ? '🌫' : d.weather_code >= 3 ? '☁️' : d.weather_code >= 2 ? '⛅' : '☀️') : '—'}</span>
              <span style={{ fontSize: 12, color: '#71717a' }}>UV {d.uv_max}</span>
              {d.precip_sum_in > 0 && <span style={{ fontSize: 12, color: '#7ec8e3' }}>🌧 {d.precip_sum_in.toFixed(2)}&quot;</span>}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f8' }}>{Math.round(d.temp_max_f)}° <span style={{ color: '#71717a', fontWeight: 400 }}>{Math.round(d.temp_min_f)}°</span></span>
            </div>
          ))}
        </div>
      )}

      {/* ── Earthquakes (fallback only — otherwise shown as classified hazard events) ── */}
      {!hazards && (snapshot?.earthquakes ?? []).length > 0 && (
        <div style={{ background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 18, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#ff8c8c', textTransform: 'uppercase' }}>🌍 Nearby Earthquakes (last 24h)</p>
          {snapshot!.earthquakes.map((eq, i) => (
            <p key={i} style={{ margin: i > 0 ? '4px 0 0' : 0, fontSize: 12, color: '#d4d4d8' }}>M{eq.magnitude.toFixed(1)} — {eq.place}</p>
          ))}
        </div>
      )}

      {/* ── Custom Activity ── */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Custom Activity Analysis</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={customActivity}
            onChange={e => { setCustomActivity(e.target.value); setCustomResult(null) }}
            onKeyDown={e => e.key === 'Enter' && void handleCustomActivity()}
            placeholder="Ex: observar as estrelas, pesca noturna, trilha…"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16, padding: '10px 14px', fontSize: 13, color: '#f0f0f8',
              outline: 'none',
            }}
          />
          <button
            onClick={() => void handleCustomActivity()}
            disabled={!customActivity.trim() || !snapshot || customLoading}
            style={{
              background: AC, color: '#0a0a0f', border: 'none', borderRadius: 16,
              padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              opacity: (!customActivity.trim() || !snapshot || customLoading) ? 0.4 : 1,
              flexShrink: 0,
            }}
          >
            {customLoading ? '…' : 'Analisar'}
          </button>
        </div>

        {customResult && (
          <div style={{
            marginTop: 10, border: `1px solid ${RISK_COLOR[customResult.risk]}44`,
            borderRadius: 18, background: RISK_BG[customResult.risk], padding: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f8' }}>{customActivity}</span>
              <RiskBadge risk={customResult.risk} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: RISK_COLOR[customResult.risk], fontWeight: 600 }}>{customResult.title}</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#a1a1aa', lineHeight: 1.5 }}>{customResult.reason}</p>
            {customResult.best_time && (
              <div style={{ marginBottom: 10, padding: '5px 10px', background: `${AC}12`, border: `1px solid ${AC}33`, borderRadius: 12 }}>
                <span style={{ fontSize: 12, color: AC, fontWeight: 700 }}>⏱ {customResult.best_time}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 6px' }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Checklist</p>
              <button onClick={() => setKitPicker({ items: customResult.checklist })} style={{
                fontSize: 10, padding: '3px 8px', background: `${AC}18`, border: `1px solid ${AC}44`,
                borderRadius: 12, color: AC, fontWeight: 700, cursor: 'pointer',
              }}>+ Salvar no Kit</button>
            </div>
            {customResult.checklist.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ color: AC, fontSize: 12, marginTop: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 12, color: '#d4d4d8', lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Activity Toggles ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Activity Intelligence</p>
          {activeActivities.size > 0 && (
            <button onClick={() => setActiveActivities(new Set())} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 11, cursor: 'pointer', padding: 0 }}>
              Clear all
            </button>
          )}
        </div>

        {CATEGORIES.map(cat => {
          const items = ACTIVITIES.filter(a => a.category === cat)
          const isOpen = openCategories.has(cat)
          const activeCount = items.filter(a => activeActivities.has(a.id)).length
          return (
            <div key={cat} style={{ marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
                <button
                  onClick={() => toggleCategory(cat)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1, padding: 0 }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#d4d4d8' }}>
                    {CATEGORY_LABELS[cat]}
                    {activeCount > 0 && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: AC }}>({activeCount})</span>}
                  </span>
                </button>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isOpen && (
                    <button onClick={() => selectAll(cat)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: 10, cursor: 'pointer', padding: 0 }}>All</button>
                  )}
                  <span style={{ color: '#71717a', fontSize: 13 }} onClick={() => toggleCategory(cat)}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '0 10px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.map(activity => {
                    const active = activeActivities.has(activity.id)
                    return (
                      <button
                        key={activity.id}
                        onClick={() => toggleActivity(activity.id)}
                        style={{
                          padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                          background: active ? AC : 'rgba(255,255,255,0.07)',
                          color: active ? '#0a0a0f' : '#a1a1aa',
                        }}
                      >
                        {activity.icon} {activity.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Recommendations ── */}
      {activeActivities.size > 0 && (
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>
            EOS Recommendations — {recommendations.length} activit{recommendations.length === 1 ? 'y' : 'ies'}
          </p>

          {!snapshot && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#71717a', fontSize: 13 }}>
              {loading ? '⏳ Loading weather data…' : '📡 Weather data needed for recommendations'}
            </div>
          )}

          {recommendations.map(rec => (
            <RecommendationCard key={rec.activity_id} rec={rec} onSave={(items) => { setKitPicker({ items }); setSaveKit('BUG_OUT') }} />
          ))}

          {/* Summary badge */}
          {recommendations.length > 0 && (() => {
            const critical = recommendations.filter(r => r.risk === 'critical').length
            const high     = recommendations.filter(r => r.risk === 'high').length
            return (critical > 0 || high > 0) ? (
              <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 16, padding: '10px 14px', marginTop: 4 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#ff8c8c', fontWeight: 600 }}>
                  {critical > 0 && `${critical} critical risk${critical > 1 ? 's' : ''}. `}
                  {high > 0 && `${high} high risk${high > 1 ? 's' : ''}. `}
                  Review before going out.
                </p>
              </div>
            ) : null
          })()}
        </div>
      )}

      {activeActivities.size === 0 && snapshot && (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: '#71717a', fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>☝️</div>
          Select activities above to get intelligent recommendations.
        </div>
      )}

      {/* Data sources — real per-channel status lives in the Live Intelligence
          Network at the top of this screen (honest states, not optimistic). */}
      {snapshot && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#4b4b6a', textTransform: 'uppercase' }}>Data Sources</p>
          <p style={{ margin: 0, fontSize: 11, color: '#71717a', lineHeight: 1.5 }}>
            {hazards
              ? `${hazards.network.liveCount}/${hazards.network.totalChannels} canais ao vivo · ${hazards.network.headline.toLowerCase()}. Toque em “Live Intelligence Network” acima para ver o estado real de cada fonte.`
              : 'Estado por canal disponível no “Live Intelligence Network” no topo desta tela.'}
          </p>
        </div>
      )}

      {/* Kit picker modal */}
      {kitPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px 32px',
        }} onClick={() => setKitPicker(null)}>
          <div style={{
            background: '#13131e', border: '1px solid #2a2a3a', borderRadius: 22,
            padding: 20, width: '100%', maxWidth: 440,
          }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#f0f0f8' }}>
              Salvar {kitPicker.items.length} itens no Kit
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#8a8a99' }}>Escolha o kit de destino:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {KITS.map((k) => (
                <button key={k.type} onClick={() => setSaveKit(k.type)} style={{
                  padding: '8px 14px', borderRadius: 16, cursor: 'pointer',
                  border: `1.5px solid ${saveKit === k.type ? k.color : '#2a2a3a'}`,
                  background: saveKit === k.type ? `${k.color}18` : 'transparent',
                  color: saveKit === k.type ? k.color : '#8a8a99',
                  fontSize: 13, fontWeight: 600,
                }}>
                  {k.icon} {k.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setKitPicker(null)} style={{
                flex: 1, padding: '10px 0', background: 'transparent', border: '1px solid #2a2a3a',
                borderRadius: 16, color: '#8a8a99', fontSize: 13, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={() => void saveToKit(kitPicker.items)} disabled={saving} style={{
                flex: 2, padding: '10px 0', background: saving ? '#2a2a3a' : AC,
                border: 'none', borderRadius: 16,
                color: saving ? '#8a8a99' : '#0a0a0f',
                fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
              }}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {savedMsg && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: '#22c55e', color: '#0a0a0f', padding: '10px 20px',
          borderRadius: 24, fontSize: 13, fontWeight: 700, zIndex: 300,
          boxShadow: '0 4px 20px rgba(34,197,94,.4)', whiteSpace: 'nowrap',
        }}>
          ✓ {savedMsg}
        </div>
      )}
    </div>
  )
}