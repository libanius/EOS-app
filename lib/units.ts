/**
 * Unidades de água — uma régua, um lugar (D-158 / D-159, PREP-T11).
 *
 * ANTES desta tarefa o EOS tinha CINCO cópias do número "3 litros por pessoa
 * por dia": `lib/household.ts`, `lib/simulation-debrief.ts`,
 * `components/world-v2/useWorldData.ts`, `components/world-v2/usePilotFacts.ts`
 * e mais duas multiplicações inline `3 * people` nas telas legacy. Cinco cópias
 * de um número que decide se a família tem ou não água é cinco chances de
 * divergirem — e elas já tinham divergido antes, em autonomia (ver o cabeçalho
 * de `autonomyDays`).
 *
 * E o número estava errado. A FEMA publica **1 galão por pessoa por dia**, e o
 * próprio EOS distribui o `FEMA_Emergency_Supply_List.pdf` no EDU. Três litros
 * são 79% disso: o app operava abaixo da régua que ele ensina.
 *
 * ── Armazenamento continua em LITROS ──────────────────────────────────────
 *
 * `resource_inventory.water_liters` guarda litros e continua guardando litros.
 * Gravar galão num campo chamado `_liters` seria a próxima linha da seção
 * "Critical Field Name Notes" do `docs/06-data-model.md` — a regra do D-158 é
 * que nenhum número mora em campo cujo nome contradiga a unidade. O campo só é
 * renomeado quando PREP-T04 trouxer `Holding.quantity` + `unit`, e aí a unidade
 * passa a ser dado, não convenção.
 *
 * Portanto: **litro é a unidade de ARMAZENAMENTO e de cálculo; galão é a
 * unidade de EXIBIÇÃO.** A conversão acontece na borda, nunca no meio.
 */

/** Galão americano. O britânico tem 4,546 L e não é o da FEMA. */
export const LITERS_PER_GALLON = 3.785411784

/** FEMA, `FEMA_Emergency_Supply_List.pdf`: 1 galão por pessoa por dia. */
export const WATER_GALLONS_PER_PERSON_DAY = 1

/**
 * A mesma régua em litros, porque o banco guarda litros.
 *
 * O nome diz a unidade de propósito (D-158). O antigo `WATER_PER_PERSON_DAY`
 * não dizia, e um número sem unidade no nome é um número esperando ser lido
 * errado.
 */
export const WATER_LITERS_PER_PERSON_DAY = WATER_GALLONS_PER_PERSON_DAY * LITERS_PER_GALLON

export function litersToGallons(liters: number): number {
  if (!Number.isFinite(liters)) return 0
  return liters / LITERS_PER_GALLON
}

export function gallonsToLiters(gallons: number): number {
  if (!Number.isFinite(gallons)) return 0
  return gallons * LITERS_PER_GALLON
}

/**
 * Galões para leitura humana.
 *
 * Uma casa decimal: o estoque de água não é uma medida de laboratório, e
 * "12,3 gal" carrega toda a precisão que a decisão exige. Duas casas dariam
 * falsa precisão a um número que a pessoa estimou olhando garrafões.
 */
export function formatGallons(liters: number, decimals = 1): string {
  return litersToGallons(liters).toFixed(decimals)
}

/**
 * Rótulo curto. Não é traduzido: `gal` é a abreviação usada tanto em pt-BR
 * quanto em en, e traduzir uma unidade padronizada só cria duas verdades.
 */
export const GALLON_SHORT = 'gal'
