import { RulesQuery, RulesResult, ScenarioType, UrgencyLevel } from './types'

// ─── Urgency Escalation Helpers ──────────────────────────────────────────────

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  [UrgencyLevel.LOW]: 0,
  [UrgencyLevel.MEDIUM]: 1,
  [UrgencyLevel.HIGH]: 2,
  [UrgencyLevel.CRITICAL]: 3,
}

/**
 * Returns the higher of the two urgency levels.
 * Urgency only escalates — it never decreases.
 */
function escalate(current: UrgencyLevel, candidate: UrgencyLevel): UrgencyLevel {
  return URGENCY_RANK[candidate] > URGENCY_RANK[current] ? candidate : current
}

// ─── Rule Definitions ────────────────────────────────────────────────────────

type RuleFn = (
  query: RulesQuery,
  perPerson: { waterPerPerson: number },
) => { urgency: UrgencyLevel; message: string } | null

/**
 * Rule 1 — Water critically low (< 2 L/person).
 * Overrides Rule 2 when both thresholds are crossed.
 */
const ruleWaterCritical: RuleFn = (_query, { waterPerPerson }) => {
  if (waterPerPerson < 2) {
    return {
      urgency: UrgencyLevel.CRITICAL,
      message: 'WATER_CRITICAL: reabastecimento imediato',
    }
  }
  return null
}

/**
 * Rule 2 — Water low (< 4 L/person).
 * Skipped when Rule 1 already fired (water < 2 L/person).
 */
const ruleWaterLow: RuleFn = (_query, { waterPerPerson }) => {
  if (waterPerPerson >= 2 && waterPerPerson < 4) {
    return {
      urgency: UrgencyLevel.HIGH,
      message: `WATER_LOW: ${waterPerPerson.toFixed(2)} L/pessoa`,
    }
  }
  return null
}

/**
 * Rule 3 — Food supply critically low (< 1 day).
 */
const ruleFoodCritical: RuleFn = (query) => {
  if (query.food_days < 1) {
    return {
      urgency: UrgencyLevel.HIGH,
      message: 'FOOD_CRITICAL',
    }
  }
  return null
}

/**
 * Rule 4 — Food supply low (< 3 days).
 * Only fires when Rule 3 has not already fired (food_days ≥ 1).
 */
const ruleFoodLow: RuleFn = (query) => {
  if (query.food_days >= 1 && query.food_days < 3) {
    return {
      urgency: UrgencyLevel.MEDIUM,
      message: `FOOD_LOW: ${query.food_days.toFixed(1)} dias`,
    }
  }
  return null
}

/**
 * Rule 5 — Household has infants → nutritional priority override.
 * Does not escalate urgency on its own but records the override.
 */
const ruleInfants: RuleFn = (query) => {
  if (query.has_infants) {
    return {
      urgency: UrgencyLevel.LOW, // no autonomous escalation
      message: 'PRIORIDADE: Nutrição do bebê',
    }
  }
  return null
}

/**
 * Rule 6 — Household has members with medical conditions → medication continuity override.
 */
const ruleMedicalConditions: RuleFn = (query) => {
  if (query.has_medical_conditions) {
    return {
      urgency: UrgencyLevel.LOW, // no autonomous escalation
      message: 'PRIORIDADE: Continuidade de medicação',
    }
  }
  return null
}

/**
 * Rule 7 — At least one mobility-impaired person → accessible evacuation override.
 */
const ruleMobilityImpaired: RuleFn = (query) => {
  if (query.mobility_impaired > 0) {
    return {
      urgency: UrgencyLevel.LOW, // no autonomous escalation
      message: 'PRIORIDADE: Evacuação acessível',
    }
  }
  return null
}

/**
 * Rule 8 — Fallout scenario → mandatory shelter-in-place.
 */
const ruleScenarioFallout: RuleFn = (query) => {
  if (query.scenarioType === ScenarioType.FALLOUT) {
    return {
      urgency: UrgencyLevel.CRITICAL,
      message: 'FALLOUT: abrigo no local obrigatório',
    }
  }
  return null
}

/**
 * Rule 9 — Earthquake scenario → aftershock warning.
 */
const ruleScenarioEarthquake: RuleFn = (query) => {
  if (query.scenarioType === ScenarioType.EARTHQUAKE) {
    return {
      urgency: UrgencyLevel.HIGH,
      message: 'EARTHQUAKE: aviso de réplicas',
    }
  }
  return null
}

/**
 * Rule 10 — No communication device available.
 */
const ruleNoComms: RuleFn = (query) => {
  if (!query.has_communication_device) {
    return {
      urgency: UrgencyLevel.MEDIUM,
      message: 'SEM_COMMS',
    }
  }
  return null
}

// Evaluation order is deterministic and fixed.
const RULES: RuleFn[] = [
  ruleWaterCritical,      // Rule 1
  ruleWaterLow,           // Rule 2
  ruleFoodCritical,       // Rule 3
  ruleFoodLow,            // Rule 4
  ruleInfants,            // Rule 5
  ruleMedicalConditions,  // Rule 6
  ruleMobilityImpaired,   // Rule 7
  ruleScenarioFallout,    // Rule 8
  ruleScenarioEarthquake, // Rule 9
  ruleNoComms,            // Rule 10
]

// ─── Rules Engine ─────────────────────────────────────────────────────────────

export const RulesEngine = {
  /**
   * Evaluates all rules against the supplied query and returns a deterministic
   * RulesResult.
   *
   * - Urgency only escalates (LOW < MEDIUM < HIGH < CRITICAL).
   * - Every rule that fires appends a descriptive string to rulesApplied.
   * - The initial urgency level is LOW; the final level reflects the highest
   *   urgency encountered across all fired rules.
   *
   * @throws {RangeError} if people_count is less than 1.
   */
  evaluate(query: RulesQuery): RulesResult {
    if (query.people_count < 1) {
      throw new RangeError('people_count must be at least 1')
    }

    const waterPerPerson = query.water_liters / query.people_count
    const derived = { waterPerPerson }

    let urgency: UrgencyLevel = UrgencyLevel.LOW
    const rulesApplied: string[] = []

    for (const rule of RULES) {
      const result = rule(query, derived)
      if (result !== null) {
        urgency = escalate(urgency, result.urgency)
        rulesApplied.push(result.message)
      }
    }

    return { urgency, rulesApplied }
  },
}
