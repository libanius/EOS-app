/**
 * Holdings — o que a família REALMENTE tem, e onde (PREP-T04 / D-160).
 *
 * Spec: `docs/37-preparedness-state.md`. Este módulo é o estágio 1 e 2 do §28:
 * o modelo novo nasce ao lado do antigo, e um ADAPTADOR projeta o antigo na
 * forma nova. Nada é migrado, nada é escrito, nada muda na tela.
 *
 * ── A distinção que sustenta o modelo ──────────────────────────────────────
 *
 *   Holding      o que EXISTE, num lugar, numa quantidade   ← este arquivo
 *   Requirement  o que DEVERIA existir, para um kit/cenário ← PREP-T05
 *
 * `resource_inventory` é uma linha por perfil com sete escalares: ele não sabe
 * dizer objeto, quantidade por objeto nem lugar. É por isso que "onde está
 * minha água de reserva?" não tem resposta hoje.
 *
 * ── Por que itens de checklist NÃO viram Holding ───────────────────────────
 *
 * Tentador: o item está marcado como adquirido, logo a família tem. Errado, e
 * é exatamente o defeito que PREP-T11 removeu. Um item marcado carrega a
 * quantidade PLANEJADA, não a medida — e carrega um `kit_type`, não um lugar.
 * Transformá-lo em Holding na casa reintroduziria as duas confusões numa
 * camada mais funda, onde seriam mais difíceis de achar.
 *
 * Item adquirido é `Requirement` com estado `met`. Isso é PREP-T05.
 */

import { WATER_LITERS_PER_PERSON_DAY } from '@/lib/units'

export type HoldingKind = 'CONSUMABLE' | 'DURABLE'

export type LocationKind =
  | 'HOME' | 'FARM' | 'WAREHOUSE' | 'OFFICE' | 'VEHICLE'
  | 'RV' | 'BOAT' | 'STORAGE_UNIT' | 'SECOND_RESIDENCE' | 'CUSTOM'

export type EosLocation = {
  id: string
  parentId: string | null
  name: string
  kind: LocationKind
  isDefault: boolean
}

export type Holding = {
  locationId: string
  resourceKey: string
  label: string
  kind: HoldingKind
  quantity: number
  unit: string | null
}

/** O nome da casa que o EOS cria sozinho. A pessoa pode renomear depois. */
export const DEFAULT_LOCATION_NAME = 'Casa'

/**
 * Chaves canônicas dos recursos que o modelo antigo conhece.
 *
 * São as mesmas de `checklists.canonical_key` de propósito: `resource_key` é a
 * chave que liga PRECISAR a TER, e ela só serve se os dois lados escreverem
 * igual (docs/37 §13.1).
 */
export const RESOURCE_KEYS = {
  water: 'agua',
  food: 'comida',
  fuel: 'combustivel',
  medicalKit: 'kit-medico',
  comms: 'radio-comunicacao',
  cash: 'dinheiro',
} as const

/** Os sete escalares do modelo antigo. */
export type LegacyInventory = {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
  cash_amount: number
}

/**
 * Litros, a partir de qualquer unidade que o modelo novo aceite.
 *
 * A conversão acontece AQUI e em nenhum outro lugar da matemática de cobertura
 * (docs/37 §15.3). Unidade desconhecida devolve `null` em vez de chutar: um
 * palpite silencioso viraria autonomia inventada, e autonomia inventada para
 * cima é o pior erro que este app pode cometer.
 */
export function toLiters(quantity: number, unit: string | null): number | null {
  if (!Number.isFinite(quantity)) return null
  const u = (unit ?? '').trim().toLowerCase()
  if (u === 'l' || u === 'litro' || u === 'litros' || u === 'liter' || u === 'liters') return quantity
  if (u === 'gal' || u === 'galao' || u === 'galão' || u === 'galoes' || u === 'galões' || u === 'gallon' || u === 'gallons') {
    return quantity * 3.785411784
  }
  return null
}

/**
 * Projeta o inventário antigo como Holdings na Location padrão.
 *
 * PURA de propósito: é o coração testável do adaptador, e um teste que precisa
 * de banco não é um teste que alguém roda.
 *
 * O que NÃO é projetado, e por quê:
 *
 * - **Bateria.** `battery_percent` é uma porcentagem de capacidade, não um
 *   objeto guardado num lugar. Vira Holding só quando existir "bateria X, 2
 *   unidades, na garagem" — e aí a porcentagem some, porque ela nunca foi o
 *   dado certo. Até lá, continua no card próprio (docs/37 §24.3).
 *
 * - **Zeros.** Um recurso com quantidade zero não é um Holding vazio; é a
 *   ausência de Holding. Criar linha para o que não existe encheria a
 *   localização de nada e faria "tenho 6 recursos" onde há 2.
 */
