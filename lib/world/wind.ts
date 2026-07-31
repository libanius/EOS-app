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
 * NÃO é um modelo de vento interpolado nem uma animação de partículas. São
 * leituras pontuais, desenhadas como setas, e a UI diz isso. Uma animação bonita
 * insinuaria uma resolução que estes dados não têm.
 */

export type WindReading = {
  lat: number
  lng: number
  /** km/h no nível de 10 m — a altura padrão de medição meteorológica. */
  speedKmh: number
  gustKmh: number | null
  /** Direção DE ONDE o vento vem, em graus verdadeiros (convenção meteorológica). */
  fromDeg: number
}

export type WindSnapshot = {
  source: 'Open-Meteo'
  fetchedAt: string
  readings: WindReading[]
  /** Leitura no ponto central, para o texto da UI. */
  atUser: WindReading | null
  error?: string
}

/** 5×5 = 25 leituras. Mais que isso não muda a leitura visual e pesa na rede. */
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

export function buildGrid(centre: { lat: number; lng: number }): Array<[number, number]> {
  const step = SPAN_DEG / (GRID - 1)
  const start = -SPAN_DEG / 2
  const points: Array<[number, number]> = []
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
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

export async function getWind(
  centre: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<WindSnapshot> {
  const fetchedAt = new Date().toISOString()
  const grid = buildGrid(centre)
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
    return { source: 'Open-Meteo', fetchedAt, readings: [], atUser: null, error: 'wind_unreachable' }
  }

  const data = (await response.json().catch(() => null)) as unknown
  // Com um ponto só o Open-Meteo devolve objeto; com vários, lista.
  const items = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    latitude?: number
    longitude?: number
    current?: { wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number }
  }>

  const readings: WindReading[] = items
    .filter(i => typeof i.latitude === 'number' && typeof i.current?.wind_direction_10m === 'number')
    .map(i => ({
      lat: i.latitude as number,
      lng: i.longitude as number,
      speedKmh: Math.round(i.current?.wind_speed_10m ?? 0),
      gustKmh: typeof i.current?.wind_gusts_10m === 'number' ? Math.round(i.current.wind_gusts_10m) : null,
      fromDeg: i.current?.wind_direction_10m as number,
    }))

  if (!readings.length) {
    return { source: 'Open-Meteo', fetchedAt, readings: [], atUser: null, error: 'wind_empty' }
  }

  // O ponto mais próximo do centro é o que a UI cita em texto.
  const atUser = readings.reduce((best, r) => {
    const d = Math.abs(r.lat - centre.lat) + Math.abs(r.lng - centre.lng)
    const bd = Math.abs(best.lat - centre.lat) + Math.abs(best.lng - centre.lng)
    return d < bd ? r : best
  }, readings[0])

  return { source: 'Open-Meteo', fetchedAt, readings, atUser }
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
