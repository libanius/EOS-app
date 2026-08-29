/**
 * Incêndios ativos — NASA EONET (D-226).
 *
 * ── Por que EONET e não FIRMS ────────────────────────────────────────────
 *
 * A ficha do plano prometia "NASA FIRMS". O FIRMS exige `MAP_KEY`, e chave é
 * pendência do dono — a promessa ficaria parada esperando um cadastro. O EONET
 * (Earth Observatory Natural Event Tracker), da mesma NASA, publica os mesmos
 * incêndios ativos **sem chave nenhuma**, com coordenada e data. Verificado em
 * 2026-08-29: três incêndios abertos devolvidos em Nevada e Novo México.
 *
 * A diferença que importa: o FIRMS entrega o pixel térmico bruto do satélite,
 * de hora em hora; o EONET entrega o EVENTO já curado — "Wildfire Calico,
 * Humboldt, Nevada" — com atualizações periódicas. Para uma família decidindo
 * se sai de casa, o evento curado é melhor que o pixel: menos falso positivo,
 * e um nome que a pessoa reconhece no noticiário.
 *
 * ── O que este provider NÃO afirma ───────────────────────────────────────
 *
 * O EONET dá o ponto do incêndio, não o perímetro nem a direção de propagação.
 * Então o EOS reporta **distância até o ponto conhecido**, e nunca "o fogo vem
 * na sua direção" — isso exigiria dado de perímetro e vento que este canal não
 * tem. Inferir avanço de incêndio a partir de um ponto seria o mesmo erro que a
 * D-051 barrou para rota e abrigo.
 */
import { HAZARD_CONFIG } from '../config'
import { haversineMiles } from '../distance'
import type { Coordinates, HazardEvent, HazardSeverity } from '../types'
import type { HazardEventProvider, ProviderResult } from './interfaces'

/** Só entra o que pode mudar a decisão de hoje. Mais longe que isso é notícia. */
const RELEVANT_MILES = 150

interface EonetGeometry {
  date?: string
  type?: string
  coordinates?: number[] | number[][]
}

interface EonetEvent {
  id?: string
  title?: string
  description?: string | null
  link?: string
  closed?: string | null
  categories?: Array<{ id?: string; title?: string }>
  sources?: Array<{ id?: string; url?: string }>
  geometry?: EonetGeometry[]
}

/**
 * A severidade vem da DISTÂNCIA, não do tamanho do fogo.
 *
 * O EONET não publica área queimada nem contenção, e inventar severidade a
 * partir do título seria o defeito que a `normalizeUsgsFeature` já pagou caro:
 * um número extraído de texto que ninguém garante. Distância é o único fato
 * duro aqui, e é também o que decide se a família se importa.
 */
function severityForDistance(miles: number): HazardSeverity {
  if (miles <= 10) return 'extreme'
  if (miles <= 25) return 'severe'
  if (miles <= 60) return 'moderate'
  return 'minor'
}

/** O último ponto do array de geometria é a posição mais recente do evento. */
function latestPoint(geometry?: EonetGeometry[]): { lat: number; lng: number; date?: string } | null {
  if (!geometry?.length) return null
  for (let i = geometry.length - 1; i >= 0; i--) {
    const g = geometry[i]
    const c = g.coordinates
    // Ponto: [lng, lat]. Polígono: descartado — o EONET só usa polígono para
    // alguns tipos, e o centroide de um perímetro de incêndio não é o foco.
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      return { lng: c[0] as number, lat: c[1] as number, date: g.date }
    }
  }
  return null
}

export function normalizeEonetEvent(e: EonetEvent, user: Coordinates): HazardEvent | null {
  const point = latestPoint(e.geometry)
  if (!point) return null

  const distanceMiles = haversineMiles(user, { lat: point.lat, lng: point.lng })
  if (!Number.isFinite(distanceMiles) || distanceMiles > RELEVANT_MILES) return null

  const when = point.date ?? new Date().toISOString()
  const id = e.id ?? `${e.title}-${when}`

  return {
    id: `eonet:${id}`,
    sourceEventId: id,
    source: 'nasa_eonet',
    // Observacional: é um evento detectado por satélite, não um aviso de
    // governo. A distinção governa a cor e o peso na tela (D-043).
    authority: 'observational',
    visualClass: 'DETECTED_EVENT',
    hazardType: 'wildfire',
    eventType: 'wildfire_active',
    title: e.title ?? 'Active wildfire',
    // Frase mínima e factual. O texto rico é montado na tela, no idioma de quem
    // lê, a partir de `metrics` e `distanceMiles` (D-225).
    summary: e.title ?? 'Active wildfire detected by NASA EONET.',
    severity: severityForDistance(distanceMiles),
    urgency: distanceMiles <= 25 ? 'immediate' : 'expected',
    certainty: 'observed',
    location: { lat: point.lat, lng: point.lng },
    distanceMiles: Number(distanceMiles.toFixed(1)),
    startsAt: when,
    detectedAt: when,
    updatedAt: when,
    officialUrl: e.sources?.[0]?.url ?? e.link,
    rawPayloadReference: id,
  }
}

export const nasaEonetProvider: HazardEventProvider = {
  source: 'nasa_eonet',
  isConfigured: () => true, // sem chave, por escolha da fonte
  async getEvents(location: Coordinates): Promise<ProviderResult<HazardEvent[]>> {
    const started = Date.now()
    try {
      // `status=open` traz só o que ainda está ardendo. Um incêndio encerrado
      // vira histórico, e histórico não acorda ninguém às três da manhã.
      const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=200'
      const res = await fetch(url, { signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs) })
      if (!res.ok) {
        return { provider: 'nasa_eonet', status: 'degraded', data: [], latencyMs: Date.now() - started, message: `HTTP ${res.status}` }
      }
      const json = (await res.json()) as { events?: EonetEvent[] }
      const events = (json.events ?? [])
        .map(e => normalizeEonetEvent(e, location))
        .filter((e): e is HazardEvent => e !== null)
        // O mais perto primeiro: é o que decide.
        .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))
        .slice(0, 5)

      return {
        provider: 'nasa_eonet',
        status: 'live',
        data: events,
        latencyMs: Date.now() - started,
        lastSuccessAt: new Date().toISOString(),
        dataAgeSeconds: 0,
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error'
      return { provider: 'nasa_eonet', status: 'offline', data: [], latencyMs: Date.now() - started, message }
    }
  },
}
