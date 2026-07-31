'use client'

/**
 * WorldMap — HWD-02/03 live hybrid map (doc 16 §6, §25).
 * MapLibre GL over a provider-neutral base (keyless CARTO dark; MapTiler
 * satellite + 3D terrain via env). Lazy-loaded; never blocks the HUD or
 * critical text. Degrades to the static world plate on load/WebGL failure (§28).
 *
 * HWD-03: the map centers on the user's REAL location (RiskProvider coords),
 * falling back to Parkland.
 *
 * D-064: this component renders ONLY real data. Family markers come from
 * consented circle members (`/api/circles`) and always carry a freshness label;
 * route/shelter render only when real guidance is supplied. When there is
 * nothing real to draw, it draws nothing.
 *
 * Shared by `/dashboard` (World v2) and `/dashboard-world` (HWD v1) — a change
 * here lands on both screens.
 */

import { useEffect, useRef } from 'react'
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useRisk } from '@/components/v2/RiskProvider'
import { getMapConfig } from '@/lib/world/providers'
import type { CycloneSnapshot } from '@/lib/world/cyclones'
import type { WindSnapshot } from '@/lib/world/wind'
import { blowingToward } from '@/lib/world/wind'
import type { MapBaseMode } from '@/lib/world/providers'

// D-064 §5: no mock overlays. This component used to invent three family pins
// ("Paulo/Isadora/Ana"), a route and a `SHELTER · mock` marker whenever it got no
// data — and that shipped to the production dashboard. A fictional shelter on an
// emergency product is a hazard, not a placeholder. No real data → no marker.
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] }
const EMPTY_LINE = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [] as Array<[number, number]> } }

type HazardSeverity = 'info' | 'minor' | 'moderate' | 'severe' | 'extreme'
type HazardEvent = {
  id: string
  source: string
  visualClass: string
  title: string
  severity: HazardSeverity
  location?: { lat: number; lng: number }
  geometry?: unknown
  updatedAt: string
}
type HazardSnapshot = { events?: HazardEvent[]; fetchedAt?: string }
type RadarSnapshot = { ok?: boolean; tileUrl?: string; attribution?: string; frameTime?: number }
export type WorldFamilyMember = {
  id: string
  name: string
  lat: number
  lng: number
  isMe?: boolean
  freshness: string
  /** Signed avatar URL for the self puck. Others always render as pins. */
  avatarUrl?: string | null
  /** Drives the "live signal" halo — a stale point does not pulse. */
  live?: boolean
  /**
   * True for a profile point: a geocoded address, not a position. It can be
   * kilometres from where the person actually is, so it must NOT look like a
   * live fix — an approximate point drawn with the confidence of a real one is
   * how a family ends up looking in the wrong place.
   */
  approximate?: boolean
}
/** Official FEMA shelters (D-065). Rendered distinctly from family points. */
export type WorldShelter = { id: string; name: string; lat: number; lng: number; distanceKm: number }

export type WorldGuidance = {
  shelter: { name: string; lat: number; lng: number; confidence: string; source: string }
  route: { label: string; confidence: string; points: Array<[number, number]> }
  caveat: string
}

const HAZARD_COLOR: Record<HazardSeverity, string> = {
  info: '#35d7f2',
  minor: '#7c6bff',
  moderate: '#ffb347',
  severe: '#ff8a3d',
  extreme: '#ff6b6b',
}

function isFiniteCoord(lng: number, lat: number) {
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function pointFeature(e: HazardEvent): unknown | null {
  if (!e.location || !isFiniteCoord(e.location.lng, e.location.lat)) return null
  return {
    type: 'Feature',
    properties: {
      id: e.id,
      title: e.title,
      severity: e.severity,
      color: HAZARD_COLOR[e.severity] ?? HAZARD_COLOR.info,
    },
    geometry: { type: 'Point', coordinates: [e.location.lng, e.location.lat] },
  }
}

function geometryFeature(e: HazardEvent): unknown | null {
  const g = e.geometry as { type?: string; coordinates?: unknown } | null
  if (!g?.type || !g.coordinates) return null
  return {
    type: 'Feature',
    properties: {
      id: e.id,
      title: e.title,
      severity: e.severity,
      visualClass: e.visualClass,
      color: HAZARD_COLOR[e.severity] ?? HAZARD_COLOR.info,
    },
    geometry: g,
  }
}

function collectCoords(coords: unknown, out: Array<[number, number]>) {
  if (!Array.isArray(coords)) return
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const lng = coords[0], lat = coords[1]
    if (isFiniteCoord(lng, lat)) out.push([lng, lat])
    return
  }
  for (const child of coords) collectCoords(child, out)
}

