'use client'

/**
 * WorldMap — HWD-02 live hybrid map (doc 16 §6, §25).
 * MapLibre GL renderer over a provider-neutral base (keyless CARTO dark by
 * default; MapTiler + 3D terrain via env). Lazy-loaded so it never blocks the
 * HUD or critical text. Degrades to the static world plate on load/WebGL
 * failure (§28). Family markers + shelter route are MOCK GeoJSON, labeled.
 */

import { useEffect, useRef, useState } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapConfig } from '@/lib/world/providers'

// Mock geographic overlays (Parkland-area coords), clearly labeled in the HUD.
const FAMILY: Array<{ name: string; label: string; color: string; lngLat: [number, number] }> = [
  { name: 'Paulo', label: 'HOME', color: '#00e5a0', lngLat: [-80.2455, 26.3055] },
  { name: 'Isadora', label: 'SCHOOL', color: '#ffb347', lngLat: [-80.2255, 26.3205] },
  { name: 'Ana', label: 'WORK', color: '#9aa0ad', lngLat: [-80.2555, 26.3155] },
]
const ROUTE: Array<[number, number]> = [
  [-80.2455, 26.3055], [-80.2385, 26.3035], [-80.2305, 26.3015], [-80.2215, 26.3005],
]
const SHELTER: [number, number] = [-80.2215, 26.3005]

export default function WorldMap({ plateUrl }: { state: string; plateUrl: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let map: MLMap | undefined

    ;(async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        if (cancelled || !ref.current) return
        const cfg = getMapConfig()

        map = new maplibregl.Map({
          container: ref.current,
          style: cfg.styleUrl,
          center: cfg.center,
          zoom: cfg.zoom,
          pitch: cfg.pitch,
          bearing: cfg.bearing,
          attributionControl: false,
          interactive: true,
          maxPitch: 75,
        })
        mapRef.current = map
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
        // Tile errors must not blank the app — the static plate stays behind.
        map.on('error', () => { /* swallow provider/tile errors */ })

        map.on('load', () => {
          if (cancelled || !map) return

          map.addSource('eos-route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ROUTE } },
          })
          map.addLayer({
            id: 'eos-route-glow', type: 'line', source: 'eos-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#00e5a0', 'line-width': 9, 'line-opacity': 0.18, 'line-blur': 6 },
          })
          map.addLayer({
            id: 'eos-route', type: 'line', source: 'eos-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#00e5a0', 'line-width': 3.5, 'line-opacity': 0.95 },
          })

          for (const f of FAMILY) {
            const el = document.createElement('div')
            el.className = 'w-mapmarker'
            el.innerHTML = `<span class="pin" style="background:${f.color}">${f.name.slice(0, 2).toUpperCase()}</span><span class="lab">${f.label}</span>`
            new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(f.lngLat).addTo(map)
          }
          const sh = document.createElement('div')
          sh.className = 'w-mapmarker shelter'
          sh.innerHTML = `<span class="lab">▶ SHELTER 4.2 MI</span>`
          new maplibregl.Marker({ element: sh, anchor: 'bottom' }).setLngLat(SHELTER).addTo(map)

          setReady(true)
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => { cancelled = true; if (map) map.remove() }
  }, [])

  return (
    <div className="world-map-wrap" aria-hidden="true">
      {/* static plate fallback: shows during load and if WebGL/tiles fail (§28) */}
      <div
        className="world-plate has-image"
        style={{ ['--world-image' as string]: `url(${plateUrl})`, opacity: ready ? 0 : 1, transition: 'opacity 800ms ease' }}
      />
      <div ref={ref} className="world-map" style={{ opacity: failed ? 0 : 1 }} />
    </div>
  )
}
