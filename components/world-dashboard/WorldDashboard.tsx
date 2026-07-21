'use client'

/**
 * WorldDashboard — HWD-01 static prototype HUD (doc 16 §8).
 * Real React components over a world plate. Reads live RiskProvider data +
 * inventory/family/checklist. Family markers and route are MOCK and labeled.
 * No map SDK (MapLibre is HWD-02). Reversible: isolated /dashboard-world route.
 */

import { type UIEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'
import { useRisk } from '@/components/v2/RiskProvider'
import WorldMap from './WorldMap'
import type { WorldFamilyMember, WorldGuidance } from './WorldMap'
import type { MapBaseMode } from '@/lib/world/providers'
import type { WeatherSnapshot } from '@/lib/weather/types'
import './world-dashboard.css'

// World plates by risk state — clean Parkland aerials generated in Higgsfield
// (no baked HUD), so the real React HUD sits over an honest world. The plate
// changes with the live risk state (calm morning → pre-storm → severe storm).
const WORLD_PLATES: Record<string, string> = {
  safe: '/world/parkland-safe.webp',
  watch: '/world/parkland.webp',
  warning: '/world/parkland-storm.webp',
  critical: '/world/parkland-storm.webp',
}

// Demo location label for the static prototype. Real geocoding lands in HWD-03;
// the condition line below it is already live data.
const DEMO_LOCATION = 'Parkland'

const COPY = {
  pt: {
    eyebrow: 'EOS // WORLD', connectivity: 'Conexão', online: 'Online', offline: 'Offline',
    risk: 'Índice de risco', autonomy: 'Autonomia', days: 'dias',
    water: 'Água', food: 'Comida', checklist: 'Checklist', medical: 'Kit médico', comms: 'Comunicação',
    ok: 'OK', none: '—',
    alerts: 'Alertas ativos', clearBrief: 'Setor limpo — sem alertas', openScenario: 'Abrir cenário',
    yourArea: 'Sua área', mapSummary: 'Mapa da situação',
    temp: 'Temp', wind: 'Vento', aqi: 'AQI', uv: 'UV', hum: 'Umidade', vis: 'Visão',
    mapBase: 'Base do mapa', hybrid: 'Híbrido', dark: 'Dark',
    focusRoute: 'Focar rota', notifyFamily: 'Notificar família', notified: 'Família notificada',
    notifyUnavailable: 'Notificação indisponível', openChecklist: 'Checklist',
    needLocation: 'Preciso da sua localização para compor o mundo.', useGps: 'Usar GPS',
    loadErr: 'Não foi possível carregar.', retry: 'Tentar de novo',
    placeholderBg: 'Fundo provisório — troque pela imagem do Higgsfield',
    mockData: 'Dados de família e rota são simulados (mock)',
    family: 'Família', route: 'Rota', to: 'até',
  },
  en: {
    eyebrow: 'EOS // WORLD', connectivity: 'Link', online: 'Online', offline: 'Offline',
    risk: 'Risk index', autonomy: 'Autonomy', days: 'days',
    water: 'Water', food: 'Food', checklist: 'Checklist', medical: 'Medical kit', comms: 'Comms',
    ok: 'OK', none: '—',
    alerts: 'Active alerts', clearBrief: 'Sector clear — no alerts', openScenario: 'Open scenario',
    yourArea: 'Your area', mapSummary: 'Situation map',
    temp: 'Temp', wind: 'Wind', aqi: 'AQI', uv: 'UV', hum: 'Humidity', vis: 'Visibility',
    mapBase: 'Map base', hybrid: 'Hybrid', dark: 'Dark',
    focusRoute: 'Focus route', notifyFamily: 'Notify family', notified: 'Family notified',
    notifyUnavailable: 'Notify unavailable', openChecklist: 'Checklist',
    needLocation: 'EOS needs your location to compose the world.', useGps: 'Use GPS',
    loadErr: 'Could not load.', retry: 'Retry',
    placeholderBg: 'Placeholder background — swap for the Higgsfield image',
    mockData: 'Family and route data are simulated (mock)',
    family: 'Family', route: 'Route', to: 'to',
  },
} as const

const STATE_LABEL = {
  pt: { safe: 'Seguro', watch: 'Atenção', warning: 'Alerta', critical: 'Crítico' },
  en: { safe: 'Safe', watch: 'Watch', warning: 'Warning', critical: 'Critical' },
} as const

type Inv = { water_liters: number; food_days: number; has_medical_kit: boolean; has_communication_device: boolean }
type RadarStatus = { ok?: boolean; provider?: string; frameTime?: number }
type CircleMember = { user_id: string; name: string; is_me: boolean; location_lat: number | null; location_lng: number | null }
type CircleRow = { id: string; name: string; is_admin?: boolean; members?: CircleMember[] }
type PilotState = 'GO' | 'LIMITED' | 'WAIT' | 'AVOID' | 'PRIORITY OVERRIDE'
type PilotActivityId = 'fishing' | 'boating' | 'camping' | 'family_outdoor' | 'road_trip'
type PilotActivity = { id: PilotActivityId; pt: string; en: string }
type PilotRecommendation = { state: PilotState; title: string; detail: string; factors: string[]; window: string }
type HudSnap = 'peek' | 'half' | 'full'

const PILOT_ACTIVITIES: PilotActivity[] = [
  { id: 'fishing', pt: 'Pescaria', en: 'Fishing' },
  { id: 'boating', pt: 'Barco', en: 'Boating' },
  { id: 'camping', pt: 'Acampar', en: 'Camping' },
  { id: 'family_outdoor', pt: 'Família ar livre', en: 'Family outdoor' },
  { id: 'road_trip', pt: 'Viagem', en: 'Road trip' },
]

export default function WorldDashboard() {
  const { language } = useLanguage()
  const c = COPY[language]
  const { snapshot, score, state, hasCoords, coords, requestGps, error, refresh } = useRisk()

  const [inv, setInv] = useState<Inv | null>(null)
  const [people, setPeople] = useState(1)
  const [items, setItems] = useState<{ acquired: boolean }[]>([])
  const [online, setOnline] = useState(true)
  const [radar, setRadar] = useState<RadarStatus | null>(null)
  const [mapFamily, setMapFamily] = useState<WorldFamilyMember[]>([])
  const [guidance, setGuidance] = useState<WorldGuidance | null>(null)
  const [mapBase, setMapBase] = useState<MapBaseMode>('hybrid')
  const [adminCircles, setAdminCircles] = useState<Array<{ id: string; name: string }>>([])
  const [routeFocusNonce, setRouteFocusNonce] = useState(0)
  const [hudSnap, setHudSnap] = useState<HudSnap>('peek')
  const [mobileHud, setMobileHud] = useState(false)
  const [desktopHudCollapsed, setDesktopHudCollapsed] = useState(false)

  const fetchLocal = useCallback(async () => {
    try {
      const [i, f, k] = await Promise.all([
        fetch('/api/inventory').catch(() => null),
        fetch('/api/family-members').catch(() => null),
        fetch('/api/checklist').catch(() => null),
      ])
      if (i?.ok) setInv((await i.json()).inventory ?? null)
      if (f?.ok) setPeople(Math.max(1, ((await f.json()).members ?? []).length))
      if (k?.ok) setItems((await k.json()).items ?? [])
    } catch { /* offline-tolerant */ }
  }, [])

  useEffect(() => { fetchLocal() }, [fetchLocal])
  useEffect(() => {
    const saved = window.localStorage.getItem('eos-world-map-base')
    if (saved === 'hybrid' || saved === 'dark') setMapBase(saved)
  }, [])
  useEffect(() => {
    let cancelled = false
    fetch('/api/world/radar')
      .then(r => (r.ok ? r.json() : null))
      .then((data: RadarStatus | null) => { if (!cancelled) setRadar(data) })
      .catch(() => { if (!cancelled) setRadar({ ok: false }) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    fetch('/api/circles')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { circles?: CircleRow[] } | null) => {
        if (cancelled) return
        const byId = new Map<string, WorldFamilyMember>()
        setAdminCircles((data?.circles ?? [])
          .filter(circle => circle.is_admin)
          .map(circle => ({ id: circle.id, name: circle.name })))
        for (const circle of data?.circles ?? []) {
          for (const m of circle.members ?? []) {
            if (typeof m.location_lat !== 'number' || typeof m.location_lng !== 'number') continue
            byId.set(m.user_id, {
              id: m.user_id,
              name: m.is_me ? (language === 'pt' ? 'Você' : 'You') : (m.name || '—'),
              lat: m.location_lat,
              lng: m.location_lng,
              isMe: m.is_me,
              freshness: m.is_me ? (language === 'pt' ? 'agora' : 'now') : (language === 'pt' ? 'perfil' : 'profile'),
            })
          }
        }
        if (coords && !Array.from(byId.values()).some(m => m.isMe)) {
          byId.set('me-live', {
            id: 'me-live',
            name: language === 'pt' ? 'Você' : 'You',
            lat: coords.lat,
            lng: coords.lng,
            isMe: true,
            freshness: language === 'pt' ? 'agora' : 'now',
          })
        }
        setMapFamily(Array.from(byId.values()))
      })
      .catch(() => {
        if (!cancelled) setAdminCircles([])
        if (coords && !cancelled) setMapFamily([{
          id: 'me-live',
          name: language === 'pt' ? 'Você' : 'You',
          lat: coords.lat,
          lng: coords.lng,
          isMe: true,
          freshness: language === 'pt' ? 'agora' : 'now',
        }])
      })
    return () => { cancelled = true }
  }, [coords, language])
  useEffect(() => {
    if (!coords) return
    let cancelled = false
    fetch(`/api/world/guidance?lat=${coords.lat}&lng=${coords.lng}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: WorldGuidance | null) => { if (!cancelled && data?.shelter) setGuidance(data) })
      .catch(() => { if (!cancelled) setGuidance(null) })
    return () => { cancelled = true }
  }, [coords])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const sync = () => {
      setMobileHud(mq.matches)
      if (!mq.matches) setHudSnap('peek')
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (mobileHud) return
      if (event.deltaY > 12) setDesktopHudCollapsed(true)
      if (event.deltaY < -12) setDesktopHudCollapsed(false)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [mobileHud])

  const cur = snapshot?.current
  const metric = language === 'pt'
  const waterDays = inv ? inv.water_liters / (3 * people) : 0
  const checklistPct = items.length ? Math.round((items.filter(i => i.acquired).length / items.length) * 100) : 0
  const alertCount = (snapshot?.alerts.length ?? 0) + (snapshot?.earthquakes.length ?? 0)
  const topAlert = snapshot?.alerts[0]
  const hazardPreview = (snapshot?.alerts ?? []).slice(0, 2)

  // Rail mode selector (like the reference "C W R"): Clear / Watch / Respond.
  const mode: 'C' | 'W' | 'R' = state === 'safe' ? 'C' : state === 'watch' ? 'W' : 'R'
  const modeLabel = (language === 'pt'
    ? { C: 'Modo claro', W: 'Modo atenção', R: 'Modo resposta' }
    : { C: 'Clear state', W: 'Watch state', R: 'Respond state' })[mode]

  const worldImage = WORLD_PLATES[state] ?? WORLD_PLATES.watch
  const chooseMapBase = (base: MapBaseMode) => {
    setMapBase(base)
    window.localStorage.setItem('eos-world-map-base', base)
  }
  const collapseHudForMap = () => {
    if (mobileHud) setHudSnap('peek')
    else setDesktopHudCollapsed(true)
  }
  const handleSheetScroll = (event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop
    if (top > 56 && hudSnap === 'half') setHudSnap('full')
    if (top <= 0 && hudSnap === 'full') setHudSnap('half')
  }

  return (
    <main className="world" data-risk={state} data-hud={hudSnap} data-desktop-hud={desktopHudCollapsed ? 'collapsed' : 'open'}>
      <WorldMap
        key={mapBase}
        state={state}
        plateUrl={worldImage}
        family={mapFamily}
        guidance={guidance}
        mapBase={mapBase}
        routeFocusNonce={routeFocusNonce}
        onMapInteraction={collapseHudForMap}
      />
      <div className="world-vignette" aria-hidden="true" />

      <div className="world-hud">
        {/* accessibility: textual equivalent of the map's meaning (doc 16 §22) */}
        <p className="w-sr" role="status">
          {`${c.mapSummary}: ${STATE_LABEL[language][state]}, ${hasCoords ? c.yourArea : DEMO_LOCATION}. ${topAlert ? topAlert.headline : c.clearBrief}. ${alertCount} ${c.alerts}. ${c.mockData}.`}
        </p>

        {/* location / error gates */}
        {!hasCoords && (
          <div className="w-glass" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', padding: 24, textAlign: 'center', maxWidth: 340 }}>
            <p style={{ color: 'var(--w-ink-2)', marginBottom: 14, fontSize: 14 }}>{c.needLocation}</p>
            <button className="w-chip solid" onClick={requestGps}>{c.useGps}</button>
          </div>
        )}
        {error && hasCoords && (
          <div className="w-glass" style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', padding: '10px 14px' }}>
            <button className="w-chip" onClick={() => { refresh(); fetchLocal() }}>{c.retry}</button>
          </div>
        )}

        {/* ── Status Rail ── */}
        <aside className="w-rail" aria-label="Household status">
          <div className="rail-eyebrow">{c.eyebrow}</div>
          <div>
            <div className="rail-eyebrow" style={{ marginBottom: 6 }}>{c.risk}</div>
            <div className="rail-score">{score ?? '--'}</div>
            <div className="rail-state" style={{ color: 'var(--w-state)', marginTop: 4 }}>
              <span className="w-dot" />{STATE_LABEL[language][state]}
            </div>
          </div>

          <div className="rail-div" />
          <div className="rail-row"><span className="k">{c.connectivity}</span><span className="v">{online ? c.online : c.offline}</span></div>
          <div className="rail-row"><span className="k">{c.autonomy}</span><span className="v">~{waterDays.toFixed(1)} {c.days}</span></div>

          <div className="rail-div" />
          <RailBar k={c.water} v={`${waterDays.toFixed(1)} ${c.days}`} pct={Math.min(1, waterDays / 3)} />
          <RailBar k={c.food} v={`${inv?.food_days ?? 0} ${c.days}`} pct={Math.min(1, (inv?.food_days ?? 0) / 3)} />
          <RailBar k={c.checklist} v={`${checklistPct}%`} pct={checklistPct / 100} />
          <div className="rail-row"><span className="k">{c.medical}</span><span className="v">{inv?.has_medical_kit ? c.ok : c.none}</span></div>
          <div className="rail-row"><span className="k">{c.comms}</span><span className="v">{inv?.has_communication_device ? c.ok : c.none}</span></div>

          <div className="rail-div" />
          <div className="w-cwr" role="group" aria-label="Operating mode">
            {(['C', 'W', 'R'] as const).map(letter => (
              <span key={letter} className={mode === letter ? 'on' : ''}>{letter}</span>
            ))}
          </div>
          <div className="rail-eyebrow" style={{ textAlign: 'center' }}>{modeLabel}</div>
        </aside>

        {/* ── Pilot Capsule ── */}
        <PilotCapsule
          snapshot={snapshot}
          riskState={state}
          checklistPct={checklistPct}
          waterDays={waterDays}
          guidance={guidance}
          canFocusRoute={Boolean(guidance?.route?.points?.length || guidance?.shelter)}
          onFocusRoute={() => setRouteFocusNonce(n => n + 1)}
          adminCircleId={adminCircles[0]?.id}
        />

        {/* ── Alert Counter ── */}
        <div className="w-glass w-alerts" aria-label={c.alerts}>
          <div className="w-eyebrow" style={{ marginBottom: 4 }}>{c.alerts}</div>
          <div className="n">{alertCount}</div>
        </div>

        {/* ── Central Location Brief ── */}
        <div className="w-brief">
          <div className="loc">{hasCoords ? c.yourArea : DEMO_LOCATION}</div>
          <div className="sub">{topAlert ? shorten(topAlert.headline, 60) : c.clearBrief}</div>
          <Link href="/scenario" className="cond">
            <span className="w-dot" />
            {c.openScenario}
          </Link>
        </div>

        <div className="w-sensors" aria-label="World data layers">
          <div className="sensor-head">
            <span className="w-eyebrow">{language === 'pt' ? 'Camadas ao vivo' : 'Live layers'}</span>
            <span className="sensor-pulse" aria-hidden="true" />
          </div>
          <div className="map-style-control" aria-label={c.mapBase}>
            <span>{c.mapBase}</span>
            <div className="map-style-toggle" role="group" aria-label={c.mapBase}>
              {(['hybrid', 'dark'] as const).map(base => (
                <button
                  key={base}
                  type="button"
                  className={mapBase === base ? 'on' : ''}
                  aria-pressed={mapBase === base}
                  onClick={() => chooseMapBase(base)}
                >
                  {base === 'hybrid' ? c.hybrid : c.dark}
                </button>
              ))}
            </div>
          </div>
          <div className="sensor-grid">
            <div className="sensor-row">
              <span>Radar</span>
              <strong>{radar?.ok ? 'RainViewer' : radar ? (language === 'pt' ? 'indisp.' : 'unavail.') : '...'}</strong>
            </div>
            <div className="sensor-row">
              <span>Hazards</span>
              <strong>{alertCount}</strong>
            </div>
            <div className="sensor-row">
              <span>{language === 'pt' ? 'Família' : 'Family'}</span>
              <strong>{mapFamily.length || '...'}</strong>
            </div>
            <div className="sensor-row">
              <span>{language === 'pt' ? 'Rota' : 'Route'}</span>
              <strong>{guidance ? 'AI' : 'mock'}</strong>
            </div>
          </div>
          {radar?.frameTime && (
            <div className="sensor-note">
              {language === 'pt' ? 'Frame radar' : 'Radar frame'} {formatUtcTime(radar.frameTime)}
            </div>
          )}
          {hazardPreview.length > 0 ? (
            <div className="sensor-alerts">
              {hazardPreview.map(a => <span key={a.id}>{shorten(a.headline, 42)}</span>)}
            </div>
          ) : (
            <div className="sensor-note">{language === 'pt' ? 'Sem alerta oficial no centro atual' : 'No official alert at current center'}</div>
          )}
          {guidance && (
            <div className="sensor-note">
              {language === 'pt' ? 'Shelter candidato' : 'Candidate shelter'}: {shorten(guidance.shelter.name, 34)} · {guidance.shelter.confidence}
            </div>
          )}
        </div>

        {/* ── Environmental Ticker ── */}
        {cur && (
          <div className="w-ticker" aria-label="Environmental conditions">
            <Tick k={c.temp} v={`${metric ? toC(cur.temp_f) : Math.round(cur.temp_f)}°`} />
            <Tick k={c.wind} v={`${metric ? toKmh(cur.wind_mph) : Math.round(cur.wind_mph)}`} />
            <Tick k={c.aqi} v={`${snapshot?.air_quality?.us_aqi ?? '--'}`} />
            <Tick k={c.uv} v={`${cur.uv_index}`} />
            <Tick k={c.hum} v={`${cur.humidity_pct}%`} />
            <Tick k={c.vis} v={`${metric ? toKmTxt(cur.visibility_mi) : cur.visibility_mi.toFixed(1)}`} />
          </div>
        )}

        {/* honesty label */}
        <div className="w-badge-mock">
          {mapFamily.length || guidance
            ? (language === 'pt' ? 'FAMÍLIA: EOS · ROTA/SHELTER: IA CANDIDATA' : 'FAMILY: EOS · ROUTE/SHELTER: AI CANDIDATE')
            : c.mockData}
        </div>

        <MobileWorldSheet
          c={c}
          language={language}
          score={score}
          state={state}
          online={online}
          waterDays={waterDays}
          inv={inv}
          checklistPct={checklistPct}
          alertCount={alertCount}
          hazardPreview={hazardPreview}
          cur={cur}
          aqi={snapshot?.air_quality?.us_aqi ?? null}
          metric={metric}
          radar={radar}
          mapFamilyCount={mapFamily.length}
          guidance={guidance}
          mapBase={mapBase}
          chooseMapBase={chooseMapBase}
          snap={hudSnap}
          setSnap={setHudSnap}
          onScroll={handleSheetScroll}
          requestGps={requestGps}
          hasCoords={hasCoords}
          onFocusRoute={() => setRouteFocusNonce(n => n + 1)}
        />
      </div>
    </main>
  )
}

function MobileWorldSheet({
  c,
  language,
  score,
  state,
  online,
  waterDays,
  inv,
  checklistPct,
  alertCount,
  hazardPreview,
  cur,
  aqi,
  metric,
  radar,
  mapFamilyCount,
  guidance,
  mapBase,
  chooseMapBase,
  snap,
  setSnap,
  onScroll,
  requestGps,
  hasCoords,
  onFocusRoute,
}: {
  c: (typeof COPY)[keyof typeof COPY]
  language: keyof typeof COPY
  score: number | null
  state: keyof (typeof STATE_LABEL)['pt']
  online: boolean
  waterDays: number
  inv: Inv | null
  checklistPct: number
  alertCount: number
  hazardPreview: WeatherSnapshot['alerts']
  cur: WeatherSnapshot['current'] | undefined
  aqi: number | null
  metric: boolean
  radar: RadarStatus | null
  mapFamilyCount: number
  guidance: WorldGuidance | null
  mapBase: MapBaseMode
  chooseMapBase: (base: MapBaseMode) => void
  snap: HudSnap
  setSnap: (snap: HudSnap) => void
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  requestGps: () => void
  hasCoords: boolean
  onFocusRoute: () => void
}) {
  const pt = language === 'pt'
  const nextSnap: HudSnap = snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek'
  const snapLabel = snap === 'peek'
    ? (pt ? 'Abrir controles' : 'Open controls')
    : snap === 'half'
      ? (pt ? 'Expandir' : 'Expand')
      : (pt ? 'Recolher' : 'Collapse')

  return (
    <section className="w-mobile-sheet" aria-label={pt ? 'Controles do World Dashboard' : 'World Dashboard controls'}>
      <button
        type="button"
        className="sheet-handle"
        aria-expanded={snap !== 'peek'}
        onClick={() => setSnap(nextSnap)}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <span className="sheet-summary">
          <strong>{score ?? '--'}</strong>
          <span>{STATE_LABEL[language][state]} · {alertCount} {c.alerts.toLowerCase()}</span>
        </span>
        <em>{snapLabel}</em>
      </button>

      <div className="sheet-scroll" onScroll={onScroll}>
        <div className="sheet-actions">
          <Link href="/scenario" className="w-chip solid">{c.openScenario}</Link>
          <Link href="/checklist" className="w-chip">{c.openChecklist}</Link>
          <button className="w-chip" disabled={!guidance} onClick={onFocusRoute}>{c.focusRoute}</button>
          {!hasCoords && <button className="w-chip" onClick={requestGps}>{c.useGps}</button>}
        </div>

        <div className="sheet-section">
          <div className="sheet-title">{pt ? 'Status da família' : 'Family status'}</div>
          <div className="sheet-grid">
            <SheetMetric k={c.connectivity} v={online ? c.online : c.offline} />
            <SheetMetric k={c.autonomy} v={`~${waterDays.toFixed(1)} ${c.days}`} />
            <SheetMetric k={c.water} v={`${waterDays.toFixed(1)} ${c.days}`} />
            <SheetMetric k={c.food} v={`${inv?.food_days ?? 0} ${c.days}`} />
            <SheetMetric k={c.checklist} v={`${checklistPct}%`} />
            <SheetMetric k={c.medical} v={inv?.has_medical_kit ? c.ok : c.none} />
            <SheetMetric k={c.comms} v={inv?.has_communication_device ? c.ok : c.none} />
            <SheetMetric k={c.family} v={`${mapFamilyCount || '...'}`} />
          </div>
        </div>

        <div className="sheet-section">
          <div className="sheet-title">{pt ? 'Camadas e mapa' : 'Layers and map'}</div>
          <div className="map-style-control sheet-map-style" aria-label={c.mapBase}>
            <span>{c.mapBase}</span>
            <div className="map-style-toggle" role="group" aria-label={c.mapBase}>
              {(['hybrid', 'dark'] as const).map(base => (
                <button
                  key={base}
                  type="button"
                  className={mapBase === base ? 'on' : ''}
                  aria-pressed={mapBase === base}
                  onClick={() => chooseMapBase(base)}
                >
                  {base === 'hybrid' ? c.hybrid : c.dark}
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-grid">
            <SheetMetric k="Radar" v={radar?.ok ? 'RainViewer' : radar ? (pt ? 'indisp.' : 'unavail.') : '...'} />
            <SheetMetric k="Hazards" v={`${alertCount}`} />
            <SheetMetric k={c.route} v={guidance ? 'AI' : 'mock'} />
            <SheetMetric k="Frame" v={radar?.frameTime ? formatUtcTime(radar.frameTime) : '--'} />
          </div>
          {guidance && (
            <p className="sheet-note">
              {pt ? 'Shelter candidato' : 'Candidate shelter'}: {shorten(guidance.shelter.name, 48)} · {guidance.shelter.confidence}
            </p>
          )}
        </div>

        {cur && (
          <div className="sheet-section">
            <div className="sheet-title">{pt ? 'Condições agora' : 'Current conditions'}</div>
            <div className="sheet-ticks">
              <Tick k={c.temp} v={`${metric ? toC(cur.temp_f) : Math.round(cur.temp_f)}°`} />
              <Tick k={c.wind} v={`${metric ? toKmh(cur.wind_mph) : Math.round(cur.wind_mph)}`} />
              <Tick k={c.aqi} v={`${aqi ?? '--'}`} />
              <Tick k={c.uv} v={`${cur.uv_index}`} />
              <Tick k={c.hum} v={`${cur.humidity_pct}%`} />
              <Tick k={c.vis} v={`${metric ? toKmTxt(cur.visibility_mi) : cur.visibility_mi.toFixed(1)}`} />
            </div>
          </div>
        )}

        <div className="sheet-section">
          <div className="sheet-title">{c.alerts}</div>
          {hazardPreview.length > 0 ? (
            <div className="sheet-alerts">
              {hazardPreview.map(a => <span key={a.id}>{shorten(a.headline, 64)}</span>)}
            </div>
          ) : (
            <p className="sheet-note">{pt ? 'Sem alerta oficial no centro atual.' : 'No official alert at current center.'}</p>
          )}
        </div>
      </div>
    </section>
  )
}

function SheetMetric({ k, v }: { k: string; v: string }) {
  return (
    <div className="sheet-metric">
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  )
}

// ── Pilot Capsule: "What's the plan?" + deterministic HWD-05 actions ──
function PilotCapsule({
  snapshot,
  riskState,
  checklistPct,
  waterDays,
  guidance,
  canFocusRoute,
  onFocusRoute,
  adminCircleId,
}: {
  snapshot: WeatherSnapshot | null
  riskState: string
  checklistPct: number
  waterDays: number
  guidance: WorldGuidance | null
  canFocusRoute: boolean
  onFocusRoute: () => void
  adminCircleId?: string
}) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<PilotActivityId | null>(null)
  const [notifyState, setNotifyState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const criticalAlert = (snapshot?.alerts ?? []).find(a => a.severity === 'CRITICAL')
  const pt = language === 'pt'
  const c = COPY[language]
  const activity = PILOT_ACTIVITIES.find(a => a.id === sel) ?? null
  const recommendation = buildPilotRecommendation({
    snapshot,
    riskState,
    activity,
    checklistPct,
    waterDays,
    guidance,
    pt,
    criticalAlert: criticalAlert?.headline,
  })
  const override = recommendation.state === 'PRIORITY OVERRIDE'

  const notifyFamily = async () => {
    if (!adminCircleId) { setNotifyState('failed'); return }
    setNotifyState('sending')
    try {
      const res = await fetch(`/api/circles/${adminCircleId}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `EOS Pilot · ${recommendation.state}`,
          message: `${recommendation.title}. ${recommendation.detail}`,
        }),
      })
      setNotifyState(res.ok ? 'sent' : 'failed')
    } catch {
      setNotifyState('failed')
    }
  }

  if (override || sel) {
    return (
      <div className={`w-glass w-pilot pilot-state-${recommendation.state.toLowerCase().replace(/\s+/g, '-')}`} style={override ? { borderColor: 'rgba(var(--w-state-rgb), 0.55)' } : undefined}>
        <div className="cap-head">
          <span className="w-eyebrow">PILOT</span>
          <span className="w-eyebrow" style={{ color: override ? 'var(--w-state)' : 'var(--w-ink-2)' }}>{recommendation.state}</span>
        </div>
        <div className="pilot-reco-title">
          {recommendation.title}
        </div>
        <div className="pilot-reco-detail">
          {recommendation.detail}
        </div>
        <div className="pilot-reco-grid" aria-label={pt ? 'Fatores do Pilot' : 'Pilot factors'}>
          <span>{recommendation.window}</span>
          {recommendation.factors.slice(0, 3).map(f => <span key={f}>{f}</span>)}
        </div>
        <div className="cap-actions">
          <Link href="/scenario" className="w-chip solid">{override ? (pt ? 'Abrir resposta' : 'Open response') : c.openScenario}</Link>
          <Link href="/checklist" className="w-chip">{c.openChecklist}</Link>
          <button className="w-chip" disabled={!canFocusRoute} onClick={onFocusRoute}>{c.focusRoute}</button>
          <button className="w-chip" disabled={notifyState === 'sending'} onClick={notifyFamily}>
            {notifyState === 'sent' ? c.notified : notifyState === 'failed' ? c.notifyUnavailable : c.notifyFamily}
          </button>
          {!override && <button className="w-chip" onClick={() => { setSel(null); setOpen(true); setNotifyState('idle') }}>{pt ? 'trocar' : 'change'}</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="w-glass w-pilot">
      <div className="cap-head">
        <span className="w-eyebrow">PILOT</span>
        <span className="w-eyebrow">{pt ? 'copiloto de decisão' : 'decision copilot'}</span>
      </div>
      <>
        <button onClick={() => setOpen(v => !v)} aria-expanded={open}
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--w-ink)' }}>
            {pt ? 'Qual é o plano?' : "What's the plan?"}
          </div>
          <div style={{ color: 'var(--w-ink-2)', fontSize: 12, marginTop: 2 }}>
            {pt ? 'Toque para escolher sua atividade' : 'Tap to choose your activity'}
          </div>
        </button>
        {open && (
          <div className="cap-actions">
            {PILOT_ACTIVITIES.map(a => (
              <button key={a.id} className="w-chip" onClick={() => { setSel(a.id); setOpen(false); setNotifyState('idle') }}>
                {pt ? a.pt : a.en}
              </button>
            ))}
          </div>
        )}
      </>
    </div>
  )
}

