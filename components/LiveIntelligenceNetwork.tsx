'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types (mirror lib/hazards/types.ts, kept local to the client) ────────────

type ProviderStatus = 'live' | 'syncing' | 'degraded' | 'offline' | 'not_configured' | 'unavailable_here'

interface Channel {
  key: string
  label: string
  dataType: string
  status: ProviderStatus
  required: boolean
  configured: boolean
  usingFallback: boolean
  primaryProvider: string
  activeProvider?: string
  fallbackProvider?: string
  official: boolean
  lastSuccessAt?: string
  dataAgeSeconds?: number
  message?: string
}

interface NetworkStatus {
  headline: string
  tone: 'mint' | 'amber' | 'red' | 'muted'
  liveCount: number
  configuredCount: number
  totalChannels: number
  degradedCount: number
  notConfiguredCount: number
  syncedAt: string
}

interface Snapshot {
  channels: Channel[]
  network: NetworkStatus
  fetchedAt: string
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg: '#0A0A0F', card: '#13131A', border: '#2A2A38',
  mint: '#00E5A0', purple: '#7C6BFF', red: '#FF6B6B', amber: '#FFB347',
  text: '#F0F0F8', muted: '#6B6B8A',
}

const STATUS_META: Record<ProviderStatus, { label: string; color: string }> = {
  live: { label: 'LIVE', color: C.mint },
  syncing: { label: 'SYNCING', color: C.purple },
  degraded: { label: 'DEGRADED', color: C.amber },
  offline: { label: 'OFFLINE', color: C.red },
  not_configured: { label: 'NOT CONFIGURED', color: C.muted },
  unavailable_here: { label: 'UNAVAILABLE HERE', color: C.muted },
}

const TONE_COLOR: Record<NetworkStatus['tone'], string> = {
  mint: C.mint, amber: C.amber, red: C.red, muted: C.muted,
}

const MONO = "'DM Mono', ui-monospace, 'SF Mono', monospace"

