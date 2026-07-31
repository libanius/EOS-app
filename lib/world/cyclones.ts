/**
 * Ciclones tropicais no mapa — posição, trajetória e cone (D-078).
 *
 * O dono pediu a pergunta certa: "onde está a tempestade e para onde ela vai".
 * O EOS já sabia que existe um ciclone — o provider `lib/hazards/providers/nhc`
 * lê o `CurrentStorms.json` e produz um texto. O que faltava era a **geometria**:
 * sem ela, "furacão a 340 km" é um número que ninguém consegue traduzir em
 * decisão. Com o cone desenhado, a pergunta "minha casa está dentro?" se responde
 * em um olhar.
 *
 * A fonte é o serviço GIS do National Hurricane Center. Duas coisas sobre ele:
 *
 *  - **Nada aqui é inferido.** Cone, trajetória e pontos de previsão são os
 *    produtos oficiais do NHC, redesenhados. O EOS não calcula trajetória, não
 *    interpola e não "melhora" o cone — o dia em que fizermos isso, a tela passa
 *    a afirmar algo que nenhuma autoridade afirmou.
 *  - **O cone é incerteza, não área de dano.** Ele contém a posição do CENTRO em
 *    cerca de dois terços dos casos históricos; ventos e chuva vão muito além
 *    dele. A UI tem que dizer isso, senão "estou fora do cone" vira falsa
 *    segurança — que é o pior resultado possível para esta feature.
 */

const NHC_GIS =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer'

/** Camadas do MapServer do NHC, confirmadas ao vivo. */
const LAYER = { forecastPoints: 5, forecastTrack: 6, forecastCone: 7, watchWarning: 8, pastTrack: 9 } as const

const CURRENT_STORMS = 'https://www.nhc.noaa.gov/CurrentStorms.json'

export type CycloneStorm = {
  id: string
  name: string
  /** HU, MH, TS, TD, PTC… já traduzido para leitura humana. */
  classification: string
  classCode: string
  lat: number
  lng: number
  windKmh: number
  gustKmh: number | null
  pressureMb: number | null
  /** Para onde ela está indo, em graus verdadeiros. Null quando o NHC não diz. */
  headingDeg: number | null
  speedKmh: number | null
  /** Distância em km desde a pessoa, quando há posição. */
  distanceKm: number | null
  advisoryUrl: string | null
  updatedAt: string
}

export type CycloneSnapshot = {
  source: 'NOAA National Hurricane Center'
  fetchedAt: string
  storms: CycloneStorm[]
  /** Geometrias oficiais, prontas para o mapa. */
  cone: GeoJSON.FeatureCollection | null
  track: GeoJSON.FeatureCollection | null
  forecastPoints: GeoJSON.FeatureCollection | null
  /** Nenhum ciclone ativo é uma resposta CORRETA, não uma falha. */
  empty: boolean
  error?: string
}

const KT_TO_KMH = 1.852
const MPH_TO_KMH = 1.60934

const CLASS_PT: Record<string, string> = {
  HU: 'Furacão',
  MH: 'Furacão de grande intensidade',
  TS: 'Tempestade tropical',
  TD: 'Depressão tropical',
  STS: 'Tempestade subtropical',
  SD: 'Depressão subtropical',
  PTC: 'Ciclone tropical potencial',
  RM: 'Remanescentes',
}
const CLASS_EN: Record<string, string> = {
  HU: 'Hurricane',
  MH: 'Major hurricane',
  TS: 'Tropical storm',
  TD: 'Tropical depression',
  STS: 'Subtropical storm',
  SD: 'Subtropical depression',
  PTC: 'Potential tropical cyclone',
  RM: 'Remnants',
}

export function classLabel(code: string, pt: boolean): string {
  const table = pt ? CLASS_PT : CLASS_EN
  return table[code.toUpperCase()] ?? (pt ? 'Ciclone tropical' : 'Tropical cyclone')
}

/** Rumo em ponto cardeal — "a nor-noroeste" é mais legível que "335°". */
export function headingLabel(deg: number | null, pt: boolean): string | null {
  if (deg === null || !Number.isFinite(deg)) return null
  const pts = pt
    ? ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
    : ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return pts[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function geojson(layer: number, signal?: AbortSignal): Promise<GeoJSON.FeatureCollection | null> {
  const url = `${NHC_GIS}/${layer}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson`
  const response = await fetch(url, { signal, next: { revalidate: 300 } }).catch(() => null)
  if (!response?.ok) return null
  const data = (await response.json().catch(() => null)) as GeoJSON.FeatureCollection | null
  // Uma coleção vazia é diferente de falha, e o chamador precisa distinguir.
  return data && Array.isArray(data.features) ? data : null
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : null
}

export async function getCyclones(
  user: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<CycloneSnapshot> {
  const fetchedAt = new Date().toISOString()

  const stormsResponse = await fetch(CURRENT_STORMS, { signal, next: { revalidate: 300 } }).catch(() => null)
  if (!stormsResponse?.ok) {
    return {
      source: 'NOAA National Hurricane Center',
      fetchedAt,
      storms: [],
      cone: null,
      track: null,
      forecastPoints: null,
      empty: true,
      error: 'nhc_unreachable',
    }
  }

  const payload = (await stormsResponse.json().catch(() => null)) as
    | { activeStorms?: Array<Record<string, unknown>> }
    | null
  const active = payload?.activeStorms ?? []

  const storms: CycloneStorm[] = active.map(s => {
    const lat = num(s.latitudeNumeric) ?? 0
    const lng = num(s.longitudeNumeric) ?? 0
    const code = String(s.classification ?? '').toUpperCase()
    const windKt = num(s.intensity) ?? 0
    const advisory = s.publicAdvisory as { url?: string } | undefined
    return {
      id: String(s.id ?? s.name ?? 'storm'),
      name: String(s.name ?? '—'),
      classification: code,
      classCode: code,
      lat,
      lng,
      windKmh: Math.round(windKt * KT_TO_KMH),
      gustKmh: null,
      pressureMb: num(s.pressure),
      headingDeg: num(s.movementDir),
      speedKmh: num(s.movementSpeed) !== null ? Math.round((num(s.movementSpeed) as number) * KT_TO_KMH) : null,
      distanceKm: user && lat && lng ? Math.round(distanceKm(user, { lat, lng })) : null,
      advisoryUrl: advisory?.url ?? null,
      updatedAt: String(s.lastUpdate ?? fetchedAt),
    }
  })

  // Sem ciclone ativo não há geometria para buscar — e três requisições que
  // devolveriam coleções vazias são três requisições desperdiçadas.
  if (!storms.length) {
    return {
      source: 'NOAA National Hurricane Center',
      fetchedAt,
      storms: [],
      cone: null,
      track: null,
      forecastPoints: null,
      empty: true,
    }
  }

  const [cone, track, forecastPoints] = await Promise.all([
    geojson(LAYER.forecastCone, signal),
    geojson(LAYER.forecastTrack, signal),
    geojson(LAYER.forecastPoints, signal),
  ])

  return {
    source: 'NOAA National Hurricane Center',
    fetchedAt,
    storms: storms.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)),
    cone,
    track,
    forecastPoints,
    empty: false,
  }
}

/** Converte mph para km/h — o NHC publica em nós e mph conforme o campo. */
export const mphToKmh = (mph: number) => Math.round(mph * MPH_TO_KMH)
