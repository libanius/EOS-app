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
import type { MapBaseMode } from '@/lib/world/providers'

// D-064 §5: no mock overlays. This component used to invent three family pins
// ("Paulo/Isadora/Ana"), a route and a `SHELTER · mock` marker whenever it got no
// data — and that shipped to the production dashboard. A fictional shelter on an
// emergency product is a hazard, not a placeholder. No real data → no marker.
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

function markerEl(className: string, pin: string, label: string, color?: string) {
  const el = document.createElement('div')
  el.className = className
  if (pin) {
    const p = document.createElement('span')
    p.className = 'pin'
    if (color) p.style.background = color
    p.textContent = pin
    el.appendChild(p)
  }
  const lab = document.createElement('span')
  lab.className = 'lab'
  lab.textContent = label
  el.appendChild(lab)
  return el
}

export default function WorldMap({ plateUrl, family = [], shelters = [], guidance = null, mapBase = 'hybrid', routeFocusNonce = 0, focus = null, courseTo = null, onMapInteraction }: {
  state: string
  plateUrl: string
  family?: WorldFamilyMember[]
  shelters?: WorldShelter[]
  guidance?: WorldGuidance | null
  mapBase?: MapBaseMode
  routeFocusNonce?: number
  /** A place picked from search. `nonce` re-triggers the fly-to on re-pick. */
  focus?: { lat: number; lng: number; label: string; nonce: number } | null
  /**
   * A course the user asked to see: EOS draws it as a layer on its own map
   * instead of only handing off to another app (D-069). Indicative straight
   * line — EOS does not claim to know the roads.
   */
  courseTo?: { lat: number; lng: number; label: string; nonce: number } | null
  onMapInteraction?: () => void
}) {
  const { coords } = useRisk()
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef<MLMarker[]>([])
  const hazardMarkersRef = useRef<MLMarker[]>([])
  // Kept out of markersRef so a family/shelter refresh never wipes the search pin.
  const searchMarkerRef = useRef<MLMarker | null>(null)
  const courseMarkerRef = useRef<MLMarker | null>(null)
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

    family.slice(0, 8).forEach((m, i) => {
      if (m.isMe) {
        // Centred, unlabelled: a presence, not a marker (see selfPuckEl).
        const puck = selfPuckEl(m.avatarUrl, m.live !== false)
        markersRef.current.push(
          new maplibregl.Marker({ element: puck, anchor: 'center' }).setLngLat([m.lng, m.lat]).addTo(map),
        )
        return
      }
      const initials = m.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'FM'
      const color = ['#ffb347', '#9aa0ad', '#7c6bff', '#35d7f2'][i % 4]
      // Freshness is part of the label by contract: a stale point presented as
      // a current one is worse than no point at all.
      const el = markerEl('w-mapmarker real', initials, `${short(m.name, 18)} · ${m.freshness}`, color)
      markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map))
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
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
        map.on('error', () => { /* tiles/provider errors must not blank the app */ })
        if (onMapInteraction) {
          map.on('dragstart', onMapInteraction)
          map.on('zoomstart', onMapInteraction)
          map.on('rotatestart', onMapInteraction)
          map.on('pitchstart', onMapInteraction)
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
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) map.jumpTo({ center })
    else map.flyTo({ center, duration: 1400, essential: true })
    if (readyRef.current) {
      void placeOverlays()
      renderHazards(center)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng])

  useEffect(() => {
    if (readyRef.current) void placeOverlays()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, shelters, guidance])

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
      const el = markerEl('w-mapmarker searched', '', short(focus.label, 30))
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
