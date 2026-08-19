'use client'

/**
 * RouteDraw — a família desenha a própria rota (PLAN-T03 / doc 18 §5).
 *
 * NÃO existe motor de roteamento aqui, e isso é a decisão, não uma limitação
 * (D-066 §5). Uma rota desenhada à mão:
 *
 *  1. sobrevive offline — é uma polilinha guardada, não uma chamada de servidor;
 *  2. carrega conhecimento local que roteador nenhum tem ("a ponte baixa alaga",
 *     "corta pelo parque, o portão fica aberto");
 *  3. é um COMPROMISSO da família, não uma sugestão. O valor está no acordo.
 *
 * O traçado começa e termina em pontos que já existem no plano: a família
 * desenha o MEIO. Isso amarra a rota à escada de pontos de encontro em vez de
 * deixá-la solta no mapa, e é o que faz a rota significar "como eu chego lá".
 *
 * O mapa aqui é PLANO (pitch 0) de propósito. O dashboard é inclinado porque é
 * uma vista de situação; desenhar num mapa inclinado erra o ponto, porque a
 * projeção move o pixel em relação ao chão.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMapBaseMode } from '@/lib/use-map-base-mode'
import { getMapConfig } from '@/lib/world/providers'
import { distanceKm } from '@/lib/world/shelters'
import { formatDistance, walkingMinutes } from '@/lib/world/navigation'
import { isRendezvous, type PlanRoute, type PlanWaypoint } from '@/lib/family-plan'
import { Pill } from './primitives'
import { haptic } from './motion'

type LngLat = [number, number]

const COPY = {
  pt: {
    title: 'Desenhar rota',
    from: 'De',
    to: 'Para',
    label: 'Nome da rota',
    labelPlaceholder: 'Ex.: da escola até a praça',
    mode: 'Como',
    foot: 'A pé',
    car: 'De carro',
    notes: 'O que a família precisa saber',
    notesPlaceholder: 'Ex.: não pegue a ponte baixa, ela alaga',
    tapToDraw: 'Toque no mapa para marcar o caminho. Comece perto do ponto de partida.',
    undo: 'Desfazer',
    clear: 'Limpar',
    save: 'Salvar rota',
    cancel: 'Cancelar',
    needTwo: 'Escolha um ponto de partida e um de chegada.',
    samePoint: 'Partida e chegada precisam ser lugares diferentes.',
    onFoot: 'a pé',
    vertices: 'pontos no traçado',
  },
  en: {
    title: 'Draw route',
    from: 'From',
    to: 'To',
    label: 'Route name',
    labelPlaceholder: 'e.g. school to the square',
    mode: 'How',
    foot: 'On foot',
    car: 'By car',
    notes: 'What the family needs to know',
    notesPlaceholder: 'e.g. avoid the low bridge, it floods',
    tapToDraw: 'Tap the map to mark the way. Start near the departure point.',
    undo: 'Undo',
    clear: 'Clear',
    save: 'Save route',
    cancel: 'Cancel',
    needTwo: 'Pick a departure and an arrival point.',
    samePoint: 'Departure and arrival must be different places.',
    onFoot: 'on foot',
    vertices: 'points in the path',
  },
} as const

/** Comprimento real do traçado, somando segmento a segmento. */
export function routeLengthKm(coordinates: LngLat[]): number {
  let total = 0
  for (let i = 1; i < coordinates.length; i += 1) {
    total += distanceKm(
      { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] },
      { lat: coordinates[i][1], lng: coordinates[i][0] },
    )
  }
  return total
}

