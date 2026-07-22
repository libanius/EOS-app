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
import type { ProfilePersonalization } from '@/lib/profile-personalization'
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

type Inv = {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
}
type RadarStatus = { ok?: boolean; provider?: string; frameTime?: number }
type FamilyRosterPerson = { id: string; name: string }
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
  const [familyRoster, setFamilyRoster] = useState<FamilyRosterPerson[]>([])
  const [items, setItems] = useState<{ acquired: boolean }[]>([])
  const [online, setOnline] = useState(true)
  const [radar, setRadar] = useState<RadarStatus | null>(null)
  const [mapFamily, setMapFamily] = useState<WorldFamilyMember[]>([])
  const [guidance, setGuidance] = useState<WorldGuidance | null>(null)
  const [mapBase, setMapBase] = useState<MapBaseMode>('hybrid')
  const [adminCircles, setAdminCircles] = useState<Array<{ id: string; name: string }>>([])
  const [personalization, setPersonalization] = useState<ProfilePersonalization | null>(null)
  const [routeFocusNonce, setRouteFocusNonce] = useState(0)
  const [hudSnap, setHudSnap] = useState<HudSnap>('peek')
  const [mobileHud, setMobileHud] = useState(false)
  const [desktopHudCollapsed, setDesktopHudCollapsed] = useState(false)
  const [sensorsOpen, setSensorsOpen] = useState(false)
  const [layersNonce, setLayersNonce] = useState(0)

  const fetchLocal = useCallback(async () => {
    try {
      const [i, f, k] = await Promise.all([
        fetch('/api/inventory').catch(() => null),
        fetch('/api/family-members').catch(() => null),
        fetch('/api/checklist').catch(() => null),
      ])
      if (i?.ok) setInv((await i.json()).inventory ?? null)
      if (f?.ok) {
        const members = ((await f.json()).members ?? []) as Array<{ id?: string; name?: string }>
        setPeople(Math.max(1, members.length))
        setFamilyRoster(members.map((m, i) => ({ id: m.id ?? `member-${i}`, name: m.name || '—' })))
      }
      if (k?.ok) setItems((await k.json()).items ?? [])
    } catch { /* offline-tolerant */ }
  }, [])

  useEffect(() => { fetchLocal() }, [fetchLocal])
  useEffect(() => {
    let cancelled = false
    fetch('/api/profile/personalization')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { personalization?: ProfilePersonalization } | null) => {
        if (!cancelled) setPersonalization(data?.personalization ?? null)
      })
      .catch(() => { if (!cancelled) setPersonalization(null) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    const saved = window.localStorage.getItem('eos-world-map-base')
    if (saved === 'hybrid' || saved === 'dark') setMapBase(saved)
  }, [])
  useEffect(() => {
    let cancelled = false
    setRadar(null) // show loading on (re)fetch
    fetch('/api/world/radar')
      .then(r => (r.ok ? r.json() : null))
      .then((data: RadarStatus | null) => { if (!cancelled) setRadar(data) })
      .catch(() => { if (!cancelled) setRadar({ ok: false }) })
    return () => { cancelled = true }
  }, [layersNonce])
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
  }, [coords, layersNonce])
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
  const foodDays = inv?.food_days ?? 0
  const powerDays = inv ? (inv.battery_percent / 100) * 3 : 0
  const fuelDays = inv ? inv.fuel_liters / 10 : 0
  const autonomyDays = Math.max(0, Math.min(waterDays || 0, foodDays || 0, powerDays || 0, fuelDays || 0))
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

        <StatusRail
          c={c}
          language={language}
          score={score}
          state={state}
          online={online}
          mode={mode}
          modeLabel={modeLabel}
          inv={inv}
          waterDays={waterDays}
          foodDays={foodDays}
          powerDays={powerDays}
          fuelDays={fuelDays}
          autonomyDays={autonomyDays}
          checklistPct={checklistPct}
          people={people}
          family={mapFamily.length ? mapFamily.map(m => ({ id: m.id, name: m.name })) : familyRoster}
          avatarUrl={personalization?.avatar_url ?? null}
        />

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
          personalization={personalization}
        />

        {/* ── Alert Counter (tappable → weather/alerts) ── */}
        <Link href="/weather" className="w-glass w-alerts tappable" aria-label={`${alertCount} ${c.alerts} — ${language === 'pt' ? 'ver detalhes' : 'view details'}`}>
          <div className="w-eyebrow" style={{ marginBottom: 4 }}>{c.alerts}</div>
          <div className="n">{alertCount}</div>
        </Link>

        <div className={`w-sensors${sensorsOpen ? '' : ' collapsed'}`} aria-label="World data layers">
          <button type="button" className="sensor-head" aria-expanded={sensorsOpen} onClick={() => setSensorsOpen(v => !v)}>
            <span className="w-eyebrow">{language === 'pt' ? 'Camadas ao vivo' : 'Live layers'}</span>
            <span className="sensor-summary">{radar?.ok ? 'Radar ✓' : 'Radar —'} · {alertCount} hz</span>
            <span className="sensor-pulse" aria-hidden="true" />
            <svg className="sensor-caret" width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M2.5 4 L5.5 7 L8.5 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
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
              <strong>
                {radar?.ok ? 'RainViewer' : radar ? (language === 'pt' ? 'indisp.' : 'unavail.') : '...'}
                {radar && !radar.ok && (
                  <button type="button" className="sensor-retry" onClick={() => setLayersNonce(n => n + 1)} aria-label={language === 'pt' ? 'Tentar de novo' : 'Retry'}>
                    <RetryIcon />
                  </button>
                )}
              </strong>
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
          foodDays={foodDays}
          powerDays={powerDays}
          fuelDays={fuelDays}
          autonomyDays={autonomyDays}
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

