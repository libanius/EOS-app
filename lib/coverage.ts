/**
 * Cobertura — onde Requirement e Holding finalmente se encontram
 * (PREP-T06 / D-162). Spec: `docs/37-preparedness-state.md` §15.1 e §24.
 *
 *   Requirement  o que DEVERIA existir
 *   Holding      o que EXISTE, num lugar
 *   Cobertura    quanto o segundo satisfaz o primeiro   ← este arquivo
 *
 * Tudo aqui é **derivado**. Nada é gravado. Prontidão não é um número que se
 * guarda: é uma leitura do estado atual, e guardá-la criaria uma segunda
 * verdade que envelhece em silêncio.
 *
 * ── A regra que não pode ser suavizada ─────────────────────────────────────
 *
 * `unknown` NUNCA sobe para `covered`. Um desconhecido dentro de um conjunto
 * coberto torna o conjunto `unknown`, não "pronto". Num app de emergência,
 * dado faltando que vira tranquilização é o mesmo erro do Pilot dizer "pode
 * ir" sem saber — e é o erro que custa caro exatamente no dia em que importa.
 *
 * Corolário menos óbvio, e igualmente obrigatório: **um conjunto VAZIO é
 * `unknown`, não `covered`.** Um kit sem requisitos não está pronto; ninguém
 * disse o que ele precisa. "Zero problemas encontrados" e "nada foi olhado"
 * não podem ter a mesma cor.
 */

import type { EosLocation, Holding } from '@/lib/holdings'
import { locationSubtree, toLiters } from '@/lib/holdings'

export type CoverageStatus =
  | 'covered' | 'partial' | 'missing' | 'unknown' | 'not_applicable'

/**
 * Ordem de severidade, pior primeiro. É ela que define o pior-vence.
 *
 * `missing` acima de `partial`: não ter nada é pior que ter pouco.
 * `partial` acima de `unknown`: uma falta MEDIDA é acionável e merece gritar
 * mais alto que uma incerteza. Mas `unknown` fica acima de `covered`, que é o
 * que garante a regra inegociável — incerteza nunca é prontidão.
 */
type CountedStatus = Exclude<CoverageStatus, 'not_applicable'>

const SEVERITY: CountedStatus[] = ['missing', 'partial', 'unknown', 'covered']

export type RequirementForCoverage = {
  resourceKey: string
  quantity: number
  unit: string | null
  /** Onde precisa ser satisfeito. `null` = a casa. */
  locationScopeId: string | null
  /** `not_applicable` sai da conta inteira. */
  status?: 'proposed' | 'needed' | 'met' | 'not_applicable'
}

export type CoverageResult = {
  status: CoverageStatus
  /** Quanto existe, na unidade do requisito. `null` quando não dá para saber. */
  have: number | null
  /** Quanto é preciso. */
  need: number
  /** Por que deu `unknown` — vazio quando não deu. */
  reason?: 'unconvertible-unit' | 'no-requirements'
}

/**
 * O recurso é consumível ou durável?
 *
 * A informação mora no Holding (`kind`), não no Requirement — e isso é uma
 * assimetria real do modelo: consumível/durável é propriedade do RECURSO, não
 * de uma linha. Enquanto não existir uma tabela de recursos, inferimos:
 *
 *   1. se existe algum holding com essa chave, ele manda;
 *   2. senão, unidade presente ⇒ consumível; ausente ⇒ durável.
 *
 * A heurística 2 acerta o caso real ("água, 4, gal" × "torniquete, 1, sem
 * unidade") e está isolada aqui para ter um lugar só quando virar coluna.
 * Registrado como acompanhamento em `docs/37` §34.
 */
export function resourceIsConsumable(
  resourceKey: string,
  requirementUnit: string | null,
  holdings: Holding[],
): boolean {
  const conhecido = holdings.find(h => h.resourceKey === resourceKey)
  if (conhecido) return conhecido.kind === 'CONSUMABLE'
  return Boolean((requirementUnit ?? '').trim())
}

/**
 * Cobertura de UM requisito.
 *
 * Consumível: soma quantidades dentro do escopo, com conversão de unidade.
 * Durável: presença alcançável do escopo — um torniquete na garagem serve
 * qualquer kit executado de casa, e não serve o kit do carro (docs/37 §15.1).
 */
