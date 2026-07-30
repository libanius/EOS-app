/**
 * O envelope geográfico do plano (PLAN-T06 / doc 18 §10).
 *
 * "Baixar o mapa para usar offline" é impossível como pedido e trivial como
 * recorte: o mundo não cabe, mas a caixa que contém a casa, os pontos de
 * encontro, os lugares e as rotas da família é pequena — e foi a própria
 * família que a definiu, ponto a ponto.
 *
 * **O plano é o que torna o download offline finito e certo.** Por isso ele vem
 * antes dos mapas offline no roadmap, e não depois.
 *
 * Puro e síncrono, como o motor do Pilot e o debrief: dá para testar sem rede,
 * sem mapa e sem navegador.
 */

import type { PlanRoute, PlanWaypoint } from './family-plan'

export type Bounds = { west: number; south: number; east: number; north: number }

export type PlanEnvelope = {
  bounds: Bounds
  /** Centro geométrico — para onde a câmera aponta ao abrir o plano. */
  center: { lat: number; lng: number }
  /** Maior dimensão da caixa, em km. É o número que diz se o plano é local. */
  spanKm: number
  areaKm2: number
  /** Quantos pontos entraram na conta. Zero = não há envelope. */
  points: number
}

/**
 * Margem em torno dos pontos.
 *
 * Uma caixa colada nos extremos deixa o ponto de encontro exatamente na borda
 * da tela — e quem está chegando precisa ver o que existe em volta dele, não só
 * o alfinete. 15% do maior lado, com um piso para planos muito compactos.
 */
const MARGIN_RATIO = 0.15
const MIN_MARGIN_DEG = 0.004 // ~450 m

const EARTH_KM_PER_DEG = 111.32

function coordsOf(routes: PlanRoute[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const route of routes) {
    const line = (route.geometry as { coordinates?: Array<[number, number]> } | undefined)?.coordinates
    if (Array.isArray(line)) out.push(...line.filter(p => Array.isArray(p) && p.length >= 2))
  }
  return out
}

export function planEnvelope(waypoints: PlanWaypoint[], routes: PlanRoute[] = []): PlanEnvelope | null {
  const points: Array<[number, number]> = [
    ...waypoints.filter(w => Number.isFinite(w.lat) && Number.isFinite(w.lng)).map(w => [w.lng, w.lat] as [number, number]),
    ...coordsOf(routes),
  ]
  if (!points.length) return null

  let west = points[0][0]
  let east = points[0][0]
  let south = points[0][1]
  let north = points[0][1]
  for (const [lng, lat] of points) {
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }

  const spanLng = east - west
  const spanLat = north - south
  const margin = Math.max(MIN_MARGIN_DEG, Math.max(spanLng, spanLat) * MARGIN_RATIO)

  const bounds: Bounds = {
    west: west - margin,
    south: south - margin,
    east: east + margin,
    north: north + margin,
  }

  const center = { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 }
  // A longitude encolhe com o cosseno da latitude; ignorar isso superestima a
  // área em quase 20% na Flórida e muito mais perto dos polos.
  const kmPerDegLng = EARTH_KM_PER_DEG * Math.cos((center.lat * Math.PI) / 180)
  const widthKm = (bounds.east - bounds.west) * kmPerDegLng
  const heightKm = (bounds.north - bounds.south) * EARTH_KM_PER_DEG

  return {
    bounds,
    center,
    spanKm: Math.max(widthKm, heightKm),
    areaKm2: widthKm * heightKm,
    points: points.length,
  }
}

/**
 * Projeta um ponto para coordenadas de tela dentro do envelope.
 *
 * Mercator não é usado aqui de propósito: o envelope de um plano familiar tem
 * poucos quilômetros, e nessa escala a distorção é menor que a espessura da
 * linha. Uma projeção equiretangular corrigida pelo cosseno da latitude central
 * é exata o bastante e não depende de biblioteca nenhuma — o que importa quando
 * o desenho precisa aparecer com a rede caída.
 */
export function projector(envelope: PlanEnvelope, width: number, height: number, padding = 24) {
  const { bounds, center } = envelope
  const kx = Math.cos((center.lat * Math.PI) / 180)
  const w = (bounds.east - bounds.west) * kx
  const h = bounds.north - bounds.south
  // Uma escala só para os dois eixos: esticar um deles deformaria a rota que a
  // família desenhou, e o formato do caminho é parte da informação.
  const scale = Math.min((width - padding * 2) / (w || 1), (height - padding * 2) / (h || 1))
  const offsetX = (width - w * scale) / 2
  const offsetY = (height - h * scale) / 2

  return (lng: number, lat: number): [number, number] => [
    offsetX + (lng - bounds.west) * kx * scale,
    // y cresce para baixo na tela e o norte é para cima.
    offsetY + (bounds.north - lat) * scale,
  ]
}

/** Barra de escala honesta: quantos metros/km vale um segmento na tela. */
export function scaleBar(envelope: PlanEnvelope, width: number, padding = 24) {
  const kmPerDegLng = EARTH_KM_PER_DEG * Math.cos((envelope.center.lat * Math.PI) / 180)
  const widthKm = (envelope.bounds.east - envelope.bounds.west) * kmPerDegLng
  const usable = width - padding * 2
  const kmPerPx = widthKm / (usable || 1)

  // Escolhe um comprimento redondo — 1, 2 ou 5 vezes uma potência de dez.
  const target = kmPerPx * (usable / 4)
  const magnitude = 10 ** Math.floor(Math.log10(target || 1))
  const nice = [1, 2, 5, 10].find(m => magnitude * m >= target) ?? 10
  const km = magnitude * nice

  return {
    km,
    pixels: km / (kmPerPx || 1),
    label: km >= 1 ? `${km % 1 === 0 ? km : km.toFixed(1)} km` : `${Math.round(km * 1000)} m`,
  }
}