export function projectLegacyInventory(
  inventory: LegacyInventory | null,
  locationId: string,
): Holding[] {
  if (!inventory || !locationId) return []
  const out: Holding[] = []

  const consumable = (resourceKey: string, label: string, quantity: number, unit: string) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return
    out.push({ locationId, resourceKey, label, kind: 'CONSUMABLE', quantity, unit })
  }

  consumable(RESOURCE_KEYS.water, 'Água', Number(inventory.water_liters) || 0, 'L')
  consumable(RESOURCE_KEYS.fuel, 'Combustível', Number(inventory.fuel_liters) || 0, 'L')
  consumable(RESOURCE_KEYS.cash, 'Dinheiro', Number(inventory.cash_amount) || 0, 'BRL')

  /*
   * Comida é dia-pessoa e não volume. A unidade vai no dado (D-158) justamente
   * para que ninguém volte a somar "dias" de duas casas e dobrar a autonomia —
   * o erro que `foodPersonDays` documenta em `lib/household.ts`.
   */
  consumable(RESOURCE_KEYS.food, 'Comida', Number(inventory.food_days) || 0, 'dia-pessoa')

  if (inventory.has_medical_kit) {
    out.push({ locationId, resourceKey: RESOURCE_KEYS.medicalKit, label: 'Kit médico', kind: 'DURABLE', quantity: 1, unit: null })
  }
  if (inventory.has_communication_device) {
    out.push({ locationId, resourceKey: RESOURCE_KEYS.comms, label: 'Rádio / comunicação', kind: 'DURABLE', quantity: 1, unit: null })
  }

  return out
}

/**
 * Ids das localizações que ficam SOB uma raiz, ela inclusive.
 *
 * A autonomia da casa lê o que está em CASA (D-156), e "em casa" inclui a
 * garagem e o armário dentro da garagem. Percurso iterativo e com visitados:
 * `parent_id` vem do banco e um ciclo — mesmo impossível pela UI — não pode
 * travar o cálculo da autonomia.
 */
export function locationSubtree(locations: EosLocation[], rootId: string): Set<string> {
  const filhosPor = new Map<string, string[]>()
  for (const l of locations) {
    if (!l.parentId) continue
    const atuais = filhosPor.get(l.parentId) ?? []
    atuais.push(l.id)
    filhosPor.set(l.parentId, atuais)
  }

  const dentro = new Set<string>()
  const fila = [rootId]
  while (fila.length) {
    const atual = fila.pop() as string
    if (dentro.has(atual)) continue
    dentro.add(atual)
    for (const filho of filhosPor.get(atual) ?? []) fila.push(filho)
  }
  return dentro
}

/**
 * Quanto de um recurso consumível existe sob uma raiz, em litros.
 *
 * Conta CADA Holding uma vez (docs/37 §15.1): não há alocação, não há reserva,
 * e o mesmo litro nunca aparece em dois lugares porque um litro só está num
 * lugar. Unidade desconhecida é IGNORADA — nunca somada como se fosse litro.
 */
export function consumableLitersUnder(
  holdings: Holding[],
  locations: EosLocation[],
  rootId: string,
  resourceKey: string,
): number {
  const dentro = locationSubtree(locations, rootId)
  let total = 0
  for (const h of holdings) {
    if (h.kind !== 'CONSUMABLE') continue
    if (h.resourceKey !== resourceKey) continue
    if (!dentro.has(h.locationId)) continue
    const litros = toLiters(h.quantity, h.unit)
    if (litros === null) continue
    total += litros
  }
  return total
}

/**
 * Autonomia em dias a partir de Holdings, lendo o que está sob a raiz dada.
 *
 * Tem que devolver EXATAMENTE o mesmo que `autonomyDays()` de `lib/household`
 * para os mesmos dados — é o critério 6 de PREP-T04, e é o que prova que o
 * modelo novo não inventou uma segunda verdade enquanto o antigo ainda manda.
 * A quinta conta de prontidão seria defeito, não feature (docs/37 §24.2).
 */
export function autonomyDaysFromHoldings(
  holdings: Holding[],
  locations: EosLocation[],
  rootId: string,
  householdSize: number,
): number {
  if (householdSize <= 0) return 0

  const aguaLitros = consumableLitersUnder(holdings, locations, rootId, RESOURCE_KEYS.water)
  const diasDeAgua = aguaLitros / (WATER_LITERS_PER_PERSON_DAY * householdSize)

  // Comida já está em dia-pessoa; dividir pelas bocas devolve dias.
  const dentro = locationSubtree(locations, rootId)
  const comidaPessoaDia = holdings
    .filter(h => h.kind === 'CONSUMABLE' && h.resourceKey === RESOURCE_KEYS.food && dentro.has(h.locationId))
    .reduce((soma, h) => soma + (Number.isFinite(h.quantity) ? h.quantity : 0), 0)
  const diasDeComida = comidaPessoaDia / householdSize

  return Math.max(0, Math.min(diasDeAgua, diasDeComida))
}

/**
 * Um Holding durável atende um requisito alcançável do mesmo lugar.
 *
 * É a regra que impede um torniquete de virar quatro torniquetes só porque
 * quatro kits o citam (docs/37 §15.1). O durável é PRESENÇA: se está sob o
 * lugar de onde o kit é executado, cobre; se não está, não cobre. Sem reserva,
 * sem alocação, sem razão de estoque.
 */
export function durableCovers(
  holdings: Holding[],
  locations: EosLocation[],
  requirementRootId: string,
  resourceKey: string,
): boolean {
  const dentro = locationSubtree(locations, requirementRootId)
  return holdings.some(h =>
    h.kind === 'DURABLE'
    && h.resourceKey === resourceKey
    && dentro.has(h.locationId)
    && h.quantity > 0,
  )
}