export default function RouteDraw({
  open,
  pt,
  waypoints,
  existing,
  onSave,
  onClose,
}: {
  open: boolean
  pt: boolean
  waypoints: PlanWaypoint[]
  existing: PlanRoute | null
  onSave: (route: PlanRoute) => void
  onClose: () => void
}) {
  const c = COPY[pt ? 'pt' : 'en']
  const holder = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef<MLMarker[]>([])
  const { mapBase } = useMapBaseMode()

  const [fromIndex, setFromIndex] = useState(0)
  const [toIndex, setToIndex] = useState(1)
  const [label, setLabel] = useState('')
  const [mode, setMode] = useState<'foot' | 'car'>('foot')
  const [notes, setNotes] = useState('')
  const [vertices, setVertices] = useState<LngLat[]>([])

  const from = waypoints[fromIndex] ?? null
  const to = waypoints[toIndex] ?? null

  /**
   * O traçado completo: partida → o que a família desenhou → chegada.
   * Memoizado porque alimenta um efeito: recriar o array a cada render redesenharia
   * a camada do mapa sessenta vezes por segundo sem nada ter mudado.
   */
  const line = useMemo<LngLat[]>(
    () => (from && to ? [[from.lng, from.lat], ...vertices, [to.lng, to.lat]] : []),
    [from, to, vertices],
  )

  const lengthKm = line.length > 1 ? routeLengthKm(line) : 0

  useEffect(() => {
    if (!open) return
    setLabel(existing?.label ?? '')
    setMode(existing?.mode === 'car' ? 'car' : 'foot')
    setNotes(existing?.notes ?? '')
    // Reabrir uma rota existente devolve o traçado sem as pontas, que são
    // recompostas a partir dos pontos escolhidos.
    const coords = (existing?.geometry as { coordinates?: LngLat[] } | undefined)?.coordinates
    setVertices(coords && coords.length > 2 ? coords.slice(1, -1) : [])
  }, [open, existing])

  // ── the map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !holder.current || mapRef.current) return
    let cancelled = false

    void (async () => {
      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled || !holder.current) return
      const cfg = getMapConfig(mapBase)

      const map = new maplibregl.Map({
        container: holder.current,
        style: cfg.styleUrl,
        center: from ? [from.lng, from.lat] : cfg.center,
        zoom: 14,
        pitch: 0,      // desenhar exige o chão, não a perspectiva
        bearing: 0,
        attributionControl: false,
      })
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        if (cancelled) return
        map.addSource('draw-line', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
        })
        map.addLayer({
          id: 'draw-line-glow',
          type: 'line',
          source: 'draw-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#30d158', 'line-width': 10, 'line-opacity': 0.2, 'line-blur': 6 },
        })
        map.addLayer({
          id: 'draw-line-core',
          type: 'line',
          source: 'draw-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#30d158', 'line-width': 4 },
        })
        mapRef.current = map
        // Força o primeiro desenho assim que as camadas existem.
        setVertices(v => [...v])
      })

      map.on('click', event => {
        haptic.selection()
        setVertices(current => [...current, [event.lngLat.lng, event.lngLat.lat]])
      })
    })()

    return () => {
      cancelled = true
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
    // `from` só é lido para a centralização inicial; recriar o mapa ao trocar de
    // ponto perderia o traçado em andamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBase, open])

  // ── keep the drawing on screen ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('draw-line')) return
    ;(map.getSource('draw-line') as maplibregl.GeoJSONSource).setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    })
  }, [line])

  // ── anchors: every place the plan knows ────────────────────────────────────
  const paintMarkers = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    const maplibregl = (await import('maplibre-gl')).default
    markersRef.current.forEach(m => m.remove())
    markersRef.current = waypoints.map((w, i) => {
      const el = document.createElement('div')
      el.className = `wv2-drawpin${i === fromIndex ? ' from' : ''}${i === toIndex ? ' to' : ''}`
      el.textContent = w.name
      return new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([w.lng, w.lat])
        .addTo(map)
    })
  }, [waypoints, fromIndex, toIndex])

  useEffect(() => {
    if (!open) return
    void paintMarkers()
  }, [open, paintMarkers, vertices.length])

  if (!open) return null

  const invalid = !from || !to ? c.needTwo : fromIndex === toIndex ? c.samePoint : null

  return (
    <div className="wv2 wv2-draw" role="dialog" aria-label={c.title}>
      <div ref={holder} className="wv2-draw-map" />

      <div className="wv2-draw-panel wv2-fume">
        <div className="wv2-draw-head">
          <strong className="t-title2">{c.title}</strong>
          <span className="t-foot ink-3">
            {vertices.length} {c.vertices}
            {lengthKm > 0 && ` · ${formatDistance(lengthKm, pt)}`}
            {lengthKm > 0 && mode === 'foot' && ` · ~${walkingMinutes(lengthKm)} min ${c.onFoot}`}
          </span>
        </div>

        <div className="wv2-draw-ends">
          <label className="wv2-field">
            <span className="t-caps ink-3">{c.from}</span>
            <select className="wv2-input" value={fromIndex} onChange={e => setFromIndex(Number(e.target.value))}>
              {waypoints.map((w, i) => <option key={i} value={i}>{w.name}</option>)}
            </select>
          </label>
          <label className="wv2-field">
            <span className="t-caps ink-3">{c.to}</span>
            <select className="wv2-input" value={toIndex} onChange={e => setToIndex(Number(e.target.value))}>
              {waypoints.map((w, i) => <option key={i} value={i}>{w.name}</option>)}
            </select>
          </label>
        </div>

        <p className="t-foot ink-3">{c.tapToDraw}</p>

        <label className="wv2-field">
          <span className="t-caps ink-3">{c.label}</span>
          <input className="wv2-input" value={label} onChange={e => setLabel(e.target.value)} placeholder={c.labelPlaceholder} />
        </label>

        <div className="wv2-draw-mode">
          <button type="button" className={`wv2-chip${mode === 'foot' ? ' on' : ''}`} onClick={() => setMode('foot')}>{c.foot}</button>
          <button type="button" className={`wv2-chip${mode === 'car' ? ' on' : ''}`} onClick={() => setMode('car')}>{c.car}</button>
        </div>

        <label className="wv2-field">
          <span className="t-caps ink-3">{c.notes}</span>
          <input className="wv2-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={c.notesPlaceholder} />
        </label>

        {invalid && <p className="t-foot warn">{invalid}</p>}

        <div className="wv2-draw-acts">
          <Pill onClick={() => setVertices(v => v.slice(0, -1))} disabled={!vertices.length}>{c.undo}</Pill>
          <Pill onClick={() => setVertices([])} disabled={!vertices.length}>{c.clear}</Pill>
          <Pill onClick={onClose}>{c.cancel}</Pill>
          <Pill
            primary
            disabled={Boolean(invalid) || !label.trim() || line.length < 2}
            onClick={() =>
              onSave({
                label: label.trim(),
                mode,
                notes: notes.trim() || null,
                geometry: { type: 'LineString', coordinates: line },
              })
            }
          >
            {c.save}
          </Pill>
        </div>
      </div>
    </div>
  )
}

/** Rótulo curto de uma rota para as listas do plano. */
export function routeSummary(route: PlanRoute, pt: boolean): string {
  const coords = (route.geometry as { coordinates?: LngLat[] } | undefined)?.coordinates ?? []
  const km = routeLengthKm(coords)
  const how = route.mode === 'car' ? (pt ? 'de carro' : 'by car') : (pt ? 'a pé' : 'on foot')
  if (!km) return how
  return route.mode === 'foot'
    ? `${formatDistance(km, pt)} · ~${walkingMinutes(km)} min ${how}`
    : `${formatDistance(km, pt)} · ${how}`
}

export { isRendezvous }
