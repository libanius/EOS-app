'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLanguage, type Language, type MessageKey } from '@/lib/i18n'
import { useRouter } from 'next/navigation'
import LiveIntelligenceNetwork from '@/components/LiveIntelligenceNetwork'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenarioType =
  | 'hurricane'
  | 'earthquake'
  | 'fallout'
  | 'pandemic'
  | 'fire'
  | 'flood'
  | 'general'

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
// Mode type alias kept for documentation — actual value lives in IntelligenceResponse
// type Mode = 'CONNECTED' | 'LOCAL AI' | 'SURVIVAL'
type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

type Severity = 'CRITICAL' | 'HIGH' | 'WATCH' | 'MODERATE' | 'CLEAR'

interface MonitorAlert {
  source: string
  type: string
  severity: Severity
  headline: string
  expires: string | null
  url: string | null
}

interface WeatherCurrent {
  temp: number; unit: 'F' | 'C'
  wind_speed: string; wind_dir: string
  condition: string; rain_pct: number | null
  is_daytime: boolean
  hourly: Array<{ hour: string; temp: number; condition: string; rain_pct: number | null }>
}

interface MonitorData {
  alerts: MonitorAlert[]
  status: { weather: Severity; earthquake: Severity }
  current: WeatherCurrent | null
  cached_at: string
}

type AgentId = 'macgyver' | 'seal' | 'sas'

interface IntelligenceResponse {
  mode: 'CONNECTED' | 'LOCAL_AI' | 'SURVIVAL'
  priority: Priority
  risks: string[]
  immediate_actions: string[]
  short_term_actions: string[]
  mid_term_actions: string[]
  rulesApplied: string[]
  knowledgeSources: string[]
  raw_text?: string
  action_plan_id?: string
  agent?: AgentId
}

interface AgentMeta {
  id: AgentId
  name: string
  tagline: { pt: string; en: string }
  color: string
  // Minimal geometric glyph (no emoji) drawn per agent.
  glyph: React.ReactNode
}

const AGENTS: AgentMeta[] = [
  {
    id: 'macgyver',
    name: 'MacGyver',
    tagline: { pt: 'Improviso com o que você tem', en: 'Improvise with what you have' },
    color: '#ffb347',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a1.5 1.5 0 0 0 2.1 2.1l6-6a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.1-2.1z"/></svg>
    ),
  },
  {
    id: 'seal',
    name: 'Navy SEAL',
    tagline: { pt: 'Disciplina e execução sob pressão', en: 'Discipline and execution under pressure' },
    color: '#7c6bff',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>
    ),
  },
  {
    id: 'sas',
    name: 'SAS',
    tagline: { pt: 'Sobrevivência de campo prolongada', en: 'Long-duration field survival' },
    color: '#00e5a0',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18L12 4 3 20z"/><path d="M12 4v16"/></svg>
    ),
  },
]

// ─── Constants ────────────────────────────────────────────────────────────────

const SCENARIO_TYPES: { id: ScenarioType; labelKey: MessageKey }[] = [
  { id: 'hurricane', labelKey: 'scenario.hurricane' },
  { id: 'earthquake', labelKey: 'scenario.earthquake' },
  { id: 'fallout', labelKey: 'scenario.fallout' },
  { id: 'pandemic', labelKey: 'scenario.pandemic' },
  { id: 'fire', labelKey: 'scenario.fire' },
  { id: 'flood', labelKey: 'scenario.flood' },
  { id: 'general', labelKey: 'scenario.general' },
]

const LOADING_KEYS: MessageKey[] = [
  'scenario.loading1',
  'scenario.loading2',
  'scenario.loading3',
  'scenario.loading4',
]

const MODE_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  CONNECTED: {
    bg: 'rgba(0,229,160,0.12)',
    text: '#00e5a0',
    label: 'CONNECTED',
  },
  LOCAL_AI: {
    bg: 'rgba(255,185,60,0.12)',
    text: '#FFB347',
    label: 'LOCAL AI',
  },
  SURVIVAL: {
    bg: 'rgba(255,107,107,0.12)',
    text: '#ff6b6b',
    label: 'SURVIVAL',
  },
}

