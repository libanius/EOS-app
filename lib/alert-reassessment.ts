/**
 * Alerta oficial vira reavaliação, não cartão (PREP-T08 / D-168).
 *
 * A quarta e última entrada do laço fechado de `docs/37`. As outras três — EDU,
 * simulação e Pilot — já existiam; o alerta era o único que terminava numa
 * notificação e parava ali.
 *
 * ── Duas armadilhas evitadas, de propósito ────────────────────────────────
 *
 * **1. Nenhuma IA decide relevância.** Tudo aqui é determinístico. A LLM não
 * decide se existe aviso oficial, não decide se ele importa e não suaviza
 * veredito (`docs/37` §6). Ela pode explicar depois; não pode ser a trava.
 *
 * **2. Nenhuma chamada de modelo no cron.** A reavaliação roda quando o usuário
 * CHEGA, na tela, onde ele pode confirmar. Rodar no cron significaria gerar
 * proposta para milhares de casas que talvez nunca abram o app — custo, ruído,
 * e escrita preparada sem ninguém presente para consentir.
 *
 * ── O que o alerta faz ────────────────────────────────────────────────────
 *
 * Ele não cria necessidades novas: **ele reordena as que já existem**. Um aviso
 * de furacão não inventa que falta água — ele torna a água que já faltava
 * urgente, e empurra para baixo o que pode esperar. Alerta sem lacuna
 * correspondente **não vira tarefa**: inventar trabalho durante um evento é
 * roubar atenção de quem tem pouca.
 */

import type { AttentionItem, AttentionKind } from '@/lib/attention'

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'WATCH' | 'MODERATE' | 'CLEAR'

export type ReassessmentAlert = {
  source: string
  type: string
  severity: AlertSeverity
  headline: string
  expires?: string | null
}

/**
 * Que recursos cada família de evento coloca sob pressão.
 *
 * Derivado das próprias fontes do EOS (FEMA/NWS), e deliberadamente grosso: a
 * lista existe para ORDENAR o que já é sabido, não para prever física. Uma
 * tabela fina aqui daria falsa precisão sobre um evento que ainda não
 * aconteceu.
 *
 * **Fronteira de palavra é obrigatória.** Sem `\b`, "neve" casa dentro de
 * "nevoeiro" e um aviso de neblina passaria a pressionar comida e água. Um
 * teste pegou exatamente isso: palavra curta sem fronteira produz alarme por
 * coincidência de letras.
 */
const PRESSAO_POR_EVENTO: Array<{ padrao: RegExp; afeta: AttentionKind[] }> = [
  // Vento forte derruba energia; furacão soma inundação e isolamento.
  { padrao: /\b(hurricane|furac\w*|tropical|typhoon|ciclone)\b/i, afeta: ['water', 'food', 'battery', 'medical-kit', 'comms'] },
  { padrao: /\btornado\b/i, afeta: ['comms', 'medical-kit', 'battery'] },
  { padrao: /\b(wind|vento|gale|storm|tempestade|thunder\w*)\b/i, afeta: ['battery', 'comms'] },
  // Enchente contamina água e corta rota.
  { padrao: /\b(flood\w*|enchente|alagam\w*|inunda\w*)\b/i, afeta: ['water', 'food', 'medical-kit'] },
  { padrao: /\b(fire|inc[êe]ndio|smoke|fuma[çc]a)\b/i, afeta: ['medical-kit', 'comms'] },
  { padrao: /\b(winter|snow|ice|neve|gelo|freeze|frio)\b/i, afeta: ['battery', 'food', 'water'] },
  { padrao: /\b(heat|calor)\b/i, afeta: ['water', 'battery'] },
  { padrao: /\b(quake|earthquake|terremoto|seismic|s[íi]smic\w*)\b/i, afeta: ['water', 'food', 'medical-kit', 'comms'] },
  { padrao: /\b(power|blackout|outage|apag[ãa]o|energia)\b/i, afeta: ['battery', 'comms', 'food'] },
]

/** Severidades que valem reavaliação. Abaixo de WATCH é ruído. */
const RANK: Record<AlertSeverity, number> = { CRITICAL: 4, HIGH: 3, WATCH: 2, MODERATE: 1, CLEAR: 0 }

export type Reassessment = {
  /** Vale interromper e reavaliar? */
  warranted: boolean
  /** O alerta que motivou — o mais severo entre os relevantes. */
  alert: ReassessmentAlert | null
  /** Lacunas que ESTE evento torna urgentes, do pior para o menos pior. */
  gaps: AttentionItem[]
  /** Chave estável para deduplicar (mesma ideia de `sourceKeyFor`). */
  triggerKey: string | null
}

/**
 * Chave estável do gatilho.
 *
 * Mesmo evento, mesma severidade, mesma casa ⇒ mesma chave. É o que permite não
 * repetir a interrupção a cada render, e é o mesmo princípio do `source_key`
 * que a notificação por push já usa (`lib/comms-notifications.ts`).
 */
export function triggerKeyFor(alert: ReassessmentAlert): string {
  return [alert.source, alert.type, alert.severity, alert.expires ?? '']
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function afetadosPor(alert: ReassessmentAlert): AttentionKind[] {
  const texto = `${alert.type} ${alert.headline}`
  const atingidos = new Set<AttentionKind>()
  for (const { padrao, afeta } of PRESSAO_POR_EVENTO) {
    if (padrao.test(texto)) afeta.forEach(k => atingidos.add(k))
  }
  return Array.from(atingidos)
}

/**
 * O que este evento torna urgente, dado o que a casa já não tem.
 *
 * `attention` vem de `lib/attention` — os mesmos itens que a Visão mostra em
 * repouso. O alerta não produz uma segunda verdade sobre a casa; ele filtra e
 * reordena a única que existe.
 */
export function reassess(
  alerts: ReassessmentAlert[],
  attention: AttentionItem[],
): Reassessment {
  const relevantes = alerts.filter(a => RANK[a.severity] >= RANK.WATCH)
  if (!relevantes.length) {
    return { warranted: false, alert: null, gaps: [], triggerKey: null }
  }

  // O mais severo manda. Empate resolve pelo primeiro, que é a ordem da fonte.
  const alert = relevantes.reduce((pior, a) => (RANK[a.severity] > RANK[pior.severity] ? a : pior))
  const afetados = afetadosPor(alert)

  /*
   * Evento que não sabemos mapear NÃO vira "tudo é urgente". Nesse caso a
   * reavaliação usa apenas o que já é crítico: alargar o alarme por ignorância
   * é o oposto de informar.
   */
  const gaps = afetados.length
    ? attention.filter(item => afetados.includes(item.kind))
    : attention.filter(item => item.severity === 'critical')

  return {
    // Alerta relevante SEM lacuna correspondente não interrompe. A casa está
    // pronta para este evento; dizer "atenção" assim mesmo gasta a atenção que
    // o próximo evento vai precisar.
    warranted: gaps.length > 0,
    alert,
    gaps,
    triggerKey: triggerKeyFor(alert),
  }
}

/**
 * `kit_type` das propostas vindas de alerta.
 *
 * `OFFICIAL_ALERT` já é procedência válida em `requirements` (D-161); aqui ela
 * ganha o valor correspondente no armazenamento legado, para que o item
 * apareça em "O que falta" com a origem certa em vez de virar um kit inventado.
 */
export const ALERT_KIT_TYPE = 'OFFICIAL_ALERT'
