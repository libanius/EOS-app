/**
 * Estoque único da casa — a parte pura (INVENTORY-001 §3.3, §3.6, §4.2).
 *
 * `holdings` é a verdade do que a casa tem, item a item. `resource_inventory`
 * (os 7 números que todas as telas leem) passa a ser a SOMA dele, calculada
 * aqui. Sem banco e sem rede: as rotas montam as linhas e chamam estas funções.
 *
 * Três regras fáceis de errar ficam aqui, testadas:
 *
 * 1. "Sob a Casa" é sob QUALQUER uma das Casas padrão da casa (E20), e mochila
 *    no carro não conta (E3, D-156).
 * 2. Comida é estimada pelo peso e pelo tipo, sempre PARA MENOS na dúvida
 *    (D-I6): autonomia superestimada é o pior erro que este app pode cometer.
 * 3. Unidade desconhecida não soma. Nunca vira litro, grama ou refeição por
 *    palpite (D-158).
 */

import { LITERS_PER_GALLON } from './units'
import { locationSubtree, type EosLocation } from './holdings'

/* ── Tipos ─────────────────────────────────────────────────────────────── */

export const FOOD_TYPES = [
  'arroz', 'feijao', 'macarrao', 'aveia', 'farinha', 'acucar',
  'leite-po', 'castanhas', 'enlatado', 'pronta', 'outro',
] as const
export type FoodType = (typeof FOOD_TYPES)[number]

export type StockItem = {
  id: string
  profileId: string
  locationId: string
  resourceKey: string
  label: string
  kind: 'CONSUMABLE' | 'DURABLE'
  quantity: number
  unit: string | null
  brand: string | null
  model: string | null
  notes: string | null
  expiresOn: string | null
  foodType: FoodType | null
  mealsOverride: number | null
}

/** Os escalares de `resource_inventory` que vêm do estoque. Bateria fica fora. */
export type InventoryProjection = {
  water_liters: number
  food_days: number
  fuel_liters: number
  cash_amount: number
  has_medical_kit: boolean
  has_communication_device: boolean
}

/* ── Unidades ──────────────────────────────────────────────────────────── */

const norm = (u: string | null) => (u ?? '').trim().toLowerCase()

/** Litros a partir de gal ou L. Outra unidade: `null`, nunca palpite. */
export function litersOf(quantity: number, unit: string | null): number | null {
  if (!Number.isFinite(quantity)) return null
  const u = norm(unit)
  if (u === 'l' || u === 'litro' || u === 'litros') return quantity
  if (u === 'gal' || u === 'galao' || u === 'galão') return quantity * LITERS_PER_GALLON
  return null
}

const GRAMS_PER_LB = 453.59237
const GRAMS_PER_OZ = 28.349523125

/** Gramas a partir de g, kg, lb ou oz (E7d). Outra unidade: `null`. */
export function gramsOf(quantity: number, unit: string | null): number | null {
  if (!Number.isFinite(quantity)) return null
  const u = norm(unit)
  if (u === 'g') return quantity
  if (u === 'kg') return quantity * 1000
  if (u === 'lb') return quantity * GRAMS_PER_LB
  if (u === 'oz') return quantity * GRAMS_PER_OZ
  return null
}

/* ── Comida: refeições estimadas pelo peso (D-I6, §3.3) ─────────────────── */

export const KCAL_PER_PERSON_DAY = 2000
export const MEALS_PER_DAY = 3
export const KCAL_PER_MEAL = KCAL_PER_PERSON_DAY / MEALS_PER_DAY

/**
 * kcal por kg, por tipo. Médias de referência (USDA FoodData Central)
 * arredondadas PARA BAIXO. `enlatado` é o peso com o líquido; `outro` é
 * conservador de propósito.
 */
export const FOOD_KCAL_PER_KG: Record<FoodType, number> = {
  arroz: 3600,
  feijao: 3400,
  macarrao: 3700,
  aveia: 3900,
  farinha: 3600,
  acucar: 3900,
  'leite-po': 4900,
  castanhas: 5800,
  enlatado: 900,
  pronta: 4000,
  outro: 1500,
}

export function isFoodType(v: unknown): v is FoodType {
  return typeof v === 'string' && (FOOD_TYPES as readonly string[]).includes(v)
}

export type MealsEstimate = { meals: number; estimated: boolean }

/**
 * Refeições de um item de comida.
 *
 * - `mealsOverride` vale sobre tudo (E7c).
 * - Peso × kcal/kg do tipo ÷ kcal por refeição, arredondado para baixo (E7a).
 * - Tipo ausente estima como `outro` (E7e).
 * - Legado do backfill: `dia-pessoa` × 3 e `refeicoes` direto, sem estimativa.
 * - Unidade desconhecida: `null`. Não soma.
 */
