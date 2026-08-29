/**
 * Declarações federais de desastre — OpenFEMA (D-226).
 *
 * ── O que isto é, e o que NÃO é ──────────────────────────────────────────
 *
 * Não é alerta. Uma declaração federal não avisa que algo vai acontecer — ela
 * reconhece que já aconteceu, e **destrava dinheiro e programas**: assistência
 * individual, obras públicas, mitigação. Para uma família, a pergunta que ela
 * responde não é "eu devo sair?", é "eu tenho direito a alguma coisa?".
 *
 * Por isso entra como `ADVISORY` e com urgência `future`, nunca como
 * `OFFICIAL_WARNING`: pintá-la com a cor de um aviso do NWS treinaria a pessoa
 * a ignorar a cor que importa de verdade.
 *
 * ── Precisão de condado, não de estado ───────────────────────────────────
 *
 * Uma declaração para a Flórida inteira não diz nada a quem mora em Miami se o
 * desastre foi no norte do estado. O NWS `/points` devolve a zona de condado
 * (`FLC086`), cujos três últimos dígitos são o FIPS do condado — o mesmo
 * `fipsCountyCode` que a OpenFEMA publica. O cruzamento é exato.
 *
 * Quando o condado não puder ser resolvido, o provider **prefere não afirmar**:
 * devolve as declarações do estado marcadas como tal na frase, em vez de fingir
 * uma precisão que não tem.
 *
 * Ambas as APIs são gratuitas e sem chave. Verificado em 2026-08-29.
 */
import { HAZARD_CONFIG } from '../config'
import type { Coordinates, HazardEvent, HazardSeverity } from '../types'
import type { HazardEventProvider, ProviderResult } from './interfaces'

/** Declaração velha é história. Um ano cobre o ciclo de auxílio que ainda corre. */
const WINDOW_DAYS = 365

interface FemaDeclaration {
  disasterNumber?: number
  femaDeclarationString?: string
  state?: string
  declarationType?: string
  declarationTitle?: string
  declarationDate?: string
  incidentType?: string
  incidentBeginDate?: string
  incidentEndDate?: string | null
  disasterCloseoutDate?: string | null
  designatedArea?: string
  fipsCountyCode?: string
  iaProgramDeclared?: boolean
  paProgramDeclared?: boolean
}

/** Onde a pessoa está, em termos que a FEMA usa. */
export interface UsPlace {
  state: string
  countyFips?: string
}

/**
 * `DR` (major disaster) destrava mais programas que `EM` (emergency), e `FM`
 * (fire management) é o mais estreito. A severidade reflete o alcance do que
 * foi destravado, não a violência do evento — que já é assunto de outro canal.
 */
function severityForType(declarationType?: string, ia?: boolean): HazardSeverity {
  if (declarationType === 'DR') return ia ? 'severe' : 'moderate'
  if (declarationType === 'EM') return 'moderate'
  return 'minor'
}

/** Resolve estado e condado a partir da coordenada, via NWS (sem chave). */
export async function resolveUsPlace(location: Coordinates): Promise<UsPlace | null> {
  try {
    const res = await fetch(
      `https://api.weather.gov/points/${location.lat.toFixed(4)},${location.lng.toFixed(4)}`,
      { headers: { 'User-Agent': 'EOS (brightscalegroup@gmail.com)' }, signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs) },
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      properties?: { relativeLocation?: { properties?: { state?: string } }; county?: string }
    }
    const state = json.properties?.relativeLocation?.properties?.state
    if (!state) return null
    // ".../zones/county/FLC086" → "086"
    const countyUrl = json.properties?.county
    const m = countyUrl?.match(/([A-Z]{2})C(\d{3})$/)
    return { state, countyFips: m?.[2] }
  } catch {
    return null
  }
}

