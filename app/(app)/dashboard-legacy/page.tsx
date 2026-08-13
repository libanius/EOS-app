'use client'

/**
 * EOS Living Dashboard (v2) — parallel route, does not touch legacy screens.
 * Risk state, weather snapshot and the Global Risk Island come from
 * RiskProvider (mounted in the (app) layout); this page adds the household
 * data and the instrument cluster.
 * Migration plan: EOS documents/Design System/dashboard-v2-blueprint.md
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'
import RiskProvider, { useRisk } from '@/components/v2/RiskProvider'
import TacticalCard from '@/components/v2/TacticalCard'
// Só a régua: estas telas mostram água em DIAS, não em volume.
import { WATER_LITERS_PER_PERSON_DAY } from '@/lib/units'
import ParticleField from '@/components/v2/ParticleField'
import LivingTimeline from '@/components/v2/LivingTimeline'
import InstrumentDial from '@/components/v2/InstrumentDial'
import CartoLayer from '@/components/v2/CartoLayer'
import RotaryBezelNav from '@/components/v2/RotaryBezelNav'
import '@/components/v2/v2.css'

// ─── copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  pt: {
    title: 'Painel vivo',
    sub: 'Sua situação, agora — lida pelo EOS.',
    conditions: 'Condições',
    timeline: 'Próximas 24 h',
    readiness: 'Prontidão da casa',
    alerts: 'Alertas ativos',
    family: 'Família',
    wind: 'Vento', gust: 'Rajada', precip: 'Chuva', visibility: 'Visibilidade',
    humidity: 'Umidade', uv: 'UV', air: 'Qualidade do ar',
    water: 'Água', food: 'Comida', kit: 'Kit médico', comms: 'Comunicação',
    checklist: 'Checklist', days: 'dias',
    noAlerts: 'SETOR LIMPO — SEM ALERTAS',
    noFamily: 'Nenhum membro cadastrado ainda.',
    addFamily: 'Cadastrar família',
    needLocation: 'Preciso da sua localização para ler as condições ao redor.',
    enableGps: 'Usar GPS',
    loadError: 'Não foi possível carregar os dados.',
    retry: 'Tentar de novo',
    updated: 'Atualizado',
    quake: 'Sismo',
  },
  en: {
    title: 'Living dashboard',
    sub: 'Your situation, right now — read by EOS.',
    conditions: 'Conditions',
    timeline: 'Next 24 h',
    readiness: 'Household readiness',
    alerts: 'Active alerts',
    family: 'Family',
    wind: 'Wind', gust: 'Gust', precip: 'Rain', visibility: 'Visibility',
    humidity: 'Humidity', uv: 'UV', air: 'Air quality',
    water: 'Water', food: 'Food', kit: 'Medical kit', comms: 'Comms',
    checklist: 'Checklist', days: 'days',
    noAlerts: 'SECTOR CLEAR — NO ACTIVE ALERTS',
    noFamily: 'No members registered yet.',
    addFamily: 'Add family',
    needLocation: 'EOS needs your location to read the conditions around you.',
    enableGps: 'Use GPS',
    loadError: 'Could not load data.',
    retry: 'Retry',
    updated: 'Updated',
    quake: 'Quake',
  },
} as const

// ─── unit helpers ─────────────────────────────────────────────────────────────

const toC = (f: number) => Math.round(((f - 32) * 5) / 9)
const toKmh = (mph: number) => Math.round(mph * 1.609)
const toKmTxt = (mi: number) => (mi * 1.609).toFixed(1)

// ─── data shapes from existing APIs ────────────────────────────────────────────

type Inventory = {
  water_liters: number; food_days: number; fuel_liters: number
  battery_percent: number; has_medical_kit: boolean
  has_communication_device: boolean; cash_amount: number
}
type Member = {
  id: string; name: string; age: number | null
  mobility_impaired: boolean; is_infant: boolean
  medications: string | null; medical_conditions: string | null
}
type ChecklistItem = { acquired: boolean }

function readiness(inv: Inventory | null, members: Member[], items: ChecklistItem[]) {
  const people = Math.max(1, members.length)
  const waterDays = inv ? inv.water_liters / (WATER_LITERS_PER_PERSON_DAY * people) : 0
  const foodDays = inv?.food_days ?? 0
  const pct = items.length ? items.filter(i => i.acquired).length / items.length : 0
  const score =
    Math.min(1, waterDays / 3) * 30 +
    Math.min(1, foodDays / 3) * 30 +
    pct * 25 +
    (inv?.has_medical_kit ? 10 : 0) +
    (inv?.has_communication_device ? 5 : 0)
  return { waterDays, foodDays, pct, score: Math.round(score) }
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <RiskProvider>
      <DashboardContent />
    </RiskProvider>
  )
}

function DashboardContent() {
  const { language } = useLanguage()
  const c = COPY[language]
  const { snapshot, score, state, escalation, escFlash, loading: riskLoading, error, hasCoords, requestGps, refresh } = useRisk()

  const [inv, setInv] = useState<Inventory | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [localLoading, setLocalLoading] = useState(true)

  const fetchLocal = useCallback(async () => {
    setLocalLoading(true)
    try {
      const [i, f, k] = await Promise.all([
        fetch('/api/inventory').catch(() => null),
        fetch('/api/family-members').catch(() => null),
        fetch('/api/checklist').catch(() => null),
      ])
      if (i?.ok) setInv((await i.json()).inventory ?? null)
      if (f?.ok) setMembers((await f.json()).members ?? [])
      if (k?.ok) setItems((await k.json()).items ?? [])
    } finally {
      setLocalLoading(false)
    }
  }, [])

  useEffect(() => { fetchLocal() }, [fetchLocal])

  const loading = riskLoading || localLoading
  const ready = readiness(inv, members, items)
  const cur = snapshot?.current

  const metric = language === 'pt'
  const temp = cur ? (metric ? `${toC(cur.temp_f)}°` : `${Math.round(cur.temp_f)}°`) : '--'
  const wind = cur ? (metric ? toKmh(cur.wind_mph) : Math.round(cur.wind_mph)) : 0
  const gust = cur ? (metric ? toKmh(cur.wind_gust_mph) : Math.round(cur.wind_gust_mph)) : 0
  const speedUnit = metric ? 'km/h' : 'mph'
  const vis = cur ? (metric ? toKmTxt(cur.visibility_mi) : cur.visibility_mi.toFixed(1)) : '--'
  const visUnit = metric ? 'km' : 'mi'

  return (
    <main className="eos2" data-risk={state}>
      {/* ── living fog: cartography plate drifting like wind ── */}
      <div className="e2-fog" aria-hidden="true" />
      {/* ── contour lines tinted by the current risk state ── */}
      <CartoLayer />
      {/* ── ambient particles: full-page layer behind every module ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} aria-hidden="true">
        <ParticleField
          density={70}
          windFactor={cur ? Math.min(1, cur.wind_mph / 60) : 0.15}
          rainFactor={cur ? cur.precip_prob_pct / 100 : 0}
          intensity={{ safe: 0.5, watch: 0.8, warning: 1.2, critical: 1.9 }[state]}
        />
      </div>

      {/* ── header ── */}
      <div style={{ position: 'relative' }}>
        <div className="e2-wrap" style={{ paddingTop: 22, paddingBottom: 0, position: 'relative' }}>
          <div className="e2-eyebrow">
            <b>EOS</b>{' // LIVING DASHBOARD'}
          </div>
          <h1 style={{ fontSize: 'clamp(28px,6vw,40px)', fontWeight: 700, letterSpacing: '-0.03em', margin: '10px 0 4px' }}>
            {c.title}
          </h1>
          <p style={{ color: 'var(--e2-tx2)', margin: '0 0 4px', fontSize: 15 }}>
            {c.sub}
            {snapshot && (
              <span className="e2-label" style={{ marginLeft: 10 }}>
                {c.updated} {new Date(snapshot.fetched_at).toLocaleTimeString(language === 'pt' ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="e2-wrap">
        {/* ── location / error / loading gates ── */}
        {!hasCoords && !riskLoading && (
          <div className="e2-card e2-fade-in" style={{ marginTop: 16, textAlign: 'center', padding: 28 }}>
            <p style={{ color: 'var(--e2-tx2)', marginBottom: 16 }}>{c.needLocation}</p>
            <button className="e2-btn primary" onClick={requestGps}>
              <span className="tick" />
              {c.enableGps}
            </button>
          </div>
        )}
        {error && (
          <div className="e2-card e2-fade-in" style={{ marginTop: 16, textAlign: 'center', padding: 28 }}>
            <p style={{ color: 'var(--e2-tx2)', marginBottom: 16 }}>{c.loadError}</p>
            <button className="e2-btn" onClick={() => { refresh(); fetchLocal() }}>
              <span className="tick" />
              {c.retry}
            </button>
          </div>
        )}
        {loading && !snapshot && (
          <div className="e2-grid" style={{ marginTop: 16 }}>
            {[92, 92, 180, 180].map((h, i) => (
              <div key={i} className="e2-skel span2" style={{ height: h }} />
            ))}
          </div>
        )}

        {/* ── modules ── */}
        {snapshot && cur && (
          <div className="e2-grid e2-fade-in" style={{ marginTop: 8 }}>
            {/* instrument dial — the hero, wrapped in the rotary bezel nav */}
            <div className="span2 span4" style={{ padding: '14px 0 4px' }}>
              <div className="e2-case" style={{ paddingTop: 18 }}>
                <RotaryBezelNav
                  size={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 48 : 340)}
                  openLabel={language === 'pt' ? 'tocar p/ abrir' : 'tap to open'}
                  items={[
                    { label: language === 'pt' ? 'Cenário' : 'Scenario', href: '/scenario' },
                    { label: language === 'pt' ? 'Clima' : 'Weather', href: '/weather' },
                    { label: language === 'pt' ? 'Recursos' : 'Inventory', href: '/inventory' },
                    { label: 'Checklist', href: '/checklist' },
                    { label: language === 'pt' ? 'Família' : 'Family', href: '/family' },
                    { label: language === 'pt' ? 'Círculos' : 'Circles', href: '/circles' },
                  ]}
                >
                  <InstrumentDial
                    score={score ?? 0}
                    state={state}
                    readiness={ready.score}
                    wind={gust}
                    windUnit={speedUnit}
                    language={language}
                    led={escFlash && escalation ? escalation.to : null}
                    size={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 48 : 340)}
                  />
                </RotaryBezelNav>
              </div>
            </div>

            {/* conditions */}
            <TacticalCard
              label={c.conditions}
              breathe
              className="span2"
              detail={
                <div className="e2-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div>
                    <span className="e2-label">{c.humidity}</span>
                    <div className="e2-val" style={{ fontSize: 18 }}>{cur.humidity_pct}<span className="e2-unit">%</span></div>
                  </div>
                  <div>
                    <span className="e2-label">{c.uv}</span>
                    <div className="e2-val" style={{ fontSize: 18 }}>{cur.uv_index}</div>
                  </div>
                  <div>
                    <span className="e2-label">{c.air}</span>
                    <div className="e2-val" style={{ fontSize: 18 }}>{snapshot.air_quality?.us_aqi ?? '--'}</div>
                  </div>
                </div>
              }
            >
              <div className="e2-row" style={{ gap: 16, alignItems: 'flex-end' }}>
                <div className="e2-val" style={{ fontSize: 44 }}>{temp}</div>
                <div style={{ paddingBottom: 6 }}>
                  <div style={{ fontSize: 14, color: 'var(--e2-tx2)' }}>{cur.condition}</div>
                  <div className="e2-label" style={{ marginTop: 2 }}>
                    {c.wind} {wind} · {c.gust} {gust} {speedUnit}
                  </div>
                </div>
              </div>
              <div className="e2-row" style={{ marginTop: 12, gap: 18 }}>
                <div style={{ flex: 1 }}>
                  <span className="e2-label">{c.precip}</span>
                  <div className="e2-val" style={{ fontSize: 20 }}>{Math.round(cur.precip_prob_pct)}<span className="e2-unit">%</span></div>
                  <div className="e2-sbar">
                    {snapshot.hourly.slice(0, 12).map((h, i) => (
                      <i key={i} style={{ height: `${Math.max(6, h.precip_prob_pct)}%` }} />
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <span className="e2-label">{c.visibility}</span>
                  <div className="e2-val" style={{ fontSize: 20 }}>{vis}<span className="e2-unit">{visUnit}</span></div>
                  <div className="e2-sbar">
                    {snapshot.hourly.slice(0, 12).map((h, i) => (
                      <i key={i} style={{ height: `${Math.max(6, Math.min(100, h.wind_gust_mph * 1.6))}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </TacticalCard>

            {/* timeline */}
            <TacticalCard label={c.timeline} className="span2">
              <LivingTimeline hourly={snapshot.hourly} state={state} language={language} />
            </TacticalCard>

            {/* readiness */}
            <TacticalCard label={c.readiness} breathe className="span2">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  [c.water, `${ready.waterDays.toFixed(1)} ${c.days}`],
                  [c.food, `${ready.foodDays} ${c.days}`],
                  [c.checklist, `${Math.round(ready.pct * 100)}%`],
                  [c.kit, inv?.has_medical_kit ? 'OK' : '—'],
                  [c.comms, inv?.has_communication_device ? 'OK' : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="e2-row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: 'var(--e2-tx2)' }}>{k}</span>
                    <span className="e2-label" style={{ color: 'var(--e2-state)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </TacticalCard>

            {/* alerts */}
            <TacticalCard label={c.alerts} className="span2">
              {snapshot.alerts.length === 0 && snapshot.earthquakes.length === 0 ? (
                <div className="e2-empty">
                  <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true">
                    <circle cx="19" cy="19" r="16" stroke="var(--e2-line)" strokeWidth="1.5" strokeDasharray="3 5" />
                    <circle cx="19" cy="19" r="3.5" fill="var(--e2-state)" opacity=".7" />
                  </svg>
                  {c.noAlerts}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {snapshot.alerts.slice(0, 4).map(a => {
                    const col = a.severity === 'CRITICAL' ? '#FF6B6B' : a.severity === 'HIGH' ? '#FFB347' : '#7C6BFF'
                    return (
                      <div className="e2-alert" key={a.id}>
                        <span className="sev" style={{ color: col, borderColor: col }}>{a.severity}</span>
                        <p>{a.headline}</p>
                      </div>
                    )
                  })}
                  {snapshot.earthquakes.slice(0, 2).map((q, i) => (
                    <div className="e2-alert" key={`q${i}`}>
                      <span className="sev" style={{ color: '#FFB347', borderColor: '#FFB347' }}>M{q.magnitude.toFixed(1)}</span>
                      <p>{c.quake} — {q.place}</p>
                    </div>
                  ))}
                </div>
              )}
            </TacticalCard>

            {/* family */}
            <TacticalCard label={c.family} className="span2">
              {members.length === 0 ? (
                <div className="e2-empty" style={{ gap: 12 }}>
                  {c.noFamily}
                  <Link href="/family" className="e2-btn" style={{ fontSize: 10, padding: '9px 14px', minHeight: 0 }}>
                    <span className="tick" />
                    {c.addFamily}
                  </Link>
                </div>
              ) : (
                <div className="e2-row">
                  {members.map(m => {
                    const flagged = m.mobility_impaired || m.is_infant || !!m.medications
                    return (
                      <span className="e2-chip" key={m.id}>
                        <span className="init">{m.name.slice(0, 2).toUpperCase()}</span>
                        {m.name.split(' ')[0]}
                        {flagged && <span className="e2-flag" aria-label="needs attention" />}
                      </span>
                    )
                  })}
                </div>
              )}
            </TacticalCard>
          </div>
        )}
      </div>
    </main>
  )
}
