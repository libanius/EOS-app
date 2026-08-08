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

import { useEffect, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { restingVerdict } from './resting-verdict'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { useRisk } from '@/components/v2/RiskProvider'
import { useSimulation } from '@/components/SimulationProvider'
import { SOURCE_LABELS, isSourceDown } from '@/lib/simulation'
import WorldMap from '@/components/world-dashboard/WorldMap'
import DetentSheet, { type Detent } from './DetentSheet'
import PilotBar from './PilotBar'
import MemberSheet from './MemberSheet'
import type { PilotContext } from './pilot-engine'
import type { ShelterSnapshot } from '@/lib/world/shelters'
import type { MapBaseMode } from '@/lib/world/providers'
import { DEFAULT_LAYERS, type MapLayerState } from '@/components/world-dashboard/WorldMap'
import { headingLabel, isRelevant, stormBounds } from '@/lib/world/cyclones'
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
import { usePilot } from './PilotProvider'

const COPY = {
  pt: {
    riskIndex: 'Índice de risco',
    readinessLabel: 'Prontidão',
    checklistLabel: 'Checklist',
    readiness: 'Prontidão',
    autonomy: 'Autonomia da família',
    autonomyHint: 'água ou comida, o que acabar antes',
    autonomyCapability: 'Não limita a autonomia',
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
    checklist: 'Preparação',
    plan: 'Plano da família',
    actions: 'Ações',
    offline: 'Offline',
    online: 'Online',
    yourArea: 'Sua área',
    locating: 'Sem localização',
    useGps: 'Usar GPS',
    gpsCap: 'Você',
    refreshCap: 'Atualizar',
    moreControls: 'Mais controles do mapa',
    lessControls: 'Recolher controles',
    layersLabel: 'Camadas',
    base: 'Base do mapa',
    darkBase: 'Escuro',
    satCap: 'Satélite',
    darkCap: 'Camadas',
    layerRadar: 'Chuva',
    layerAlerts: 'Alertas',
    layerWind: 'Vento',
    layerCyclone: 'Ciclone',
    layerFlood: 'Flood',
    layerSurge: 'Surge',
    layerWindImpact: 'Vento impacto',
    layerTornado: 'Tornado',
    windHere: 'Vento aqui',
    windImpactNote: 'Impacto de vento é derivado do grid atual; avisos oficiais continuam em Alertas.',
    tornadoNote: 'Direção de tornado só aparece quando o aviso oficial informa movimento.',
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
    fix: 'Resolver',
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
    checklistLabel: 'Checklist',
    readiness: 'Readiness',
    autonomy: 'Family autonomy',
    autonomyHint: 'water or food, whichever runs out first',
    autonomyCapability: 'Does not bound autonomy',
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
    checklist: 'Preparedness',
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
    layerFlood: 'Flood',
    layerSurge: 'Surge',
    layerWindImpact: 'Wind impact',
    layerTornado: 'Tornado',
    windHere: 'Wind here',
    windImpactNote: 'Wind impact is derived from the current grid; official warnings remain in Alerts.',
    tornadoNote: 'Tornado direction appears only when the official warning includes motion.',
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
    moreControls: 'More map controls',
    lessControls: 'Collapse controls',
    panel: 'Show or hide the panel',
    open: 'Open',
    fix: 'Fix',
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
  /*
   * A conversa é a do app inteiro (D-137).
   *
   * Esta tela montava o PRÓPRIO `<Pilot>`, com as próprias mensagens, enquanto
   * o dock montava outro. Sair do dashboard e voltar perdia tudo o que tinha
   * sido perguntado. Agora o Pilot é um só, montado no layout; aqui ficam a
   * barra de busca e o mapa que ela precisa desenhar.
   */
  const pilot = usePilot()
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
  /** Os controles de ajuste do mapa, recolhidos em repouso (D-131). */
  const [controlsOpen, setControlsOpen] = useState(false)

  /*
   * `Escape` fecha o painel de Camadas (D-128).
   *
   * O Pilot já fazia isso; o painel de camadas não. Duas superfícies
   * sobrepostas na mesma tela, uma que solta e outra que prende.
   */
  useEffect(() => {
    if (!layersOpen) return
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') setLayersOpen(false) }
    window.addEventListener('keydown', sair)
    return () => window.removeEventListener('keydown', sair)
  }, [layersOpen])

  const { cyclones, wind, alerts: locatedAlerts } = useWeatherLayers(coords, layers)

  /**
   * Levar a câmera até um alerta.
   *
   * "Tropical Storm Warning" sem lugar nenhum obriga a pessoa a imaginar onde é.
   * O nonce faz o mapa reagir mesmo quando se toca duas vezes no mesmo alerta —
   * sem ele, o segundo toque não mudaria estado e pareceria quebrado.
   */
  type MapFocus = {
    lat: number
    lng: number
    label: string
    nonce: number
    kind?: 'place' | 'alert'
    bounds?: [[number, number], [number, number]]
  }
  const [focus, setFocus] = useState<MapFocus | null>(null)
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
    setFocus({
      lat: storm.lat,
      lng: storm.lng,
      label: storm.name,
      nonce: Date.now(),
      kind: 'alert',
      // Enquadrar o cone, não mergulhar no olho: a pergunta é "minha casa está
      // dentro?", e ela não existe se o cone não couber na tela.
      bounds: cyclones ? stormBounds(cyclones, storm) ?? undefined : undefined,
    })
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

  /*
   * O que a faixa de repouso diz (D-128).
   *
   * Função pura, testada em `lib/__tests__/resting-verdict.test.ts`: a tela
   * renderiza o resultado, não decide. O que ela garante é que a linha nunca
   * fica otimista — se a casa está pior que o tempo, é da casa que ela fala.
   */
  const veredito = restingVerdict({
    riskState: state,
    score: score ?? null,
    stateLabel,
    autonomyDays: data?.autonomyDays ?? null,
    checklistPct: data?.checklistPct ?? 0,
    alertCount,
    pt: language === 'pt',
  })

  const conditionLine = current
    ? `${metric ? toC(current.temp_f) : Math.round(current.temp_f)}° · ${
        metric ? `${toKmh(current.wind_mph)} km/h` : `${Math.round(current.wind_mph)} mph`
      }`
    : data.online
      ? '—'
      : c.offline

  // Everything the copilot reasons over, in one object. Rebuilt on every data
  // tick so an open Pilot console keeps answering the current situation.
  /* "Ver no mapa" só existe onde há mapa. Esta é a tela que tem. */
  useEffect(
    () =>
      pilot.registerCourse(destination => {
        setCourse({ ...destination, nonce: Date.now() })
        // Tem que REVELAR o mapa: recolhe a folha, senão o trajeto é desenhado
        // atrás dela.
        setDetent('peek')
      }),
    [pilot],
  )

  /*
   * O que SÓ o dashboard sabe (D-137).
   *
   * Casa, despensa, checklist e autonomia NÃO entram aqui: são iguais em toda
   * tela e vêm de `usePilotFacts`, no Pilot montado pelo layout. Foi a
   * divergência dessas quatro coisas que fez o mesmo Pilot dizer "checklist 0%,
   * não sei quem mora aí" numa tela e "88%, limitante 0.7d" na outra.
   *
   * O que esta tela tem de próprio é o MAPA: abrigos carregados, posições da
   * família, o ciclone desenhado, o vento medido. Sem passar isso adiante,
   * unificar deixaria o Pilot pior justamente onde ele é mais usado — a mesma
   * armadilha do D-079, quando o mapa desenhava o cone e o Pilot dizia não
   * enxergar o evento.
   */
  const enriquecer = useCallback(
    (base: PilotContext): PilotContext => ({
      ...base,
      pt: metric,
      riskState: state,
      score,
      snapshot,
      online: data.online,
      hasCoords,
      /*
       * `powerDays`, `fuelDays` e `autonomyDays` NÃO entram aqui.
       *
       * Sobraram da versão antiga e o lint os apontou. Se ficassem, o Pilot
       * leria a autonomia desta tela no dashboard e a de `usePilotFacts` nas
       * outras — que é exatamente a divergência que este conserto elimina.
       * Reservas são iguais em toda parte; vêm da base.
       */
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
      // D-079: o mapa desenhava o cone e o Pilot dizia que não enxergava o
      // evento. O dado existia e não era enviado — a mesma armadilha de
      // estender uma ponta e esquecer a outra.
      cyclones: (cyclones?.storms ?? []).map(st => ({
        name: st.name,
        classification: st.classification,
        windKmh: st.windKmh,
        distanceKm: st.distanceKm,
        headingDeg: st.headingDeg,
        speedKmh: st.speedKmh,
        relevant: isRelevant(st),
      })),
      wind: wind?.atUser
        ? { speedKmh: wind.atUser.speedKmh, gustKmh: wind.atUser.gustKmh, fromDeg: wind.atUser.fromDeg }
        : base.wind,
    }),
    [metric, state, score, snapshot, hasCoords, coords, data.online, shelterSnapshot, simulation.active, simulation.config, family, cyclones, wind],
  )

  useEffect(() => pilot.registerContext(enriquecer), [pilot, enriquecer])

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
      veredito={veredito}
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
        onOpen={() => pilot.setOpen(true)}
        onAsk={question => pilot.ask(question)}
      />

      <div className="wv2-layer wv2-chrome">
        {/* Textual equivalent of the map for assistive technology. */}
        <p className="wv2-sr" role="status">
          {/*
            A leitura de tela anunciava só a metade tranquilizadora: índice,
            estado, alertas — e nunca a autonomia nem a prontidão. Quem usa
            leitor recebia um retrato mais confortável que o de quem enxerga.
          */}
          {`${c.riskIndex} ${score ?? '—'}, ${stateLabel}. ${
            hasCoords ? c.yourArea : c.locating
          }. ${alertCount} ${c.alerts.toLowerCase()}. ${
            headlines[0]?.headline ?? c.noAlerts
          }. ${veredito.lead}${veredito.line}.`}
        </p>


        {/*
          Os controles do mapa recolhem (D-131).

          O relatório mediu dezesseis controles visíveis em repouso e cinco
          objetos disputando o olho: o orbe do Pilot, esta cápsula verde, o pulso
          do puck, o número da faixa e o orbe elevado da navegação. Numa tela que
          uma família abre sob estresse, isso pede mais do que informa.

          "Você" fica de fora do recolhimento de propósito: centralizar no
          próprio ponto é o gesto mais usado num mapa, e escondê-lo atrás de um
          toque cobraria dois gestos pelo mais comum. Atualizar e Camadas — que
          são ajuste, não leitura — entram.

          O que sai da tela em repouso não some do produto: fica a um toque, com
          o rótulo à vista quando aberto.
        */}
        <div className="wv2-mapcontrols" data-open={controlsOpen ? '' : undefined}>
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

          {controlsOpen && (
            <>
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
            </>
          )}

          <IconButton
            label={controlsOpen ? c.lessControls : c.moreControls}
            active={controlsOpen}
            onClick={() => {
              haptic.selection()
              setControlsOpen(o => !o)
              if (controlsOpen) setLayersOpen(false)
            }}
          >
            <span className="wv2-more" aria-hidden="true">{controlsOpen ? '×' : '···'}</span>
          </IconButton>
        </div>

        {/*
          Fechar o painel de Camadas (D-128).

          Ele não tinha saída: sem botão de fechar, sem `Escape`, sem toque
          fora — e cobrindo 54% do próprio botão que o abriu. Um mau toque numa
          pilha de três controles prendia a pessoa na tela inicial do app.

          O escurecido é transparente de propósito: ele existe para capturar o
          toque, não para escurecer. Um painel de utilidade não merece o peso
          visual de uma tarefa modal.
        */}
        <AnimatePresence>
          {layersOpen && (
            <div
              className="wv2-layers-catch"
              role="presentation"
              onClick={() => setLayersOpen(false)}
            />
          )}
        </AnimatePresence>

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
              <div className="wv2-layers-head">
                <p className="t-caps ink-3">{c.layersLabel}</p>
                <button
                  type="button"
                  className="wv2-layers-close"
                  onClick={() => setLayersOpen(false)}
                  aria-label={language === 'pt' ? 'Fechar camadas' : 'Close layers'}
                >
                  ✕
                </button>
              </div>
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
                <button type="button" className={`wv2-chip${layers.flood ? ' on' : ''}`} onClick={() => toggleLayer('flood')}>{c.layerFlood}</button>
                <button type="button" className={`wv2-chip${layers.surge ? ' on' : ''}`} onClick={() => toggleLayer('surge')}>{c.layerSurge}</button>
                <button type="button" className={`wv2-chip${layers.windImpact ? ' on' : ''}`} onClick={() => toggleLayer('windImpact')}>{c.layerWindImpact}</button>
                <button type="button" className={`wv2-chip${layers.tornado ? ' on' : ''}`} onClick={() => toggleLayer('tornado')}>{c.layerTornado}</button>
              </div>

              {layers.wind && wind?.atUser && (
                <p className="t-foot ink-2">
                  {c.windHere}: {wind.atUser.speedKmh} km/h {headingLabel(wind.atUser.fromDeg, metric) ?? ''} · {windMeaning(wind.atUser.speedKmh, metric)}
                </p>
              )}
              {layers.windImpact && <p className="t-foot ink-3">{c.windImpactNote}</p>}
              {layers.tornado && <p className="t-foot ink-3">{c.tornadoNote}</p>}
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
                {/*
                  A faixa mostra o PIOR entre clima e casa (D-128).

                  Antes ela gastava sua única linha — a que a maioria das
                  sessões vai ler — dizendo "14 · Estável" em verde para uma
                  casa com zero dias de água. O comentário logo abaixo, no
                  cartão de risco, já tinha o instinto certo ("um risco de 9 lê
                  diferente a 20% de prontidão do que a 90%"); faltava a faixa
                  obedecer ao que o código já pensava.
                */}
                <span className="lead" data-severity={veredito.severity}>
                  <strong className="t-title1">{veredito.lead}</strong>
                  <span className="t-sub ink-2">{veredito.line}</span>
                </span>
                {/* Todo número ganha alça: antes "0 dias de água" era um
                    veredito sem saída — lia-se o problema sem poder agir. */}
                <Link
                  href={veredito.href}
                  className="wv2-peek-handle t-caps"
                  onClick={e => e.stopPropagation()}
                >
                  {veredito.source === 'household' ? c.fix : c.open}
                </Link>
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

      {/*
        O Pilot NÃO é montado aqui (D-137) — ele vive no layout, numa instância
        só, para a conversa sobreviver à navegação. O que esta tela tem de
        próprio é o mapa: ela registra o que fazer quando o Pilot entrega um
        destino, e desregistra ao sair.
      */}
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
  /** O pior entre clima e casa (D-128). Vale para os dois layouts. */
  veredito: ReturnType<typeof restingVerdict>
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
  veredito,
}: SectionProps) {
  return (
    <>
      {/* ── Risk: the one number this screen exists to communicate ── */}
      <Card accented>
        <SectionLabel trailing={data.online ? c.online : c.offline}>{c.riskIndex}</SectionLabel>
        {/*
          Duas figuras pareadas: quão ruim está, e quão pronto você está. O
          comentário original já dizia o certo — "um risco de 9 lê diferente a
          20% de prontidão do que a 90%" — mas o acento ficava SEMPRE no número
          do clima. Numa casa com 0,3 dias de autonomia, o olho pousava no verde.

          Agora o acento segue o PIOR dos dois (D-128). Este cartão é
          compartilhado pelo painel do desktop e pela folha do celular; a
          primeira versão consertou só a faixa do celular, e no desktop a
          contradição continuou inteira.
        */}
        <div className="wv2-pair" data-worse={veredito.source}>
          <div className="fig">
            <span className={`t-display${veredito.source === 'weather' ? ' accent' : ''}`}>{score ?? '—'}</span>
            <span className="t-sub ink-2">{stateLabel}</span>
          </div>
          <span className="sep" aria-hidden="true" />
          <div className="fig">
            {/*
              Este número é o percentual do CHECKLIST, e o rótulo dizia
              "Prontidão" (D-129). Em Preparação, "Prontidão" é outro número —
              um score composto de 0 a 100 que pesa água, comida, bateria, kit
              e comunicação. O dono viu 88% numa tela e 68/100 na outra, para a
              mesma casa, e não tinha como saber que eram grandezas diferentes.

              Duas métricas podem coexistir; duas métricas com o mesmo nome,
              não. O nome passa a dizer o que o número é.
            */}
            <span className={`t-display${veredito.source === 'household' ? ' accent' : ''}`} data-severity={veredito.severity}>
              {data.checklistPct}<i>%</i>
            </span>
            <span className="t-sub ink-2">{c.checklistLabel}</span>
          </div>
        </div>

        {/* Quando a casa é o problema, o cartão diz qual é — e leva até lá.
            Antes o número ficava sozinho, um veredito sem saída. */}
        {veredito.source === 'household' && (
          <p className="wv2-worse t-sub" data-severity={veredito.severity}>
            {veredito.lead}{veredito.line}
            <Link href={veredito.href} className="wv2-worse-handle">{c.fix} →</Link>
          </p>
        )}
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
        <PillLink href="/preparedness">{c.checklist}</PillLink>
        <PillLink href="/plan">{c.plan}</PillLink>
      </div>

      {/* ── Autonomy ── */}
      <Card>
        <SectionLabel trailing={c.autonomyHint}>{c.autonomy}</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.25rem 0 1rem' }}>
          <span className="t-figure">{formatDays(data.autonomyDays)}</span>
          <span className="t-title2 ink-2">{data.autonomyDays === 1 ? c.day : c.days}</span>
        </div>
        {/*
          Quatro barras, duas contas diferentes (D-131).

          O rótulo dizia "limitada pelo recurso mais escasso" e logo abaixo
          vinham quatro barras — dando a entender que a bateria entra na conta.
          Ela não entra: `autonomyDays` é `min(água, comida)`, e é assim de
          propósito. Uma casa com dez dias de despensa e o telefone a 10% não
          "sobrevive 0,3 dias"; ela sobrevive dez dias com menos recurso.

          Água e comida decidem quanto tempo a casa aguenta. Bateria e
          combustível decidem o que ela CONSEGUE FAZER nesse tempo. São as duas
          perguntas, e a separação diz qual barra responde qual — sem esconder
          nenhuma delas.
        */}
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
        </div>
        <p className="wv2-capability-note t-caps ink-3">{c.autonomyCapability}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
