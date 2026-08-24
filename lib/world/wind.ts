/**
 * Campo de vento sobre o mapa (D-078).
 *
 * "Ver os ventos e as direções" precisa de mais de um ponto: uma seta na sua
 * casa não mostra que o vento gira, nem de que lado o mar está empurrando. Então
 * o EOS amostra uma GRADE em volta da pessoa.
 *
 * Sem chave e numa requisição só: o Open-Meteo aceita listas de latitude e
 * longitude e devolve um resultado por ponto. Uma grade 5×5 são 25 leituras num
 * único GET — o que mantém a feature dentro do orçamento de "keyless por padrão"
 * que rege os provedores do EOS.
 *
 * D-141: o contrato interno também carrega vetor U/V. A fonte v1 continua sendo
 * uma grade pública Open-Meteo, mas o renderer não fica preso a ela: HRRR/GFS
 * podem entrar depois entregando o mesmo formato vetorial.
 *
 * D-145: para o modo premium sincronizado com ciclones, a mesma rota passa a
 * buscar frames horários e usa `models=best_match` explicitamente. O Open-Meteo
 * continua sendo o único provider gratuito de fundo; perto de ciclones, o
 * cliente mistura esse fundo com um perfil paramétrico baseado no NHC.
 */

import type { CycloneStorm } from './cyclones'

export type WindReading = {
  lat: number
  lng: number
  /** km/h no nível de 10 m — a altura padrão de medição meteorológica. */
  speedKmh: number
  /** mph derivado do vetor, usado pela legenda/popup da camada animada. */
  speedMph: number
  gustKmh: number | null
  gustMph: number | null
  /** Direção DE ONDE o vento vem, em graus verdadeiros (convenção meteorológica). */
  fromDeg: number
  /** Direção PARA ONDE o vento sopra, em graus verdadeiros. */
  toDeg: number
  /** Componente leste-oeste em m/s. Positivo = leste. */
  uMps: number
  /** Componente norte-sul em m/s. Positivo = norte. */
  vMps: number
  /** Índice do frame dentro de `WindSnapshot.frames`. Ausente em leituras legadas. */
  frameIndex?: number
  validAt?: string
  /** Marca leituras cujo vetor foi ajustado pelo perfil de ciclone NHC. */
  cycloneAdjusted?: boolean
}

export type WindSnapshot = {
  source: 'Open-Meteo'
  provider: 'open-meteo-current-grid'
  model: string
  fetchedAt: string
  frames: Array<{ forecastHour: number; label: string; validAt: string }>
  readings: WindReading[]
  frameReadings?: WindReading[][]
  /** Leitura no ponto central, para o texto da UI. */
  atUser: WindReading | null
  error?: string
}

/** Grade local padrão; o mapa animado pode pedir uma grade maior do viewport. */
const GRID = 5

/**
 * Extensão da grade, em graus.
 *
 * Começou em 0,5° (≈55 km) e estava errado: na câmera padrão do dashboard, que
 * enquadra poucos quilômetros, o usuário via UMA seta. Uma seta só não mostra
 * direção — mostra um número com enfeite; o pedido era ver o vento GIRAR.
 *
 * 0,15° ≈ 16 km põe várias leituras dentro do enquadramento normal e continua
 * cobrindo a vizinhança quando se afasta o zoom.
 */
const SPAN_DEG = 0.15