const PRIORITY_STYLES: Record<Priority, { color: string }> = {
  CRITICAL: { color: '#ff6b6b' },
  HIGH: { color: '#FFB347' },
  MEDIUM: { color: '#7c6bff' },
  LOW: { color: '#00e5a0' },
}

const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: '#ff6b6b',
  HIGH: '#FFB347',
  WATCH: '#f5d76e',
  MODERATE: '#7ec8e3',
  CLEAR: '#00e5a0',
}

// ─── Monitoring Panel ─────────────────────────────────────────────────────────

function MonitoringPanel({
  lat, lng,
  locationSource,
  onAnalyze,
}: {
  lat: number | null; lng: number | null
  locationSource: 'device' | 'profile' | null
  onAnalyze: (headline: string) => void
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchMonitor = useCallback(async () => {
    if (!lat || !lng) return
    setLoading(true)
    try {
      const res = await fetch(`/api/monitor?lat=${lat}&lng=${lng}&t=${Date.now()}`)
      if (res.ok) setData(await res.json())
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [lat, lng])

  useEffect(() => {
    fetchMonitor()
    if (!lat || !lng) return
    const id = setInterval(fetchMonitor, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchMonitor, lat, lng])

  if (!lat || !lng) {
    return (
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 4 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#71717a', lineHeight: 1.5 }}>{t('monitoring.noLocation')}</p>
        <button
          onClick={() => router.push('/ficha')}
          style={{ marginTop: 8, background: 'none', border: 'none', color: '#22c55e', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
        >
          {t('monitoring.setLocation')}
        </button>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 4 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#71717a' }}>{t('monitoring.loading')}</p>
      </div>
    )
  }

  const activeAlerts = data?.alerts.filter(a => a.severity !== 'CLEAR') ?? []
  const worstSeverity: Severity = activeAlerts.length > 0
    ? (activeAlerts[0].severity as Severity)
    : 'CLEAR'
  const borderColor = SEVERITY_COLOR[worstSeverity]

  return (
    <div style={{ border: `1px solid ${borderColor}55`, borderRadius: 12, overflow: 'hidden', marginBottom: 4 }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', background: `${borderColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: borderColor }}>
          {t('monitoring.title')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeAlerts.length > 0 && (
            <span style={{ fontSize: 11, color: borderColor, fontWeight: 600 }}>
              {activeAlerts.length} {t('monitoring.activeAlerts')}
            </span>
          )}
          {locationSource && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: locationSource === 'device' ? '#22c55e' : '#71717a', display: 'flex', alignItems: 'center', gap: 3 }}>
              {locationSource === 'device' ? '◉ GPS' : '◎ Salvo'}
            </span>
          )}
          {loading && <span style={{ fontSize: 10, color: '#71717a' }}>↻</span>}
        </div>
      </div>

      {/* Current weather card */}
      {data?.current && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#f0f0f8', lineHeight: 1 }}>
                {data.current.temp}°{data.current.unit}
              </span>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>{data.current.condition}</p>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#71717a', lineHeight: 1.6 }}>
              <div>💨 {data.current.wind_speed} {data.current.wind_dir}</div>
              {data.current.rain_pct != null && <div>🌧 {data.current.rain_pct}% chuva</div>}
            </div>
          </div>
          {/* Hourly strip */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {data.current.hourly.map((h, i) => (
              <div key={i} style={{ minWidth: 52, textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 4px', fontSize: 11 }}>
                <div style={{ color: '#71717a', marginBottom: 3 }}>{h.hour}</div>
                <div style={{ fontWeight: 700, color: '#f0f0f8' }}>{h.temp}°</div>
                {h.rain_pct != null && h.rain_pct > 0 && (
                  <div style={{ color: '#7ec8e3', marginTop: 2 }}>{h.rain_pct}%</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source status rows */}
      {data && (
        <div style={{ padding: '8px 14px', display: 'grid', gap: 6 }}>
          {[
            { key: 'weather', label: t('monitoring.weather'), sev: data.status.weather },
            { key: 'earthquake', label: t('monitoring.earthquake'), sev: data.status.earthquake },
          ].map(({ key, label, sev }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#a1a1aa' }}>{label}</span>
              <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', color: SEVERITY_COLOR[sev as Severity] }}>
                {t(`monitoring.severity.${sev}` as MessageKey)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Active alert cards */}
      {activeAlerts.slice(0, 2).map((alert, i) => (
        <div key={i} style={{ margin: '0 14px 10px', padding: '10px 12px', background: `${SEVERITY_COLOR[alert.severity as Severity]}10`, border: `1px solid ${SEVERITY_COLOR[alert.severity as Severity]}30`, borderRadius: 8 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#f5f5f5', lineHeight: 1.4 }}>{alert.headline}</p>
          <button
            onClick={() => onAnalyze(alert.headline)}
            style={{ background: 'none', border: 'none', color: SEVERITY_COLOR[alert.severity as Severity], fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >
            {t('monitoring.analyze')}
          </button>
        </div>
      ))}

      {data && activeAlerts.length === 0 && (
        <p style={{ margin: '0 14px 12px', fontSize: 12, color: '#52525b' }}>{t('monitoring.noAlerts')}</p>
      )}
    </div>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useTypewriter(
  targetText: string,
  active: boolean,
  intervalMs = 12
): { displayed: string; done: boolean } {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) {
      setDisplayed('')
      setDone(false)
      indexRef.current = 0
      return
    }

    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      if (indexRef.current >= targetText.length) {
        clearInterval(timerRef.current!)
        setDone(true)
        return
      }
      const next = indexRef.current + 1
      setDisplayed(targetText.slice(0, next))
      indexRef.current = next
    }, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [targetText, active, intervalMs])

  return { displayed, done }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingDots() {
  const { t } = useLanguage()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '32px 0' }}>
      {LOADING_KEYS.map((key, i) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: 0,
            animation: `eos-fade-in 0.3s ease forwards`,
            animationDelay: `${i * 0.3}s`,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--ac, #00e5a0)',
              flexShrink: 0,
              animation: `eos-blink 1.4s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
          <span
            style={{
              fontSize: 13,
              color: 'var(--mu, #6b6b8a)',
              fontFamily: 'inherit',
            }}
          >
            {t(key)}
          </span>
        </div>
      ))}
    </div>
  )
}

function StreamOutput({
  streamBuffer,
  response,
  status,
}: {
  streamBuffer: string
  response: IntelligenceResponse | null
  status: Status
}) {
  const { language } = useLanguage()
  const isDone = status === 'done' && !!response
  const displayText = isDone && response
    ? formatResponse(response, language)
    : streamBuffer

  // Typewriter only animates while streaming. On "done" we render the full
  // formatted response directly — this avoids a bug where the typewriter index,
  // left mid-stream, would freeze on the (token-truncated) raw buffer and never
  // reveal the complete parsed text.
  const { displayed, done: twDone } = useTypewriter(
    displayText,
    status === 'streaming'
  )
  const shown = isDone ? displayText : displayed

  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    if (twDone || isDone) {
      const t = setTimeout(() => setShowCursor(false), 800)
      return () => clearTimeout(t)
    }
    setShowCursor(true)
  }, [twDone, isDone])

  return (
    <div
      style={{
        fontFamily:
          "ui-monospace, 'SF Mono', 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 1.7,
        color: 'var(--tx, #f0f0f8)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: 200,
      }}
    >
      {shown}
      {showCursor && !twDone && !isDone && (
        <span
          style={{
            color: 'var(--ac, #00e5a0)',
            animation: 'eos-cursor 1s step-end infinite',
          }}
        >
          ▋
        </span>
      )}
    </div>
  )
}

function formatResponse(r: IntelligenceResponse, language: Language): string {
  const lines: string[] = []
  const labels = language === 'pt'
    ? { priority: 'PRIORIDADE', risks: 'RISCOS', immediate: 'AÇÕES IMEDIATAS (15 min)', short: 'CURTO PRAZO (1 hora)', mid: 'MÉDIO PRAZO (3 horas)' }
    : { priority: 'PRIORITY', risks: 'RISKS', immediate: 'IMMEDIATE ACTIONS (15 min)', short: 'SHORT TERM (1 hour)', mid: 'MID TERM (3 hours)' }

  lines.push(`${labels.priority}: ${r.priority}`)
  lines.push('')

  if (r.risks.length > 0) {
    lines.push(`${labels.risks}:`)
    r.risks.forEach((risk) => lines.push(`· ${risk}`))
    lines.push('')
  }

  if (r.immediate_actions.length > 0) {
    lines.push(`${labels.immediate}:`)
    r.immediate_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
    lines.push('')
  }

  if (r.short_term_actions.length > 0) {
    lines.push(`${labels.short}:`)
    r.short_term_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
    lines.push('')
  }

  if (r.mid_term_actions.length > 0) {
    lines.push(`${labels.mid}:`)
    r.mid_term_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
  }

  return lines.join('\n')
}

function ModeBadge({ mode }: { mode: string }) {
  const style = MODE_STYLES[mode] || MODE_STYLES.SURVIVAL
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: style.bg,
        color: style.text,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '1.2px',
        padding: '4px 10px',
        borderRadius: 20,
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: style.text,
          animation: 'eos-blink 1.4s ease-in-out infinite',
        }}
      />
      {style.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const { color } = PRIORITY_STYLES[priority] || PRIORITY_STYLES.LOW
  return (
    <span
      style={{
        display: 'inline-block',
        background: `${color}20`,
        color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '1.2px',
        padding: '4px 10px',
        borderRadius: 20,
        textTransform: 'uppercase',
        border: `1px solid ${color}40`,
      }}
    >
      {priority}
    </span>
  )
}

function CollapsibleRules({ rules }: { rules: string[] }) {
  const [open, setOpen] = useState(false)
  const { t } = useLanguage()

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--mu, #6b6b8a)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.5px',
          padding: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            fontSize: 10,
          }}
        >
          ▶
        </span>
        {t('scenario.rules')} ({rules.length})
      </button>

      {open && (
        <ul
          style={{
            listStyle: 'none',
            margin: '8px 0 0',
            padding: '0 0 0 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {rules.map((rule) => (
            <li
              key={rule}
              style={{
                fontSize: 11,
                color: 'var(--mu, #6b6b8a)',
                fontFamily: "ui-monospace, 'SF Mono', monospace",
              }}
            >
              · {rule}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ScenarioPage() {
  const { t, language } = useLanguage()
  const [selectedType, setSelectedType] = useState<ScenarioType>('general')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [streamBuffer, setStreamBuffer] = useState('')
  const [response, setResponse] = useState<IntelligenceResponse | null>(null)
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationSource, setLocationSource] = useState<'device' | 'profile' | null>(null)

  // Fallback: saved profile coords
  useEffect(() => {
    fetch('/api/profile/ficha')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const lat = d?.ficha?.location_lat
        const lng = d?.ficha?.location_lng
        if (typeof lat === 'number' && typeof lng === 'number') {
          setCoords(prev => prev ?? { lat, lng })
          setLocationSource(src => src ?? 'profile')
        }
      })
      .catch(() => {})
  }, [])

  // Primary: device GPS — takes over whenever available
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationSource('device')
      },
      () => { /* silently fall back to profile coords */ },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const abortRef = useRef<AbortController | null>(null)

  const handleAnalyzeFromMonitor = useCallback((headline: string) => {
    setDescription(headline)
    setSelectedType('general')
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleGenerate = useCallback(async (agent?: AgentId) => {
    if (!description.trim() || status === 'loading' || status === 'streaming')
      return

    // Abort any previous request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setActiveAgent(agent ?? null)
    setStatus('loading')
    setStreamBuffer('')
    setResponse(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenario: description,
          scenarioType: selectedType,
          ...(agent ? { agent } : {}),
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream reader')

      const decoder = new TextDecoder()
      let buffer = ''

      setStatus('streaming')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)

          try {
            const parsed = JSON.parse(jsonStr)

            if (parsed.token !== undefined) {
              setStreamBuffer((prev) => prev + parsed.token)
            }

            if (parsed.done && parsed.response) {
              setResponse(parsed.response)
              setStatus('done')
            }
          } catch {
            // Partial JSON — continue
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return

      console.error('[EOS] Stream error:', err)
      showToast(t('scenario.connectionError'))
      setStatus('error')

      // Show survival mode fallback
      setResponse({
        mode: 'SURVIVAL',
        priority: 'MEDIUM',
        risks: [t('scenario.networkRisk')],
        immediate_actions: [
          t('scenario.localResources'),
          t('scenario.familyCommunication'),
        ],
        short_term_actions: [],
        mid_term_actions: [],
        rulesApplied: ['NETWORK_ERROR: fallback_to_survival'],
        knowledgeSources: ['Rules Engine (offline)'],
      })
    }
  }, [description, selectedType, status, t])

  const isLoading = status === 'loading'
  const isStreaming = status === 'streaming'
  const isActive = isLoading || isStreaming
  const hasResult = status === 'done' || status === 'error'
  const canSubmit = description.trim().length > 0 && !isActive

  return (
    <>
      {/* Global animation styles */}
      <style>{`
        @keyframes eos-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes eos-cursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes eos-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .eos-chip {
          padding: 7px 13px;
          border-radius: 20px;
          border: 1px solid var(--bd, #2a2a38);
          background: var(--sf2, #1c1c27);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          color: var(--tx, #f0f0f8);
          transition: all 0.15s;
          white-space: nowrap;
        }
        .eos-chip.on {
          background: var(--ac, #00e5a0);
          color: #0a0a0f;
          border-color: var(--ac, #00e5a0);
        }
        .eos-chip:active { opacity: 0.75; }
        .eos-textarea {
          width: 100%;
          background: var(--sf2, #1c1c27);
          border: 1px solid var(--bd, #2a2a38);
          border-radius: 10px;
          color: var(--tx, #f0f0f8);
          font-size: 14px;
          line-height: 1.6;
          padding: 12px;
          resize: vertical;
          min-height: 120px;
          font-family: inherit;
          transition: border-color 0.15s;
          outline: none;
          box-sizing: border-box;
        }
        .eos-textarea:focus {
          border-color: var(--ac, #00e5a0);
          box-shadow: 0 0 0 1px var(--ac, #00e5a0);
        }
        .eos-textarea::placeholder {
          color: var(--mu, #6b6b8a);
        }
        .btn {
          padding: 13px 18px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: opacity 0.15s;
          font-family: inherit;
        }
        .btn:active { opacity: 0.75; }
        .bp {
          background: var(--ac, #00e5a0);
          color: #0a0a0f;
        }
        .bp:disabled {
          background: var(--bd, #2a2a38);
          color: var(--mu, #6b6b8a);
          cursor: not-allowed;
          opacity: 1;
        }
        .bfull { width: 100%; display: block; }
        .card {
          background: var(--sf, #13131a);
          border: 1px solid var(--bd, #2a2a38);
          border-radius: 16px;
          padding: 16px;
        }
        .ct {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          color: var(--mu, #6b6b8a);
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        /* Toast */
        .eos-toast {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255,107,107,0.95);
          color: #fff;
          padding: 12px 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          z-index: 999;
          pointer-events: none;
          animation: eos-fade-in 0.3s ease;
          white-space: nowrap;
        }

        @media (max-width: 767px) {
          .eos-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Toast */}
      {toast && <div className="eos-toast">{toast}</div>}

      {/* Page */}
      <div
        style={{
          padding: '20px 16px 100px',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1.2px',
              color: 'var(--mu, #6b6b8a)',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            {t('scenario.engine')}
          </p>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--tx, #f0f0f8)',
              margin: 0,
            }}
          >
            {t('scenario.title')}
          </h1>
        </div>

        {/* Main Grid */}
        <div
          className="eos-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '380px 1fr',
            gap: 24,
            alignItems: 'start',
          }}
        >
          {/* ── LEFT: Configuration ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Live Intelligence Network — real-time multi-channel status */}
            <LiveIntelligenceNetwork lat={coords?.lat ?? null} lng={coords?.lng ?? null} />

            {/* Monitoring Panel */}
            <MonitoringPanel
              lat={coords?.lat ?? null}
              lng={coords?.lng ?? null}
              locationSource={locationSource}
              onAnalyze={handleAnalyzeFromMonitor}
            />

            {/* Scenario Type */}
            <div className="card">
              <div className="ct">{t('scenario.type')}</div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {SCENARIO_TYPES.map(({ id, labelKey }) => (
                  <button
                    key={id}
                    className={`eos-chip${selectedType === id ? ' on' : ''}`}
                    onClick={() => setSelectedType(id)}
                    disabled={isActive}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Scenario Description */}
            <div className="card">
              <div className="ct">{t('scenario.description')}</div>
              <textarea
                className="eos-textarea"
                placeholder={t('scenario.placeholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isActive}
              />
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--mu, #6b6b8a)',
                  margin: '8px 0 0',
                }}
              >
                {description.length}/2000 {t('scenario.characters')}
              </p>
            </div>

            {/* Submit */}
            <button
              className="btn bp bfull"
              onClick={() => handleGenerate()}
              disabled={!canSubmit}
            >
              {isLoading
                ? t('scenario.analyzing')
                : isStreaming
                ? t('scenario.generating')
                : t('scenario.generate')}
            </button>
          </div>

          {/* ── RIGHT: Output ── */}
          <div className="card" style={{ minHeight: 400 }}>
            {status === 'idle' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 320,
                  color: 'var(--mu, #6b6b8a)',
                  fontSize: 14,
                  textAlign: 'center',
                  padding: 32,
                }}
              >
                {t('scenario.empty')}
              </div>
            )}

            {isLoading && <LoadingDots />}

            {(isStreaming || hasResult) && (
              <>
                <StreamOutput
                  streamBuffer={streamBuffer}
                  response={response}
                  status={status}
                />

                {/* Footer badges — shown when done */}
                {hasResult && response && (
                  <div
                    style={{
                      marginTop: 24,
                      paddingTop: 16,
                      borderTop: '1px solid var(--bd, #2a2a38)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {/* Mode + Priority + active agent */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                    >
                      <ModeBadge mode={response.mode} />
                      <PriorityBadge priority={response.priority} />
                      {response.agent && (() => {
                        const a = AGENTS.find(x => x.id === response.agent)
                        return a ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: a.color, background: `${a.color}18`, border: `1px solid ${a.color}44`, padding: '4px 10px', borderRadius: 20 }}>
                            <span style={{ color: a.color, display: 'inline-flex' }}>{a.glyph}</span>
                            {a.name}
                          </span>
                        ) : null
                      })()}
                    </div>

                    {/* Rules */}
                    {response.rulesApplied.length > 0 && (
                      <CollapsibleRules rules={response.rulesApplied} />
                    )}

                    {/* Knowledge sources */}
                    {response.knowledgeSources.length > 0 && (
                      <p
                        style={{
                          fontSize: 11,
                          color: 'var(--mu, #6b6b8a)',
                          margin: 0,
                        }}
                      >
                        {t('scenario.sources')}:{' '}
                        {response.knowledgeSources.join(' · ')}
                      </p>
                    )}

                    {/* ── Survival specialists (D-044): deepen the base analysis ── */}
                    <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid var(--bd, #2a2a38)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--mu, #6b6b8a)', textTransform: 'uppercase', marginBottom: 4 }}>
                        {language === 'en' ? 'Survival specialists' : 'Especialistas de sobrevivência'}
                      </div>
                      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--mu, #6b6b8a)', lineHeight: 1.5 }}>
                        {language === 'en'
                          ? 'Re-run the plan through a specialist perspective.'
                          : 'Refaça o plano pela ótica de um especialista.'}
                      </p>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {AGENTS.map(a => {
                          const on = activeAgent === a.id
                          return (
                            <button
                              key={a.id}
                              onClick={() => handleGenerate(a.id)}
                              disabled={isActive}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                padding: '10px 12px', borderRadius: 12, cursor: isActive ? 'default' : 'pointer',
                                textAlign: 'left', fontFamily: 'inherit',
                                background: on ? `${a.color}14` : 'var(--sf2, #1c1c27)',
                                border: `1px solid ${on ? a.color : 'var(--bd, #2a2a38)'}`,
                                opacity: isActive && !on ? 0.55 : 1,
                                transition: 'all 0.15s',
                              }}
                            >
                              <span style={{ display: 'inline-flex', color: a.color, flexShrink: 0 }}>{a.glyph}</span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--tx, #f0f0f8)' }}>{a.name}</span>
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--mu, #6b6b8a)' }}>{a.tagline[language === 'en' ? 'en' : 'pt']}</span>
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: a.color, flexShrink: 0 }}>
                                {on ? (language === 'en' ? 'ACTIVE' : 'ATIVO') : '→'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
