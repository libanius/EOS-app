'use client'

/**
 * WorldMap — HWD-02/03 live hybrid map (doc 16 §6, §25).
 * MapLibre GL over a provider-neutral base (keyless CARTO dark; MapTiler
 * satellite + 3D terrain via env). Lazy-loaded; never blocks the HUD or
 * critical text. Degrades to the static world plate on load/WebGL failure (§28).
 *
 * HWD-03: the map centers on the user's REAL location (RiskProvider coords),
 * falling back to Parkland. Family markers + shelter route are MOCK (labeled),
 * placed as offsets from the current center so they stay near the user until
 * real family/routing lands in HWD-04 (privacy-gated).
 */

import { useEffect, useRef } from 'react'
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useRisk } from '@/components/v2/RiskProvider'
import { getMapConfig } from '@/lib/world/providers'
import type { MapBaseMode } from '@/lib/world/providers'

// Mock overlays as [lng, lat] offsets from the map center (labeled in the HUD).
const FAMILY_OFF: Array<{ name: string; label: string; color: string; d: [number, number] }> = [
  { name: 'Paulo', label: 'HOME', color: '#00e5a0', d: [-0.006, -0.004] },
  { name: 'Isadora', label: 'SCHOOL', color: '#ffb347', d: [0.008, 0.006] },
  { name: 'Ana', label: 'WORK', color: '#9aa0ad', d: [-0.010, 0.004] },
]
const ROUTE_OFF: Array<[number, number]> = [
  [-0.006, -0.004], [-0.001, -0.006], [0.005, -0.008], [0.011, -0.010],
]
const SHELTER_OFF: [number, number] = [0.011, -0.010]

const off = (c: [number, number], d: [number, number]): [number, number] => [c[0] + d[0], c[1] + d[1]]

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
export type WorldFamilyMember = { id: string; name: string; lat: number; lng: number; isMe?: boolean; freshness: string }
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

export default function WorldMap({ plateUrl, family = [], guidance = null, mapBase = 'hybrid' }: {
  state: string
  plateUrl: string
  family?: WorldFamilyMember[]
  guidance?: WorldGuidance | null
  mapBase?: MapBaseMode
}) {
  const { coords } = useRisk()
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef<MLMarker[]>([])
  const hazardMarkersRef = useRef<MLMarker[]>([])
  const readyRef = useRef(false)
  const centerRef = useRef<[number, number] | null>(null)
  const plateRef = useRef<HTMLDivElement>(null)

  // Place / reposition family + route overlays. Real HWD-04 data wins; mock
  // overlays remain only as a labeled fallback when no family/guidance exists.
  const placeOverlays = async (center: [number, number]) => {
    const map = mapRef.current
    if (!map) return
    const routeCoords = guidance?.route?.points?.length
      ? guidance.route.points
      : ROUTE_OFF.map(d => off(center, d))
    const src = map.getSource('eos-route') as { setData?: (d: unknown) => void } | undefined
    src?.setData?.({
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: routeCoords },
    })
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    const maplibregl = (await import('maplibre-gl')).default
    if (family.length) {
      family.slice(0, 8).forEach((m, i) => {
        const initials = m.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'FM'
        const color = m.isMe ? '#00e5a0' : ['#ffb347', '#9aa0ad', '#7c6bff', '#35d7f2'][i % 4]
        const el = markerEl('w-mapmarker real', initials, `${short(m.name, 18)} · ${m.freshness}`, color)
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map))
      })
    } else {
      for (const f of FAMILY_OFF) {
        const el = markerEl('w-mapmarker', f.name.slice(0, 2).toUpperCase(), f.label, f.color)
        markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(off(center, f.d)).addTo(map))
      }
    }
    const shelter = guidance?.shelter
    const sh = markerEl(
      `w-mapmarker shelter ${shelter ? 'ai' : ''}`,
      '',
      shelter ? `AI SHELTER · ${short(shelter.name, 24)}` : '▶ SHELTER (mock)',
    )
    markersRef.current.push(new maplibregl.Marker({ element: sh, anchor: 'bottom' }).setLngLat(
      shelter ? [shelter.lng, shelter.lat] : off(center, SHELTER_OFF),
    ).addTo(map))
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

        map.on('load', () => {
          if (cancelled || !map) return
          const cur = centerRef.current ?? center

          if (cfg.hasTerrain && cfg.terrainSource) {
            if (!map.getSource('eos-dem')) map.addSource('eos-dem', { type: 'raster-dem', url: cfg.terrainSource })
            map.setTerrain({ source: 'eos-dem', exaggeration: 1.2 })
          }

          map.addSource('eos-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ROUTE_OFF.map(d => off(cur, d)) } } })
          map.addLayer({ id: 'eos-route-glow', type: 'line', source: 'eos-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#00e5a0', 'line-width': 9, 'line-opacity': 0.18, 'line-blur': 6 } })
          map.addLayer({ id: 'eos-route', type: 'line', source: 'eos-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#00e5a0', 'line-width': 3.5, 'line-opacity': 0.95 } })

          readyRef.current = true
          void placeOverlays(cur)
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
      void placeOverlays(center)
      renderHazards(center)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng])

  useEffect(() => {
    const center = centerRef.current
    if (readyRef.current && center) void placeOverlays(center)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, guidance])

  return (
    <div className="world-map-wrap" aria-hidden="true">
      <div ref={plateRef} className="world-plate has-image" style={{ ['--world-image' as string]: `url(${plateUrl})`, transition: 'opacity 800ms ease' }} />
      <div ref={ref} className="world-map" />
    </div>
  )
}
