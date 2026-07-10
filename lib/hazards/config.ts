// ─── Centralized hazard thresholds ────────────────────────────────────────────
// Every magic number the hazard system relies on lives here, never scattered
// through the providers. Tuning risk behavior = editing this file.

export const HAZARD_CONFIG = {
  // Network freshness / reliability thresholds (section 7).
  health: {
    requestTimeoutMs: 8_000,
    // Data older than this (for a successful channel) flips it to `degraded`.
    maxDataAgeSeconds: 900, // 15 min
    // Consecutive failures before a configured channel is treated as offline.
    failuresBeforeOffline: 3,
    // Consecutive failures before a channel is degraded.
    failuresBeforeDegraded: 1,
  },

  // Rain nowcast detection (section B).
  precipitation: {
    lookAheadMinutes: 60,
    minimumProbability: 0.4, // 0-1
    minimumIntensityMmH: 0.2, // mm/h considered "precipitation starting"
    lightMaxMmH: 2.5,
    moderateMaxMmH: 7.6, // > this is heavy
  },

  // Lightning distance rules (section H) — miles.
  lightning: {
    attentionMiles: 25,
    elevatedMiles: 15,
    stopActivityMiles: 10,
    immediateDangerMiles: 6,
    // Window used to decide the "approaching/receding" trend.
    trendWindowMinutes: 15,
  },

  // Earthquake relevance (section D) — magnitude × distance rules.
  earthquake: {
    // Moderate-or-greater nearby.
    nearbyRadiusMiles: 150,
    nearbyMinMagnitude: 4.0,
    // Significant regional.
    regionalRadiusMiles: 400,
    regionalMinMagnitude: 5.5,
    // Large with possible distant impact.
    distantMinMagnitude: 7.0,
    // Feeds queried from USGS (used by the provider).
    queryRadiusKm: 500,
    queryMinMagnitude: 2.5,
    queryWindowHours: 24,
  },
} as const

export type HazardConfig = typeof HAZARD_CONFIG
