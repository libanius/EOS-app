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

import { useEffect, useRef, useState } from 'react'
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useRisk } from '@/components/v2/RiskProvider'
import { getMapConfig } from '@/lib/world/providers'
import type { CycloneSnapshot } from '@/lib/world/cyclones'
import type { WindSnapshot } from '@/lib/world/wind'
import { blowingToward } from '@/lib/world/wind'
import { WindParticleLayer } from '@/lib/world/WindParticleLayer'
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
  hazardType?: string
  eventType?: string
  title: string
  summary?: string
  instructions?: string[]
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

type HazardMapLayer = 'alert' | 'flood' | 'surge' | 'tornado'
type StormMotion = { bearingDeg: number; speedMph: number; phrase: string }

const HAZARD_LAYER_COLOR: Record<HazardMapLayer, string> = {
  alert: '#ffb347',
  flood: '#35d7f2',
  surge: '#7c6bff',
  tornado: '#ff453a',
}

const MOTION_BEARINGS: Record<string, number> = {
  n: 0, north: 0, northward: 0, northwards: 0,
  nne: 22.5, ne: 45, northeast: 45, 'north-east': 45, northeasterly: 45, northeastward: 45, northeastwards: 45,
  ene: 67.5, e: 90, east: 90, eastward: 90, eastwards: 90,
  ese: 112.5, se: 135, southeast: 135, 'south-east': 135, southeasterly: 135, southeastward: 135, southeastwards: 135,
  sse: 157.5, s: 180, south: 180, southward: 180, southwards: 180,
  ssw: 202.5, sw: 225, southwest: 225, 'south-west': 225, southwesterly: 225, southwestward: 225, southwestwards: 225,
  wsw: 247.5, w: 270, west: 270, westward: 270, westwards: 270,
  wnw: 292.5, nw: 315, northwest: 315, 'north-west': 315, northwesterly: 315, northwestward: 315, northwestwards: 315,
  nnw: 337.5,
}

function hazardText(e: HazardEvent) {
  return `${e.eventType ?? ''} ${e.hazardType ?? ''} ${e.title} ${e.summary ?? ''} ${(e.instructions ?? []).join(' ')}`
}

function hazardLayer(e: HazardEvent): HazardMapLayer {
  const text = hazardText(e).toLowerCase()
  if (/\bstorm surge\b/.test(text)) return 'surge'
  if (/\btornado\b/.test(text)) return 'tornado'
  if (/\b(flash flood|flood warning|flood watch|flood advisory|coastal flood|river flood|areal flood|flooding)\b/.test(text)) return 'flood'
  return 'alert'
}

function parseStormMotion(e: HazardEvent): StormMotion | null {
  if (hazardLayer(e) !== 'tornado') return null
  const text = hazardText(e).replace(/\s+/g, ' ')
  const match = text.match(/\bmoving\s+([a-z-]{1,20}|[NSEW]{1,3})\s+(?:at|around|near)\s+(\d{1,3})\s*mph\b/i)
  if (!match) return null
  const key = match[1].toLowerCase()
  const bearingDeg = MOTION_BEARINGS[key]
  const speedMph = Number(match[2])
  if (!Number.isFinite(bearingDeg) || !Number.isFinite(speedMph)) return null
  return { bearingDeg, speedMph, phrase: `moving ${match[1]} at ${speedMph} mph` }
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
  const layer = hazardLayer(e)
  return {
    type: 'Feature',
    properties: {
      id: e.id,
      title: e.title,
      severity: e.severity,
      visualClass: e.visualClass,
      hazardLayer: layer,
      color: layer === 'alert' ? HAZARD_COLOR[e.severity] ?? HAZARD_COLOR.info : HAZARD_LAYER_COLOR[layer],
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

function destinationPoint(start: [number, number], bearingDeg: number, distanceKm: number): [number, number] {
  const radiusKm = 6371
  const bearing = bearingDeg * Math.PI / 180
  const lat1 = start[1] * Math.PI / 180
  const lon1 = start[0] * Math.PI / 180
  const angular = distanceKm / radiusKm
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing))
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]
}

