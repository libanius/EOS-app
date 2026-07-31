'use client'

/**
 * Ciclones e vento para o mapa (D-078).
 *
 * Busca sob demanda, guiada pelo interruptor: enquanto a camada está desligada,
 * a requisição não sai. Não é economia de servidor — é honestidade com o
 * aparelho da pessoa, que num evento está com bateria contada e possivelmente
 * numa rede degradada. Ligar a camada é o consentimento para gastar isso.
 *
 * O ciclone é exceção parcial e de propósito: ele fica ligado por padrão, porque
 * "existe um furacão vindo" não é informação opcional.
 */

import { useEffect, useState } from 'react'
import type { CycloneSnapshot } from '@/lib/world/cyclones'
import type { WindSnapshot } from '@/lib/world/wind'
import type { MapLayerState } from '@/components/world-dashboard/WorldMap'

/** O NHC publica avisos a cada 3 h e intermediários a cada hora. */
const CYCLONE_REFRESH_MS = 10 * 60 * 1000
/** Vento muda devagar em escala de grade; 15 min sobra. */
const WIND_REFRESH_MS = 15 * 60 * 1000

/**
 * Um alerta com POSIÇÃO.
 *
 * O card de alertas do dashboard mostrava só o texto — e "Tropical Storm Warning"
 * sem lugar nenhum obriga a pessoa a imaginar onde é. Os eventos de `/api/hazards`
 * carregam geometria, então cada alerta vira um ponto para onde o mapa voa.
 */
export type LocatedAlert = {
  id: string
  title: string
  severity: string
  lat: number
  lng: number
}

/**
 * Centro aproximado de uma geometria.
 *
 * Média dos vértices, não centroide de área: um polígono de alerta é um recorte
 * de condado, e o que se quer aqui é "leve a câmera para perto disto", não uma
 * medida cartográfica. A diferença entre os dois não é visível no zoom em que
 * este ponto é usado.
 */
function centreOf(geometry: unknown): { lat: number; lng: number } | null {
  const g = geometry as { type?: string; coordinates?: unknown } | null
  if (!g?.type || !g.coordinates) return null

  const points: Array<[number, number]> = []
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      points.push([node[0] as number, node[1] as number])
      return
    }
    node.forEach(walk)
  }
  walk(g.coordinates)
  if (!points.length) return null

  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
  return { lng: sum[0] / points.length, lat: sum[1] / points.length }
}

export function useWeatherLayers(
  coords: { lat: number; lng: number } | null,
  layers: MapLayerState,
) {
  const [cyclones, setCyclones] = useState<CycloneSnapshot | null>(null)
  const [wind, setWind] = useState<WindSnapshot | null>(null)
  const [alerts, setAlerts] = useState<LocatedAlert[]>([])

  useEffect(() => {
    if (!coords || !layers.cyclone) return
    let cancelled = false

    const load = () => {
      fetch(`/api/world/cyclones?lat=${coords.lat}&lng=${coords.lng}`)
        .then(r => (r.ok ? r.json() : null))
        .then((data: CycloneSnapshot | null) => { if (!cancelled && data) setCyclones(data) })
        .catch(() => { /* uma camada fora do ar não pode derrubar o mapa */ })
    }

    load()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      load()
    }, CYCLONE_REFRESH_MS)

    return () => { cancelled = true; clearInterval(timer) }
  }, [coords, layers.cyclone])

  useEffect(() => {
    if (!coords || (!layers.wind && !layers.windImpact)) return
    let cancelled = false

    const load = () => {
      fetch(`/api/world/wind?lat=${coords.lat}&lng=${coords.lng}`)
        .then(r => (r.ok ? r.json() : null))
        .then((data: WindSnapshot | null) => { if (!cancelled && data) setWind(data) })
        .catch(() => {})
    }

    load()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      load()
    }, WIND_REFRESH_MS)

    return () => { cancelled = true; clearInterval(timer) }
  }, [coords, layers.wind, layers.windImpact])

  // Alertas com geometria: é o que permite tocar num alerta e ver onde ele está.
  useEffect(() => {
    if (!coords) return
    let cancelled = false

    const load = () => {
      fetch(`/api/hazards?lat=${coords.lat}&lng=${coords.lng}`)
        .then(r => (r.ok ? r.json() : null))
        .then((snap: { events?: Array<{ id: string; title: string; severity: string; geometry?: unknown; coordinates?: { lat: number; lng: number } }> } | null) => {
          if (cancelled || !snap?.events) return
          const located = snap.events
            .map(e => {
              const point = e.coordinates ?? centreOf(e.geometry)
              return point ? { id: e.id, title: e.title, severity: e.severity, lat: point.lat, lng: point.lng } : null
            })
            .filter((x): x is LocatedAlert => x !== null)
          setAlerts(located)
        })
        .catch(() => {})
    }

    load()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      load()
    }, CYCLONE_REFRESH_MS)

    return () => { cancelled = true; clearInterval(timer) }
  }, [coords])

  return { cyclones, wind, alerts }
}