function StatusRail({
  c,
  language,
  score,
  state,
  online,
  mode,
  modeLabel,
  inv,
  waterDays,
  foodDays,
  powerDays,
  fuelDays,
  autonomyDays,
  checklistPct,
  people,
  family,
  avatarUrl,
}: {
  c: (typeof COPY)[keyof typeof COPY]
  language: keyof typeof COPY
  score: number | null
  state: keyof (typeof STATE_LABEL)['pt']
  online: boolean
  mode: 'C' | 'W' | 'R'
  modeLabel: string
  inv: Inv | null
  waterDays: number
  foodDays: number
  powerDays: number
  fuelDays: number
  autonomyDays: number
  checklistPct: number
  people: number
  family: FamilyRosterPerson[]
  avatarUrl: string | null
}) {
  const pt = language === 'pt'
  const readiness = readinessLabel(state, language)
  const shuttersReady = checklistPct >= 60
  const waterReady = waterDays >= 3
  const looseItemsReady = checklistPct >= 80 && state !== 'critical'
  const fuelPct = Math.max(0, Math.min(100, inv ? Math.round((inv.fuel_liters / 50) * 100) : 0))
  const commsReady = Boolean(inv?.has_communication_device)
  const visibleFamily = family.slice(0, 4)
  const familyCount = Math.max(people, family.length)
  const fallbackFamily = Array.from({ length: Math.min(Math.max(people, 1), 4) }, (_, i) => ({
    id: `fallback-${i}`,
    name: pt ? `Pessoa ${i + 1}` : `Person ${i + 1}`,
  }))
  const familyAvatars = visibleFamily.length ? visibleFamily : fallbackFamily

  return (
    <aside className="w-rail" aria-label={pt ? 'Prontidão da casa' : 'Household readiness'}>
      <div className="rail-topline">
        <span>{online ? (pt ? 'Online' : 'Online') : c.offline}</span>
        <span className="rail-watch"><i />{STATE_LABEL[language][state]}</span>
      </div>

      <div className="rail-risk-block">
        <div className="rail-score">{score ?? '--'}</div>
        <div className="rail-risk-label">
          <span>{pt ? 'Índice de risco' : 'Risk index'}</span>
          <b>{readiness}</b>
        </div>
      </div>

      <div className="rail-div" />

      <div className="house-stage" aria-label={pt ? 'Modelo de prontidão da casa' : 'House readiness model'}>
        <HouseModel />
        <Callout className="callout-shutters" tone={shuttersReady ? 'ok' : 'warn'} label={pt ? 'Venezianas' : 'Shutters'} ok={shuttersReady} value={shuttersReady ? undefined : `${checklistPct}%`} />
        <Callout className="callout-loose" tone={looseItemsReady ? 'ok' : 'danger'} label={pt ? 'Itens soltos' : 'Loose items'} />
        <Callout className="callout-water" tone={waterReady ? 'ok' : 'warn'} label={c.water} ok={waterReady} value={waterReady ? undefined : `${formatDays(waterDays)}d`} />
        <Callout className="callout-fuel" tone={fuelPct >= 50 ? 'ok' : fuelPct > 0 ? 'warn' : 'danger'} label={pt ? 'Comb.' : 'Fuel'} value={inv ? `${fuelPct}%` : '--'} />
      </div>

      <div className="rail-autonomy">
        <strong>{formatDays(autonomyDays)} {c.days}</strong>
        <span>{pt ? 'Autonomia familiar' : 'Family autonomy'}</span>
      </div>

      <div className="rail-resource-stack">
        <ReadinessBar k={c.water} v={`${formatDays(waterDays)}d`} pct={Math.min(1, waterDays / 7)} tone={waterDays >= 3 ? 'ok' : 'warn'} />
        <ReadinessBar k={c.food} v={`${formatDays(foodDays)}d`} pct={Math.min(1, foodDays / 8)} tone={foodDays >= 3 ? 'ok' : 'warn'} />
        <ReadinessBar k={pt ? 'Energia' : 'Power'} v={`${formatDays(powerDays)}d`} pct={Math.min(1, powerDays / 3)} tone={powerDays >= 2 ? 'ok' : 'warn'} />
        <ReadinessBar k={pt ? 'Comb.' : 'Fuel'} v={`${formatDays(fuelDays)}d`} pct={Math.min(1, fuelDays / 3)} tone={fuelDays >= 2 ? 'ok' : 'warn'} />
      </div>

      <div className="rail-div" />

      <div className="family-strip">
        <div className="family-faces" aria-hidden="true">
          {familyAvatars.map((person, index) => (
            <span key={person.id} className="family-face">
              {index === 0 && avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" />
              ) : (
                initials(person.name)
              )}
              <i />
            </span>
          ))}
        </div>
        <div className="family-safe">{pt ? 'Família EOS' : 'EOS family'} · {familyCount}</div>
      </div>

      <div className="rail-comms">
        <span>{pt ? 'Comms' : 'Comms'}</span>
        <b>LTE <i className={online ? 'on' : ''} /></b>
        <b>HAM VHF <i className={commsReady ? 'on' : ''} /></b>
      </div>

      <div className="w-cwr-wrap">
        <div className="w-cwr" role="group" aria-label={modeLabel}>
          {(['C', 'W', 'R'] as const).map(letter => (
            <span key={letter} className={mode === letter ? 'on' : ''}>{letter}</span>
          ))}
        </div>
        <span className="w-cwr-label">{modeLabel}</span>
      </div>
    </aside>
  )
}