function buildPilotRecommendation({
  snapshot,
  riskState,
  activity,
  checklistPct,
  waterDays,
  guidance,
  pt,
  criticalAlert,
}: {
  snapshot: WeatherSnapshot | null
  riskState: string
  activity: PilotActivity | null
  checklistPct: number
  waterDays: number
  guidance: WorldGuidance | null
  pt: boolean
  criticalAlert?: string
}): PilotRecommendation {
  if (riskState === 'critical' || criticalAlert) {
    return {
      state: 'PRIORITY OVERRIDE',
      title: pt ? 'Orientação recreativa suspensa' : 'Recreational guidance suspended',
      detail: criticalAlert ? shorten(criticalAlert, 92) : (pt ? 'Uma ameaça ativa exige atenção.' : 'An active threat requires attention.'),
      factors: [
        pt ? 'Regra crítica ativa' : 'Critical rule active',
        guidance?.shelter ? (pt ? 'Rota candidata disponível' : 'Candidate route available') : (pt ? 'Sem rota validada' : 'No validated route'),
        `${pt ? 'Checklist' : 'Checklist'} ${checklistPct}%`,
      ],
      window: pt ? 'Ação imediata' : 'Immediate action',
    }
  }

  const cur = snapshot?.current
  const alerts = snapshot?.alerts ?? []
  const highAlert = alerts.some(a => a.severity === 'HIGH')
  const thunder = alerts.some(a => /THUNDERSTORM|TORNADO/i.test(a.type)) || (cur?.weather_code ?? 0) >= 95
  const gust = cur?.wind_gust_mph ?? 0
  const wind = cur?.wind_mph ?? 0
  const precip = Math.max(cur?.precip_prob_pct ?? 0, ...(snapshot?.hourly.slice(0, 6).map(h => h.precip_prob_pct) ?? [0]))
  const vis = cur?.visibility_mi ?? 10
  const uv = cur?.uv_index ?? 0
  const aqi = snapshot?.air_quality?.us_aqi ?? null
  const isBoating = activity?.id === 'boating'
  const isFamily = activity?.id === 'family_outdoor'
  const isRoadTrip = activity?.id === 'road_trip'

  let state: PilotState = 'GO'
  if (riskState === 'warning' || highAlert || thunder || gust > 40 || precip > 82 || vis < 1 || (isBoating && gust > 30)) {
    state = 'AVOID'
  } else if (riskState === 'watch' || gust > 30 || precip > 60 || (aqi ?? 0) > 150 || (isFamily && uv >= 9)) {
    state = 'WAIT'
  } else if (gust > 20 || wind > 16 || precip > 35 || uv >= 8 || (aqi ?? 0) > 100 || checklistPct < 60 || waterDays < 1) {
    state = 'LIMITED'
  }

  const label = activity ? (pt ? activity.pt : activity.en) : (pt ? 'Atividade' : 'Activity')
  const titleByState: Record<PilotState, string> = {
    GO: pt ? `${label}: GO` : `${label}: GO`,
    LIMITED: pt ? `${label}: LIMITED` : `${label}: LIMITED`,
    WAIT: pt ? `${label}: WAIT` : `${label}: WAIT`,
    AVOID: pt ? `${label}: AVOID` : `${label}: AVOID`,
    'PRIORITY OVERRIDE': 'PRIORITY OVERRIDE',
  }
  const detailByState: Record<PilotState, string> = {
    GO: pt ? 'Condições favoráveis. Mantenha monitoramento e plano de retorno.' : 'Conditions are favorable. Keep monitoring and a return plan.',
    LIMITED: pt ? 'Possível, mas com limites claros de clima, recursos ou prontidão.' : 'Possible, with clear limits from weather, resources, or readiness.',
    WAIT: pt ? 'A janela não está boa agora. Reavaliar antes de sair.' : 'The window is not good now. Re-evaluate before leaving.',
    AVOID: pt ? 'Não recomendado nas condições atuais.' : 'Not recommended under current conditions.',
    'PRIORITY OVERRIDE': '',
  }

  const factors = [
    `${pt ? 'Rajada' : 'Gust'} ${pt ? toKmh(gust) + ' km/h' : Math.round(gust) + ' mph'}`,
    `${pt ? 'Chuva' : 'Rain'} ${Math.round(precip)}%`,
    `${pt ? 'Checklist' : 'Checklist'} ${checklistPct}%`,
    isRoadTrip && guidance?.shelter ? (pt ? 'Rota candidata no mapa' : 'Candidate route on map') : null,
    aqi ? `AQI ${aqi}` : null,
    vis < 6 ? `${pt ? 'Visão' : 'Visibility'} ${pt ? toKmTxt(vis) + ' km' : vis.toFixed(1) + ' mi'}` : null,
  ].filter(Boolean) as string[]

  return {
    state,
    title: titleByState[state],
    detail: detailByState[state],
    factors,
    window: bestPilotWindow(snapshot, pt, state),
  }
}

