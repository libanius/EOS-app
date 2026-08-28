'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage, type MessageKey } from '@/lib/i18n'
import type {
  HazardChannel,
  NetworkHeadlineKey,
  NetworkStatus,
  ProviderStatus as HazardProviderStatus,
} from '@/lib/hazards/types'

// ─── Types (mirror lib/hazards/types.ts, kept local to the client) ────────────

/*
 * Os tipos vêm de `lib/hazards/types.ts`, a fonte única.
 *
 * Este arquivo mantinha CÓPIAS locais de `ProviderStatus`, `Channel` e
 * `NetworkStatus`, escritas à mão a partir do que a rota devolvia. Elas já
 * tinham começado a divergir: `headlineKey` nasceu no tipo canônico e esta tela
 * não o enxergava, então o compilador não podia avisar que a cópia estava
 * velha. Um tipo duplicado é um contrato que ninguém assinou.
 */
type ProviderStatus = HazardProviderStatus
type Channel = HazardChannel

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

// A cor é do desenho e não muda com o idioma; só o rótulo é traduzido.
const STATUS_META: Record<ProviderStatus, { key: MessageKey; color: string }> = {
  live: { key: 'lin.statusLive', color: C.mint },
  syncing: { key: 'lin.statusSyncing', color: C.purple },
  degraded: { key: 'lin.statusDegraded', color: C.amber },
  offline: { key: 'lin.statusOffline', color: C.red },
  not_configured: { key: 'lin.statusNotConfigured', color: C.muted },
  unavailable_here: { key: 'lin.statusUnavailableHere', color: C.muted },
}

/**
 * Exportado porque a linha "Fontes de dados" da AlertsPage precisa do MESMO
 * título, no mesmo idioma. Ela injetava `network.headline` cru — a frase em
 * inglês do servidor — dentro de uma sentença em português, e saía
 * "6 de 9 canais ao vivo · using backup weather source".
 */
export const HEADLINE_KEY: Record<NetworkHeadlineKey, MessageKey> = {
  limited_coverage: 'lin.headlineLimited',
  partial_channels: 'lin.headlinePartial',
  backup_source: 'lin.headlineBackup',
  all_live: 'lin.headlineAllLive',
}

const TONE_COLOR: Record<NetworkStatus['tone'], string> = {
  mint: C.mint, amber: C.amber, red: C.red, muted: C.muted,
}

const MONO = "'DM Mono', ui-monospace, 'SF Mono', monospace"

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

function ageLabel(iso: string | undefined, t: Translate): string {
  if (!iso) return '—'
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (secs < 60) return t('lin.secAgo', { n: secs })
  if (secs < 3600) return t('lin.minAgo', { n: Math.round(secs / 60) })
  return t('lin.hAgo', { n: Math.round(secs / 3600) })
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
  const { t } = useLanguage()
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
          <span style={styles.title}>{t('lin.title')}</span>
        </div>
        <p style={styles.subtitle}>{t('lin.needLocation')}</p>
      </div>
    )
  }

  if (!snap) {
    return (
      <div style={styles.card} aria-busy>
        <div style={styles.headerRow}>
          <span style={{ ...styles.dot, background: C.purple }} />
          <span style={styles.title}>{t('lin.title')}</span>
        </div>
        <p style={styles.subtitle}>{error ? 'Falha ao sincronizar. Toque para tentar novamente.' : 'Conectando aos canais…'}</p>
        {error && <button onClick={() => void load(true)} style={styles.retry}>Retry</button>}
      </div>
    )
  }

  const { channels, network } = snap
  const toneColor = TONE_COLOR[network.tone]
  const active = channels[highlight] ?? channels[0]

  /*
   * O título do estado é RENDERIZADO da causa, não lido do texto do servidor.
   *
   * `network.headline` chega pronto e em inglês de `lib/hazards/health.ts` — e o
   * servidor não sabe em que idioma esta pessoa lê. `headlineKey` carrega a
   * RAZÃO ("está usando fonte reserva"), e a frase se monta aqui, com os
   * números que já vieram no mesmo objeto.
   */
  const headline = network.headlineKey === 'partial_channels'
    ? t('lin.headlinePartial', { live: network.liveCount, total: network.totalChannels })
    : t(HEADLINE_KEY[network.headlineKey])
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
          <span style={styles.title}>{t('lin.title')}</span>
          <span style={{ ...styles.chevron, transform: expanded ? 'rotate(180deg)' : 'none' }} aria-hidden>⌄</span>
        </div>
        <p style={styles.subtitle}>{t('lin.subtitle')}</p>

        <div style={{ ...styles.statusLine, color: toneColor }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, letterSpacing: '0.04em' }}>{headline}</span>
        </div>

        {/* Rotating highlighted channel */}
        <div style={styles.rotatorRow} aria-live="polite">
          <ChannelMark color={activeColor} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.rotatorLabel}>{active.label.toUpperCase()}</div>
            <div style={styles.rotatorMeta}>
              <span style={{ ...styles.statusPill, color: activeColor }}>{t(STATUS_META[active.status].key)}</span>
              <span style={styles.metaDim}>{t('lin.lastSignal', { age: ageLabel(active.lastSuccessAt ?? network.syncedAt, t) })}</span>
            </div>
          </div>
        </div>

        <div style={styles.footerRow}>
          <span style={styles.footerStat}><b style={{ color: C.mint, fontFamily: MONO }}>{network.liveCount}</b> {t('lin.live')}</span>
          {network.degradedCount > 0 && <span style={styles.footerStat}><b style={{ color: C.amber, fontFamily: MONO }}>{network.degradedCount}</b> {t('lin.degraded')}</span>}
          {network.notConfiguredCount > 0 && <span style={styles.footerStat}><b style={{ color: C.muted, fontFamily: MONO }}>{network.notConfiguredCount}</b> {t('lin.toConfigure')}</span>}
          <span style={{ ...styles.footerStat, marginLeft: 'auto', fontFamily: MONO, color: C.muted }}>{ageLabel(network.syncedAt, t)}</span>
        </div>
      </button>

      {/* Expanded per-channel panel */}
      {expanded && (
        <div style={styles.expandWrap} role="region" aria-label={t('lin.channelDetails')}>
          {channels.map(ch => {
            const meta = STATUS_META[ch.status]
            return (
              <div key={ch.key} style={styles.channelRow}>
                <ChannelMark color={meta.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.channelTop}>
                    <span style={styles.channelName}>{ch.label}</span>
                    {ch.official && <span style={styles.officialBadge}>{t('lin.officialSource')}</span>}
                  </div>
                  <div style={styles.channelType}>{ch.dataType}</div>
                  {ch.message && <div style={styles.channelMsg}>{ch.message}</div>}
                  {ch.usingFallback && ch.fallbackProvider && (
                    <div style={styles.channelMsg}>{t('lin.fallbackActive', { provider: ch.fallbackProvider })}</div>
                  )}
                  <div style={styles.channelMetaRow}>
                    <span style={{ fontFamily: MONO, color: C.muted }}>{ageLabel(ch.lastSuccessAt, t)}</span>
                    <span style={{ fontFamily: MONO, color: C.muted }}>· {ch.activeProvider ?? ch.primaryProvider}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ ...styles.statusPill, color: meta.color, borderColor: meta.color + '55', border: '1px solid', padding: '2px 8px', borderRadius: 999 }}>
                    {t(meta.key)}
                  </span>
                  {(ch.status === 'offline' || ch.status === 'degraded') && (
                    <button onClick={() => void load(true)} disabled={loading} style={styles.retrySmall}>{t('lin.retry')}</button>
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
