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

export default function WorldMap({ plateUrl }: { state: string; plateUrl: string }) {
  const { coords } = useRisk()
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef<MLMarker[]>([])
  const readyRef = useRef(false)
  const centerRef = useRef<[number, number] | null>(null)
  const plateRef = useRef<HTMLDivElement>(null)

  // Place / reposition the mock overlays around a given center.
  const placeOverlays = (center: [number, number]) => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('eos-route') as { setData?: (d: unknown) => void } | undefined
    src?.setData?.({
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: ROUTE_OFF.map(d => off(center, d)) },
    })
    markersRef.current.forEach((mk, i) => {
      const d = i < FAMILY_OFF.length ? FAMILY_OFF[i].d : SHELTER_OFF
      mk.setLngLat(off(center, d))
    })
  }

  // init once
  useEffect(() => {
    let cancelled = false
    let map: MLMap | undefined
    ;(async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        if (cancelled || !ref.current) return
        const cfg = getMapConfig()
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

          markersRef.current = []
          for (const f of FAMILY_OFF) {
            const el = document.createElement('div')
            el.className = 'w-mapmarker'
            el.innerHTML = `<span class="pin" style="background:${f.color}">${f.name.slice(0, 2).toUpperCase()}</span><span class="lab">${f.label}</span>`
            markersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(off(cur, f.d)).addTo(map))
          }
          const sh = document.createElement('div')
          sh.className = 'w-mapmarker shelter'
          sh.innerHTML = `<span class="lab">▶ SHELTER (mock)</span>`
          markersRef.current.push(new maplibregl.Marker({ element: sh, anchor: 'bottom' }).setLngLat(off(cur, SHELTER_OFF)).addTo(map))

          readyRef.current = true
          if (plateRef.current) plateRef.current.style.opacity = '0'
        })
      } catch {
        // WebGL/init failure → keep the static plate visible (§28)
      }
    })()
    return () => { cancelled = true; markersRef.current = []; if (map) map.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // recenter when the real location resolves/changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !coords) return
    const center: [number, number] = [coords.lng, coords.lat]
    centerRef.current = center
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) map.jumpTo({ center })
    else map.flyTo({ center, duration: 1400, essential: true })
    if (readyRef.current) placeOverlays(center)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng])

  return (
    <div className="world-map-wrap" aria-hidden="true">
      <div ref={plateRef} className="world-plate has-image" style={{ ['--world-image' as string]: `url(${plateUrl})`, transition: 'opacity 800ms ease' }} />
      <div ref={ref} className="world-map" />
    </div>
  )
}