export type WindGridOptions = {
  spanDeg?: number
  latSpanDeg?: number
  lngSpanDeg?: number
  grid?: number
  forecastHours?: number
  model?: string
  cellSelection?: 'land' | 'sea' | 'nearest'
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function rangeAround(center: number, span: number, min: number, max: number): [number, number] {
  if (span >= max - min) return [min, max]
  let from = center - span / 2
  let to = center + span / 2
  if (from < min) {
    to += min - from
    from = min
  }
  if (to > max) {
    from -= to - max
    to = max
  }
  return [clamp(from, min, max), clamp(to, min, max)]
}

export function buildGrid(centre: { lat: number; lng: number }, options: WindGridOptions = {}): Array<[number, number]> {
  /*
   * O teto subiu de 25 para 57 (MAP-T10 / D-207).
   *
   * 25×25 = 625 pontos. Sobre o mundo inteiro isso é **uma leitura a cada
   * 1.598 km**, e tudo entre elas é interpolação — o motivo de o campo global
   * parecer liso e falso enquanto o local coincide com o radar de chuva.
   *
   * 57×57 = 3.249 pontos, uma leitura a cada ~700 km. Ainda longe dos 1,8 km
   * locais, e nunca vai chegar lá: o custo é linear no número de pontos.
   *
   * O teto continua existindo, e continua sendo o freio certo: sem ele, um
   * `grid` grande vindo da query viraria uma requisição enorme para o provedor
   * a cada movimento de mapa.
   *
   * **Descoberto ao tentar refinar**: o cliente pedia 57 e recebia 25 calado.
   * Sem esta linha, a "segunda ida" de D-207 buscaria exatamente o mesmo dado —
   * um refinamento que não refina nada.
   */
  const grid = Math.round(clamp(options.grid ?? GRID, 3, 57))
  const baseSpan = options.spanDeg ?? SPAN_DEG
  const latSpan = clamp(options.latSpanDeg ?? baseSpan, 0.15, 170)
  const lngSpan = clamp(options.lngSpanDeg ?? baseSpan, 0.15, 360)
  const [minLat, maxLat] = rangeAround(centre.lat, latSpan, -85, 85)
  const [minLng, maxLng] = rangeAround(centre.lng, lngSpan, -179.5, 179.5)
  const latStep = (maxLat - minLat) / (grid - 1)
  const lngStep = (maxLng - minLng) / (grid - 1)
  const points: Array<[number, number]> = []
  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      points.push([minLat + row * latStep, minLng + col * lngStep])
    }
  }
  return points
}

/**
 * Para onde o vento SOPRA, a partir de onde ele vem.
 *
 * Meteorologia informa a direção de origem ("vento de nordeste"); uma seta no
 * mapa precisa apontar para onde ele vai. Confundir os dois inverte a seta em
 * 180° — e uma seta invertida numa tela de emergência é pior que seta nenhuma.
 */
export const blowingToward = (fromDeg: number) => (fromDeg + 180) % 360

export function vectorFromSpeedDirection(speedKmh: number, fromDeg: number) {
  const speedMps = speedKmh / 3.6
  const rad = fromDeg * Math.PI / 180
  const uMps = -speedMps * Math.sin(rad)
  const vMps = -speedMps * Math.cos(rad)
  return {
    uMps,
    vMps,
    toDeg: blowingToward(fromDeg),
    speedMph: Math.round(speedKmh * 0.621371),
  }
}

function vectorFromToDirection(speedKmh: number, toDeg: number) {
  const speedMps = speedKmh / 3.6
  const rad = toDeg * Math.PI / 180
  return {
    uMps: speedMps * Math.sin(rad),
    vMps: speedMps * Math.cos(rad),
  }
}

