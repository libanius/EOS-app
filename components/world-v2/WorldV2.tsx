'use client'

/**
 * WorldV2 — the rebuilt World Dashboard surface.
 *
 * The map is the existing HWD WorldMap, unchanged and kept black. Everything
 * above it is new: one material system, one type scale, one set of springs.
 *
 * Composition follows the platform convention rather than inventing one —
 * a draggable detent sheet on touch, a parallel side panel on a pointer device.
 * Both render the SAME sections from the same primitives, so the two form
 * factors cannot drift apart.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { useRisk } from '@/components/v2/RiskProvider'
import { useSimulation } from '@/components/SimulationProvider'
import WorldMap from '@/components/world-dashboard/WorldMap'
import DetentSheet, { type Detent } from './DetentSheet'
import Pilot from './Pilot'
import MapSearch from './MapSearch'
import type { GeocodeResult } from '@/app/api/geocode/search/route'
import type { PilotContext } from './pilot-engine'
import type { ShelterSnapshot } from '@/lib/world/shelters'
import { Bar, Card, IconButton, Pill, PillLink, SectionLabel, Tile, TileGrid } from './primitives'
import { SPRING } from './motion'
import { useCircleFamily } from './useCircleFamily'
import { useShelters } from './useShelters'
import { compassPoint } from '@/lib/world/shelters'
import { directionsUrl, formatDistance, walkingMinutes } from '@/lib/world/navigation'
import { useWorldData } from './useWorldData'
import './world-v2.css'

const COPY = {
  pt: {
    riskIndex: 'Índice de risco',
    readinessLabel: 'Prontidão',
    readiness: 'Prontidão',
    autonomy: 'Autonomia da família',
    autonomyHint: 'limitada pelo recurso mais escasso',
    days: 'dias',
    day: 'dia',
    reserves: 'Reservas',
    water: 'Água',
    food: 'Comida',
    power: 'Energia',
    fuel: 'Combustível',
    conditions: 'Condições agora',
    alerts: 'Alertas ativos',
    noAlerts: 'Nenhum alerta oficial na sua área',
    seeAlerts: 'Ver alertas',
    scenario: 'Abrir cenário',
    checklist: 'Checklist',
    actions: 'Ações',
    offline: 'Offline',
    online: 'Online',
    yourArea: 'Sua área',
    locating: 'Sem localização',
    useGps: 'Usar GPS',
    refresh: 'Atualizar dados',
    panel: 'Mostrar ou ocultar o painel',
    open: 'Abrir',
    expand: 'Expandir',
    collapse: 'Recolher',
    sheetLabel: 'Situação da família',
    grabber: 'Arraste para redimensionar o painel, ou toque para alternar',
    shelters: 'Abrigos oficiais',
    noShelters: 'Nenhum abrigo aberto perto de você. É o normal fora de desastre ativo.',
    sheltersError: 'Não foi possível consultar o FEMA agora.',
    directions: 'Como chegar',
    onFoot: 'a pé',
    capacityUnknown: 'FEMA não informa vagas nem acessibilidade deste abrigo.',
    provenance: 'Pontos da família aparecem só para quem ativou o compartilhamento, sempre com a idade do ponto. Rota e abrigo estão fora do mapa até haver fonte oficial.',
    checklistDone: 'Checklist',
    temp: 'Temp',
    wind: 'Vento',
    uv: 'UV',
    aqi: 'AQI',
    humidity: 'Umidade',
    visibility: 'Visão',
  },
  en: {
    riskIndex: 'Risk index',
    readinessLabel: 'Readiness',
    readiness: 'Readiness',
    autonomy: 'Family autonomy',
    autonomyHint: 'bounded by the scarcest reserve',
    days: 'days',
    day: 'day',
    reserves: 'Reserves',
    water: 'Water',
    food: 'Food',
    power: 'Power',
    fuel: 'Fuel',
    conditions: 'Conditions now',
    alerts: 'Active alerts',
    noAlerts: 'No official alert in your area',
    seeAlerts: 'See alerts',
    scenario: 'Open scenario',
    checklist: 'Checklist',
    actions: 'Actions',
    offline: 'Offline',
    online: 'Online',
    yourArea: 'Your area',
    locating: 'No location',
    useGps: 'Use GPS',
    refresh: 'Refresh data',
    panel: 'Show or hide the panel',
    open: 'Open',
    expand: 'Expand',
    collapse: 'Collapse',
    sheetLabel: 'Family situation',
    grabber: 'Drag to resize the panel, or tap to cycle',
    shelters: 'Official shelters',
    noShelters: 'No open shelter near you. That is normal outside an active disaster.',
    sheltersError: 'Could not reach FEMA right now.',
    directions: 'Directions',
    onFoot: 'on foot',
    capacityUnknown: 'FEMA does not report capacity or accessibility for this shelter.',
    provenance: 'Family points appear only for members who enabled sharing, always with the age of the point. Route and shelter stay off the map until there is an official source.',
    checklistDone: 'Checklist',
    temp: 'Temp',
    wind: 'Wind',
    uv: 'UV',
    aqi: 'AQI',
    humidity: 'Humidity',
    visibility: 'Visibility',
  },
} as const

const STATE_LABEL = {
  pt: { safe: 'Estável', watch: 'Atenção', warning: 'Alerta', critical: 'Crítico' },
  en: { safe: 'Stable', watch: 'Watch', warning: 'Warning', critical: 'Critical' },
} as const

export default function WorldV2() {
  const { language } = useLanguage()
  const c = COPY[language]
  const metric = language === 'pt'
  const reduceMotion = useReducedMotion()

  const { snapshot, score, state, hasCoords, coords, requestGps, refresh } = useRisk()
  const data = useWorldData()
  const simulation = useSimulation()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [searched, setSearched] = useState<{ lat: number; lng: number; label: string; nonce: number } | null>(null)
  const [course, setCourse] = useState<{ lat: number; lng: number; label: string; nonce: number } | null>(null)
  const family = useCircleFamily(language === 'pt', coords, avatarUrl)
  const shelterSnapshot = useShelters(coords)

  const [detent, setDetent] = useState<Detent>('peek')
  const [isDesktop, setIsDesktop] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [ready, setReady] = useState(false)

  // The self puck wears the user's photo; without one it falls back to the EOS
  // mark, so the puck is never an empty circle.
  useEffect(() => {
    let cancelled = false
    fetch('/api/profile/personalization')
      .then(response => (response.ok ? response.json() : null))
      .then((data: { personalization?: { avatar_url?: string | null } } | null) => {
        if (!cancelled) setAvatarUrl(data?.personalization?.avatar_url ?? null)
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null)
      })
    return () => { cancelled = true }
  }, [])

  // Layout is chosen after mount so the server never guesses the form factor;
  // the chrome cross-fades in once resolved instead of snapping between the two.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)')
    const sync = () => setIsDesktop(query.matches)
    sync()
    setReady(true)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const current = snapshot?.current
  const alertCount = (snapshot?.alerts.length ?? 0) + (snapshot?.earthquakes.length ?? 0)
  const headlines = useMemo(() => (snapshot?.alerts ?? []).slice(0, 2), [snapshot])
  const stateLabel = STATE_LABEL[language][state]

  const conditionLine = current
    ? `${metric ? toC(current.temp_f) : Math.round(current.temp_f)}° · ${
        metric ? `${toKmh(current.wind_mph)} km/h` : `${Math.round(current.wind_mph)} mph`
      }`
    : data.online
      ? '—'
      : c.offline

  // Everything the copilot reasons over, in one object. Rebuilt on every data
  // tick so an open Pilot console keeps answering the current situation.
  const pilotContext: PilotContext = useMemo(
    () => ({
      pt: metric,
      riskState: state,
      score,
      snapshot,
      online: data.online,
      hasCoords,
      household: data.household,
      inventory: data.inventory,
      checklistPct: data.checklistPct,
      waterDays: data.waterDays,
      foodDays: data.foodDays,
      powerDays: data.powerDays,
      fuelDays: data.fuelDays,
      autonomyDays: data.autonomyDays,
      nearestShelter: shelterSnapshot?.shelters[0]
        ? { name: shelterSnapshot.shelters[0].name, distanceKm: shelterSnapshot.shelters[0].distanceKm }
        : null,
      sheltersKnown: Boolean(shelterSnapshot),
      simulated: simulation.active,
      locationLabel: hasCoords ? (metric ? 'Sua área' : 'Your area') : null,
      coords,
      family: family.map(m => ({ name: m.name, lat: m.lat, lng: m.lng, freshness: m.freshness, isMe: m.isMe })),
      shelters: (shelterSnapshot?.shelters ?? []).map(s => ({
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        distanceKm: s.distanceKm,
      })),
      searchedPlace: searched ? { label: searched.label, lat: searched.lat, lng: searched.lng } : null,
    }),
    [metric, state, score, snapshot, hasCoords, coords, data, shelterSnapshot, simulation.active, family, searched],
  )

  const sections = (
    <WorldSections
      c={c}
      metric={metric}
      score={score}
      stateLabel={stateLabel}
      data={data}
      current={current}
      aqi={snapshot?.air_quality?.us_aqi ?? null}
      alertCount={alertCount}
      headlines={headlines}
      hasCoords={hasCoords}
      onUseGps={requestGps}
      shelters={shelterSnapshot}
      conditionLine={conditionLine}
    />
  )

  return (
    <main className="wv2" data-risk={state} data-ready={ready}>
      <div className="wv2-map">
        <WorldMap
          state={state}
          plateUrl="/world/parkland.webp"
          mapBase="dark"
          family={family}
          focus={searched}
          courseTo={course}
          shelters={(shelterSnapshot?.shelters ?? []).map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, distanceKm: s.distanceKm }))}
          onMapInteraction={() => setDetent('peek')}
        />
      </div>
      <div className="wv2-scrim" aria-hidden="true" />

      <MapSearch
        pt={metric}
        near={coords}
        onPick={(result: GeocodeResult) =>
          setSearched({ lat: result.lat, lng: result.lng, label: result.name, nonce: Date.now() })
        }
        onClear={() => setSearched(null)}
      />

      <div className="wv2-layer wv2-chrome">
        {/* Textual equivalent of the map for assistive technology. */}
        <p className="wv2-sr" role="status">
          {`${c.riskIndex} ${score ?? '—'}, ${stateLabel}. ${
            hasCoords ? c.yourArea : c.locating
          }. ${alertCount} ${c.alerts.toLowerCase()}. ${
            headlines[0]?.headline ?? c.noAlerts
          }.`}
        </p>


        <div className="wv2-mapcontrols">
          <IconButton label={c.useGps} onClick={requestGps} active={hasCoords}>
            <LocationIcon />
          </IconButton>
          <IconButton label={c.refresh} onClick={() => { refresh(); data.refresh() }}>
            <RefreshIcon />
          </IconButton>
          {isDesktop && (
            <IconButton label={c.panel} active={panelOpen} onClick={() => setPanelOpen(open => !open)}>
              <PanelIcon />
            </IconButton>
          )}
        </div>
      </div>

      <div className="wv2-chrome">
        {isDesktop ? (
          <motion.aside
            className="wv2-panel"
            aria-label={c.sheetLabel}
            initial={false}
            animate={{ x: panelOpen ? 0 : '-115%' }}
            transition={reduceMotion ? { duration: 0 } : SPRING.move}
          >
            <div className="wv2-panel-scroll">{sections}</div>
          </motion.aside>
        ) : (
          <DetentSheet
            detent={detent}
            onDetentChange={setDetent}
            label={c.sheetLabel}
            grabberLabel={c.grabber}
            summary={
              <>
                <span className="lead">
                  <strong className="t-title1">{score ?? '—'}</strong>
                  <span className="t-sub ink-2">
                    {stateLabel} · {alertCount} {c.alerts.toLowerCase()}
                  </span>
                </span>
                <span className="t-caps ink-3">
                  {detent === 'peek' ? c.open : detent === 'medium' ? c.expand : c.collapse}
                </span>
              </>
            }
          >
            {sections}
          </DetentSheet>
        )}
      </div>

      {/* Always reachable, above every other surface — that is the whole point. */}
      <div className="wv2-chrome">
        <Pilot
          ctx={pilotContext}
          online={data.online}
          onShowCourse={destination => {
            setCourse({ ...destination, nonce: Date.now() })
            // "Show on map" has to actually reveal the map: collapse the sheet
            // so the course is not drawn behind it.
            setDetent('peek')
          }}
        />
      </div>
    </main>
  )
}

