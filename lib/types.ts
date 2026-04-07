// ─── Urgency Levels ──────────────────────────────────────────────────────────
// Ordered LOW → MEDIUM → HIGH → CRITICAL.
// Urgency only escalates — it never decreases.

export enum UrgencyLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// ─── Scenario Types ───────────────────────────────────────────────────────────

export enum ScenarioType {
  FALLOUT = 'FALLOUT',
  EARTHQUAKE = 'EARTHQUAKE',
  FLOOD = 'FLOOD',
  FIRE = 'FIRE',
  GENERAL = 'GENERAL',
}

// ─── Rules Engine I/O ────────────────────────────────────────────────────────

/**
 * Input for the Rules Engine.
 * All numeric quantities must be non-negative.
 */
export interface RulesQuery {
  /** Total number of people (used to compute per-person ratios). Must be ≥ 1. */
  people_count: number

  /** Total available water in litres. */
  water_liters: number

  /** Estimated food supply in days. */
  food_days: number

  /** True if the household includes at least one infant. */
  has_infants: boolean

  /** True if any household member has ongoing medical conditions / medication needs. */
  has_medical_conditions: boolean

  /** Number of household members with limited mobility. */
  mobility_impaired: number

  /** Active emergency scenario type. Omit for a general assessment. */
  scenarioType?: ScenarioType

  /** True if at least one working communication device is available. */
  has_communication_device: boolean
}

/**
 * Output produced by RulesEngine.evaluate().
 */
export interface RulesResult {
  /** Highest urgency level reached after all rules are evaluated. */
  urgency: UrgencyLevel

  /**
   * Ordered list of rule strings that fired during evaluation.
   * Each entry is a descriptive label as specified per rule (e.g. "WATER_CRITICAL: reabastecimento imediato").
   */
  rulesApplied: string[]
}
