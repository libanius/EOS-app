/**
 * Requirements — o que a família DEVERIA ter (PREP-T05 / D-161).
 *
 * O outro lado do par que `lib/holdings.ts` abriu:
 *
 *   Holding      o que EXISTE, num lugar
 *   Requirement  o que DEVERIA existir, para um kit ou cenário   ← aqui
 *
 * Os dois se encontram por `resource_key`.
 *
 * ── O defeito que este módulo desfaz ───────────────────────────────────────
 *
 * `checklists.kit_type` guarda duas dimensões incompatíveis na mesma coluna:
 *
 *   propósito     GERAL · BUG_OUT · ACAMPAMENTO · PESCA · CACA
 *   procedência   EDU_CONTENT · PILOT_RECOMMENDATION · SIMULATION_DEBRIEF
 *
 * E a coluna faz parte da chave única `(profile_id, canonical_key, kit_type)`.
 * Por isso o MESMO item recomendado pelo Pilot e pertencente à Bug Out vira
 * duas linhas que nunca se fundem — não por bug, por desenho.
 *
 * `splitKitType()` é a separação, e é pura de propósito: é a regra mais fácil
 * de errar da migração inteira, e uma regra que só existe dentro de um SQL de
 * backfill não tem como ser testada antes de rodar.
 */

export type Provenance =
  | 'MANUAL' | 'PILOT' | 'EDU' | 'SIMULATION' | 'OFFICIAL_ALERT' | 'PLAN_GAP'

export type RequirementStatus = 'proposed' | 'needed' | 'met' | 'not_applicable'

export type RequirementTier = 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'

export type Requirement = {
  resourceKey: string
  label: string
  quantity: number
  unit: string | null
  /** `null` = requisito de linha de base da casa. */
  kitSlug: string | null
  tier: RequirementTier
  status: RequirementStatus
  provenance: Provenance
  provenanceRef: string | null
}

/**
 * Os kits de verdade — os que se PEGA e leva.
 *
 * `GERAL` não está aqui de propósito. `lib/checklist.ts` o descreve como
 * *"Preparação Geral — estoque e suprimentos para emergências em casa"*: isso
 * não é uma mochila, é a LINHA DE BASE da casa, que no modelo novo se
 * representa como requisito sem kit (docs/37 §17).
 *
 * A distinção não é cosmética. Com `GERAL` mapeado para um kit, um item vindo
 * do Pilot (sem kit) e o mesmo item em `GERAL` teriam chaves naturais
 * diferentes e nunca se fundiriam — e a deduplicação que D-155 §26.2 promete
 * jamais dispararia sobre dado real, que é o caso mais comum de todos.
 */
export const KIT_SLUGS = ['BUG_OUT', 'ACAMPAMENTO', 'PESCA', 'CACA'] as const

/** `kit_type` antigos que significam "linha de base da casa", não um kit. */
const BASELINE_LEGACY_KITS = new Set(['GERAL'])

/**
 * Valores de `kit_type` que nunca foram kits — são procedências.
 *
 * Ficaram ali porque a coluna era o único lugar disponível quando EDU, Pilot e
 * simulação passaram a criar itens (D-119, D-093, D-092). A gambiarra era
 * consciente e está registrada; aqui ela é desfeita.
 */
const PROVENANCE_BY_LEGACY_KIT: Record<string, Provenance> = {
  EDU_CONTENT: 'EDU',
  PILOT_RECOMMENDATION: 'PILOT',
  SIMULATION_DEBRIEF: 'SIMULATION',
}

export type KitTypeSplit = {
  /** `null` quando o valor antigo era procedência, não kit. */
  kitSlug: string | null
  provenance: Provenance
}

/**
 * Separa o `kit_type` antigo nas duas dimensões que ele misturava.
 *
 * Regras:
 * - `GERAL`, vazio ou nulo   → **sem kit** (linha de base da casa), MANUAL
 * - procedência disfarçada   → sem kit, procedência real
 * - qualquer outro           → kit com aquele slug, MANUAL
 *   (D-157: todo kit é Preparação, inclusive os que o usuário criar — um slug
 *   desconhecido é um kit dele, não um erro a descartar)
 *
 * A partir do legado nunca sai `kitSlug` **e** procedência não-MANUAL ao mesmo
 * tempo: a coluna antiga só conseguia guardar um dos dois. Depois do backfill
 * os dois coexistem livremente — um item da Bug Out sugerido pelo Pilot vira
 * UMA linha com kit `BUG_OUT` e procedência `PILOT`, que é justamente o que o
 * modelo antigo não sabia representar.
 */
