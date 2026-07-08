// ─── Plan type ────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'family' | 'premium'

const PLAN_RANK: Record<Plan, number> = { free: 0, family: 1, premium: 2 }

// ─── Feature → minimum required plan ─────────────────────────────────────────
// Decision: D-021. The DB stores only `profiles.plan`.
// This file is the single source of truth for access control.

export const FEATURE_GATES = {
  // ── AI analysis ──────────────────────────────────────────────────────────
  analise_ia: 'free',              // Basic AI analysis — core product, always free
  analise_ia_monitoring: 'family', // AI with real-time monitoring context injected

  // ── Monitoring — tier breakdowns defined in D-025 ────────────────────────
  monitoring_weather: 'free',      // NWS severe weather + active alerts
  monitoring_earthquake: 'free',   // USGS earthquakes
  monitoring_aqi: 'family',        // AirNow air quality index
  monitoring_fire: 'family',       // NASA FIRMS satellite fire detection
  monitoring_fema: 'family',       // FEMA disaster declarations + active shelters
  monitoring_multilocal: 'family', // Monitor circle members' locations
  monitoring_cdc: 'premium',       // CDC disease / outbreak surveillance
  monitoring_fda: 'premium',       // FDA drug + food recalls
  monitoring_push: 'premium',      // Push notifications for critical alerts
  monitoring_history: 'premium',   // 30-day alert history

  // ── Circles ───────────────────────────────────────────────────────────────
  circulos: 'family',              // CREATE a circle (D-041: joining an invite is free)
  circulos_multiplos: 'premium',   // Belong to more than one circle simultaneously

  // ── Ficha & identity ──────────────────────────────────────────────────────
  qr_emergencia: 'family',         // Public QR page /ficha/[id] accessible by first responders
  exportar_ficha: 'premium',       // Export ficha as PDF
} as const satisfies Record<string, Plan>

export type Feature = keyof typeof FEATURE_GATES

// ─── Access check ─────────────────────────────────────────────────────────────

export function canAccess(feature: Feature, userPlan: Plan): boolean {
  const required = FEATURE_GATES[feature]
  return PLAN_RANK[userPlan] >= PLAN_RANK[required]
}

export function requiredPlan(feature: Feature): Plan {
  return FEATURE_GATES[feature]
}
