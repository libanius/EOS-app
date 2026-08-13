/**
 * "Precisa de atenção" — o que a Visão da Preparação responde (PREP-T07 fase 2).
 *
 * ── O problema que isto conserta ───────────────────────────────────────────
 *
 * A nota dizia "37/100 · crítico" no topo, e o que ela diagnosticava ficava
 * 400px abaixo, preso dentro de cada card. Não existia caminho do problema até
 * a ação: a tela respondia *"onde estou"* e não respondia *"para onde eu vou"*.
 * É o achado P2 de `docs/36`.
 *
 * ── Sem dado novo ─────────────────────────────────────────────────────────
 *
 * Todos os sinais aqui JÁ eram calculados — só viviam espalhados. Água e
 * comida usam os mesmos limiares do rules-engine (D-163); bateria usa os do
 * card; o checklist já contava feitos por tier. Reunir não é inventar.
 *
 * ── Por que função pura ───────────────────────────────────────────────────
 *
 * É o coração da tela mais importante da Preparação. Uma regra de segurança
 * que só existe dentro de JSX não tem como ser testada, e esta precisa ser —
 * inclusive a de baixo, que é a mais fácil de errar.
 */

import {
  WATER_ADEQUATE_LITERS_PER_PERSON,
  WATER_CRITICAL_LITERS_PER_PERSON,
  WATER_MIN_DAYS_FEMA,
} from '@/lib/units'

export type AttentionSeverity = 'critical' | 'low' | 'unknown'

/** Onde o problema se conserta — vira o destino do toque. */
export type AttentionWhere = 'holdings' | 'requirements' | 'household'

export type AttentionKind =
  | 'household-unknown'
  | 'water'
  | 'food'
  | 'battery'
  | 'medical-kit'
  | 'comms'
  | 'checklist-essential'

export type AttentionItem = {
  kind: AttentionKind
  severity: AttentionSeverity
  where: AttentionWhere
  /** Números para a frase. A tela monta o texto; aqui só os fatos. */
  detail: {
    perPersonLiters?: number
    days?: number
    percent?: number
    done?: number
    total?: number
  }
}

export type AttentionInput = {
  waterLiters: number
  foodDays: number
  batteryPercent: number
  hasMedicalKit: boolean
  hasCommunicationDevice: boolean
  /** Tamanho da casa. `0` ou ausente = desconhecido — e desconhecido NÃO é 1. */
  householdSize: number
  /** Itens essenciais do checklist. */
  essentialDone: number
  essentialTotal: number
}

/** Pior primeiro. `unknown` acima de `low`: não saber é pior que saber pouco. */
const ORDEM: Record<AttentionSeverity, number> = { critical: 0, unknown: 1, low: 2 }

/**
 * O que precisa de atenção, do pior para o menos pior.
 *
 * Devolve lista vazia quando está tudo bem — e a tela deve dizer isso com
 * palavras, não sumir. Uma seção que desaparece é indistinguível de uma seção
 * que falhou ao carregar.
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const itens: AttentionItem[] = []

  /*
   * Casa de tamanho desconhecido é um item de atenção, não um detalhe.
   *
   * O resto do app usa `Math.max(size, 1)` para não dividir por zero, o que é
   * correto como defesa e ERRADO como resposta: uma casa de quatro avaliada
   * como se fosse uma parece quatro vezes mais preparada do que é. Enquanto
   * não sabemos quem mora aqui, dizemos que não sabemos — `unknown` nunca pode
   * ler como tranquilidade (docs/37 §24).
   */
  const casaConhecida = input.householdSize > 0
  if (!casaConhecida) {
    itens.push({ kind: 'household-unknown', severity: 'unknown', where: 'household', detail: {} })
  }

  const bocas = Math.max(input.householdSize, 1)

  // ── Água: régua da FEMA (D-163) ────────────────────────────────────────────
  const aguaPorPessoa = input.waterLiters / bocas
  if (aguaPorPessoa < WATER_CRITICAL_LITERS_PER_PERSON) {
    itens.push({
      kind: 'water',
      severity: casaConhecida ? 'critical' : 'unknown',
      where: 'holdings',
      detail: { perPersonLiters: aguaPorPessoa, days: aguaPorPessoa / WATER_CRITICAL_LITERS_PER_PERSON },
    })
  } else if (aguaPorPessoa < WATER_ADEQUATE_LITERS_PER_PERSON) {
    itens.push({
      kind: 'water',
      severity: casaConhecida ? 'low' : 'unknown',
      where: 'holdings',
      detail: { perPersonLiters: aguaPorPessoa, days: aguaPorPessoa / WATER_CRITICAL_LITERS_PER_PERSON },
    })
  }

  // ── Comida: mesmo piso de 3 dias ───────────────────────────────────────────
  if (input.foodDays < 1) {
    itens.push({ kind: 'food', severity: 'critical', where: 'holdings', detail: { days: input.foodDays } })
  } else if (input.foodDays < WATER_MIN_DAYS_FEMA) {
    itens.push({ kind: 'food', severity: 'low', where: 'holdings', detail: { days: input.foodDays } })
  }

  // ── Bateria: capacidade, não sobrevivência — nunca crítica sozinha ─────────
  if (input.batteryPercent < 30) {
    itens.push({
      kind: 'battery',
      severity: input.batteryPercent < 10 ? 'critical' : 'low',
      where: 'holdings',
      detail: { percent: input.batteryPercent },
    })
  }

  if (!input.hasMedicalKit) {
    itens.push({ kind: 'medical-kit', severity: 'low', where: 'holdings', detail: {} })
  }
  if (!input.hasCommunicationDevice) {
    itens.push({ kind: 'comms', severity: 'low', where: 'holdings', detail: {} })
  }

  /*
   * Checklist essencial incompleto. `total === 0` NÃO entra: lista vazia é
   * "nada foi olhado", e a Visão já convida a gerar a lista pela porta. Marcar
   * como falta o que ninguém listou seria alarme sobre ausência de informação.
   */
  if (input.essentialTotal > 0 && input.essentialDone < input.essentialTotal) {
    itens.push({
      kind: 'checklist-essential',
      severity: 'low',
      where: 'requirements',
      detail: { done: input.essentialDone, total: input.essentialTotal },
    })
  }

  return itens.sort((a, b) => ORDEM[a.severity] - ORDEM[b.severity])
}
