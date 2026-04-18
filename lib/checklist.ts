/**
 * EOS — Checklist utilities
 *
 * canonical_key: deterministic string used to deduplicate the same logical
 * item across different scenarios (e.g. "Água engarrafada 5L" and
 * "água engarrafada – 5 litros" should map to the same key so marking
 * one acquired reflects in all scenarios).
 */

const DIACRITICS = /[\u0300-\u036f]/g
const NON_ALPHANUM = /[^a-z0-9]+/g
const MULTI_DASH = /-{2,}/g
const EDGE_DASH = /^-+|-+$/g

/**
 * Normalise an item name into a canonical_key.
 *
 * Steps:
 *   1. Lowercase
 *   2. Remove diacritics (á→a, ç→c)
 *   3. Replace non-alphanumeric runs with "-"
 *   4. Collapse duplicate "-"
 *   5. Trim edge "-"
 *
 * Deterministic — pure function, safe to call everywhere.
 */
export function canonicalKey(rawName: string): string {
  if (!rawName) return ''
  return rawName
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUM, '-')
    .replace(MULTI_DASH, '-')
    .replace(EDGE_DASH, '')
}

// ─── Tiered checklist contract (LLM output) ──────────────────────────────────

export type ChecklistTier = 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'

export interface ChecklistItem {
  name: string
  tier: ChecklistTier
  quantity: number
  unit?: string | null
  canonical_key: string
}

export interface ChecklistGenerateInput {
  scenarioType: string
  scenarioDescription?: string
  familySize: number
  hasChildren: boolean
  hasInfants: boolean
  hasElderly: boolean
  hasMedicalConditions: boolean
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

export function buildChecklistPrompt(input: ChecklistGenerateInput): string {
  return `You are EOS — Emergency Operating System's preparedness planner.

Generate a TIERED preparedness checklist for this family.

FAMILY:
- Size: ${input.familySize}
- Has children (<18): ${input.hasChildren}
- Has infants (<2): ${input.hasInfants}
- Has elderly (>65): ${input.hasElderly}
- Has medical conditions: ${input.hasMedicalConditions}

SCENARIO:
- Type: ${input.scenarioType}
- Description: ${input.scenarioDescription ?? 'general preparedness'}

RULES:
1. Split items in three TIERS:
   - ESSENTIAL: minimum to survive 72h (FEMA/Red Cross baseline)
   - MODERATE: comfortable 7-day autonomy
   - EXCELLENT: 30-day resilience, comfort, redundancy
2. All quantities MUST be calculated for the family size (per-person x ${input.familySize}).
3. Always use SI units: litros, kg, unidades. Cash in USD.
4. Water baseline: 1 gallon (3.8 L) per person per day (Red Cross).
5. Infants require formula, diapers, wipes. Elders/medical: prescriptions + 7-day buffer.

OUTPUT - respond ONLY with valid JSON, no markdown fences:
{
  "items": [
    { "name": "Agua engarrafada", "tier": "ESSENTIAL", "quantity": 45, "unit": "litros" },
    { "name": "Barra de proteina", "tier": "MODERATE", "quantity": 20, "unit": "unidades" }
  ]
}

Generate 8-14 items per tier. No duplicates. Prioritise by survival impact.`
}

// ─── Readiness autonomy helper ───────────────────────────────────────────────

export function estimateAutonomyDays(
  items: Array<{ canonical_key: string; acquired: boolean; tier: ChecklistTier }>,
  familySize: number,
): { essential: number; moderate: number; excellent: number } {
  void familySize // reserved for future per-person scaling
  const pct = (tier: ChecklistTier) => {
    const subset = items.filter((i) => i.tier === tier)
    if (!subset.length) return 0
    const done = subset.filter((i) => i.acquired).length
    return done / subset.length
  }

  // Rough mapping: fully completed tier → days of autonomy
  return {
    essential: Math.round(pct('ESSENTIAL') * 3 * 10) / 10, // up to 3 days
    moderate: Math.round(pct('MODERATE') * 7 * 10) / 10, // up to 7 days
    excellent: Math.round(pct('EXCELLENT') * 30 * 10) / 10, // up to 30 days
  }
}
