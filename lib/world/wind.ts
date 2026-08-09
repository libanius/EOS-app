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
 * D-141.1: o renderer nunca pode extrapolar essa grade para o mundo inteiro.
 * Quando o mapa está aberto, a UI pode pedir uma grade maior proporcional ao
 * viewport; fora da área amostrada, não se desenha vento.
 */

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
}

export type WindSnapshot = {
  source: 'Open-Meteo'
  provider: 'open-meteo-current-grid'
  model: 'Open-Meteo current 10m wind'
  fetchedAt: string
  frames: Array<{ forecastHour: 0; label: 'NOW'; validAt: string }>
  readings: WindReading[]
  /** Leitura no ponto central, para o texto da UI. */
  atUser: WindReading | null
  error?: string
}

/** Grade local padrão para textos/Pilot. O mapa pode pedir uma grade maior. */
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
  /** Largura aproximada da amostragem em graus. */
  spanDeg?: number
  /** Número de pontos por eixo. Servidor limita para evitar abuso/acidente. */
  grid?: number
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function buildGrid(centre: { lat: number; lng: number }, options: WindGridOptions = {}): Array<[number, number]> {
  const grid = Math.round(clamp(options.grid ?? GRID, 3, 13))
  const span = clamp(options.spanDeg ?? SPAN_DEG, 0.15, 30)
  const step = span / (grid - 1)
  const start = -span / 2
  const points: Array<[number, number]> = []
  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      points.push([centre.lat + start + row * step, centre.lng + start + col * step])
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
  return {
    uMps: -speedMps * Math.sin(rad),
    vMps: -speedMps * Math.cos(rad),
    toDeg: blowingToward(fromDeg),
    speedMph: Math.round(speedKmh * 0.621371),
  }
}

export async function getWind(
  centre: { lat: number; lng: number },
  signal?: AbortSignal,
  options: WindGridOptions = {},
): Promise<WindSnapshot> {
  const fetchedAt = new Date().toISOString()
  const grid = buildGrid(centre, options)
  const base = {
    source: 'Open-Meteo' as const,
    provider: 'open-meteo-current-grid' as const,
    model: 'Open-Meteo current 10m wind' as const,
    fetchedAt,
    frames: [{ forecastHour: 0 as const, label: 'NOW' as const, validAt: fetchedAt }],
  }
  const params = new URLSearchParams({
    latitude: grid.map(p => p[0].toFixed(4)).join(','),
    longitude: grid.map(p => p[1].toFixed(4)).join(','),
    current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kmh',
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal,
    next: { revalidate: 600 },
  }).catch(() => null)

  if (!response?.ok) {
    return { ...base, readings: [], atUser: null, error: 'wind_unreachable' }
  }

  const data = (await response.json().catch(() => null)) as unknown
  // Com um ponto só o Open-Meteo devolve objeto; com vários, lista.
  const items = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    latitude?: number
    longitude?: number
    current?: { wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number }
  }>

  /**
   * O Open-Meteo devolve a coordenada da CÉLULA do modelo, não a que foi pedida.
   * Quando a grade é mais fina que o modelo, dois pontos meus caem na mesma
   * célula — e eu desenharia duas setas idênticas, empilhadas no mesmo pixel.
   * Não é dado errado; é ruído visual que finge densidade que não existe.
   */
  const seen = new Set<string>()
  const readings: WindReading[] = items
    .filter(i => typeof i.latitude === 'number' && typeof i.current?.wind_direction_10m === 'number')
    .map(i => {
      const speedKmh = Math.round(i.current?.wind_speed_10m ?? 0)
      const gustKmh = typeof i.current?.wind_gusts_10m === 'number' ? Math.round(i.current.wind_gusts_10m) : null
      return {
        lat: i.latitude as number,
        lng: i.longitude as number,
        speedKmh,
        gustKmh,
        gustMph: gustKmh === null ? null : Math.round(gustKmh * 0.621371),
        fromDeg: i.current?.wind_direction_10m as number,
        ...vectorFromSpeedDirection(speedKmh, i.current?.wind_direction_10m as number),
      }
    })
    .filter(r => {
      const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  if (!readings.length) {
    return { ...base, readings: [], atUser: null, error: 'wind_empty' }
  }

  // O ponto mais próximo do centro é o que a UI cita em texto.
  const atUser = readings.reduce((best, r) => {
    const d = Math.abs(r.lat - centre.lat) + Math.abs(r.lng - centre.lng)
    const bd = Math.abs(best.lat - centre.lat) + Math.abs(best.lng - centre.lng)
    return d < bd ? r : best
  }, readings[0])

  return { ...base, readings, atUser }
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