function hazardTagLngLat(e: HazardEvent): [number, number] | null {
  if (e.location && isFiniteCoord(e.location.lng, e.location.lat)) return [e.location.lng, e.location.lat]
  const g = e.geometry as { coordinates?: unknown } | null
  const coords: Array<[number, number]> = []
  collectCoords(g?.coordinates, coords)
  if (!coords.length) return null
  const mid = coords.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]] as [number, number], [0, 0])
  return [mid[0] / coords.length, mid[1] / coords.length]
}

function short(text: string, max = 38) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`
}

/**
 * The self marker is a PUCK, not a pin — deliberately a different kind of object.
 *
 * A pin points at a place someone else is. You are not a place: you are the
 * presence the map is oriented around, so the puck sits centred on the point
 * with no name label. Being told your own name on your own map is noise.
 *
 * Falls back to the EOS mark (three bars + signal dot) when there is no photo.
 */
function selfPuckEl(avatarUrl: string | null | undefined, live: boolean) {
  const el = document.createElement('div')
  el.className = 'w-selfpuck'
  el.dataset.live = live ? 'true' : 'false'

  const halo = document.createElement('span')
  halo.className = 'halo'
  el.appendChild(halo)

  const disc = document.createElement('span')
  disc.className = 'disc'
  if (avatarUrl) {
    const img = document.createElement('img')
    img.src = avatarUrl
    img.alt = ''
    // A broken signed URL must degrade to the mark, never to an empty circle.
    img.onerror = () => {
      img.remove()
      disc.appendChild(eosGlyph())
    }
    disc.appendChild(img)
  } else {
    disc.appendChild(eosGlyph())
  }
  el.appendChild(disc)
  return el
}

/** EOS mark, matching public/icon.svg: three bars and a signal dot. */
function eosGlyph() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 512 512')
  svg.setAttribute('class', 'eos-glyph')
  svg.setAttribute('aria-hidden', 'true')
  const bars: Array<[number, number, number]> = [
    [128, 120, 256],
    [128, 230, 192],
    [128, 340, 256],
  ]
  for (const [x, y, w] of bars) {
    const r = document.createElementNS(ns, 'rect')
    r.setAttribute('x', String(x))
    r.setAttribute('y', String(y))
    r.setAttribute('width', String(w))
    r.setAttribute('height', '52')
    r.setAttribute('rx', '8')
    svg.appendChild(r)
  }
  const dot = document.createElementNS(ns, 'circle')
  dot.setAttribute('cx', '420')
  dot.setAttribute('cy', '150')
  dot.setAttribute('r', '26')
  svg.appendChild(dot)
  return svg
}

function markerEl(className: string, pin: string, label: string, color?: string, photo?: string | null) {
  const el = document.createElement('div')
  el.className = className
  if (pin || photo) {
    const p = document.createElement('span')
    p.className = 'pin'
    if (color) p.style.background = color
    if (photo) {
      const img = document.createElement('img')
      img.src = photo
      img.alt = ''
      img.onerror = () => { img.remove(); p.textContent = pin }
      p.appendChild(img)
    } else {
      p.textContent = pin
    }
    el.appendChild(p)
  }
  const lab = document.createElement('span')
  lab.className = 'lab'
  lab.textContent = label
  el.appendChild(lab)
  return el
}

/**
 * Camadas que o usuário liga e desliga (D-078).
 *
 * São escolhas de LEITURA, não de dado: tudo continua sendo buscado e o Pilot
 * continua enxergando tudo. Desligar o radar não deixa o EOS cego, só limpa a
 * tela — que num evento, com alerta, cone, vento e família no mesmo mapa, é a
 * diferença entre ler e não ler.
 */
export type MapLayerState = {
  radar: boolean
  alerts: boolean
  wind: boolean
  cyclone: boolean
}

export const DEFAULT_LAYERS: MapLayerState = { radar: true, alerts: true, wind: false, cyclone: true }

export default function WorldMap({ plateUrl, family = [], shelters = [], guidance = null, mapBase = 'hybrid', routeFocusNonce = 0, focus = null, courseTo = null, recenterNonce = 0, cyclones = null, wind = null, layers = DEFAULT_LAYERS, onMemberTap, onMapInteraction }: {
  state: string
  plateUrl: string
  family?: WorldFamilyMember[]
  shelters?: WorldShelter[]
  guidance?: WorldGuidance | null
  mapBase?: MapBaseMode
  routeFocusNonce?: number
  /** A place picked from search. `nonce` re-triggers the fly-to on re-pick. */
  focus?: { lat: number; lng: number; label: string; nonce: number; kind?: 'place' | 'alert' } | null
  /**
   * A course the user asked to see: EOS draws it as a layer on its own map
   * instead of only handing off to another app (D-069). Indicative straight
   * line — EOS does not claim to know the roads.
   */
  courseTo?: { lat: number; lng: number; label: string; nonce: number } | null
  /** Bump to re-centre on the user. Nothing else ever moves the camera to them. */
  recenterNonce?: number
  /** Ciclones ativos com a geometria oficial do NHC (D-078). */
  cyclones?: CycloneSnapshot | null
  /** Grade de vento em volta da pessoa (D-078). */
  wind?: WindSnapshot | null
  /** Quais camadas o usuário deixou ligadas. */
  layers?: MapLayerState
  /** Tapping a face is how the user acts on a person, not just sees them (D-073). */
  onMemberTap?: (id: string) => void
  onMapInteraction?: () => void
}) {
  const { coords } = useRisk()
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef<MLMarker[]>([])
  const hazardMarkersRef = useRef<MLMarker[]>([])
  const stormMarkersRef = useRef<MLMarker[]>([])
  // Kept out of markersRef so a family/shelter refresh never wipes the search pin.
  const searchMarkerRef = useRef<MLMarker | null>(null)
  const courseMarkerRef = useRef<MLMarker | null>(null)
  // The camera follows the user exactly once — on the first fix.
  const centeredOnceRef = useRef(false)
  const readyRef = useRef(false)
  const centerRef = useRef<[number, number] | null>(null)
  const plateRef = useRef<HTMLDivElement>(null)

  // Place / reposition family + route overlays from REAL data only (D-064 §5).
  const placeOverlays = async () => {
    const map = mapRef.current
    if (!map) return

    const routeCoords = guidance?.route?.points?.length ? guidance.route.points : []
    const src = map.getSource('eos-route') as { setData?: (d: unknown) => void } | undefined
    src?.setData?.({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: routeCoords },
    })

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (!family.length && !shelters.length && !guidance?.shelter) return
    const maplibregl = (await import('maplibre-gl')).default

    // Co-located people must not hide each other. Two members who both geocoded
    // the same city share the exact same profile point, and one marker lands on
    // top of the other — the map then lies about how many people it knows.
    // Fan them out in a small ring, in PIXELS so the spread survives zoom.
    const buckets = new Map<string, number[]>()
    family.slice(0, 8).forEach((m, i) => {
      const key = `${m.lat.toFixed(4)},${m.lng.toFixed(4)}`
      buckets.set(key, [...(buckets.get(key) ?? []), i])
    })
    const offsetFor = (m: WorldFamilyMember, index: number): [number, number] => {
      const bucket = buckets.get(`${m.lat.toFixed(4)},${m.lng.toFixed(4)}`) ?? [index]
      if (bucket.length < 2) return [0, 0]
      const angle = (bucket.indexOf(index) / bucket.length) * Math.PI * 2 - Math.PI / 2
      return [Math.cos(angle) * 26, Math.sin(angle) * 26]
    }

    family.slice(0, 8).forEach((m, i) => {
      if (m.isMe) {
        // Centred, unlabelled: a presence, not a marker (see selfPuckEl).
        const puck = selfPuckEl(m.avatarUrl, m.live !== false)
        if (onMemberTap) {
          puck.style.pointerEvents = 'auto'
          puck.style.cursor = 'pointer'
          puck.addEventListener('click', () => onMemberTap(m.id))
        }
        markersRef.current.push(
          new maplibregl.Marker({ element: puck, anchor: 'center', offset: offsetFor(m, i) })
            .setLngLat([m.lng, m.lat])
            .addTo(map),
        )
        return
      }
      const initials = m.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'FM'
      const color = ['#ffb347', '#9aa0ad', '#7c6bff', '#35d7f2'][i % 4]
      // Freshness is part of the label by contract: a stale point presented as
      // a current one is worse than no point at all.
      const el = markerEl(
        `w-mapmarker real${m.approximate ? ' approximate' : ''}`,
        initials,
        `${short(m.name, 18)} · ${m.freshness}`,
        color,
        m.avatarUrl,
      )
      if (onMemberTap) {
        el.style.cursor = 'pointer'
        el.addEventListener('click', () => onMemberTap(m.id))
      }
      markersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: 'bottom', offset: offsetFor(m, i) })
          .setLngLat([m.lng, m.lat])
          .addTo(map),
      )
    })

    // Official FEMA shelters. Distance is on the label because it is the fact
    // that decides whether this shelter is reachable on foot.
    for (const shelter of shelters.slice(0, 6)) {
      const el = markerEl('w-mapmarker shelter', '', `${short(shelter.name, 26)} · ${shelter.distanceKm.toFixed(1)} km`)
      markersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([shelter.lng, shelter.lat]).addTo(map),
      )
    }

    const shelter = guidance?.shelter
    if (shelter) {
      const sh = markerEl('w-mapmarker shelter ai', '', `AI SHELTER · ${short(shelter.name, 24)}`)
      markersRef.current.push(
        new maplibregl.Marker({ element: sh, anchor: 'bottom' }).setLngLat([shelter.lng, shelter.lat]).addTo(map),
      )
    }
  }

  const loadRadar = async () => {
    const map = mapRef.current
    if (!map || map.getSource('eos-radar')) return
    try {
      const radar = (await fetch('/api/world/radar').then(r => (r.ok ? r.json() : null))) as RadarSnapshot | null
      if (!radar?.ok || !radar.tileUrl) return
      map.addSource('eos-radar', {
        type: 'raster',
        tiles: [radar.tileUrl],
        tileSize: 256,
        maxzoom: 7,
        attribution: radar.attribution ?? 'RainViewer',
      })
      const before = map.getLayer('eos-route-glow') ? 'eos-route-glow' : undefined
      map.addLayer({
        id: 'eos-radar',
        type: 'raster',
        source: 'eos-radar',
        paint: {
          'raster-opacity': 0.38,
          'raster-fade-duration': 350,
          'raster-brightness-min': 0.02,
          'raster-brightness-max': 0.86,
        },
      }, before)
    } catch {
      // Radar is additive. Never blank the world if RainViewer is unavailable.
    }
  }

  const renderHazards = async (center: [number, number]) => {
    const map = mapRef.current
    if (!map) return
    try {
      const snap = (await fetch(`/api/hazards?lat=${center[1]}&lng=${center[0]}`).then(r => (r.ok ? r.json() : null))) as HazardSnapshot | null
      const events = (snap?.events ?? []).slice(0, 12)
      const polygons = events.map(geometryFeature).filter(Boolean)
      const points = events.map(pointFeature).filter(Boolean)
      const polyData = { type: 'FeatureCollection' as const, features: polygons } as never
      const pointData = { type: 'FeatureCollection' as const, features: points } as never

      const polySrc = map.getSource('eos-hazard-polygons') as { setData?: (d: unknown) => void } | undefined
      if (polySrc) polySrc.setData?.(polyData)
      else {
        map.addSource('eos-hazard-polygons', { type: 'geojson', data: polyData })
        const before = map.getLayer('eos-route-glow') ? 'eos-route-glow' : undefined
        map.addLayer({
          id: 'eos-hazard-fill',
          type: 'fill',
          source: 'eos-hazard-polygons',
          paint: {
            'fill-color': ['coalesce', ['get', 'color'], '#ffb347'],
            'fill-opacity': 0.16,
          },
        }, before)
        map.addLayer({
          id: 'eos-hazard-outline',
          type: 'line',
          source: 'eos-hazard-polygons',
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#ffb347'],
            'line-width': 1.4,
            'line-opacity': 0.75,
          },
        }, before)
      }

      const pointSrc = map.getSource('eos-hazard-points') as { setData?: (d: unknown) => void } | undefined
      if (pointSrc) pointSrc.setData?.(pointData)
      else {
        map.addSource('eos-hazard-points', { type: 'geojson', data: pointData })
        map.addLayer({
          id: 'eos-hazard-point-halo',
          type: 'circle',
          source: 'eos-hazard-points',
          paint: {
            'circle-radius': 16,
            'circle-color': ['coalesce', ['get', 'color'], '#ffb347'],
            'circle-opacity': 0.12,
            'circle-blur': 0.35,
          },
        })
        map.addLayer({
          id: 'eos-hazard-point',
          type: 'circle',
          source: 'eos-hazard-points',
          paint: {
            'circle-radius': 5,
            'circle-color': ['coalesce', ['get', 'color'], '#ffb347'],
            'circle-stroke-color': '#f4f6fa',
            'circle-stroke-width': 1,
            'circle-opacity': 0.94,
          },
        })
      }

      hazardMarkersRef.current.forEach(m => m.remove())
      hazardMarkersRef.current = []
      const maplibregl = (await import('maplibre-gl')).default
      for (const e of events.slice(0, 5)) {
        const ll = hazardTagLngLat(e)
        if (!ll) continue
        const el = document.createElement('div')
        el.className = `w-hazardtag sev-${e.severity}`
        const source = document.createElement('span')
        source.textContent = e.source.toUpperCase()
        el.append(source, document.createTextNode(short(e.title)))
        hazardMarkersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom-left', offset: [10, -10] }).setLngLat(ll).addTo(map))
      }
    } catch {
      // Hazard layers are additive. Existing weather/risk text remains the fallback.
    }
  }

  // init once
  useEffect(() => {
    let cancelled = false
    let map: MLMap | undefined
    ;(async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        if (cancelled || !ref.current) return
        const cfg = getMapConfig(mapBase)
        const center: [number, number] = coords ? [coords.lng, coords.lat] : cfg.center
        centerRef.current = center

        map = new maplibregl.Map({
          container: ref.current,
          style: cfg.styleUrl,
          center, zoom: cfg.zoom, pitch: cfg.pitch, bearing: cfg.bearing,
          attributionControl: false, interactive: true, maxPitch: 75,
        })
        mapRef.current = map
        /**
         * Referência de diagnóstico.
         *
         * As camadas (chuva, vento, ciclone, alertas) são desenhadas em canvas
         * pelo MapLibre — não existe DOM para inspecionar. Sem esta alça, os
         * testes de navegador só conseguiriam afirmar que a API respondeu, e não
         * que a seta apareceu no mapa. É leitura apenas, e não muda comportamento.
         */
        ;(window as unknown as { __eosMap?: MLMap }).__eosMap = map
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
        map.on('error', () => { /* tiles/provider errors must not blank the app */ })
        if (onMapInteraction) {
          // ONLY user-driven moves collapse the HUD. MapLibre fires these for
          // programmatic camera moves too, so a flyTo() used to collapse the
          // sheet the user was mid-scroll on — the map fighting the person.
          // `originalEvent` is present only when a real pointer caused it.
          const ifUser = (event: { originalEvent?: unknown }) => {
            if (event?.originalEvent) onMapInteraction()
          }
          map.on('dragstart', ifUser)
          map.on('zoomstart', ifUser)
          map.on('rotatestart', ifUser)
          map.on('pitchstart', ifUser)
        }

        map.on('load', () => {
          if (cancelled || !map) return
          const cur = centerRef.current ?? center

          if (cfg.hasTerrain && cfg.terrainSource) {
            if (!map.getSource('eos-dem')) map.addSource('eos-dem', { type: 'raster-dem', url: cfg.terrainSource })
            map.setTerrain({ source: 'eos-dem', exaggeration: 1.2 })
          }

          map.addSource('eos-route', { type: 'geojson', data: EMPTY_LINE })
          map.addLayer({ id: 'eos-route-glow', type: 'line', source: 'eos-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#00e5a0', 'line-width': 9, 'line-opacity': 0.18, 'line-blur': 6 } })
          map.addLayer({ id: 'eos-route', type: 'line', source: 'eos-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#00e5a0', 'line-width': 3.5, 'line-opacity': 0.95 } })

          // Course: its own source so the family/shelter refresh never wipes it.
          // Dashed on purpose — a dashed line reads as "direction", a solid one
          // would read as "this is the road", which EOS does not know.
          // ── Ciclone (D-078). O cone vem primeiro para ficar por baixo. ──
          map.addSource('eos-cyclone-cone', { type: 'geojson', data: EMPTY_FC })
          map.addLayer({
            id: 'eos-cyclone-cone',
            type: 'fill',
            source: 'eos-cyclone-cone',
            paint: { 'fill-color': '#ffd60a', 'fill-opacity': 0.12 },
          })
          map.addLayer({
            id: 'eos-cyclone-cone-line',
            type: 'line',
            source: 'eos-cyclone-cone',
            paint: { 'line-color': '#ffd60a', 'line-width': 1.4, 'line-opacity': 0.65, 'line-dasharray': [3, 2] },
          })

          map.addSource('eos-cyclone-track', { type: 'geojson', data: EMPTY_FC })
          map.addLayer({
            id: 'eos-cyclone-track',
            type: 'line',
            source: 'eos-cyclone-track',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ff453a', 'line-width': 2.6, 'line-opacity': 0.9 },
          })

          map.addSource('eos-cyclone-points', { type: 'geojson', data: EMPTY_FC })
          map.addLayer({
            id: 'eos-cyclone-points',
            type: 'circle',
            source: 'eos-cyclone-points',
            paint: {
              'circle-radius': 5,
              'circle-color': '#ff453a',
              'circle-stroke-color': '#000',
              'circle-stroke-width': 1.5,
            },
          })
          map.addLayer({
            id: 'eos-cyclone-points-label',
            type: 'symbol',
            source: 'eos-cyclone-points',
            layout: {
              // `dvlbl` é o rótulo do NHC para o ponto (ex.: "H", "TS", "M").
              'text-field': ['coalesce', ['get', 'dvlbl'], ''],
              'text-size': 10,
              'text-offset': [0, -1.3],
              'text-allow-overlap': false,
            },
            paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.4 },
          })

          // ── Vento: seta rotacionada por leitura ──
          //
          // O ícone é DESENHADO aqui, e não é um caractere de texto. A primeira
          // versão usava "➤" num `text-field`: os dados chegavam, a camada ficava
          // visível, e nada aparecia — a fonte do estilo simplesmente não tem
          // esse glifo. Falha invisível: `querySourceFeatures` devolvia features
          // e `queryRenderedFeatures` devolvia zero. Um ícone em canvas não
          // depende de fonte nenhuma.
          if (!map.hasImage('eos-arrow')) {
            const size = 24
            const canvas = document.createElement('canvas')
            canvas.width = size
            canvas.height = size
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.fillStyle = '#ffffff'
              ctx.beginPath()
              // Seta apontando para cima; `icon-rotate` gira a partir do norte.
              ctx.moveTo(size / 2, 2)
              ctx.lineTo(size - 5, size - 4)
              ctx.lineTo(size / 2, size - 9)
              ctx.lineTo(5, size - 4)
              ctx.closePath()
              ctx.fill()
              map.addImage('eos-arrow', ctx.getImageData(0, 0, size, size), { sdf: true })
            }
          }
          map.addSource('eos-wind', { type: 'geojson', data: EMPTY_FC })
          map.addLayer({
            id: 'eos-wind',
            type: 'symbol',
            source: 'eos-wind',
            layout: {
              'icon-image': 'eos-arrow',
              'icon-size': 0.8,
              'icon-rotate': ['get', 'rotate'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: {
              // `sdf: true` na imagem é o que permite recolorir por expressão:
              // vento forte muda de cor, e a leitura não depende do número.
              'icon-color': ['case', ['==', ['get', 'strong'], 1], '#ff9f0a', '#7ad7ff'],
              'icon-halo-color': '#000000',
              'icon-halo-width': 1,
              'icon-opacity': 0.95,
            },
          })
          map.addLayer({
            id: 'eos-wind-label',
            type: 'symbol',
            source: 'eos-wind',
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 9,
              'text-offset': [0, 1.4],
              'text-allow-overlap': false,
            },
            paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.2, 'text-opacity': 0.8 },
          })

          map.addSource('eos-course', { type: 'geojson', data: EMPTY_LINE })
          map.addLayer({ id: 'eos-course-glow', type: 'line', source: 'eos-course', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.10, 'line-blur': 6 } })
          map.addLayer({ id: 'eos-course', type: 'line', source: 'eos-course', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [1.6, 1.6] } })

          readyRef.current = true
          void placeOverlays()
          if (plateRef.current) plateRef.current.style.opacity = '0'
          loadRadar()
          renderHazards(cur)
        })
      } catch {
        // WebGL/init failure → keep the static plate visible (§28)
      }
    })()
    return () => {
      cancelled = true
      markersRef.current = []
      hazardMarkersRef.current.forEach(m => m.remove())
      hazardMarkersRef.current = []
      searchMarkerRef.current?.remove()
      searchMarkerRef.current = null
      courseMarkerRef.current?.remove()
      courseMarkerRef.current = null
      if (map) map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBase])

  // recenter when the real location resolves/changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !coords) return
    const center: [number, number] = [coords.lng, coords.lat]
    centerRef.current = center

    // Follow the user ONCE. `watchPosition` fires on every GPS jitter, and
    // re-centring on each one yanked the map out from under anyone trying to
    // look somewhere else. After the first fix the camera belongs to the user;
    // the arrow button is how they ask for it back.
    if (!centeredOnceRef.current) {
      centeredOnceRef.current = true
      const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) map.jumpTo({ center })
      else map.flyTo({ center, duration: 1400, essential: true })
    }

    if (readyRef.current) {
      void placeOverlays()
      renderHazards(center)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng])

  useEffect(() => {
    if (readyRef.current) void placeOverlays()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, shelters, guidance, onMemberTap])

  /**
   * Ciclone: cone de incerteza, trajetória prevista e pontos com hora (D-078).
   *
   * Ordem de desenho é decisão de leitura: o cone é um preenchimento largo e
   * fica EMBAIXO de tudo; a trajetória por cima dele; os pontos por último,
   * porque é neles que a pessoa lê "quando". Se o cone ficasse por cima, ele
   * lavaria a informação que importa.
   *
   * O cone é INCERTEZA DE POSIÇÃO DO CENTRO, não área de dano — vento e chuva
   * passam muito além dele. Quem diz isso é a legenda na UI; aqui a
   * responsabilidade é não desenhar nada que o NHC não publicou.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    const set = (id: string, data: GeoJSON.FeatureCollection | null) => {
      const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
      const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
      if (source) source.setData(data ?? empty)
    }

    const on = Boolean(layers?.cyclone) && Boolean(cyclones) && !cyclones?.empty
    set('eos-cyclone-cone', on ? cyclones?.cone ?? null : null)
    set('eos-cyclone-track', on ? cyclones?.track ?? null : null)
    set('eos-cyclone-points', on ? cyclones?.forecastPoints ?? null : null)

    // O olho da tempestade é um marcador próprio, com a seta do rumo: "para onde
    // ela vai" é a pergunta, e um ponto sem direção não responde.
    stormMarkersRef.current.forEach(m => m.remove())
    stormMarkersRef.current = []
    if (on && cyclones?.storms.length) {
      void (async () => {
        const maplibregl = (await import('maplibre-gl')).default
        for (const storm of cyclones.storms) {
          if (!Number.isFinite(storm.lat) || !Number.isFinite(storm.lng)) continue
          const el = document.createElement('div')
          el.className = 'w-storm'
          el.innerHTML = `<span class="eye">🌀</span><span class="tag">${storm.name}</span>`
          if (storm.headingDeg !== null) {
            const arrow = document.createElement('i')
            arrow.className = 'heading'
            arrow.style.transform = `rotate(${storm.headingDeg}deg)`
            el.appendChild(arrow)
          }
          stormMarkersRef.current.push(
            new maplibregl.Marker({ element: el, anchor: 'center' })
              .setLngLat([storm.lng, storm.lat])
              .addTo(map),
          )
        }
      })()
    }
  }, [cyclones, layers?.cyclone])

  /**
   * Vento: uma seta por leitura, apontando PARA ONDE ele sopra.
   *
   * A convenção meteorológica informa a direção de ORIGEM ("vento de nordeste").
   * Uma seta no mapa precisa apontar o destino — trocar os dois inverte tudo em
   * 180°, e seta invertida numa tela de emergência é pior que seta nenhuma.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const source = map.getSource('eos-wind') as maplibregl.GeoJSONSource | undefined
    if (!source) return

    const show = Boolean(layers?.wind) && Boolean(wind?.readings.length)
    source.setData({
      type: 'FeatureCollection',
      features: show
        ? (wind?.readings ?? []).map(r => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
            properties: {
              rotate: blowingToward(r.fromDeg),
              label: `${r.speedKmh}`,
              strong: r.speedKmh >= 39 ? 1 : 0,
            },
          }))
        : [],
    })
  }, [wind, layers?.wind])

  /** Radar e alertas obedecem o interruptor sem serem recarregados. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const toggle = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    }
    toggle('eos-radar', Boolean(layers?.radar))
    // Os IDs vêm de renderHazards; usar nomes inventados aqui faria o
    // interruptor não fazer nada — em silêncio, que é o pior modo de falhar.
    for (const id of ['eos-hazard-fill', 'eos-hazard-outline', 'eos-hazard-point-halo', 'eos-hazard-point']) {
      toggle(id, Boolean(layers?.alerts))
    }
  }, [layers?.radar, layers?.alerts])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !routeFocusNonce) return
    const routeCoords = guidance?.route?.points?.length ? guidance.route.points : []
    if (!routeCoords.length) return
    const points = guidance?.shelter
      ? [...routeCoords, [guidance.shelter.lng, guidance.shelter.lat] as [number, number]]
      : routeCoords
    const lngs = points.map(p => p[0])
    const lats = points.map(p => p[1])
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ]
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.fitBounds(bounds, {
      padding: { top: 150, right: 280, bottom: 180, left: 320 },
      duration: reduce ? 0 : 900,
      maxZoom: 15,
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    })
  }, [guidance, routeFocusNonce])

  // Fly to a searched place and pin it. Separate from placeOverlays so the pin
  // survives the family/shelter polling that runs underneath it.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    searchMarkerRef.current?.remove()
    searchMarkerRef.current = null
    if (!focus) return

    let cancelled = false
    ;(async () => {
      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled || !mapRef.current) return
      // Um alerta pulsa na cor do índice de risco. É o mesmo dado dito duas
      // vezes na mesma linguagem: a cor que diz "quão ruim está" no topo da tela
      // é a cor que marca ONDE isso está acontecendo. Ligar as duas por cor faz
      // a conexão sem precisar de legenda.
      const el = markerEl(
        `w-mapmarker searched${focus.kind === 'alert' ? ' alerting' : ''}`,
        '',
        short(focus.label, 30),
      )
      searchMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([focus.lng, focus.lat])
        .addTo(mapRef.current)

      const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const target = { center: [focus.lng, focus.lat] as [number, number], zoom: Math.max(map.getZoom(), 14.5) }
      if (reduce) map.jumpTo(target)
      else map.flyTo({ ...target, duration: 1200, essential: true })
    })()

    return () => { cancelled = true }
  }, [focus])

  // Explicit recentre — the only thing besides the first fix that moves the
  // camera to the user.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !recenterNonce || !coords) return
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = { center: [coords.lng, coords.lat] as [number, number], zoom: Math.max(map.getZoom(), 14) }
    if (reduce) map.jumpTo(target)
    else map.flyTo({ ...target, duration: 900, essential: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterNonce])

  // Draw the course inside EOS: line, destination pin, and a camera that frames
  // both ends. Handing off to another app stays available, but it is no longer
  // the only answer to "how do I get there".
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    const source = map.getSource('eos-course') as { setData?: (d: unknown) => void } | undefined
    courseMarkerRef.current?.remove()
    courseMarkerRef.current = null

    if (!courseTo || !coords) {
      source?.setData?.(EMPTY_LINE)
      return
    }

    const from: [number, number] = [coords.lng, coords.lat]
    const to: [number, number] = [courseTo.lng, courseTo.lat]
    source?.setData?.({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [from, to] },
    })

    let cancelled = false
    ;(async () => {
      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled || !mapRef.current) return
      const el = markerEl('w-mapmarker destination', '', short(courseTo.label, 28))
      courseMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(to)
        .addTo(mapRef.current)

      const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      mapRef.current.fitBounds(
        [
          [Math.min(from[0], to[0]), Math.min(from[1], to[1])],
          [Math.max(from[0], to[0]), Math.max(from[1], to[1])],
        ],
        { padding: { top: 110, right: 60, bottom: 220, left: 60 }, duration: reduce ? 0 : 1100, maxZoom: 15 },
      )
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseTo, coords?.lat, coords?.lng])

  return (
    <div className="world-map-wrap" aria-hidden="true">
      <div ref={plateRef} className="world-plate has-image" style={{ ['--world-image' as string]: `url(${plateUrl})`, transition: 'opacity 800ms ease' }} />
      <div ref={ref} className="world-map" />
    </div>
  )
}
