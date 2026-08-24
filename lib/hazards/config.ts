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

  // Automatic alerting (D-074) — the scheduled scan and what earns a push.
  alerting: {
    // How far a tropical cyclone can be and still be YOUR problem. Beyond this
    // it is news, not an alert — a family in Florida does not need a push about
    // a storm forming off Baja California. `basin_wide_tropical` opts back in.
    tropicalRelevanceMiles: 750,
    // US AQI band edges. Crossing UP into a band ≥ sensitive notifies; falling
    // back to ≤ moderate sends the all-clear.
    aqiSensitiveThreshold: 101,
    aqiUnhealthyThreshold: 151,
    aqiVeryUnhealthyThreshold: 201,
    aqiHazardousThreshold: 301,
    // Rain nowcast: only worth a push when it starts within this window.
    precipAlertWithinMinutes: 30,
    precipMinimumIntensity: 'moderate' as const,
    // A location is scanned only if the app saw it recently — stale coordinates
    // would alert people about a city they left weeks ago.
    locationMaxAgeDays: 7,
    // Bounds one run: distinct rounded locations per scan, and how many run at once.
    maxLocationsPerRun: 60,
    scanConcurrency: 4,
    // Coordinate rounding for grouping users into one upstream fetch (~1.1 km).
    scanKeyPrecision: 2,
  },
} as const

export type HazardConfig = typeof HAZARD_CONFIG