function tornadoMotionFeature(e: HazardEvent): unknown | null {
  const start = hazardTagLngLat(e)
  const motion = parseStormMotion(e)
  if (!start || !motion) return null
  const distanceKm = Math.max(6, Math.min(32, motion.speedMph * 1.60934 * 0.33))
  return {
    type: 'Feature',
    properties: {
      id: e.id,
      title: e.title,
      label: motion.phrase,
      rotate: motion.bearingDeg,
      speedMph: motion.speedMph,
      color: HAZARD_LAYER_COLOR.tornado,
    },
    geometry: { type: 'LineString', coordinates: [start, destinationPoint(start, motion.bearingDeg, distanceKm)] },
  }
}

function windImpactFeatures(wind: WindSnapshot | null | undefined): GeoJSON.Feature[] {
  return (wind?.readings ?? [])
    .filter(r => r.speedKmh >= 39 || (r.gustKmh ?? 0) >= 62)
    .map(r => {
      const impact = (r.gustKmh ?? r.speedKmh) >= 89 ? 'high' : 'moderate'
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: {
          impact,
          speedKmh: r.speedKmh,
          gustKmh: r.gustKmh ?? r.speedKmh,
          radius: impact === 'high' ? 26 : 18,
          color: impact === 'high' ? '#ff453a' : '#ff9f0a',
        },
      }
    })
}