function bestPilotWindow(snapshot: WeatherSnapshot | null, pt: boolean, state: PilotState) {
  if (state === 'AVOID') return pt ? 'Sem janela segura agora' : 'No safe window now'
  if (state === 'WAIT') return pt ? 'Reavaliar em 60-90 min' : 'Recheck in 60-90 min'
  const hours = snapshot?.hourly.slice(0, 8) ?? []
  const good = hours.find(h => h.precip_prob_pct < 35 && h.wind_gust_mph < 22 && h.visibility_mi >= 3 && h.weather_code < 95)
  if (!good) return pt ? 'Janela curta/instável' : 'Short/unstable window'
  const hh = new Date(good.time_iso).toLocaleTimeString(pt ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  return pt ? `Melhor a partir de ${hh}` : `Best from ${hh}`
}

function RailBar({ k, v, pct }: { k: string; v: string; pct: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div className="rail-row"><span className="k">{k}</span><span className="v">{v}</span></div>
      <div className="w-bar"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` }} /></div>
    </div>
  )
}

function Tick({ k, v }: { k: string; v: string }) {
  return <div className="t"><span className="tk">{k}</span><span className="tv">{v}</span></div>
}

// ── helpers ──
const toC = (f: number) => Math.round(((f - 32) * 5) / 9)
const toKmh = (mph: number) => Math.round(mph * 1.609)
const toKmTxt = (mi: number) => (mi * 1.609).toFixed(1)
const formatUtcTime = (epochSeconds: number) => `${new Date(epochSeconds * 1000).toISOString().slice(11, 16)}Z`
const shorten = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