export function splitKitType(kitType: string | null | undefined): KitTypeSplit {
  const raw = (kitType ?? '').trim().toUpperCase()

  if (!raw || BASELINE_LEGACY_KITS.has(raw)) return { kitSlug: null, provenance: 'MANUAL' }

  const provenance = PROVENANCE_BY_LEGACY_KIT[raw]
  if (provenance) return { kitSlug: null, provenance }

  return { kitSlug: raw, provenance: 'MANUAL' }
}

/** Uma linha de `checklists` como ela existe hoje. */
export type LegacyChecklistRow = {
  canonical_key: string
  item_name: string
  tier: RequirementTier
  quantity: number
  unit: string | null
  acquired: boolean
  kit_type: string | null
}

/**
 * Projeta uma linha antiga de checklist como Requirement.
 *
 * `acquired` vira `status`:
 *
 *   true  → `met`      a família marcou que tem
 *   false → `needed`   confirmado como necessário, ainda sem cobertura
 *
 * Nenhum item vira `proposed`: `proposed` é o que uma fonte SUGERIU e o
 * usuário ainda não confirmou, e tudo que está em `checklists` hoje já passou
 * por confirmação (D-092/D-093/D-119). Marcar tudo como proposto reabriria
 * decisões que a família já tomou.
 *
 * ATENÇÃO: `met` aqui é herdado do legado, onde ele significava "marquei".
 * No modelo novo `met` é DERIVADO da cobertura por holdings (docs/37 §19) —
 * a conciliação dos dois é PREP-T06, não aqui.
 */
export function projectLegacyChecklistRow(row: LegacyChecklistRow): Requirement {
  const { kitSlug, provenance } = splitKitType(row.kit_type)
  return {
    resourceKey: row.canonical_key,
    label: row.item_name,
    quantity: Number(row.quantity) || 0,
    unit: row.unit,
    kitSlug,
    tier: row.tier,
    status: row.acquired ? 'met' : 'needed',
    provenance,
    provenanceRef: null,
  }
}

/**
 * Chave natural de um requisito — **sem procedência**, de propósito.
 *
 * É a regra do D-155 §26.2: o mesmo item achado por duas fontes ATUALIZA a
 * procedência, não cria uma segunda linha. Incluir procedência aqui recriaria,
 * numa tabela nova, exatamente a duplicação de `checklists.kit_type`.
 */
export function requirementNaturalKey(r: Pick<Requirement, 'resourceKey' | 'kitSlug'>, scenarioId: string | null = null): string {
  return [r.resourceKey, r.kitSlug ?? '∅', scenarioId ?? '∅'].join('::')
}

/**
 * Projeta a lista inteira, fundindo o que o modelo antigo era obrigado a
 * separar.
 *
 * Quando duas linhas antigas colapsam na mesma chave natural — o caso clássico
 * sendo "Água 4 gal" existindo em `BUG_OUT` e em `PILOT_RECOMMENDATION` —, a
 * fusão preserva:
 *
 * - o KIT, quando alguma das linhas tinha um (uma procedência não apaga o
 *   pertencimento a uma mochila);
 * - a procedência mais INFORMATIVA, ou seja, qualquer uma diferente de MANUAL
 *   (saber que veio do Pilot vale mais do que saber que alguém digitou);
 * - o status mais AVANÇADO (`met` vence `needed`), porque a família já
 *   declarou que tem;
 * - a MAIOR quantidade, que é a leitura conservadora do que é preciso.
 */
export function projectLegacyChecklist(rows: LegacyChecklistRow[]): Requirement[] {
  const porChave = new Map<string, Requirement>()

  for (const row of rows) {
    const atual = projectLegacyChecklistRow(row)
    const chave = requirementNaturalKey(atual)
    const anterior = porChave.get(chave)

    if (!anterior) {
      porChave.set(chave, atual)
      continue
    }

    porChave.set(chave, {
      ...anterior,
      kitSlug: anterior.kitSlug ?? atual.kitSlug,
      provenance: anterior.provenance !== 'MANUAL' ? anterior.provenance : atual.provenance,
      status: anterior.status === 'met' || atual.status === 'met' ? 'met' : anterior.status,
      quantity: Math.max(anterior.quantity, atual.quantity),
      tier: anterior.tier,
      label: anterior.label,
    })
  }

  // `Array.from` e não spread: o alvo de compilação do projeto não itera
  // `MapIterator` sem `downlevelIteration`.
  return Array.from(porChave.values())
}
