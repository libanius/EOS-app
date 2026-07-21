'use client'

/**
 * WorldDashboard — HWD-01 static prototype HUD (doc 16 §8).
 * Real React components over a world plate. Reads live RiskProvider data +
 * inventory/family/checklist. Family markers and route are MOCK and labeled.
 * No map SDK (MapLibre is HWD-02). Reversible: isolated /dashboard-world route.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'
import { useRisk } from '@/components/v2/RiskProvider'
import WorldMap from './WorldMap'
import type { WorldFamilyMember, WorldGuidance } from './WorldMap'
import type { MapBaseMode } from '@/lib/world/providers'
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
type CircleRow = { members?: CircleMember[] }

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

  return (
    <main className="world" data-risk={state}>
      <WorldMap key={mapBase} state={state} plateUrl={worldImage} family={mapFamily} guidance={guidance} mapBase={mapBase} />
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
        <PilotCapsule />

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
      </div>
    </main>
  )
}

// ── Pilot Capsule: "What's the plan?" + activity chooser + deterministic override ──
function PilotCapsule() {
  const { language } = useLanguage()
  const { state, snapshot } = useRisk()
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const criticalAlert = (snapshot?.alerts ?? []).find(a => a.severity === 'CRITICAL')
  const override = state === 'critical' || Boolean(criticalAlert)
  const pt = language === 'pt'

  const ACT = pt
    ? ['Pescaria', 'Barco', 'Acampar', 'Família ar livre', 'Viagem']
    : ['Fishing', 'Boating', 'Camping', 'Family outdoor', 'Road trip']

  if (override) {
    return (
      <div className="w-glass w-pilot" style={{ borderColor: 'rgba(var(--w-state-rgb), 0.55)' }}>
        <div className="cap-head">
          <span className="w-eyebrow">PILOT</span>
          <span className="w-eyebrow" style={{ color: 'var(--w-state)' }}>PRIORITY OVERRIDE</span>
        </div>
        <div className="cap-body" style={{ color: 'var(--w-state)', fontWeight: 700 }}>
          {pt ? 'Orientação recreativa suspensa' : 'Recreational guidance suspended'}
        </div>
        <div className="cap-body" style={{ color: 'var(--w-ink-2)', fontSize: 13, marginTop: 4 }}>
          {criticalAlert ? shorten(criticalAlert.headline, 80) : (pt ? 'Uma ameaça ativa exige atenção.' : 'An active threat requires attention.')}
        </div>
        <div className="cap-actions">
          <Link href="/scenario" className="w-chip solid">{pt ? 'Abrir resposta' : 'Open response'}</Link>
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
      {sel ? (
        <>
          <div className="cap-body" style={{ fontWeight: 700 }}>{sel}</div>
          <div className="cap-body" style={{ color: 'var(--w-ink-2)', fontSize: 13, marginTop: 4 }}>
            {pt
              ? 'Pilot vai cruzar clima, família e recursos. Recomendações guiadas (janela, GO/LIMITED, fatores) chegam em HWD-05.'
              : 'Pilot will cross weather, family and resources. Guided recommendations (window, GO/LIMITED, factors) land in HWD-05.'}
          </div>
          <div className="cap-actions">
            <button className="w-chip" onClick={() => { setSel(null); setOpen(true) }}>{pt ? 'trocar' : 'change'}</button>
          </div>
        </>
      ) : (
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
              {ACT.map(a => (
                <button key={a} className="w-chip" onClick={() => { setSel(a); setOpen(false) }}>{a}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
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