function HouseModel() {
  return (
    <svg className="house-model" viewBox="0 0 260 160" role="img" aria-label="House readiness model">
      <defs>
        <linearGradient id="houseWall" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#eef1f4" />
          <stop offset="1" stopColor="#c8cdd4" />
        </linearGradient>
        <linearGradient id="houseRoof" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#e2e6eb" />
          <stop offset="1" stopColor="#aeb6c1" />
        </linearGradient>
      </defs>
      <ellipse cx="132" cy="134" rx="96" ry="13" fill="rgba(20,22,28,.08)" />
      <path d="M62 72 L132 28 L210 82 L139 122 Z" fill="url(#houseRoof)" stroke="#a8b0bb" strokeWidth="2" />
      <path d="M72 74 L139 122 L139 78 L72 42 Z" fill="#d5dae1" opacity=".9" />
      <path d="M72 74 L139 122 L139 145 L72 102 Z" fill="url(#houseWall)" stroke="#b8c0ca" strokeWidth="2" />
      <path d="M139 122 L210 82 L210 115 L139 145 Z" fill="#c4cbd4" stroke="#aab2bd" strokeWidth="2" />
      <path d="M94 94 h24 v34 h-24z" fill="#bfc7d0" stroke="#9aa3af" strokeWidth="2" />
      <path d="M79 84 h25 v22 h-25zM151 101 h30 v22 h-30z" fill="#eef7f4" stroke="#97a1ad" strokeWidth="2" />
      <path d="M91 84 v22M79 95 h25M166 101 v22M151 112 h30" stroke="#9aa3af" strokeWidth="1.5" />
      <path d="M190 88 h28 v31 h-28z" fill="#b5bdc8" opacity=".72" />
      <path d="M189 78 h30 v13 h-30z" fill="#aeb6c1" />
      <path d="M177 113 h24 v24 h-24z" fill="#d8dde4" stroke="#adb5bf" strokeWidth="2" />
      <path d="M184 91 h11 v38 h-11z" fill="#b6c0c9" />
      <circle cx="189" cy="86" r="9" fill="#cfd5dc" stroke="#aab2bd" strokeWidth="2" />
      <rect x="125" y="119" width="34" height="22" rx="4" fill="#d7dce3" stroke="#abb4bf" strokeWidth="2" />
      <circle cx="134" cy="142" r="4" fill="#7b8490" />
      <circle cx="151" cy="142" r="4" fill="#7b8490" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ marginLeft: 4, verticalAlign: 'middle', flex: 'none' }}>
      <path d="M2.5 6.4 L5 8.9 L9.5 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RetryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M11.5 7a4.5 4.5 0 1 1-1.32-3.18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11.5 2.2 V4.5 H9.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Callout({ className, tone, label, value, ok }: { className: string; tone: 'ok' | 'warn' | 'danger'; label: string; value?: string; ok?: boolean }) {
  return (
    <div className={`house-callout ${className} ${tone}`}>
      <i />
      <span>{label}{ok ? <CheckIcon /> : value ? ` ${value}` : ''}</span>
    </div>
  )
}

