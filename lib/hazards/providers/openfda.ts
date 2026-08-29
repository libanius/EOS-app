/**
 * Recalls de medicamento e alimento — openFDA (D-226).
 *
 * ── Por que isto não é um alerta, e não deve virar um ───────────────────
 *
 * A FDA publica ~29 mil recalls. A esmagadora maioria é Classe II ou III:
 * rótulo errado, lote fora de especificação, problema que não fere ninguém.
 * Mandar isso para a tela de bloqueio destruiria o único ativo que um app de
 * emergência tem — a certeza de que, quando ele vibra, é sério.
 *
 * Então `recall` **não entra em `DEFAULT_ALERT_TYPES`**. Aparece no app, entra
 * na conta do canal, e não acorda ninguém. Quem quiser push disso pode ligar
 * depois, explicitamente; o padrão é o silêncio.
 *
 * ── Classe I é outra conversa ────────────────────────────────────────────
 *
 * "Class I" na FDA significa probabilidade razoável de consequência grave ou
 * morte. Essa merece severidade alta e merece ser vista. É a única que o EOS
 * promove acima de `info`.
 *
 * ── Recorte geográfico honesto ───────────────────────────────────────────
 *
 * O campo `state` do recall diz onde a EMPRESA está, não onde o produto foi
 * distribuído — `distribution_pattern` é texto livre e não dá para filtrar com
 * confiança. Então o EOS **não promete recorte local**: mostra os recalls de
 * Classe I recentes do país. Filtrar pelo estado da empresa daria uma precisão
 * falsa, que é pior do que nenhuma.
 *
 * Gratuita e sem chave. Verificado em 2026-08-29.
 */
import { HAZARD_CONFIG } from '../config'
import type { Coordinates, HazardEvent, HazardSeverity } from '../types'
import type { HazardEventProvider, ProviderResult } from './interfaces'

const WINDOW_DAYS = 90

interface FdaRecall {
  recall_number?: string
  report_date?: string
  recall_initiation_date?: string
  classification?: string
  product_description?: string
  reason_for_recall?: string
  recalling_firm?: string
  status?: string
  distribution_pattern?: string
}

function severityForClass(classification?: string): HazardSeverity {
  if (classification === 'Class I') return 'severe'
  if (classification === 'Class II') return 'minor'
  return 'info'
}

/** `20260829` → `2026-08-29T00:00:00.000Z`. A FDA não usa ISO. */
function fdaDate(raw?: string): string | undefined {
  if (!raw || raw.length !== 8) return undefined
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000Z`
  return Number.isNaN(Date.parse(iso)) ? undefined : iso
}

export function normalizeRecall(r: FdaRecall, kind: 'drug' | 'food'): HazardEvent | null {
  const id = r.recall_number
  if (!id) return null
  const when = fdaDate(r.report_date) ?? fdaDate(r.recall_initiation_date) ?? new Date().toISOString()

  return {
    id: `openfda:${id}`,
    sourceEventId: id,
    source: 'openfda',
    authority: 'official',
    visualClass: 'ADVISORY',
    hazardType: 'recall',
    eventType: `recall_${kind}`,
    title: (r.product_description ?? 'Recall').slice(0, 120),
    summary: [r.reason_for_recall, r.recalling_firm].filter(Boolean).join(' · ').slice(0, 400),
    severity: severityForClass(r.classification),
    urgency: 'future',
    certainty: 'observed',
    detectedAt: when,
    updatedAt: when,
    officialUrl: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts',
    rawPayloadReference: id,
  }
}

async function fetchOne(kind: 'drug' | 'food'): Promise<HazardEvent[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
  const until = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  // Só Classe I: ver o cabeçalho. O `search` da openFDA usa Lucene.
  const url =
    `https://api.fda.gov/${kind}/enforcement.json` +
    `?search=report_date:[${since}+TO+${until}]+AND+classification:"Class+I"&limit=10`
  const res = await fetch(url, { signal: AbortSignal.timeout(HAZARD_CONFIG.health.requestTimeoutMs) })
  // 404 na openFDA significa "nenhum resultado", não falha. Tratar como erro
  // encheria o log de alarme por um trimestre sem recall grave — que é uma
  // boa notícia, não um defeito.
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { results?: FdaRecall[] }
  return (json.results ?? [])
    .map(r => normalizeRecall(r, kind))
    .filter((e): e is HazardEvent => e !== null)
}

export const openFdaProvider: HazardEventProvider = {
  source: 'openfda',
  isConfigured: () => true, // sem chave
  async getEvents(_location: Coordinates): Promise<ProviderResult<HazardEvent[]>> {
    const started = Date.now()
    try {
      const [drugs, foods] = await Promise.all([fetchOne('drug'), fetchOne('food')])
      const events = [...drugs, ...foods]
        .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
        .slice(0, 3)
      return {
        provider: 'openfda',
        status: 'live',
        data: events,
        latencyMs: Date.now() - started,
        lastSuccessAt: new Date().toISOString(),
        dataAgeSeconds: 0,
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network error'
      return { provider: 'openfda', status: 'offline', data: [], latencyMs: Date.now() - started, message }
    }
  },
}