export function normalizeDeclaration(d: FemaDeclaration, place: UsPlace, matchedCounty: boolean): HazardEvent {
  const id = d.femaDeclarationString ?? `${d.state}-${d.disasterNumber}`
  const when = d.declarationDate ?? d.incidentBeginDate ?? new Date().toISOString()
  const area = matchedCounty ? (d.designatedArea ?? place.state) : place.state
  const programs = [d.iaProgramDeclared ? 'Individual Assistance' : null, d.paProgramDeclared ? 'Public Assistance' : null]
    .filter(Boolean)
    .join(' + ')

  return {
    id: `fema:${id}`,
    sourceEventId: id,
    source: 'fema_openfema',
    authority: 'official',
    // Deliberadamente ADVISORY, não OFFICIAL_WARNING — ver o cabeçalho.
    visualClass: 'ADVISORY',
    hazardType: 'disaster_declaration',
    eventType: `declaration_${(d.declarationType ?? 'unknown').toLowerCase()}`,
    title: d.declarationTitle ?? `${d.incidentType ?? 'Disaster'} declaration`,
    summary: `${d.incidentType ?? 'Disaster'} · ${area}${programs ? ` · ${programs}` : ''}`,
    severity: severityForType(d.declarationType, d.iaProgramDeclared),
    // Nunca 'immediate': isto não é uma coisa a fazer agora.
    urgency: 'future',
    certainty: 'observed',
    startsAt: d.incidentBeginDate ?? undefined,
    endsAt: d.incidentEndDate ?? undefined,
    detectedAt: when,
    updatedAt: when,
    officialUrl: d.disasterNumber ? `https://www.fema.gov/disaster/${d.disasterNumber}` : 'https://www.fema.gov/disasters',
    rawPayloadReference: id,
  }
}

export const femaDeclarationsProvider: HazardEventProvider = {
  source: 'fema_openfema',
  isConfigured: () => true, // sem chave
  async getEvents(location: Coordinates): Promise<ProviderResult<HazardEvent[]>> {
    const started = Date.now()
    try {
      const place = await resolveUsPlace(location)
      if (!place) {
        // Fora dos EUA o NWS não resolve — e a OpenFEMA também não teria o quê
        // dizer. "Indisponível aqui" é a verdade, e é diferente de "fora do ar".
        return { provider: 'fema_openfema', status: 'unavailable_here', data: [], latencyMs: Date.now() - started, message: 'outside US coverage' }
      }

      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
      const url =
        `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries` +
        `?$filter=state eq '${place.state}' and declarationDate ge '${since}'` +
        `&$orderby=declarationDate desc&$top=200`
      const res = await fetch(encodeURI(url), { signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs) })
      if (!res.ok) {
        return { provider: 'fema_openfema', status: 'degraded', data: [], latencyMs: Date.now() - started, message: `HTTP ${res.status}` }
      }
      const json = (await res.json()) as { DisasterDeclarationsSummaries?: FemaDeclaration[] }
      const all = json.DisasterDeclarationsSummaries ?? []

      // Encerrada é história: some da tela em vez de virar ruído permanente.
      const open = all.filter(d => !d.disasterCloseoutDate)
      const mine = place.countyFips ? open.filter(d => d.fipsCountyCode === place.countyFips) : []
      const matchedCounty = mine.length > 0
      // Sem correspondência de condado, mostra o estado — rotulado como estado.
      const chosen = matchedCounty ? mine : open

      // Uma linha por número de desastre: a FEMA emite uma por condado, e três
      // condados vizinhos do mesmo furacão não são três desastres.
      const seen = new Set<number | string>()
      const events: HazardEvent[] = []
      for (const d of chosen) {
        const k = d.disasterNumber ?? d.femaDeclarationString ?? ''
        if (seen.has(k)) continue
        seen.add(k)
        events.push(normalizeDeclaration(d, place, matchedCounty))
        if (events.length >= 5) break
      }

      return {
        provider: 'fema_openfema',
        status: 'live',
        data: events,
        latencyMs: Date.now() - started,
        lastSuccessAt: new Date().toISOString(),
        dataAgeSeconds: 0,
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error'
      return { provider: 'fema_openfema', status: 'offline', data: [], latencyMs: Date.now() - started, message }
    }
  },
}