function ageLabel(iso?: string): string {
  if (!iso) return '—'
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (secs < 60) return `${secs} sec ago`
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`
  return `${Math.round(secs / 3600)} h ago`
}

// A discrete geometric mark per channel (no emojis).
function ChannelMark({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden focusable="false">
      <circle cx="7" cy="7" r="2.5" fill={color} />
      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LiveIntelligenceNetwork({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (force = false) => {
    if (lat == null || lng == null) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/hazards?lat=${lat}&lng=${lng}${force ? '&force=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setSnap(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [lat, lng])

  useEffect(() => { void load() }, [load])

  // Reduce-motion preference.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Auto-rotate the highlighted channel (paused when expanded or reduced-motion).
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    if (!snap || expanded || reduceMotion) return
    timer.current = setInterval(() => {
      setHighlight(h => (h + 1) % snap.channels.length)
    }, 4000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [snap, expanded, reduceMotion])

  // Refresh data periodically (respecting rate limits — server caches 60s).
  useEffect(() => {
    if (lat == null || lng == null) return
    const id = setInterval(() => void load(), 90_000)
    return () => clearInterval(id)
  }, [lat, lng, load])

  if (lat == null || lng == null) {
    return (
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <span style={{ ...styles.dot, background: C.muted }} />
          <span style={styles.title}>LIVE INTELLIGENCE NETWORK</span>
        </div>
        <p style={styles.subtitle}>Defina sua localização para ativar o monitoramento multi-canal.</p>
      </div>
    )
  }

  if (!snap) {
    return (
      <div style={styles.card} aria-busy>
        <div style={styles.headerRow}>
          <span style={{ ...styles.dot, background: C.purple }} />
          <span style={styles.title}>LIVE INTELLIGENCE NETWORK</span>
        </div>
        <p style={styles.subtitle}>{error ? 'Falha ao sincronizar. Toque para tentar novamente.' : 'Conectando aos canais…'}</p>
        {error && <button onClick={() => void load(true)} style={styles.retry}>Retry</button>}
      </div>
    )
  }

  const { channels, network } = snap
  const toneColor = TONE_COLOR[network.tone]
  const active = channels[highlight] ?? channels[0]
  const activeColor = STATUS_META[active.status].color

  return (
    <section
      style={{ ...styles.card, borderColor: toneColor + '55' }}
      aria-label="Live intelligence network status"
    >
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        style={styles.headerButton}
      >
        <div style={styles.headerRow}>
          <span
            style={{
              ...styles.dot,
              background: toneColor,
              ...(reduceMotion ? {} : { animation: 'eos-pulse 2s ease-in-out infinite' }),
              boxShadow: `0 0 8px ${toneColor}`,
            }}
          />
          <span style={styles.title}>LIVE INTELLIGENCE NETWORK</span>
          <span style={{ ...styles.chevron, transform: expanded ? 'rotate(180deg)' : 'none' }} aria-hidden>⌄</span>
        </div>
        <p style={styles.subtitle}>Multi-source hazard monitoring</p>

        <div style={{ ...styles.statusLine, color: toneColor }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, letterSpacing: '0.04em' }}>{network.headline}</span>
        </div>

        {/* Rotating highlighted channel */}
        <div style={styles.rotatorRow} aria-live="polite">
          <ChannelMark color={activeColor} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.rotatorLabel}>{active.label.toUpperCase()}</div>
            <div style={styles.rotatorMeta}>
              <span style={{ ...styles.statusPill, color: activeColor }}>{STATUS_META[active.status].label}</span>
              <span style={styles.metaDim}>Last signal: {ageLabel(active.lastSuccessAt ?? network.syncedAt)}</span>
            </div>
          </div>
        </div>

        <div style={styles.footerRow}>
          <span style={styles.footerStat}><b style={{ color: C.mint, fontFamily: MONO }}>{network.liveCount}</b> live</span>
          {network.degradedCount > 0 && <span style={styles.footerStat}><b style={{ color: C.amber, fontFamily: MONO }}>{network.degradedCount}</b> degraded</span>}
          {network.notConfiguredCount > 0 && <span style={styles.footerStat}><b style={{ color: C.muted, fontFamily: MONO }}>{network.notConfiguredCount}</b> to configure</span>}
          <span style={{ ...styles.footerStat, marginLeft: 'auto', fontFamily: MONO, color: C.muted }}>{ageLabel(network.syncedAt)}</span>
        </div>
      </button>

      {/* Expanded per-channel panel */}
      {expanded && (
        <div style={styles.expandWrap} role="region" aria-label="Channel details">
          {channels.map(ch => {
            const meta = STATUS_META[ch.status]
            return (
              <div key={ch.key} style={styles.channelRow}>
                <ChannelMark color={meta.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.channelTop}>
                    <span style={styles.channelName}>{ch.label}</span>
                    {ch.official && <span style={styles.officialBadge}>OFFICIAL SOURCE</span>}
                  </div>
                  <div style={styles.channelType}>{ch.dataType}</div>
                  {ch.message && <div style={styles.channelMsg}>{ch.message}</div>}
                  {ch.usingFallback && ch.fallbackProvider && (
                    <div style={styles.channelMsg}>Fallback ativo: {ch.fallbackProvider}</div>
                  )}
                  <div style={styles.channelMetaRow}>
                    <span style={{ fontFamily: MONO, color: C.muted }}>{ageLabel(ch.lastSuccessAt)}</span>
                    <span style={{ fontFamily: MONO, color: C.muted }}>· {ch.activeProvider ?? ch.primaryProvider}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ ...styles.statusPill, color: meta.color, borderColor: meta.color + '55', border: '1px solid', padding: '2px 8px', borderRadius: 999 }}>
                    {meta.label}
                  </span>
                  {(ch.status === 'offline' || ch.status === 'degraded') && (
                    <button onClick={() => void load(true)} disabled={loading} style={styles.retrySmall}>Retry</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes eos-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.82); } }`}</style>
    </section>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, fontFamily: "'DM Sans', -apple-system, sans-serif", color: C.text },
  headerButton: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' },
  headerRow: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  title: { fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: C.text },
  chevron: { marginLeft: 'auto', color: C.muted, fontSize: 16, lineHeight: 1, transition: 'transform 0.2s' },
  subtitle: { margin: '6px 0 0', fontSize: 12, color: C.muted, letterSpacing: '0.02em' },
  statusLine: { marginTop: 14, fontSize: 13 },
  rotatorRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, transition: 'opacity 0.4s' },
  rotatorLabel: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rotatorMeta: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' },
  statusPill: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', fontFamily: MONO },
  metaDim: { fontSize: 11, color: C.muted, fontFamily: MONO },
  footerRow: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' },
  footerStat: { fontSize: 11, color: C.muted },
  expandWrap: { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: 'grid', gap: 12 },
  channelRow: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  channelTop: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  channelName: { fontSize: 13, fontWeight: 600, color: C.text },
  officialBadge: { fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: C.mint, border: `1px solid ${C.mint}44`, background: `${C.mint}12`, borderRadius: 4, padding: '1px 6px', fontFamily: MONO },
  channelType: { fontSize: 11, color: C.muted, marginTop: 2 },
  channelMsg: { fontSize: 11, color: C.amber, marginTop: 3 },
  channelMetaRow: { display: 'flex', gap: 6, marginTop: 4, fontSize: 11 },
  retry: { marginTop: 12, padding: '8px 16px', background: `${C.mint}14`, border: `1px solid ${C.mint}44`, borderRadius: 8, color: C.mint, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  retrySmall: { padding: '3px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
}