function short(text: string, max = 38) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`
}

const WIND_CARDINAL = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

function windCardinal(deg: number) {
  return WIND_CARDINAL[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

type WindPopup = {
  x: number
  y: number
  speedMph: number
  gustMph: number | null
  direction: string
  forecast: string
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
  flood: boolean
  surge: boolean
  windImpact: boolean
  tornado: boolean
}

export const DEFAULT_LAYERS: MapLayerState = {
  radar: true,
  alerts: true,
  wind: false,
  cyclone: true,
  flood: true,
  surge: true,
  windImpact: false,
  tornado: true,
}

export default function WorldMap({ plateUrl, family = [], shelters = [], guidance = null, mapBase = 'hybrid', routeFocusNonce = 0, focus = null, courseTo = null, recenterNonce = 0, cyclones = null, wind = null, layers = DEFAULT_LAYERS, onMemberTap, onMapInteraction }: {
  state: string
  plateUrl: string
  family?: WorldFamilyMember[]
  shelters?: WorldShelter[]
  guidance?: WorldGuidance | null
  mapBase?: MapBaseMode
  routeFocusNonce?: number
  /** A place picked from search. `nonce` re-triggers the fly-to on re-pick. */
  focus?: {
    lat: number
    lng: number
    label: string
    nonce: number
    kind?: 'place' | 'alert'
    /** Quando presente, a câmera ENQUADRA esta caixa em vez de mergulhar no ponto. */
    bounds?: [[number, number], [number, number]]
  } | null
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
  /**
   * Marcadores de pessoas, indexados por id (D-081).
   *
   * Guardados num mapa e não numa lista porque eles são ATUALIZADOS entre
   * leituras: recriar um marcador com foto remonta o `<img>`, o navegador rebusca
   * a imagem, e o pino pisca a cada atualização de posição.
   */
  const peopleMarkersRef = useRef<Map<string, { shape: string; marker: MLMarker }>>(new Map())
  /** Abrigos e destino: poucos, sem imagem, posição fixa — recriar sai barato. */
  const staticMarkersRef = useRef<MLMarker[]>([])
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
  const windCanvasRef = useRef<HTMLCanvasElement>(null)
  const windScalarCanvasRef = useRef<HTMLCanvasElement>(null)
  const windLayerRef = useRef<WindParticleLayer | null>(null)
  const [windPopup, setWindPopup] = useState<WindPopup | null>(null)

  const ensureWindLayer = () => {
    const map = mapRef.current
    const canvas = windCanvasRef.current
    const scalarCanvas = windScalarCanvasRef.current
    if (!map || !canvas || !readyRef.current) return null
    if (!windLayerRef.current) windLayerRef.current = new WindParticleLayer(map, canvas, scalarCanvas)
    return windLayerRef.current
  }

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

    /**
     * Marcadores de PESSOAS são reconciliados, não recriados.
     *
     * Recriar todos a cada atualização remonta o `<img>` da foto, e o navegador
     * a busca de novo — o marcador PISCAVA a cada leitura de posição. Uma
     * posição que muda deve MOVER o pino, não trocá-lo por outro igual.
     *
     * Abrigos e destino seguem sendo recriados: são poucos, sem imagem, e não
     * mudam de posição — ali o custo de reconciliar não se paga.
     */
    staticMarkersRef.current.forEach(m => m.remove())
    staticMarkersRef.current = []

    if (!family.length && !shelters.length && !guidance?.shelter) {
      peopleMarkersRef.current.forEach(m => m.marker.remove())
      peopleMarkersRef.current.clear()
      return
    }
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

    // Quem saiu da lista sai do mapa; quem ficou é atualizado no lugar.
    const alive = new Set(family.slice(0, 8).map(m => m.id))
    // `forEach` em vez de `for…of`: o alvo de compilação do projeto não itera
    // Map sem downlevelIteration, e mudar o alvo por causa de um laço é o tipo
    // de mudança global que se paga em outro lugar.
    Array.from(peopleMarkersRef.current.keys()).forEach(id => {
      if (!alive.has(id)) {
        peopleMarkersRef.current.get(id)?.marker.remove()
        peopleMarkersRef.current.delete(id)
      }
    })

    family.slice(0, 8).forEach((m, i) => {
      const offset = offsetFor(m, i)
      const existing = peopleMarkersRef.current.get(m.id)
      // Chave do que EXIGE um elemento novo. Posição não entra: mudar de lugar
      // é mover o marcador, não recriá-lo.
      const shape = `${m.isMe}|${m.avatarUrl ?? ''}|${m.name}|${m.freshness}|${m.approximate}|${m.live}`
      if (existing && existing.shape === shape) {
        existing.marker.setLngLat([m.lng, m.lat]).setOffset(offset)
        return
      }
      if (existing) {
        existing.marker.remove()
        peopleMarkersRef.current.delete(m.id)
      }

      if (m.isMe) {
        // Centred, unlabelled: a presence, not a marker (see selfPuckEl).
        const puck = selfPuckEl(m.avatarUrl, m.live !== false)
        if (onMemberTap) {
          puck.style.pointerEvents = 'auto'
          puck.style.cursor = 'pointer'
          puck.addEventListener('click', () => onMemberTap(m.id))
        }
        peopleMarkersRef.current.set(m.id, {
          shape,
          marker: new maplibregl.Marker({ element: puck, anchor: 'center', offset })
            .setLngLat([m.lng, m.lat])
            .addTo(map),
        })
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
      peopleMarkersRef.current.set(m.id, {
        shape,
        marker: new maplibregl.Marker({ element: el, anchor: 'bottom', offset })
          .setLngLat([m.lng, m.lat])
          .addTo(map),
      })
    })

    // Official FEMA shelters. Distance is on the label because it is the fact
    // that decides whether this shelter is reachable on foot.
    for (const shelter of shelters.slice(0, 6)) {
      const el = markerEl('w-mapmarker shelter', '', `${short(shelter.name, 26)} · ${shelter.distanceKm.toFixed(1)} km`)
      staticMarkersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([shelter.lng, shelter.lat]).addTo(map),
      )
    }

    const shelter = guidance?.shelter
    if (shelter) {
      const sh = markerEl('w-mapmarker shelter ai', '', `AI SHELTER · ${short(shelter.name, 24)}`)
      staticMarkersRef.current.push(
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
      const byLayer = (layer: HazardMapLayer) => polygons.filter(f => {
        const feature = f as { properties?: { hazardLayer?: string } }
        return feature.properties?.hazardLayer === layer
      })
      const points = events.map(pointFeature).filter(Boolean)
      const polyData = { type: 'FeatureCollection' as const, features: byLayer('alert') } as never
      const floodData = { type: 'FeatureCollection' as const, features: byLayer('flood') } as never
      const surgeData = { type: 'FeatureCollection' as const, features: byLayer('surge') } as never
      const tornadoPolyData = { type: 'FeatureCollection' as const, features: byLayer('tornado') } as never
      const tornadoMotionData = { type: 'FeatureCollection' as const, features: events.map(tornadoMotionFeature).filter(Boolean) } as never
      const pointData = { type: 'FeatureCollection' as const, features: points } as never

      const setOrAdd = (sourceId: string, data: unknown) => {
        const src = map.getSource(sourceId) as { setData?: (d: unknown) => void } | undefined
        if (src) {
          src.setData?.(data)
          return true
        }
        map.addSource(sourceId, { type: 'geojson', data: data as never })
        return false
      }

      const hadHazards = setOrAdd('eos-hazard-polygons', polyData)
      setOrAdd('eos-flood-polygons', floodData)
      setOrAdd('eos-surge-polygons', surgeData)
      setOrAdd('eos-tornado-polygons', tornadoPolyData)
      setOrAdd('eos-tornado-motion', tornadoMotionData)
      if (!hadHazards) {
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

        map.addLayer({
          id: 'eos-flood-fill',
          type: 'fill',
          source: 'eos-flood-polygons',
          paint: { 'fill-color': HAZARD_LAYER_COLOR.flood, 'fill-opacity': 0.22 },
        }, before)
        map.addLayer({
          id: 'eos-flood-outline',
          type: 'line',
          source: 'eos-flood-polygons',
          paint: { 'line-color': HAZARD_LAYER_COLOR.flood, 'line-width': 1.6, 'line-opacity': 0.86 },
        }, before)

        map.addLayer({
          id: 'eos-surge-fill',
          type: 'fill',
          source: 'eos-surge-polygons',
          paint: { 'fill-color': HAZARD_LAYER_COLOR.surge, 'fill-opacity': 0.2 },
        }, before)
        map.addLayer({
          id: 'eos-surge-outline',
          type: 'line',
          source: 'eos-surge-polygons',
          paint: { 'line-color': HAZARD_LAYER_COLOR.surge, 'line-width': 1.8, 'line-opacity': 0.9, 'line-dasharray': [2, 1.2] },
        }, before)

        map.addLayer({
          id: 'eos-tornado-fill',
          type: 'fill',
          source: 'eos-tornado-polygons',
          paint: { 'fill-color': HAZARD_LAYER_COLOR.tornado, 'fill-opacity': 0.14 },
        }, before)
        map.addLayer({
          id: 'eos-tornado-outline',
          type: 'line',
          source: 'eos-tornado-polygons',
          paint: { 'line-color': HAZARD_LAYER_COLOR.tornado, 'line-width': 2, 'line-opacity': 0.95 },
        }, before)
        map.addLayer({
          id: 'eos-tornado-motion',
          type: 'line',
          source: 'eos-tornado-motion',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': HAZARD_LAYER_COLOR.tornado, 'line-width': 3, 'line-opacity': 0.95, 'line-dasharray': [1.2, 1.2] },
        })
        map.addLayer({
          id: 'eos-tornado-motion-arrow',
          type: 'symbol',
          source: 'eos-tornado-motion',
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 140,
            'icon-image': 'eos-arrow',
            'icon-size': 0.8,
            'icon-rotate': ['get', 'rotate'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
          },
          paint: { 'icon-color': HAZARD_LAYER_COLOR.tornado, 'icon-halo-color': '#000000', 'icon-halo-width': 1.2 },
        })
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

          // Impacto de vento é derivado do grid acima. Ele responde "onde isso
          // já está forte o bastante para afetar decisão" sem fingir aviso
          // oficial: é uma leitura EOS/Open-Meteo, não NWS.
          map.addSource('eos-wind-impact', { type: 'geojson', data: EMPTY_FC })
          map.addLayer({
            id: 'eos-wind-impact',
            type: 'circle',
            source: 'eos-wind-impact',
            paint: {
              'circle-radius': ['get', 'radius'],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.2,
              'circle-blur': 0.25,
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': 1.2,
              'circle-stroke-opacity': 0.8,
            },
          }, 'eos-wind')
          map.addLayer({
            id: 'eos-wind-impact-label',
            type: 'symbol',
            source: 'eos-wind-impact',
            layout: {
              'text-field': ['concat', ['to-string', ['get', 'gustKmh']], ' km/h'],
              'text-size': 10,
              'text-allow-overlap': false,
            },
            paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.3, 'text-opacity': 0.9 },
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
    // O ref é copiado para uma variável do efeito: no cleanup, `.current` pode
    // já apontar para outro mapa, e removeríamos os marcadores errados.
    const people = peopleMarkersRef.current
    return () => {
      cancelled = true
      people.forEach(entry => entry.marker.remove())
      people.clear()
      staticMarkersRef.current.forEach(m => m.remove())
      staticMarkersRef.current = []
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

  useEffect(() => {
    ensureWindLayer()
    return () => {
      windLayerRef.current?.destroy()
      windLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const layer = ensureWindLayer()
    if (!layer) return
    layer.setData(wind?.readings ?? [])
    if (layers?.wind && wind?.readings.length) layer.enable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wind])

  useEffect(() => {
    const map = mapRef.current
    const layer = ensureWindLayer()
    if (!map || !layer) return
    if (layers?.wind && wind?.readings.length) layer.enable()
    else {
      layer.disable()
      setWindPopup(null)
    }
    const update = () => layer.updateViewport()
    map.on('move', update)
    map.on('zoom', update)
    window.addEventListener('resize', update)
    return () => {
      map.off('move', update)
      map.off('zoom', update)
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers?.wind, wind?.readings.length])

  useEffect(() => {
    const map = mapRef.current
    const layer = ensureWindLayer()
    if (!map || !layer || !readyRef.current || !layers?.wind) return
    let timer: number | null = null
    let controller: AbortController | null = null
    let cancelled = false

    const load = () => {
      controller?.abort()
      controller = new AbortController()
      const center = map.getCenter()
      const bounds = map.getBounds()
      const lngSpan = Math.min(360, Math.abs(bounds.getEast() - bounds.getWest()))
      const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth())
      const latSpanRequest = Math.min(170, Math.max(0.35, latSpan * 1.2))
      const lngSpanRequest = Math.min(360, Math.max(0.35, lngSpan * 1.2))
      const broadSpan = Math.max(latSpanRequest, lngSpanRequest)
      const grid = broadSpan > 90 ? 17 : broadSpan > 35 ? 15 : broadSpan > 10 ? 13 : broadSpan > 3 ? 11 : 9
      fetch(`/api/world/wind?lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}&latSpan=${latSpanRequest.toFixed(2)}&lngSpan=${lngSpanRequest.toFixed(2)}&grid=${grid}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(r => (r.ok ? r.json() : null))
        .then((snap: WindSnapshot | null) => {
          if (!cancelled && snap?.readings?.length) layer.setData(snap.readings)
        })
        .catch(() => {})
    }

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(load, 350)
    }

    load()
    map.on('moveend', schedule)
    map.on('zoomend', schedule)
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      controller?.abort()
      map.off('moveend', schedule)
      map.off('zoomend', schedule)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers?.wind])

  useEffect(() => {
    const map = mapRef.current
    const readings = wind?.readings ?? []
    if (!map || !readyRef.current || !layers?.wind || !readings.length) {
      setWindPopup(null)
      return
    }
    const onClick = (event: { point: { x: number; y: number } }) => {
      const lngLat = map.unproject([event.point.x, event.point.y])
      const sampled = windLayerRef.current?.sample(lngLat.lng, lngLat.lat)
      if (!sampled) {
        setWindPopup(null)
        return
      }
      let best: (typeof readings)[number] | null = null
      let bestD = Number.POSITIVE_INFINITY
      for (const r of readings) {
        const p = map.project([r.lng, r.lat])
        const d = Math.hypot(p.x - event.point.x, p.y - event.point.y)
        if (d < bestD) {
          bestD = d
          best = r
        }
      }
      if (!best) return
      setWindPopup({
        x: event.point.x,
        y: event.point.y,
        speedMph: Math.round(sampled.speedMph),
        gustMph: best.gustMph ?? (best.gustKmh === null ? null : Math.round(best.gustKmh * 0.621371)),
        direction: windCardinal(best.fromDeg),
        forecast: wind?.frames?.[0]?.label ?? 'NOW',
      })
    }
    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [wind, layers?.wind])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const source = map.getSource('eos-wind-impact') as maplibregl.GeoJSONSource | undefined
    if (!source) return
    const show = Boolean(layers?.windImpact) && Boolean(wind?.readings.length)
    source.setData({
      type: 'FeatureCollection',
      features: show ? windImpactFeatures(wind) : [],
    })
  }, [wind, layers?.windImpact])

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
    for (const id of ['eos-flood-fill', 'eos-flood-outline']) toggle(id, Boolean(layers?.flood))
    for (const id of ['eos-surge-fill', 'eos-surge-outline']) toggle(id, Boolean(layers?.surge))
    for (const id of ['eos-tornado-fill', 'eos-tornado-outline', 'eos-tornado-motion', 'eos-tornado-motion-arrow']) {
      toggle(id, Boolean(layers?.tornado))
    }
    for (const id of ['eos-wind-impact', 'eos-wind-impact-label']) toggle(id, Boolean(layers?.windImpact))
  }, [layers?.radar, layers?.alerts, layers?.flood, layers?.surge, layers?.tornado, layers?.windImpact])

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
      /**
       * Cone estourando a tela era o sintoma: `flyTo` com zoom fixo mergulha no
       * ponto, e o cone de um furacão cobre centenas de quilômetros. Quando há
       * caixa, ela manda — e a folha inferior é descontada no padding, senão
       * metade do cone fica embaixo dela.
       */
      if (focus.bounds) {
        const sheetSpace = window.innerWidth < 760 ? 300 : 60
        map.fitBounds(focus.bounds, {
          padding: { top: 90, bottom: sheetSpace, left: 40, right: 40 },
          duration: reduce ? 0 : 1200,
          maxZoom: 9,   // acima disso o cone volta a não caber
          essential: true,
        })
        return
      }

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
      <canvas ref={windScalarCanvasRef} className="world-wind-scalar-canvas" data-active={layers?.wind ? 'true' : 'false'} />
      <canvas ref={windCanvasRef} className="world-wind-canvas" data-active={layers?.wind ? 'true' : 'false'} />
      {layers?.wind && wind?.readings.length ? (
        <div className="world-wind-legend">
          <span>WIND SPEED</span>
          <b>0</b><b>10</b><b>20</b><b>30</b><b>40+ mph</b>
          <i aria-hidden="true" />
        </div>
      ) : null}
      {windPopup && layers?.wind ? (
        <div className="world-wind-popup" style={{ left: windPopup.x, top: windPopup.y }}>
          <strong>WIND</strong>
          <span>Speed: {windPopup.speedMph} mph</span>
          {windPopup.gustMph !== null && <span>Gusts: {windPopup.gustMph} mph</span>}
          <span>Direction: {windPopup.direction}</span>
          <span>Forecast: {windPopup.forecast}</span>
        </div>
      ) : null}
    </div>
  )
}
