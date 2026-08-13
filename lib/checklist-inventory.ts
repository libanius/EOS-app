/**
 * Marcar item do checklist NÃO mexe no estoque da casa (D-156 / PREP-T11).
 *
 * ── O que existia antes ────────────────────────────────────────────────────
 *
 * `PreparednessPage` tinha um `getInventoryDelta()` que casava o
 * `canonical_key` do item por expressão regular e escrevia o resultado nos
 * escalares de `resource_inventory`, com um `Math.max` por cima:
 *
 *     nextInv.water_liters = Math.max(inv.water_liters, delta.water_liters)
 *
 * O `Math.max` impedia a redução — o estoque nunca ENCOLHIA. Mas ele não
 * impedia os dois problemas que realmente importam:
 *
 * 1. **Quantidade planejada virava quantidade medida.** Um item "Água 20 gal"
 *    marcado como adquirido definia o estoque da casa em 20, independentemente
 *    do que a família realmente tivesse guardado. O checklist diz o que é
 *    PRECISO; ele não sabe o que EXISTE.
 *
 * 2. **Água de mochila virava água de casa.** O item pertence a um `kit_type`,
 *    e a regra não olhava para isso. Um garrafão de 5 galões listado na Bug Out
 *    subia o estoque DA CASA para 5. D-156 decidiu o contrário: a autonomia da
 *    casa lê o que está EM CASA, e quem separa as duas coisas é a localização.
 *
 * Os dois são a mesma confusão de fundo: `Requirement` (o que deveria existir)
 * e `Holding` (o que existe) sendo tratados como um objeto só, com uma regex
 * fazendo a ponte. É o defeito S4 de `docs/37-preparedness-state.md`.
 *
 * ── O que vale agora ───────────────────────────────────────────────────────
 *
 * Marcar um item registra que ele foi ADQUIRIDO. Onde ele passa a existir —
 * casa, mochila, carro, fazenda — é uma questão de LOCALIZAÇÃO, e localização
 * ainda não existe no modelo: ela chega em PREP-T04 com `Holding`.
 *
 * Até lá, a resposta honesta é não escrever nada. Um número que o sistema não
 * pode saber é melhor vindo da pessoa que abriu o armário do que adivinhado a
 * partir de uma lista de compras. O estoque continua editável nos steppers da
 * própria tela.
 *
 * Este módulo existe para que a regra tenha um teste. Se alguém reintroduzir a
 * escrita automática, `checklist-inventory.test.ts` quebra — que é a única
 * forma de uma decisão sobreviver a quem não leu a decisão.
 */

export type InventoryScalars = {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
  cash_amount: number
}

export type ChecklistToggle = {
  canonical_key: string
  quantity: number
  unit: string | null
  /** GERAL, BUG_OUT, PESCA… ou uma procedência (EDU_CONTENT, PILOT_RECOMMENDATION). */
  kit_type: string
  acquired: boolean
}

/**
 * O estoque depois de marcar/desmarcar um item: **o mesmo estoque**.
 *
 * Devolve o objeto recebido, sem cópia, para que uma comparação por identidade
 * (`next === current`) sirva de prova em teste e para que a tela possa pular o
 * `save()` sem heurística.
 */
export function inventoryAfterChecklistToggle(
  current: InventoryScalars,
  _item: ChecklistToggle,
): InventoryScalars {
  return current
}

/**
 * Se marcar este item deveria disparar uma gravação de estoque.
 *
 * Sempre `false` enquanto `Holding`/`Location` não existirem (PREP-T04). Fica
 * como função, e não como constante, porque o dia em que a resposta passar a
 * depender do item — quando o kit e a localização forem dados de verdade — o
 * ponto de mudança já está isolado e testado.
 */
export function checklistToggleWritesInventory(_item: ChecklistToggle): boolean {
  return false
}
