/**
 * EOS — Circles (social resilience layer)
 *
 * Invite-code generation + Circle Strength Score algorithm.
 *
 * Scoring weights (per spec):
 *   Water        25
 *   Food         25
 *   Medical      20
 *   Comms        15
 *   Size         15
 *   --------- ------
 *   Total       100
 */

// ─── Invite code ─────────────────────────────────────────────────────────────
//  6-char alphanumeric, ambiguous chars removed (0,1,I,O) for readability.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(): string {
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length))
  }
  return out
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface PooledInventory {
  water_liters: number
  food_days: number
  medical_kit_count: number
  communication_device_count: number
  member_count: number
}

export interface CircleScore {
  total: number
  breakdown: {
    water: number
    food: number
    medical: number
    comms: number
    size: number
  }
  band: 'FRAGILE' | 'BASIC' | 'SOLID' | 'RESILIENT'
}

/**
 * Compute the Circle Strength Score (0..100).
 *
 * Targets (linear saturation):
 *   Water   : 1 gal/person/day × 3 days = ~11.4 L/person → full 25 at 11.4 L/person
 *   Food    : 3 days/person                              → full 25 at 3 days/person
 *   Medical : 1 kit per 3 members                        → full 20 at ratio >= 1/3
 *   Comms   : at least 1 comm device in the circle       → full 15 at count >= 1
 *   Size    : 3 members                                  → full 15 at size >= 3
 */
export function computeCircleScore(pooled: PooledInventory): CircleScore {
  const people = Math.max(1, pooled.member_count)

  const waterTarget = 11.4 * people
  const water = Math.min(25, (pooled.water_liters / waterTarget) * 25)

  const foodTarget = 3 * people
  const food = Math.min(25, (pooled.food_days / foodTarget) * 25)

  const medRatio = pooled.medical_kit_count / (people / 3)
  const medical = Math.min(20, medRatio * 20)

  const comms = pooled.communication_device_count >= 1 ? 15 : 0

  const size = Math.min(15, (people / 3) * 15)

  const total = Math.round(water + food + medical + comms + size)

  const band: CircleScore['band'] =
    total >= 80
      ? 'RESILIENT'
      : total >= 60
        ? 'SOLID'
        : total >= 35
          ? 'BASIC'
          : 'FRAGILE'

  return {
    total,
    breakdown: {
      water: Math.round(water),
      food: Math.round(food),
      medical: Math.round(medical),
      comms: Math.round(comms),
      size: Math.round(size),
    },
    band,
  }
}