/* ── Sections: identical on both form factors ─────────────────────────────── */

type SectionProps = {
  c: (typeof COPY)[keyof typeof COPY]
  metric: boolean
  score: number | null
  stateLabel: string
  data: ReturnType<typeof useWorldData>
  current: NonNullable<ReturnType<typeof useRisk>['snapshot']>['current'] | undefined
  aqi: number | null
  alertCount: number
  headlines: Array<{ id: string; headline: string }>
  hasCoords: boolean
  onUseGps: () => void
  shelters: ShelterSnapshot | null
  conditionLine: string
}

function WorldSections({
  c,
  metric,
  score,
  stateLabel,
  data,
  current,
  aqi,
  alertCount,
  headlines,
  hasCoords,
  onUseGps,
  shelters,
  conditionLine,
}: SectionProps) {
  return (
    <>
      {/* ── Risk: the one number this screen exists to communicate ── */}
      <Card accented>
        <SectionLabel trailing={data.online ? c.online : c.offline}>{c.riskIndex}</SectionLabel>
        {/* Two paired figures: how bad it is, and how ready you are. They only
            mean something next to each other — a risk of 9 reads differently at
            20% readiness than at 90%. */}
        <div className="wv2-pair">
          <div className="fig">
            <span className="t-display accent">{score ?? '—'}</span>
            <span className="t-sub ink-2">{stateLabel}</span>
          </div>
          <span className="sep" aria-hidden="true" />
          <div className="fig">
            <span className="t-display">{data.checklistPct}<i>%</i></span>
            <span className="t-sub ink-2">{c.readinessLabel}</span>
          </div>
        </div>
        <p className="t-sub ink-2" style={{ marginTop: '0.75rem' }}>
          {hasCoords ? c.yourArea : c.locating} · {conditionLine}
        </p>
        {!hasCoords && (
          <div style={{ marginTop: '1rem' }}>
            <Pill wide onClick={onUseGps}>
              {c.useGps}
            </Pill>
          </div>
        )}
      </Card>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <PillLink href="/scenario" primary>
          {c.scenario}
        </PillLink>
        <PillLink href="/checklist">{c.checklist}</PillLink>
      </div>

      {/* ── Autonomy ── */}
      <Card>
        <SectionLabel trailing={c.autonomyHint}>{c.autonomy}</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.25rem 0 1rem' }}>
          <span className="t-figure">{formatDays(data.autonomyDays)}</span>
          <span className="t-title2 ink-2">{data.autonomyDays === 1 ? c.day : c.days}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Bar
            label={c.water}
            value={`${formatDays(data.waterDays)} ${c.days}`}
            fraction={data.waterDays / 7}
            low={data.waterDays < 3}
          />
          <Bar
            label={c.food}
            value={`${formatDays(data.foodDays)} ${c.days}`}
            fraction={data.foodDays / 8}
            low={data.foodDays < 3}
          />
          <Bar
            label={c.power}
            value={`${formatDays(data.powerDays)} ${c.days}`}
            fraction={data.powerDays / 3}
            low={data.powerDays < 2}
          />
          <Bar
            label={c.fuel}
            value={`${formatDays(data.fuelDays)} ${c.days}`}
            fraction={data.fuelDays / 3}
            low={data.fuelDays < 2}
          />
        </div>
      </Card>

      {/* ── Alerts ── */}
      <Card>
        <SectionLabel trailing={`${alertCount}`}>{c.alerts}</SectionLabel>
        {headlines.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
            {headlines.map(alert => (
              <p key={alert.id} className="t-body">
                {alert.headline}
              </p>
            ))}
            <PillLink href="/weather">{c.seeAlerts}</PillLink>
          </div>
        ) : (
          <p className="t-body ink-2" style={{ marginTop: '0.25rem' }}>
            {c.noAlerts}
          </p>
        )}
      </Card>

      {/* ── Official shelters (D-065). "None open" is a real answer. ── */}
      <Card>
        <SectionLabel trailing={shelters?.shelters.length ? `${shelters.shelters.length}` : undefined}>
          {c.shelters}
        </SectionLabel>
        {shelters?.error ? (
          <p className="t-body ink-2" style={{ marginTop: '0.25rem' }}>{c.sheltersError}</p>
        ) : shelters?.shelters.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
            {shelters.shelters.slice(0, 2).map(shelter => (
              <div key={shelter.id}>
                <p className="t-body">{shelter.name}</p>
                <p className="t-sub ink-2" style={{ marginTop: 2 }}>
                  {formatDistance(shelter.distanceKm, metric)} · {compassPoint(shelter.bearing, metric)}
                  {shelter.distanceKm <= 12 ? ` · ~${walkingMinutes(shelter.distanceKm)} min ${c.onFoot}` : ''}
                </p>
                <div style={{ marginTop: '0.5rem' }}>
                  <a
                    className="wv2-pill"
                    href={directionsUrl({ lat: shelter.lat, lng: shelter.lng }, shelter.name)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.directions}
                  </a>
                </div>
              </div>
            ))}
            <p className="t-foot ink-3">{c.capacityUnknown}</p>
          </div>
        ) : (
          <p className="t-body ink-2" style={{ marginTop: '0.25rem' }}>
            {shelters ? c.noShelters : '—'}
          </p>
        )}
      </Card>

      {/* ── Conditions ── */}
      {current && (
        <Card>
          <SectionLabel>{c.conditions}</SectionLabel>
          <TileGrid>
            <Tile label={c.temp} value={`${metric ? toC(current.temp_f) : Math.round(current.temp_f)}°`} />
            <Tile
              label={c.wind}
              value={metric ? `${toKmh(current.wind_mph)}` : `${Math.round(current.wind_mph)}`}
            />
            <Tile label={c.uv} value={`${current.uv_index}`} />
            <Tile label={c.aqi} value={`${aqi ?? '—'}`} />
            <Tile label={c.humidity} value={`${current.humidity_pct}%`} />
            <Tile
              label={c.visibility}
              value={metric ? toKmTxt(current.visibility_mi) : current.visibility_mi.toFixed(1)}
            />
          </TileGrid>
        </Card>
      )}

      {/* ── What is measured vs. what is inferred ── */}
      <p className="wv2-provenance t-foot">{c.provenance}</p>
    </>
  )
}

/* ── Icons ────────────────────────────────────────────────────────────────── */

function LocationIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 3 14.5 21l-2.6-7.9L4 10.5 21 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M20 3.5V8h-4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 4v16" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

const toC = (f: number) => Math.round(((f - 32) * 5) / 9)
const toKmh = (mph: number) => Math.round(mph * 1.609)
const toKmTxt = (mi: number) => (mi * 1.609).toFixed(1)

function formatDays(days: number) {
  if (!Number.isFinite(days) || days <= 0) return '0'
  if (days >= 10) return String(Math.round(days))
  return days >= 3 ? days.toFixed(0) : days.toFixed(1)
}
