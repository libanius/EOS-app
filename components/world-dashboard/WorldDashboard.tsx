'use client'

/**
 * WorldDashboard — HWD-01 static prototype HUD (doc 16 §8).
 * Real React components over a world plate. Reads live RiskProvider data +
 * inventory/family/checklist. Family markers and route are MOCK and labeled.
 * No map SDK (MapLibre is HWD-02). Reversible: isolated /dashboard-world route.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'
import { useRisk } from '@/components/v2/RiskProvider'
import type { WorldFamilyMarker, WorldRoute } from '@/lib/world/types'
import './world-dashboard.css'

// Set to a path under /public (e.g. '/world/parkland.webp') once the Higgsfield
// image is added. Null → atmospheric placeholder plate (honest, swappable).
const WORLD_IMAGE: string | null = null

// ── mock overlays (HWD-01 only, clearly labeled in the UI) ──
const MOCK_FAMILY: WorldFamilyMarker[] = [
  { id: 'm1', name: 'Paulo', semanticLocation: 'HOME', status: 'green', updatedLabel: '2m', mock: true, plate: { x: 0.52, y: 0.6 } },
  { id: 'm2', name: 'Isadora', semanticLocation: 'SCHOOL', status: 'amber', updatedLabel: '18m', mock: true, plate: { x: 0.7, y: 0.42 } },
  { id: 'm3', name: 'Ana', semanticLocation: 'WORK', status: 'gray', updatedLabel: '1h', mock: true, plate: { x: 0.38, y: 0.36 } },
]
const MOCK_ROUTE: WorldRoute = {
  id: 'r1', status: 'mock', destinationLabel: 'Shelter A', distanceMi: 4.2, durationMin: 11,
  reasons: ['mock route — not live evacuation guidance'],
  plate: [{ x: 0.52, y: 0.6 }, { x: 0.58, y: 0.5 }, { x: 0.55, y: 0.4 }, { x: 0.64, y: 0.3 }],
}

const COPY = {
  pt: {
    eyebrow: 'EOS // WORLD', connectivity: 'Conexão', online: 'Online', offline: 'Offline',
    risk: 'Índice de risco', autonomy: 'Autonomia', days: 'dias',
    water: 'Água', food: 'Comida', checklist: 'Checklist', medical: 'Kit médico', comms: 'Comunicação',
    ok: 'OK', none: '—',
    alerts: 'Alertas ativos', clearBrief: 'Setor limpo — sem alertas', openScenario: 'Abrir cenário',
    temp: 'Temp', wind: 'Vento', aqi: 'AQI', uv: 'UV', hum: 'Umidade', vis: 'Visão',
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
    temp: 'Temp', wind: 'Wind', aqi: 'AQI', uv: 'UV', hum: 'Humidity', vis: 'Visibility',
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

export default function WorldDashboard() {
  const { language } = useLanguage()
  const c = COPY[language]
  const { snapshot, score, state, hasCoords, requestGps, error, refresh } = useRisk()

  const [inv, setInv] = useState<Inv | null>(null)
  const [people, setPeople] = useState(1)
  const [items, setItems] = useState<{ acquired: boolean }[]>([])
  const [online, setOnline] = useState(true)

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

  const plateStyle = useMemo<React.CSSProperties>(
    () => (WORLD_IMAGE ? ({ ['--world-image' as string]: `url(${WORLD_IMAGE})` }) : {}),
    [],
  )

  return (
    <main className="world" data-risk={state}>
      <div className={`world-plate${WORLD_IMAGE ? ' has-image' : ''}`} style={plateStyle} aria-hidden="true" />
      <div className="world-vignette" aria-hidden="true" />

      {/* ── mock route (behind HUD, above plate) ── */}
      <svg className="w-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={routePath(MOCK_ROUTE)} />
        {(() => { const d = MOCK_ROUTE.plate[MOCK_ROUTE.plate.length - 1]; return <circle className="dest" cx={d.x * 100} cy={d.y * 100} r="1.4" /> })()}
      </svg>

      <div className="world-hud">
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
          <div className="w-legend">
            {(['safe', 'watch', 'warning', 'critical'] as const).map(s => (
              <span key={s} className={state === s ? 'on' : ''} style={state === s ? { background: 'var(--w-state)', borderColor: 'var(--w-state)' } : undefined}>
                {STATE_LABEL[language][s]}
              </span>
            ))}
          </div>
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
          <div className="loc">{topAlert ? shorten(topAlert.headline, 46) : c.clearBrief}</div>
          <Link href="/scenario" className="cond">
            <span className="w-dot" />
            {c.openScenario}
          </Link>
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

        {/* ── mock family markers ── */}
        {MOCK_FAMILY.map(m => (
          <div key={m.id} className="w-marker" style={{ left: `${m.plate.x * 100}%`, top: `${m.plate.y * 100}%` }}>
            <span className={`pin fam-${m.status}`}>{m.name.slice(0, 2).toUpperCase()}</span>
            <span className="lab">{m.semanticLocation}</span>
          </div>
        ))}

        {/* honesty labels */}
        <div className="w-badge-mock">{c.mockData}</div>
        {!WORLD_IMAGE && (
          <div className="w-badge-mock" style={{ bottom: 88 }}>{c.placeholderBg}</div>
        )}
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
const shorten = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
function routePath(r: WorldRoute) {
  return r.plate.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${p.y * 100}`).join(' ')
}