function ReadinessBar({ k, v, pct, tone }: { k: string; v: string; pct: number; tone: 'ok' | 'warn' }) {
  return (
    <div className="readiness-row">
      <span>{k}</span>
      <b>{v}</b>
      <i><em className={tone} style={{ width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` }} /></i>
    </div>
  )
}

function MobileWorldSheet({
  c,
  language,
  score,
  state,
  online,
  waterDays,
  foodDays,
  powerDays,
  fuelDays,
  autonomyDays,
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
  foodDays: number
  powerDays: number
  fuelDays: number
  autonomyDays: number
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
            <SheetMetric k={c.autonomy} v={`~${formatDays(autonomyDays)} ${c.days}`} />
            <SheetMetric k={c.water} v={`${waterDays.toFixed(1)} ${c.days}`} />
            <SheetMetric k={c.food} v={`${formatDays(foodDays)} ${c.days}`} />
            <SheetMetric k={pt ? 'Energia' : 'Power'} v={`${formatDays(powerDays)} ${c.days}`} />
            <SheetMetric k={pt ? 'Combustível' : 'Fuel'} v={`${formatDays(fuelDays)} ${c.days}`} />
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
  personalization,
}: {
  snapshot: WeatherSnapshot | null
  riskState: string
  checklistPct: number
  waterDays: number
  guidance: WorldGuidance | null
  canFocusRoute: boolean
  onFocusRoute: () => void
  adminCircleId?: string
  personalization: ProfilePersonalization | null
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
    personalization,
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
  personalization,
}: {
  snapshot: WeatherSnapshot | null
  riskState: string
  activity: PilotActivity | null
  checklistPct: number
  waterDays: number
  guidance: WorldGuidance | null
  pt: boolean
  criticalAlert?: string
  personalization: ProfilePersonalization | null
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
    personalization?.risk_tolerance && personalization.risk_tolerance !== 'balanced'
      ? `${pt ? 'Perfil' : 'Profile'} ${riskToleranceCopy(personalization.risk_tolerance, pt)}`
      : null,
    personalization?.decision_style && personalization.decision_style !== 'balanced'
      ? `${pt ? 'Estilo' : 'Style'} ${decisionStyleCopy(personalization.decision_style, pt)}`
      : null,
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

function Tick({ k, v }: { k: string; v: string }) {
  return <div className="t"><span className="tk">{k}</span><span className="tv">{v}</span></div>
}

// ── helpers ──
const toC = (f: number) => Math.round(((f - 32) * 5) / 9)
const toKmh = (mph: number) => Math.round(mph * 1.609)
const toKmTxt = (mi: number) => (mi * 1.609).toFixed(1)
const formatUtcTime = (epochSeconds: number) => `${new Date(epochSeconds * 1000).toISOString().slice(11, 16)}Z`
const shorten = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
const formatDays = (days: number) => {
  if (!Number.isFinite(days) || days <= 0) return '0'
  return days >= 10 ? String(Math.round(days)) : days.toFixed(days >= 3 ? 0 : 1)
}
const riskToleranceCopy = (value: NonNullable<ProfilePersonalization['risk_tolerance']>, pt: boolean) => {
  const copy = {
    conservative: pt ? 'conservador' : 'conservative',
    balanced: pt ? 'equilibrado' : 'balanced',
    flexible: pt ? 'flexível' : 'flexible',
  }
  return copy[value]
}
const decisionStyleCopy = (value: NonNullable<ProfilePersonalization['decision_style']>, pt: boolean) => {
  const copy = {
    concise: pt ? 'conciso' : 'concise',
    balanced: pt ? 'equilibrado' : 'balanced',
    detailed: pt ? 'detalhado' : 'detailed',
    checklist: 'checklist',
  }
  return copy[value]
}
const initials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .map(part => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase() || 'FM'
function readinessLabel(state: keyof (typeof STATE_LABEL)['pt'], language: keyof typeof COPY) {
  const pt = language === 'pt'
  if (state === 'safe') return pt ? 'Estável' : 'Stable'
  if (state === 'watch') return pt ? 'Elevado' : 'Elevated'
  if (state === 'warning') return pt ? 'Alto' : 'High'
  return pt ? 'Crítico' : 'Critical'
}