function vectorToSpeedDirection(uMps: number, vMps: number) {
  const speedKmh = Math.sqrt(uMps ** 2 + vMps ** 2) * 3.6
  const toDeg = ((Math.atan2(uMps, vMps) * 180 / Math.PI) + 360) % 360
  return {
    speedKmh: Math.round(speedKmh),
    speedMph: Math.round(speedKmh * 0.621371),
    toDeg,
    fromDeg: blowingToward(toDeg),
    uMps,
    vMps,
  }
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const rad = (d: number) => d * Math.PI / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => d * Math.PI / 180
  const deg = (r: number) => r * 180 / Math.PI
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function blendCycloneWind(
  readings: WindReading[],
  storms: Array<Pick<CycloneStorm, 'id' | 'name' | 'lat' | 'lng' | 'windKmh' | 'headingDeg' | 'speedKmh'>>,
): WindReading[] {
  if (!storms.length || !readings.length) return readings
  return readings.map(reading => {
    let out = reading
    for (const storm of storms) {
      if (!Number.isFinite(storm.lat) || !Number.isFinite(storm.lng) || storm.windKmh < 63) continue
      const center = { lat: storm.lat, lng: storm.lng }
      const d = distanceKm(center, reading)
      const rmwKm = clamp(18 + storm.windKmh * 0.18, 28, 58)
      const outerKm = clamp(rmwKm * 8.5, 240, 720)
      if (d > outerKm) continue

      const safeD = Math.max(1, d)
      const eyeFactor = safeD < rmwKm ? 0.32 + 0.68 * (safeD / rmwKm) : (rmwKm / safeD) ** 0.72
      const cycloneSpeed = Math.max(0, storm.windKmh * eyeFactor)
      const radial = bearingDeg(center, reading)
      const toDeg = (radial + (storm.lat >= 0 ? -90 : 90) + 360) % 360
      const circulation = vectorFromToDirection(cycloneSpeed, toDeg)
      const translation = storm.headingDeg !== null && storm.speedKmh !== null
        ? vectorFromToDirection(storm.speedKmh * 0.35, storm.headingDeg)
        : { uMps: 0, vMps: 0 }
      const cyclone = {
        uMps: circulation.uMps + translation.uMps,
        vMps: circulation.vMps + translation.vMps,
      }
      const weight = 1 - smoothstep(outerKm * 0.58, outerKm, d)
      if (weight <= 0) continue
      const merged = vectorToSpeedDirection(
        out.uMps * (1 - weight) + cyclone.uMps * weight,
        out.vMps * (1 - weight) + cyclone.vMps * weight,
      )
      out = {
        ...out,
        ...merged,
        gustKmh: Math.max(out.gustKmh ?? 0, Math.round(merged.speedKmh * 1.22)),
        gustMph: Math.max(out.gustMph ?? 0, Math.round(merged.speedMph * 1.22)),
        cycloneAdjusted: true,
      }
    }
    return out
  })
}

export async function getWind(
  centre: { lat: number; lng: number },
  signal?: AbortSignal,
  options: WindGridOptions = {},
): Promise<WindSnapshot> {
  const fetchedAt = new Date().toISOString()
  const grid = buildGrid(centre, options)
  const chunkSize = 160
  const forecastHours = Math.round(clamp(options.forecastHours ?? 25, 1, 49))
  const model = options.model ?? 'best_match'
  const cellSelection = options.cellSelection ?? 'nearest'
  const chunks: Array<Array<[number, number]>> = []
  for (let i = 0; i < grid.length; i += chunkSize) chunks.push(grid.slice(i, i + chunkSize))

  const responses = await Promise.all(chunks.map(async chunk => {
    const params = new URLSearchParams({
      latitude: chunk.map(p => p[0].toFixed(4)).join(','),
      longitude: chunk.map(p => p[1].toFixed(4)).join(','),
      current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'kmh',
      timezone: 'UTC',
      forecast_hours: String(forecastHours),
      models: model,
      cell_selection: cellSelection,
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal,
      next: { revalidate: 600 },
    }).catch(() => null)
    if (!response?.ok) return []
    const data = (await response.json().catch(() => null)) as unknown
    return (Array.isArray(data) ? data : data ? [data] : []) as Array<{
      latitude?: number
      longitude?: number
      current?: { wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number }
      hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[]; wind_gusts_10m?: number[] }
    }>
  }))

  const items = responses.flat()
  if (!items.length) {
    return { source: 'Open-Meteo', provider: 'open-meteo-current-grid', model: `Open-Meteo ${model} 10m wind`, fetchedAt, frames: [{ forecastHour: 0, label: 'NOW', validAt: fetchedAt }], readings: [], atUser: null, error: 'wind_unreachable' }
  }

  const times = items.find(i => i.hourly?.time?.length)?.hourly?.time?.slice(0, forecastHours) ?? []
  const frames = times.length
    ? times.map((time, index) => ({ forecastHour: index, label: index === 0 ? 'NOW' : `+${index}h`, validAt: time.endsWith('Z') ? time : `${time}:00Z` }))
    : [{ forecastHour: 0, label: 'NOW', validAt: fetchedAt }]

  /**
   * O Open-Meteo pode devolver a coordenada da CÉLULA do modelo, não a que foi
   * pedida. Para o layer bilinear, a grade precisa continuar regular; por isso
   * a posição visual é a coordenada pedida, e os valores meteorológicos vêm da
   * resposta correspondente.
   */
  const readings: WindReading[] = items
    .map((i, index): WindReading | null => {
      const requested = grid[index]
      if (!requested || typeof i.current?.wind_direction_10m !== 'number') return null
      const speedKmh = Math.round(i.current?.wind_speed_10m ?? 0)
      const gustKmh = typeof i.current?.wind_gusts_10m === 'number' ? Math.round(i.current.wind_gusts_10m) : null
      return {
        lat: requested[0],
        lng: requested[1],
        speedKmh,
        gustKmh,
        gustMph: gustKmh === null ? null : Math.round(gustKmh * 0.621371),
        fromDeg: i.current?.wind_direction_10m as number,
        frameIndex: 0,
        validAt: frames[0]?.validAt ?? fetchedAt,
        ...vectorFromSpeedDirection(speedKmh, i.current?.wind_direction_10m as number),
      }
    })
    .filter((r): r is WindReading => r !== null)

  const frameReadings: WindReading[][] = frames.map((frame, frameIndex) => items
    .map((i, index): WindReading | null => {
      const requested = grid[index]
      const dir = i.hourly?.wind_direction_10m?.[frameIndex]
      if (!requested || typeof dir !== 'number') return null
      const speedKmh = Math.round(i.hourly?.wind_speed_10m?.[frameIndex] ?? 0)
      const gustKmh = typeof i.hourly?.wind_gusts_10m?.[frameIndex] === 'number' ? Math.round(i.hourly.wind_gusts_10m[frameIndex]) : null
      return {
        lat: requested[0],
        lng: requested[1],
        speedKmh,
        gustKmh,
        gustMph: gustKmh === null ? null : Math.round(gustKmh * 0.621371),
        fromDeg: dir,
        frameIndex,
        validAt: frame.validAt,
        ...vectorFromSpeedDirection(speedKmh, dir),
      }
    })
    .filter((r): r is WindReading => r !== null))

  if (!readings.length) {
    return { source: 'Open-Meteo', provider: 'open-meteo-current-grid', model: `Open-Meteo ${model} 10m wind`, fetchedAt, frames, readings: [], frameReadings: [], atUser: null, error: 'wind_empty' }
  }

  // O ponto mais próximo do centro é o que a UI cita em texto.
  const atUser = readings.reduce((best, r) => {
    const d = Math.abs(r.lat - centre.lat) + Math.abs(r.lng - centre.lng)
    const bd = Math.abs(best.lat - centre.lat) + Math.abs(best.lng - centre.lng)
    return d < bd ? r : best
  }, readings[0])

  return { source: 'Open-Meteo', provider: 'open-meteo-current-grid', model: `Open-Meteo ${model} 10m wind`, fetchedAt, frames, readings, frameReadings, atUser }
}

/** Escala de Beaufort resumida — o que aquele número significa na prática. */
export function windMeaning(kmh: number, pt: boolean): string {
  if (kmh < 20) return pt ? 'brisa' : 'breeze'
  if (kmh < 39) return pt ? 'vento moderado' : 'moderate wind'
  if (kmh < 62) return pt ? 'vento forte — galhos quebram' : 'strong wind — branches break'
  if (kmh < 89) return pt ? 'ventania — difícil andar' : 'gale — hard to walk'
  if (kmh < 118) return pt ? 'tempestade — dano estrutural' : 'storm — structural damage'
  return pt ? 'força de furacão' : 'hurricane force'
}