export function coverRequirement(
  requirement: RequirementForCoverage,
  holdings: Holding[],
  locations: EosLocation[],
  homeLocationId: string,
): CoverageResult {
  const need = Number.isFinite(requirement.quantity) ? Math.max(0, requirement.quantity) : 0

  if (requirement.status === 'not_applicable') {
    return { status: 'not_applicable', have: null, need }
  }

  const raiz = requirement.locationScopeId ?? homeLocationId
  const dentro = locationSubtree(locations, raiz)
  const candidatos = holdings.filter(h => h.resourceKey === requirement.resourceKey && dentro.has(h.locationId))

  if (!candidatos.length) return { status: 'missing', have: 0, need }

  if (!resourceIsConsumable(requirement.resourceKey, requirement.unit, holdings)) {
    // Durável é presença, não quantidade. Um é suficiente; dois não são "mais
    // prontos" — e contar dois como cobertura dupla é justamente a dupla
    // contagem física que este modelo existe para impedir.
    const presente = candidatos.some(h => h.quantity > 0)
    return { status: presente ? 'covered' : 'missing', have: presente ? 1 : 0, need: need || 1 }
  }

  /*
   * Consumível: normalizamos para litros para poder somar galão com litro.
   * Uma unidade que não sabemos converter **não vira zero** — vira `unknown`.
   * Tratar o desconhecido como ausente inventaria uma falta; tratá-lo como
   * presente inventaria água. As duas mentem; `unknown` é a única resposta
   * honesta, e por §24 ela nunca lê como pronta.
   */
  const precisaEmLitros = toLiters(need, requirement.unit)
  let temEmLitros = 0
  let houveNaoConversivel = false

  for (const h of candidatos) {
    const litros = toLiters(h.quantity, h.unit)
    if (litros === null) { houveNaoConversivel = true; continue }
    temEmLitros += litros
  }

  // Requisito em unidade que não sabemos ler: não dá para comparar nada.
  if (precisaEmLitros === null) {
    const mesmaUnidade = candidatos.filter(h => (h.unit ?? '') === (requirement.unit ?? ''))
    if (!mesmaUnidade.length) return { status: 'unknown', have: null, need, reason: 'unconvertible-unit' }
    const total = mesmaUnidade.reduce((s, h) => s + (Number.isFinite(h.quantity) ? h.quantity : 0), 0)
    return { status: classify(total, need), have: total, need }
  }

  if (houveNaoConversivel && temEmLitros < precisaEmLitros) {
    // Existe algo que não sabemos medir, e o que sabemos medir não basta:
    // a diferença pode estar no que não foi lido. Chamar de falta seria chutar.
    return { status: 'unknown', have: null, need, reason: 'unconvertible-unit' }
  }

  const temNaUnidadeDoRequisito = need > 0 ? (temEmLitros / precisaEmLitros) * need : temEmLitros
  return { status: classify(temEmLitros, precisaEmLitros), have: temNaUnidadeDoRequisito, need }
}

function classify(have: number, need: number): CoverageStatus {
  if (need <= 0) return have > 0 ? 'covered' : 'missing'
  if (have >= need) return 'covered'
  if (have > 0) return 'partial'
  return 'missing'
}

/**
 * Pior-vence sobre um conjunto de coberturas.
 *
 * `not_applicable` sai da conta: um requisito descartado não pode nem melhorar
 * nem piorar o resultado.
 *
 * **Conjunto vazio devolve `unknown`.** É o ponto mais fácil de errar deste
 * arquivo: com `covered` como padrão, um kit sem requisitos apareceria pronto,
 * e "nada foi olhado" viraria "nada falta".
 */
export function rollupCoverage(statuses: CoverageStatus[]): CoverageStatus {
  const contam = statuses.filter((s): s is CountedStatus => s !== 'not_applicable')
  if (!contam.length) return 'unknown'

  for (const nivel of SEVERITY) {
    if (contam.includes(nivel)) return nivel
  }
  return 'unknown'
}

export type CoverageSummary = {
  status: CoverageStatus
  covered: number
  partial: number
  missing: number
  unknown: number
  notApplicable: number
  /** Requisitos que contam para o veredito. */
  total: number
}

/** Contagem + veredito, que é o que uma tela precisa para explicar o estado. */
export function summarizeCoverage(results: CoverageResult[]): CoverageSummary {
  const conta = (s: CoverageStatus) => results.filter(r => r.status === s).length
  const statuses = results.map(r => r.status)
  return {
    status: rollupCoverage(statuses),
    covered: conta('covered'),
    partial: conta('partial'),
    missing: conta('missing'),
    unknown: conta('unknown'),
    notApplicable: conta('not_applicable'),
    total: statuses.filter(s => s !== 'not_applicable').length,
  }
}
