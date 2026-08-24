/**
 * Os dias que cada recurso da casa aguenta — PURO, sem acesso a banco.
 *
 * Mora fora de `lib/household.ts` por uma fronteira real: aquele arquivo
 * importa `createAdminClient` e `error-log`, que puxam `node:crypto`. Quando
 * `usePilotFacts` — que roda no CLIENTE — passou a importar de lá, o build
 * quebrou. Cálculo puro não mora ao lado de acesso a banco.
 */

import { WATER_LITERS_PER_PERSON_DAY } from '@/lib/units'

export const BATTERY_FULL_DAYS = 3
export const LITRES_PER_FUEL_DAY = 10

/** Só o que a conta precisa. Qualquer inventário da casa satisfaz esta forma. */
export type DaysInput = {
  waterLiters: number
  foodPersonDays: number
  fuelLiters: number
  batteryPercent: number
}

/**
 * Os dias de cada recurso, num lugar só (PILOT-T12 / D-174).
 *
 * Estas fórmulas existiam em `usePilotFacts`, em `useWorldData` e aqui — a
 * quinta duplicação de constante desta frente, e a que causou o defeito mais
 * grave: o Pilot afirmando "sua autonomia está em zero" enquanto o painel
 * mostrava 2,7 dias.
 *
 * `null` quando a casa é desconhecida. **Zero não é ausência de informação** —
 * zero é um fato, e o pior possível. Foi exatamente essa confusão que fez o
 * prompt mandar `Autonomia 0.0 dias` para o modelo, que obedeceu.
 */
export type HouseholdDays = {
  water: number | null
  food: number | null
  power: number | null
  fuel: number | null
  autonomy: number | null
}

export function householdDays(
  inv: DaysInput | null,
  size: number,
  known: boolean,
): HouseholdDays {
  if (!known || !inv || size <= 0) {
    return { water: null, food: null, power: null, fuel: null, autonomy: null }
  }
  const water = inv.waterLiters / (WATER_LITERS_PER_PERSON_DAY * size)
  const food = inv.foodPersonDays / size
  return {
    water,
    food,
    power: (inv.batteryPercent / 100) * BATTERY_FULL_DAYS,
    fuel: inv.fuelLiters / LITRES_PER_FUEL_DAY,
    // Autonomia é SOBREVIVÊNCIA: água e comida (D-129).
    autonomy: Math.max(0, Math.min(water, food)),
  }
}

