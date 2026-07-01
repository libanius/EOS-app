// ─── Risk ─────────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

// ─── Weather data models ───────────────────────────────────────────────────────

export interface WeatherCurrent {
  temp_f: number
  feels_like_f: number
  humidity_pct: number
  dew_point_f: number
  pressure_hpa: number
  wind_mph: number
  wind_gust_mph: number
  wind_dir_deg: number
  wind_dir_label: string
  precip_in: number
  precip_prob_pct: number
  uv_index: number
  cloud_cover_pct: number
  visibility_mi: number
  weather_code: number
  condition: string
  condition_icon: string
  is_daytime: boolean
  sunrise_iso: string
  sunset_iso: string
}

export interface HourlyForecast {
  time_iso: string
  temp_f: number
  feels_like_f: number
  precip_prob_pct: number
  precip_in: number
  wind_mph: number
  wind_gust_mph: number
  uv_index: number
  cloud_cover_pct: number
  visibility_mi: number
  weather_code: number
  condition: string
  condition_icon: string
}

export interface DailyForecast {
  date: string
  temp_max_f: number
  temp_min_f: number
  precip_sum_in: number
  wind_max_mph: number
  gust_max_mph: number
  uv_max: number
  sunrise_iso: string
  sunset_iso: string
  weather_code: number
  condition: string
}

export interface AirQualitySnapshot {
  us_aqi: number | null
  pm25: number | null
  pm10: number | null
  ozone: number | null
  dust: number | null
  category: string
  source: string
}

export interface WeatherAlert {
  id: string
  source: string
  type: string
  severity: 'CRITICAL' | 'HIGH' | 'WATCH' | 'MODERATE'
  headline: string
  expires: string | null
  url: string | null
}

export interface EarthquakeEvent {
  magnitude: number
  place: string
  time_iso: string
  severity: 'CRITICAL' | 'HIGH' | 'WATCH' | 'MODERATE'
}

// WeatherSnapshot is the canonical aggregate returned by the API route.
// Add new provider outputs here as optional fields; never remove existing ones.
export interface WeatherSnapshot {
  location: { lat: number; lng: number }
  current: WeatherCurrent
  hourly: HourlyForecast[]   // next 24 h, 1-h resolution
  daily: DailyForecast[]     // next 3 days
  air_quality: AirQualitySnapshot | null
  alerts: WeatherAlert[]
  earthquakes: EarthquakeEvent[]
  // tides: TideSnapshot | null   — plug-in future provider here
  fetched_at: string
  providers: Record<string, 'ok' | 'unavailable' | 'error'>
}

// ─── Activities ────────────────────────────────────────────────────────────────

export type ActivityId =
  | 'hiking' | 'camping' | 'fishing' | 'hunting' | 'running' | 'cycling'
  | 'outdoor_workout' | 'gardening' | 'outdoor_cooking' | 'family_outdoor'
  | 'boating' | 'kayaking' | 'surfing'
  | 'drone_flying'
  | 'off_road' | 'shooting_range' | 'outdoor_work' | 'construction'
  | 'painting_exterior' | 'concrete_work' | 'pressure_washing' | 'roof_work'
  | 'emergency_prep' | 'bug_out'
  | 'storm_prep' | 'flood_prep' | 'wildfire_prep' | 'cold_weather_prep'
  | 'heat_survival' | 'power_outage_prep'

export type ActivityCategory =
  | 'outdoor_recreation' | 'water' | 'air_drone'
  | 'field_work' | 'survival_prep' | 'emergency_planning'

export interface Activity {
  id: ActivityId
  label: string
  category: ActivityCategory
  icon: string
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface RecommendationFactor {
  label: string
  value: string
  is_concern: boolean
}

export interface WeatherRecommendation {
  activity_id: ActivityId
  activity_label: string
  risk: RiskLevel
  title: string
  reason: string
  window?: string
  checklist: string[]
  factors: RecommendationFactor[]
}