export function mealsOf(item: Pick<StockItem, 'quantity' | 'unit' | 'foodType' | 'mealsOverride'>): MealsEstimate | null {
  if (item.mealsOverride !== null && Number.isFinite(item.mealsOverride) && item.mealsOverride >= 0) {
    return { meals: item.mealsOverride, estimated: false }
  }
  const u = norm(item.unit)
  if (u === 'dia-pessoa') return { meals: item.quantity * MEALS_PER_DAY, estimated: false }
  if (u === 'refeicoes' || u === 'refeições') return { meals: item.quantity, estimated: false }
  const grams = gramsOf(item.quantity, item.unit)
  if (grams === null) return null
  const kcalPerKg = FOOD_KCAL_PER_KG[item.foodType ?? 'outro'] ?? FOOD_KCAL_PER_KG.outro
  return { meals: Math.floor(((grams / 1000) * kcalPerKg) / KCAL_PER_MEAL + 1e-9), estimated: true }
}

/* ── Onde fica a casa (E20, D-156) ─────────────────────────────────────── */

/**
 * Ids sob a Casa: a subárvore de CADA Casa padrão das contas da casa.
 * Mochila movida para um lugar fora dessas árvores (o carro) sai sozinha.
 */
export function homeScope(locations: EosLocation[], homeRootIds: string[]): Set<string> {
  const scope = new Set<string>()
  for (const root of homeRootIds) {
    locationSubtree(locations, root).forEach(id => scope.add(id))
  }
  return scope
}

/* ── Projeção: estoque → resource_inventory (§4.2) ─────────────────────── */

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Os escalares de UMA conta, a partir dos itens DELA sob a Casa.
 *
 * `coverage` = quantas pessoas a conta cobre (ela + dependentes), a mesma de
 * `lib/household.ts`. Comida em `resource_inventory` é "dias para quem a conta
 * cobre"; a casa multiplica de volta por `coverage` ao somar. Sem isso, duas
 * pessoas com quatro dias cada leriam oito.
 */
export function projectInventory(
  items: StockItem[],
  locations: EosLocation[],
  homeRootIds: string[],
  coverage: number,
): InventoryProjection {
  const scope = homeScope(locations, homeRootIds)
  const home = items.filter(i => scope.has(i.locationId) && i.quantity > 0)

  let water = 0
  let fuel = 0
  let cash = 0
  let meals = 0
  for (const i of home) {
    if (i.resourceKey === 'agua') water += litersOf(i.quantity, i.unit) ?? 0
    else if (i.resourceKey === 'combustivel') fuel += litersOf(i.quantity, i.unit) ?? 0
    else if (i.resourceKey === 'dinheiro') cash += i.quantity
    else if (i.resourceKey === 'comida') meals += mealsOf(i)?.meals ?? 0
  }

  const people = coverage > 0 ? coverage : 1
  return {
    water_liters: round3(water),
    food_days: round3(meals / MEALS_PER_DAY / people),
    fuel_liters: round3(fuel),
    cash_amount: round3(cash),
    has_medical_kit: home.some(i => i.resourceKey === 'kit-medico'),
    has_communication_device: home.some(i => i.resourceKey === 'radio-comunicacao'),
  }
}

/* ── Cobertura de um item do Sinal (§3.4, regra 3) ─────────────────────── */

/** Itens da casa que cobrem a chave: mesma chave, quantidade > 0, sob a Casa. */
export function coveringItems(
  items: StockItem[],
  locations: EosLocation[],
  homeRootIds: string[],
  resourceKey: string,
): StockItem[] {
  const scope = homeScope(locations, homeRootIds)
  return items.filter(i => i.resourceKey === resourceKey && i.quantity > 0 && scope.has(i.locationId))
}

/* ── Validade (§3.6, D-I4) ─────────────────────────────────────────────── */

export const EXPIRY_WARNING_DAYS = 30

export type ExpiryState = 'expired' | 'soon' | null

const DAY_MS = 86_400_000
const isoDay = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))

/** Data `YYYY-MM-DD` válida, ou `false`. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = isoDay(v)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

/**
 * Vencido, a vencer em até 30 dias, ou nada. Item sem validade: nada, sem
 * aviso nenhum (E13a). `today` é `YYYY-MM-DD` no fuso de quem vê.
 */
export function expiryState(expiresOn: string | null, today: string, days = EXPIRY_WARNING_DAYS): ExpiryState {
  if (!expiresOn || !isIsoDate(expiresOn) || !isIsoDate(today)) return null
  const diff = Math.round((isoDay(expiresOn) - isoDay(today)) / DAY_MS)
  if (diff < 0) return 'expired'
  if (diff <= days) return 'soon'
  return null
}
