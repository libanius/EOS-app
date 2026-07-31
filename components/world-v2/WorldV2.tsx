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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { useRisk } from '@/components/v2/RiskProvider'
import { useSimulation } from '@/components/SimulationProvider'
import { SOURCE_LABELS, isSourceDown } from '@/lib/simulation'
import WorldMap from '@/components/world-dashboard/WorldMap'
import DetentSheet, { type Detent } from './DetentSheet'
import Pilot from './Pilot'
import PilotBar from './PilotBar'
import MemberSheet from './MemberSheet'
import type { PilotContext } from './pilot-engine'
import type { ShelterSnapshot } from '@/lib/world/shelters'
import type { MapBaseMode } from '@/lib/world/providers'
import { DEFAULT_LAYERS, type MapLayerState } from '@/components/world-dashboard/WorldMap'
import { headingLabel, isRelevant } from '@/lib/world/cyclones'
import { windMeaning } from '@/lib/world/wind'
import { useWeatherLayers } from './useWeatherLayers'
import { Bar, Card, IconButton, Pill, PillLink, SectionLabel, Tile, TileGrid } from './primitives'
import { SPRING, haptic } from './motion'
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
    plan: 'Plano da família',
    actions: 'Ações',
    offline: 'Offline',
    online: 'Online',
    yourArea: 'Sua área',
    locating: 'Sem localização',
    useGps: 'Usar GPS',
    gpsCap: 'Você',
    refreshCap: 'Atualizar',
    layersLabel: 'Camadas',
    base: 'Base do mapa',
    darkBase: 'Escuro',
    satCap: 'Satélite',
    darkCap: 'Camadas',
    layerRadar: 'Chuva',
    layerAlerts: 'Alertas',
    layerWind: 'Vento',
    layerCyclone: 'Ciclone',
    windHere: 'Vento aqui',
    showOnMap: 'Ver no mapa →',
    heading: 'indo para',
    partial: 'Parte do desenho oficial não carregou agora — o traçado na tela pode estar incompleto.',
    stormNear: 'pode virar assunto seu',
    stormFar: 'longe demais para te afetar agora',
    backHome: '← Voltar para a minha área',
    noStorm: 'Nenhum ciclone ativo agora.',
    coneNote: 'O cone é a incerteza da posição do centro, não a área de dano — vento e chuva vão além dele.',
    panelCap: 'Painel',
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
    plan: 'Family plan',
    actions: 'Actions',
    offline: 'Offline',
    online: 'Online',
    yourArea: 'Your area',
    locating: 'No location',
    useGps: 'Use GPS',
    gpsCap: 'You',
    refreshCap: 'Refresh',
    layersLabel: 'Layers',
    base: 'Map base',
    darkBase: 'Dark',
    satCap: 'Satellite',
    darkCap: 'Layers',
    layerRadar: 'Rain',
    layerAlerts: 'Alerts',
    layerWind: 'Wind',
    layerCyclone: 'Cyclone',
    windHere: 'Wind here',
    showOnMap: 'Show on map →',
    heading: 'heading',
    partial: 'Part of the official drawing did not load — what is on screen may be incomplete.',
    stormNear: 'could become your problem',
    stormFar: 'too far to affect you now',
    backHome: '← Back to my area',
    noStorm: 'No active cyclone right now.',
    coneNote: 'The cone is the uncertainty of the centre position, not the damage area — wind and rain reach well beyond it.',
    panelCap: 'Panel',
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
  const [course, setCourse] = useState<{ lat: number; lng: number; label: string; nonce: number } | null>(null)
  const [pilotOpen, setPilotOpen] = useState(false)
  const [pilotAsk, setPilotAsk] = useState<{ text: string; nonce: number } | null>(null)
  const [recenterNonce, setRecenterNonce] = useState(0)

  /** Camadas ligadas pelo usuário — leitura, não dado (D-078). */
  const [layers, setLayers] = useState<MapLayerState>(DEFAULT_LAYERS)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('eos-map-layers')
      if (stored) setLayers(current => ({ ...current, ...JSON.parse(stored) }))
    } catch { /* private mode ou JSON velho */ }
  }, [])
  const toggleLayer = (key: keyof MapLayerState) => {
    haptic.selection()
    setLayers(current => {
      const next = { ...current, [key]: !current[key] }
      try { localStorage.setItem('eos-map-layers', JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }
  const [layersOpen, setLayersOpen] = useState(false)

  const { cyclones, wind, alerts: locatedAlerts } = useWeatherLayers(coords, layers)

  /**
   * Levar a câmera até um alerta.
   *
   * "Tropical Storm Warning" sem lugar nenhum obriga a pessoa a imaginar onde é.
   * O nonce faz o mapa reagir mesmo quando se toca duas vezes no mesmo alerta —
   * sem ele, o segundo toque não mudaria estado e pareceria quebrado.
   */
  const [focus, setFocus] = useState<{ lat: number; lng: number; label: string; nonce: number; kind?: 'place' | 'alert' } | null>(null)
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null)
  /**
   * Levar a câmera até uma tempestade — que pode estar a milhares de quilómetros.
   *
   * Por isso a viagem acende o caminho de volta: sair da própria área sem uma
   * forma óbvia de retornar é abandonar a pessoa longe de casa numa tela que ela
   * abriu para se orientar.
   */
  const [awayFromHome, setAwayFromHome] = useState(false)
  const showStorm = (storm: { id: string; name: string; lat: number; lng: number }) => {
    haptic.impact()
    setDetent('peek')
    setActiveAlertId(storm.id)
    setAwayFromHome(true)
    setFocus({ lat: storm.lat, lng: storm.lng, label: storm.name, nonce: Date.now(), kind: 'alert' })
  }
  const backHome = () => {
    haptic.impact()
    setAwayFromHome(false)
    setActiveAlertId(null)
    setFocus(null)
    setRecenterNonce(n => n + 1)
  }

  const showOnMap = (alert: { id: string; lat: number; lng: number; title: string }) => {
    haptic.impact()
    setDetent('peek')
    setActiveAlertId(alert.id)
    setFocus({ lat: alert.lat, lng: alert.lng, label: alert.title, nonce: Date.now(), kind: 'alert' })
  }

  /**
   * Camada do mapa. Escuro é o padrão operacional; satélite existe porque o
   * traço de rua não distingue prédios de um mesmo condomínio, e a imagem sim.
   * A escolha fica no aparelho: é preferência de leitura, não dado de conta.
   */
  const [mapBase, setMapBase] = useState<MapBaseMode>('dark')
  useEffect(() => {
    try {
      const stored = localStorage.getItem('eos-map-base')
      if (stored === 'dark' || stored === 'satellite') setMapBase(stored)
    } catch { /* private mode */ }
  }, [])
  const setBase = (next: MapBaseMode) => {
    haptic.selection()
    setMapBase(next)
    try { localStorage.setItem('eos-map-base', next) } catch { /* private mode */ }
  }
  const [tappedMember, setTappedMember] = useState<string | null>(null)
  const familyRaw = useCircleFamily(language === 'pt', coords, avatarUrl)
  // A failed instrument must actually be blind, not quietly still working.
  const familyBlind = isSourceDown(simulation.config, 'family')
  const family = useMemo(() => (familyBlind ? [] : familyRaw), [familyBlind, familyRaw])
  const shelterSnapshotRaw = useShelters(coords)
  // A failed instrument must actually be blind, not quietly still working.
  const shelterSnapshot = isSourceDown(simulation.config, 'shelters') ? null : shelterSnapshotRaw

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
      downSources: simulation.config
        ? SOURCE_LABELS.filter(x => isSourceDown(simulation.config, x.key)).map(x => (metric ? x.pt : x.en))
        : [],
      locationLabel: hasCoords ? (metric ? 'Sua área' : 'Your area') : null,
      coords,
      family: family.map(m => ({ name: m.name, lat: m.lat, lng: m.lng, freshness: m.freshness, isMe: m.isMe })),
      shelters: (shelterSnapshot?.shelters ?? []).map(s => ({
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        distanceKm: s.distanceKm,
      })),
    }),
    [metric, state, score, snapshot, hasCoords, coords, data, shelterSnapshot, simulation.active, simulation.config, family],
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
      locatedAlerts={locatedAlerts}
      onShowAlert={showOnMap}
      activeAlertId={activeAlertId}
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
          family={family}
          courseTo={course}
          recenterNonce={recenterNonce}
          mapBase={mapBase}
          focus={focus}
          cyclones={cyclones}
          wind={wind}
          layers={layers}
          onMemberTap={setTappedMember}
          shelters={(shelterSnapshot?.shelters ?? []).map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, distanceKm: s.distanceKm }))}
          onMapInteraction={() => setDetent('peek')}
        />
      </div>
      <div className="wv2-scrim" aria-hidden="true" />

      <PilotBar
        pt={metric}
        riskState={state}
        onOpen={() => setPilotOpen(true)}
        onAsk={question => {
          setPilotOpen(true)
          setPilotAsk({ text: question, nonce: Date.now() })
        }}
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
          <IconButton
            label={c.useGps}
            caption={c.gpsCap}
            active={hasCoords}
            onClick={() => {
              requestGps()
              setRecenterNonce(n => n + 1)
            }}
          >
            <LocationIcon />
          </IconButton>
          <IconButton label={c.refresh} caption={c.refreshCap} onClick={() => { refresh(); data.refresh() }}>
            <RefreshIcon />
          </IconButton>
          <IconButton
            label={c.layersLabel}
            caption={c.darkCap}
            active={layersOpen}
            onClick={() => { haptic.selection(); setLayersOpen(open => !open) }}
          >
            <LayersIcon />
          </IconButton>
          {isDesktop && (
            <IconButton label={c.panel} caption={c.panelCap} active={panelOpen} onClick={() => setPanelOpen(open => !open)}>
              <PanelIcon />
            </IconButton>
          )}
        </div>

        <AnimatePresence>
          {layersOpen && (
            <motion.div
              className="wv2-layers wv2-fume"
              role="group"
              aria-label={c.layersLabel}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(8px)' }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0.12 } : SPRING.pop}
            >
              <p className="t-caps ink-3">{c.base}</p>
              <div className="row">
                <button type="button" className={`wv2-chip${mapBase === 'dark' ? ' on' : ''}`} onClick={() => setBase('dark')}>{c.darkBase}</button>
                <button type="button" className={`wv2-chip${mapBase === 'satellite' ? ' on' : ''}`} onClick={() => setBase('satellite')}>{c.satCap}</button>
              </div>

              <p className="t-caps ink-3">{c.layersLabel}</p>
              <div className="row">
                <button type="button" className={`wv2-chip${layers.radar ? ' on' : ''}`} onClick={() => toggleLayer('radar')}>{c.layerRadar}</button>
                <button type="button" className={`wv2-chip${layers.alerts ? ' on' : ''}`} onClick={() => toggleLayer('alerts')}>{c.layerAlerts}</button>
                <button type="button" className={`wv2-chip${layers.wind ? ' on' : ''}`} onClick={() => toggleLayer('wind')}>{c.layerWind}</button>
                <button type="button" className={`wv2-chip${layers.cyclone ? ' on' : ''}`} onClick={() => toggleLayer('cyclone')}>{c.layerCyclone}</button>
              </div>

              {layers.wind && wind?.atUser && (
                <p className="t-foot ink-2">
                  {c.windHere}: {wind.atUser.speedKmh} km/h {headingLabel(wind.atUser.fromDeg, metric) ?? ''} · {windMeaning(wind.atUser.speedKmh, metric)}
                </p>
              )}
              {/*
                Cada tempestade é um BOTÃO: tocar leva a câmera até ela. Antes era
                texto com cara de link — o dono tocou e nada aconteceu, com razão.
                E a linha diz se aquilo é assunto dele: um ciclone a 5.000 km,
                noutra bacia, com o mesmo destaque de um a 300 km, insinua uma
                ameaça que não existe.
              */}
              {layers.cyclone && cyclones && !cyclones.empty && cyclones.storms.map(storm => (
                <button
                  key={storm.id}
                  type="button"
                  className={`wv2-stormline${isRelevant(storm) ? ' near' : ''}${activeAlertId === storm.id ? ' showing' : ''}`}
                  onClick={() => showStorm(storm)}
                >
                  <span className="t-sub">
                    {storm.name} · {storm.windKmh} km/h · {c.heading} {headingLabel(storm.headingDeg, metric) ?? '—'}
                  </span>
                  <em className="t-foot ink-3">
                    {storm.distanceKm} km · {isRelevant(storm) ? c.stormNear : c.stormFar} · {c.showOnMap}
                  </em>
                </button>
              ))}
              {awayFromHome && (
                <button type="button" className="wv2-chip" onClick={backHome}>
                  {c.backHome}
                </button>
              )}
              {layers.cyclone && cyclones?.empty && <p className="t-foot ink-3">{c.noStorm}</p>}
              {layers.cyclone && cyclones && !cyclones.empty && <p className="t-foot ink-3">{c.coneNote}</p>}
              {/* Desenho incompleto tem que se anunciar: um cone que não carregou
                  é indistinguível de um cone que não existe. */}
              {layers.cyclone && cyclones?.missing?.length ? (
                <p className="t-foot warn">{c.partial}</p>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
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

      <MemberSheet
        member={family.find(m => m.id === tappedMember) ?? null}
        pt={metric}
        myCoords={coords}
        onClose={() => setTappedMember(null)}
        onShowCourse={destination => {
          setCourse({ ...destination, nonce: Date.now() })
          setDetent('peek')
        }}
      />

      {/* Always reachable, above every other surface — that is the whole point. */}
      <div className="wv2-chrome">
        <Pilot
          ctx={pilotContext}
          online={data.online}
          open={pilotOpen}
          onOpenChange={setPilotOpen}
          incoming={pilotAsk}
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
  locatedAlerts: Array<{ id: string; title: string; severity: string; lat: number; lng: number }>
  onShowAlert: (alert: { id: string; lat: number; lng: number; title: string }) => void
  /** Qual alerta está sendo mostrado no mapa agora. */
  activeAlertId: string | null
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
  locatedAlerts,
  onShowAlert,
  activeAlertId,
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
        <PillLink href="/plan">{c.plan}</PillLink>
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
        {locatedAlerts.length ? (
          <div className="wv2-alertlist">
            {locatedAlerts.slice(0, 4).map(alert => (
              <button
                key={alert.id}
                type="button"
                className={alert.id === activeAlertId ? 'showing' : ''}
                onClick={() => onShowAlert(alert)}
              >
                <span className="t-body">{alert.title}</span>
                <em className="t-foot ink-3">{c.showOnMap}</em>
              </button>
            ))}
            <PillLink href="/weather">{c.seeAlerts}</PillLink>
          </div>
        ) : headlines.length ? (
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

/** Camadas empilhadas — a metáfora que todo app de mapa usa para base layer. */
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3 12.5 12 17l9-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3 17 12 21.5 21 17" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" opacity="0.55" />
    </svg>
  )
}

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
