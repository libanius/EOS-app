'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTIVITIES, CATEGORY_LABELS, generateRecommendations } from '@/lib/weather/engine'
import type { WeatherSnapshot, ActivityId, ActivityCategory, WeatherRecommendation, RiskLevel } from '@/lib/weather/types'

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

function RecommendationCard({ rec }: { rec: WeatherRecommendation }) {
  const [open, setOpen] = useState(false)
  const color = RISK_COLOR[rec.risk]
  return (
    <div style={{
      border: `1px solid ${color}33`, borderRadius: 14,
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
            <div style={{ background: `${color}12`, border: `1px solid ${color}33`, borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: color }}>⏱ {rec.window}</span>
            </div>
          )}

          {rec.factors.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Data Used</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {rec.factors.map((f, i) => (
                  <span key={i} style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 6,
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
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>Checklist</p>
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

export default function WeatherPage() {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationSrc, setLocationSrc] = useState<'gps' | 'profile' | null>(null)
  const [activeActivities, setActiveActivities] = useState<Set<ActivityId>>(new Set())
  const [openCategories, setOpenCategories] = useState<Set<ActivityCategory>>(new Set(CATEGORIES))
  const [recommendations, setRecommendations] = useState<WeatherRecommendation[]>([])
  const watchRef = useRef<number | null>(null)

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
      const res = await fetch(`/api/weather-intelligence?lat=${lat}&lng=${lng}`)
      if (!res.ok) { setError('Could not load weather data.'); return }
      setSnapshot(await res.json())
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
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleCategory(cat: ActivityCategory) {
    setOpenCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
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

  return (
    <div style={{ padding: '16px 16px 120px', maxWidth: 600, margin: '0 auto' }}>

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
          style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', color: AC, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? '↻ Loading' : '↻ Refresh'}
        </button>
      </div>

      {error && <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#ff8c8c' }}>⚠ {error}</div>}

      {/* ── Active Alerts ── */}
      {(snapshot?.alerts ?? []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {snapshot!.alerts.map((alert, i) => (
            <div key={i} style={{ background: RISK_BG[alert.severity === 'CRITICAL' ? 'critical' : alert.severity === 'HIGH' ? 'high' : 'medium'], border: `1px solid ${RISK_COLOR[alert.severity === 'CRITICAL' ? 'critical' : alert.severity === 'HIGH' ? 'high' : 'medium']}44`, borderRadius: 10, padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: RISK_COLOR[alert.severity === 'CRITICAL' ? 'critical' : 'high'] }}>{alert.source} ALERT</span>
                {alert.expires && <span style={{ fontSize: 10, color: '#71717a' }}>Expires {fmtTime(alert.expires)}</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#f0f0f8', fontWeight: 600, lineHeight: 1.4 }}>{alert.headline}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Current Conditions Card ── */}
      {cur && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 10px' }}>
                <p style={{ margin: '0 0 2px', fontSize: 10, color: '#71717a' }}>{icon} {label}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f0f0f8' }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Air Quality */}
          {aqi && aqi.us_aqi != null && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              <div key={i} style={{ minWidth: 58, flexShrink: 0, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 4px' }}>
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
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#71717a', textTransform: 'uppercase' }}>3-Day Outlook</p>
          {snapshot.daily.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: i < snapshot.daily.length - 1 ? 8 : 0, borderBottom: i < snapshot.daily.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', marginBottom: i < snapshot.daily.length - 1 ? 8 : 0 }}>
              <span style={{ fontSize: 13, color: '#a1a1aa', width: 80 }}>{i === 0 ? 'Today' : fmtDate(d.date)}</span>
              <span style={{ fontSize: 18 }}>{d.condition ? (d.weather_code >= 95 ? '⛈' : d.weather_code >= 80 ? '🌧' : d.weather_code >= 61 ? '🌧' : d.weather_code >= 51 ? '🌦' : d.weather_code >= 45 ? '🌫' : d.weather_code >= 3 ? '☁️' : d.weather_code >= 2 ? '⛅' : '☀️') : '—'}</span>
              <span style={{ fontSize: 12, color: '#71717a' }}>UV {d.uv_max}</span>
              {d.precip_sum_in > 0 && <span style={{ fontSize: 12, color: '#7ec8e3' }}>🌧 {d.precip_sum_in.toFixed(2)}"</span>}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f8' }}>{Math.round(d.temp_max_f)}° <span style={{ color: '#71717a', fontWeight: 400 }}>{Math.round(d.temp_min_f)}°</span></span>
            </div>
          ))}
        </div>
      )}

      {/* ── Earthquakes ── */}
      {(snapshot?.earthquakes ?? []).length > 0 && (
        <div style={{ background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#ff8c8c', textTransform: 'uppercase' }}>🌍 Nearby Earthquakes (last 24h)</p>
          {snapshot!.earthquakes.map((eq, i) => (
            <p key={i} style={{ margin: i > 0 ? '4px 0 0' : 0, fontSize: 12, color: '#d4d4d8' }}>M{eq.magnitude.toFixed(1)} — {eq.place}</p>
          ))}
        </div>
      )}

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
            <div key={cat} style={{ marginBottom: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
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
            <RecommendationCard key={rec.activity_id} rec={rec} />
          ))}

          {/* Summary badge */}
          {recommendations.length > 0 && (() => {
            const critical = recommendations.filter(r => r.risk === 'critical').length
            const high     = recommendations.filter(r => r.risk === 'high').length
            return (critical > 0 || high > 0) ? (
              <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 10, padding: '10px 14px', marginTop: 4 }}>
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

      {/* Provider status footer */}
      {snapshot && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#4b4b6a', textTransform: 'uppercase' }}>Data Sources</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(snapshot.providers).map(([name, status]) => (
              <span key={name} style={{ fontSize: 10, color: status === 'ok' ? '#71717a' : '#ff6b6b', padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
                {status === 'ok' ? '✓' : '✗'} {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
