import { RulesEngine } from '../rules-engine'
import { UrgencyLevel, ScenarioType } from '../types'
import type { RulesQuery } from '../types'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** Cria uma RulesQuery com defaults seguros — sobrescreva só o que o teste precisa */
function makeQuery(overrides: Partial<RulesQuery> = {}): RulesQuery {
  return {
    people_count: 2,
    water_liters: 20,
    food_days: 7,
    has_infants: false,
    has_medical_conditions: false,
    mobility_impaired: 0,
    has_communication_device: true,
    ...overrides,
  }
}

// ─── Casos de teste ───────────────────────────────────────────────────────────

describe('RulesEngine', () => {
  // ── Caso 1 ────────────────────────────────────────────────────────────────
  describe('Caso 1 — água crítica', () => {
    it('dado 1 L total e 2 membros, quando avaliar, então urgência é CRITICAL e rulesApplied inclui "WATER_CRITICAL"', () => {
      // Dado
      const query = makeQuery({ water_liters: 1, people_count: 2 })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      expect(result.urgency).toBe(UrgencyLevel.CRITICAL)
      expect(result.rulesApplied.some((r) => r.includes('WATER_CRITICAL'))).toBe(true)
    })
  })

  // ── Caso 2 ────────────────────────────────────────────────────────────────
  describe('Caso 2 — água baixa', () => {
    it('dado 6 L total e 2 membros (3 L/pessoa), quando avaliar, então urgência é HIGH por água', () => {
      // Dado
      const query = makeQuery({ water_liters: 6, people_count: 2 })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      expect(result.urgency).toBe(UrgencyLevel.HIGH)
      expect(result.rulesApplied.some((r) => r.includes('WATER_LOW'))).toBe(true)
    })
  })

  // ── Caso 3 ────────────────────────────────────────────────────────────────
  describe('Caso 3 — água suficiente', () => {
    it('dado 20 L total e 2 membros (10 L/pessoa), quando avaliar, então urgência NÃO é CRITICAL por água', () => {
      // Dado
      const query = makeQuery({ water_liters: 20, people_count: 2 })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      expect(result.urgency).not.toBe(UrgencyLevel.CRITICAL)
      expect(result.rulesApplied.every((r) => !r.includes('WATER_CRITICAL'))).toBe(true)
    })
  })

  // ── Caso 4 ────────────────────────────────────────────────────────────────
  describe('Caso 4 — comida crítica', () => {
    it('dado food_days 0.5, quando avaliar, então urgência é HIGH e rulesApplied inclui "FOOD_CRITICAL"', () => {
      // Dado
      const query = makeQuery({ food_days: 0.5 })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      expect(result.urgency).toBe(UrgencyLevel.HIGH)
      expect(result.rulesApplied.some((r) => r.includes('FOOD_CRITICAL'))).toBe(true)
    })
  })

  // ── Caso 5 ────────────────────────────────────────────────────────────────
  describe('Caso 5 — bebês presentes', () => {
    it('dado has_infants true, quando avaliar, então priorityOverrides inclui texto sobre bebê', () => {
      // Dado
      const query = makeQuery({ has_infants: true })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então — a mensagem de regra deve mencionar nutrição/bebê
      const babymessage = result.rulesApplied.find(
        (r) => r.toLowerCase().includes('bebê') || r.toLowerCase().includes('bebe'),
      )
      expect(babymessage).toBeDefined()
    })
  })

  // ── Caso 6 ────────────────────────────────────────────────────────────────
  describe('Caso 6 — condições médicas', () => {
    it('dado has_medical_conditions true, quando avaliar, então rulesApplied inclui mensagem sobre medicação', () => {
      // Dado
      const query = makeQuery({ has_medical_conditions: true })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      const medMsg = result.rulesApplied.find((r) =>
        r.toLowerCase().includes('medica'),
      )
      expect(medMsg).toBeDefined()
    })
  })

  // ── Caso 7 ────────────────────────────────────────────────────────────────
  describe('Caso 7 — cenário FALLOUT', () => {
    it('dado scenarioType FALLOUT, quando avaliar, então urgência é CRITICAL independente dos recursos', () => {
      // Dado — recursos abundantes, mas cenário FALLOUT
      const query = makeQuery({
        water_liters: 100,
        food_days: 30,
        scenarioType: ScenarioType.FALLOUT,
      })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      expect(result.urgency).toBe(UrgencyLevel.CRITICAL)
    })
  })

  // ── Caso 8 ────────────────────────────────────────────────────────────────
  describe('Caso 8 — FALLOUT não pode ser downgraded', () => {
    it('dado FALLOUT + água OK, quando avaliar, então urgência permanece CRITICAL (nunca rebaixa)', () => {
      // Dado — água confortável (10 L/pessoa) + FALLOUT
      const query = makeQuery({
        water_liters: 20,
        people_count: 2,
        food_days: 10,
        scenarioType: ScenarioType.FALLOUT,
      })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      expect(result.urgency).toBe(UrgencyLevel.CRITICAL)
    })
  })

  // ── Caso 9 ────────────────────────────────────────────────────────────────
  describe('Caso 9 — múltiplas regras disparam', () => {
    it('dado água baixa (HIGH) e comida crítica (HIGH), quando avaliar, então urgência é o máximo das regras individuais', () => {
      // Dado — água 6 L / 2 pessoas = 3 L/pessoa → HIGH; food_days 0.5 → HIGH
      const query = makeQuery({ water_liters: 6, people_count: 2, food_days: 0.5 })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então — o máximo de {HIGH, HIGH} ainda é HIGH
      expect(result.urgency).toBe(UrgencyLevel.HIGH)
      expect(result.rulesApplied.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Caso 10 ───────────────────────────────────────────────────────────────
  describe('Caso 10 — WATER_CRITICAL + FALLOUT', () => {
    it('dado água crítica (1 L / 2 pessoas) e FALLOUT, quando avaliar, então urgência é CRITICAL e rulesApplied contém ambas as regras', () => {
      // Dado
      const query = makeQuery({
        water_liters: 1,
        people_count: 2,
        scenarioType: ScenarioType.FALLOUT,
      })

      // Quando
      const result = RulesEngine.evaluate(query)

      // Então
      expect(result.urgency).toBe(UrgencyLevel.CRITICAL)
      expect(result.rulesApplied.some((r) => r.includes('WATER_CRITICAL'))).toBe(true)
      expect(result.rulesApplied.some((r) => r.includes('FALLOUT'))).toBe(true)
    })
  })
})
