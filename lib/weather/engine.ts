// Weather Intelligence Engine — pure rules engine, no I/O.
// All rules are data-driven and extensible: add a new entry to RULES to support a new activity.
// Rules read from WeatherSnapshot and return a fully formed WeatherRecommendation.

import type { ActivityId, Activity, ActivityCategory, WeatherSnapshot, WeatherRecommendation, RiskLevel, RecommendationFactor } from './types'

// ─── Activity registry ─────────────────────────────────────────────────────────

export const ACTIVITIES: Activity[] = [
  // Outdoor Recreation
  { id: 'hiking',           label: 'Hiking',            category: 'outdoor_recreation', icon: '🥾' },
  { id: 'camping',          label: 'Camping',           category: 'outdoor_recreation', icon: '⛺' },
  { id: 'fishing',          label: 'Fishing',           category: 'outdoor_recreation', icon: '🎣' },
  { id: 'hunting',          label: 'Hunting',           category: 'outdoor_recreation', icon: '🦌' },
  { id: 'running',          label: 'Running',           category: 'outdoor_recreation', icon: '🏃' },
  { id: 'cycling',          label: 'Cycling',           category: 'outdoor_recreation', icon: '🚴' },
  { id: 'outdoor_workout',  label: 'Outdoor Workout',   category: 'outdoor_recreation', icon: '💪' },
  { id: 'gardening',        label: 'Gardening',         category: 'outdoor_recreation', icon: '🌱' },
  { id: 'outdoor_cooking',  label: 'Outdoor Cooking',   category: 'outdoor_recreation', icon: '🔥' },
  { id: 'family_outdoor',   label: 'Family Outdoor Day',category: 'outdoor_recreation', icon: '👨‍👩‍👧' },
  // Water
  { id: 'boating',          label: 'Boating',           category: 'water', icon: '⛵' },
  { id: 'kayaking',         label: 'Kayaking',          category: 'water', icon: '🛶' },
  { id: 'surfing',          label: 'Surfing',           category: 'water', icon: '🏄' },
  // Air / Drone
  { id: 'drone_flying',     label: 'Drone Flying',      category: 'air_drone', icon: '🚁' },
  // Field Work
  { id: 'off_road',         label: 'Off-Road',          category: 'field_work', icon: '🚙' },
  { id: 'shooting_range',   label: 'Shooting Range',    category: 'field_work', icon: '🎯' },
  { id: 'outdoor_work',     label: 'Outdoor Work',      category: 'field_work', icon: '🪚' },
  { id: 'construction',     label: 'Construction',      category: 'field_work', icon: '🏗' },
  { id: 'painting_exterior',label: 'Exterior Painting', category: 'field_work', icon: '🖌' },
  { id: 'concrete_work',    label: 'Concrete Work',     category: 'field_work', icon: '🧱' },
  { id: 'pressure_washing', label: 'Pressure Washing',  category: 'field_work', icon: '💦' },
  { id: 'roof_work',        label: 'Roof Work',         category: 'field_work', icon: '🏠' },
  // Survival Prep
  { id: 'emergency_prep',   label: 'Emergency Prep',    category: 'survival_prep', icon: '🎒' },
  { id: 'bug_out',          label: 'Bug Out Planning',  category: 'survival_prep', icon: '🗺' },
  // Emergency Planning
  { id: 'storm_prep',       label: 'Storm Preparation', category: 'emergency_planning', icon: '🌪' },
  { id: 'flood_prep',       label: 'Flood Preparation', category: 'emergency_planning', icon: '🌊' },
  { id: 'wildfire_prep',    label: 'Wildfire Preparation',category: 'emergency_planning', icon: '🔥' },
  { id: 'cold_weather_prep',label: 'Cold Weather Prep', category: 'emergency_planning', icon: '🧊' },
  { id: 'heat_survival',    label: 'Heat Survival',     category: 'emergency_planning', icon: '🌡' },
  { id: 'power_outage_prep',label: 'Power Outage Prep', category: 'emergency_planning', icon: '⚡' },
]

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  outdoor_recreation: 'Outdoor Recreation',
  water:              'Water Activities',
  air_drone:          'Air / Drone',
  field_work:         'Field Work',
  survival_prep:      'Survival Preparedness',
  emergency_planning: 'Emergency Planning',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasThunderstorm(s: WeatherSnapshot): boolean {
  return s.alerts.some(a => a.type.includes('THUNDERSTORM') || a.type.includes('TORNADO')) ||
    s.current.weather_code >= 95
}

function hasSevereAlert(s: WeatherSnapshot): boolean {
  return s.alerts.some(a => a.severity === 'CRITICAL' || a.severity === 'HIGH')
}

// Find best consecutive window of `minHours` hours in next 24h satisfying predicate
function bestWindow(
  s: WeatherSnapshot,
  ok: (h: { precip_prob_pct: number; wind_gust_mph: number; uv_index: number; temp_f: number; weather_code: number }) => boolean,
  minHours = 2,
): string | undefined {
  const hours = s.hourly.slice(0, 24)
  let start = -1, bestStart = -1, bestLen = 0, run = 0
  for (let i = 0; i < hours.length; i++) {
    if (ok(hours[i])) {
      if (start < 0) start = i
      run++
      if (run >= minHours && run > bestLen) { bestStart = start; bestLen = run }
    } else { start = -1; run = 0 }
  }
  if (bestStart < 0) return undefined
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const from = s.hourly[bestStart]?.time_iso
  const to   = s.hourly[Math.min(bestStart + bestLen - 1, hours.length - 1)]?.time_iso
  if (!from || !to) return undefined
  return `Best window: ${fmt(from)} – ${fmt(to)}`
}

function f(label: string, value: string, is_concern: boolean): RecommendationFactor {
  return { label, value, is_concern }
}

function risk(level: RiskLevel, title: string, reason: string,
  extra: Partial<Omit<WeatherRecommendation, 'risk' | 'title' | 'reason' | 'activity_id' | 'activity_label'>> = {}
): Omit<WeatherRecommendation, 'activity_id' | 'activity_label'> {
  return { risk: level, title, reason, checklist: [], factors: [], ...extra }
}

// ─── Rules registry ────────────────────────────────────────────────────────────

type RuleFn = (s: WeatherSnapshot) => Omit<WeatherRecommendation, 'activity_id' | 'activity_label'>

const RULES: Record<ActivityId, RuleFn> = {

  hiking(s) {
    const { temp_f, feels_like_f, uv_index, wind_gust_mph, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const factors: RecommendationFactor[] = [
      f('Temperature', `${Math.round(temp_f)}°F (feels ${Math.round(feels_like_f)}°F)`, temp_f > 90 || temp_f < 32),
      f('UV Index', String(uv_index), uv_index >= 8),
      f('Wind Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 25),
      f('Rain Probability', `${precip_prob_pct}%`, precip_prob_pct > 40),
    ]
    if (thunder) return risk('critical', '⛈ Thunderstorm Active — Do Not Hike',
      'Active thunderstorm alert. Lightning on exposed trails is life-threatening.',
      { checklist: ['Shelter in place', 'Stay away from ridgelines and trees', 'Wait at least 30 min after last thunder'], factors })
    if (temp_f > 100 || feels_like_f > 103)
      return risk('critical', '🌡 Extreme Heat — Dangerous Conditions',
        `Heat index of ${Math.round(feels_like_f)}°F. Risk of heat stroke without shade and hydration.`,
        { checklist: ['Carry 1L water per hour', 'Hike only at dawn/dusk', 'Know heat stroke symptoms'], factors })
    if (temp_f < 20)
      return risk('high', '🧊 Hypothermia Risk — Extreme Cold',
        `${Math.round(temp_f)}°F with wind chill ${Math.round(feels_like_f)}°F.`,
        { checklist: ['Layered insulation essential', 'Wind-proof outer shell', 'Emergency bivy'], factors })
    if (uv_index >= 8 || temp_f > 90 || precip_prob_pct > 60)
      return risk('high', '⚠️ Adverse Conditions for Hiking',
        uv_index >= 8 ? `UV ${uv_index} — skin damage in < 15 min without SPF 30+.` : precip_prob_pct > 60 ? `${precip_prob_pct}% rain chance makes trails slippery.` : `${Math.round(temp_f)}°F — high exertion risk.`,
        { window: bestWindow(s, h => h.uv_index < 6 && h.temp_f < 85 && h.precip_prob_pct < 30), checklist: ['Sunscreen SPF 50', 'Electrolyte tabs', 'Trekking poles for wet trails', 'Rain jacket'], factors })
    if (precip_prob_pct > 30 || wind_gust_mph > 20)
      return risk('medium', '🌦 Moderate Conditions — Prepare Accordingly',
        `${precip_prob_pct}% rain / ${Math.round(wind_gust_mph)} mph gusts may affect comfort.`,
        { window: bestWindow(s, h => h.precip_prob_pct < 20 && h.wind_gust_mph < 20), checklist: ['Waterproof boots', 'Rain layer', 'Start early'], factors })
    return risk('low', '✅ Good Conditions for Hiking',
      `${Math.round(temp_f)}°F, UV ${uv_index}, light wind. ${precip_prob_pct}% rain chance.`,
      { window: bestWindow(s, h => h.uv_index < 7 && h.temp_f < 85), checklist: ['Sunscreen', '2L water', 'Trail map', 'First aid kit'], factors })
  },

  camping(s) {
    const { temp_f, wind_gust_mph, precip_prob_pct } = s.current
    const overnight = s.daily[0]?.temp_min_f ?? temp_f
    const thunder = hasThunderstorm(s)
    const factors: RecommendationFactor[] = [
      f('Overnight Low', `${Math.round(overnight)}°F`, overnight < 40),
      f('Rain Probability', `${precip_prob_pct}%`, precip_prob_pct > 50),
      f('Wind Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 30),
    ]
    if (thunder) return risk('critical', '⛈ Cancel or Shelter Immediately',
      'Thunderstorm alert. Tent poles attract lightning. Seek hard shelter.',
      { checklist: ['Move to vehicle or hard structure', 'Do not use metal poles', 'Monitor weather radar'], factors })
    if (overnight < 25)
      return risk('high', '🧊 Dangerous Overnight Temperature',
        `Low of ${Math.round(overnight)}°F — hypothermia risk in inadequate gear.`,
        { checklist: ['4-season sleeping bag required', 'Insulated pad (R-5+)', 'Warm base layers', 'Emergency heat packs'], factors })
    if (precip_prob_pct > 60 || wind_gust_mph > 35)
      return risk('high', '⚠️ Poor Camping Conditions',
        `${precip_prob_pct}% rain or ${Math.round(wind_gust_mph)} mph gusts can compromise shelter.`,
        { checklist: ['Footprint + rain fly', 'Guy lines staked deep', 'Dry bag for gear', 'Camp stove covered'], factors })
    if (overnight < 40 || precip_prob_pct > 30)
      return risk('medium', '🌦 Chilly/Wet — Plan for Comfort',
        `Low of ${Math.round(overnight)}°F with ${precip_prob_pct}% rain probability.`,
        { checklist: ['3-season sleeping bag', 'Tarp as backup', 'Dry clothes in pack'], factors })
    return risk('low', '✅ Favorable Camping Conditions',
      `Overnight low ${Math.round(overnight)}°F, ${precip_prob_pct}% rain. Looks good.`,
      { checklist: ['Check site regulations', 'Fire permit if applicable', 'Hang food bag'], factors })
  },

  fishing(s) {
    const { temp_f, wind_mph, precip_prob_pct, pressure_hpa } = s.current
    const thunder = hasThunderstorm(s)
    const pressureRising = s.hourly.length > 3 && (s.hourly[3]?.temp_f ?? 0) > 0 // proxy
    const factors: RecommendationFactor[] = [
      f('Temperature', `${Math.round(temp_f)}°F`, temp_f > 95 || temp_f < 25),
      f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 20),
      f('Rain Probability', `${precip_prob_pct}%`, precip_prob_pct > 70),
      f('Pressure', `${Math.round(pressure_hpa)} hPa`, false),
    ]
    if (thunder) return risk('critical', '⛈ Leave the Water Immediately',
      'Thunderstorm alert. Open water + fishing rod = extreme lightning risk.',
      { checklist: ['Clear water immediately', 'Do not shelter under trees', 'Seek hard structure'], factors })
    if (wind_mph > 20 || precip_prob_pct > 70)
      return risk('high', '⛵ Rough Conditions — Not Recommended',
        `${Math.round(wind_mph)} mph wind and ${precip_prob_pct}% rain chance.`,
        { checklist: ['Life jacket if on boat', 'Check 48h forecast instead'], factors })
    if (precip_prob_pct > 40)
      return risk('medium', '🌦 Fishable but Wet',
        'Rain likely. Fish often feed actively before fronts — early morning is prime.',
        { window: bestWindow(s, h => h.precip_prob_pct < 30 && h.wind_mph < 15), checklist: ['Waterproof gear', 'Polarized sunglasses', 'Check local regulations'], factors })
    return risk('low', '🎣 Good Fishing Window',
      `Stable pressure at ${Math.round(pressure_hpa)} hPa, ${Math.round(wind_mph)} mph breeze. Fish should be active.`,
      { window: bestWindow(s, h => h.precip_prob_pct < 20 && h.wind_mph < 12), checklist: ['License', 'Catch-and-release tools', 'Insect repellent'], factors })
  },

  hunting(s) {
    const { temp_f, wind_mph, precip_prob_pct, visibility_mi } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [
      f('Temperature', `${Math.round(temp_f)}°F`, temp_f > 85 || temp_f < 15),
      f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 15),
      f('Visibility', `${visibility_mi.toFixed(1)} mi`, visibility_mi < 1),
    ]
    if (thunder) return risk('critical', '⛈ Dangerous — Cancel Hunt', 'Thunderstorm. Firearm + open field = extreme risk.', { factors, checklist: ['Return to vehicle/shelter'] })
    if (visibility_mi < 0.5) return risk('high', '🌫 Low Visibility — Unsafe', `Visibility ${visibility_mi.toFixed(1)} mi.`, { factors, checklist: ['Hunter orange required', 'Confirm target identity'] })
    if (temp_f < 15) return risk('high', '🧊 Extreme Cold — Gear Check Critical', `${Math.round(temp_f)}°F.`, { factors, checklist: ['Insulated boots', 'Hand warmers', 'Hypothermia plan'] })
    if (wind_mph < 10 && temp_f < 60 && precip_prob_pct < 30)
      return risk('low', '✅ Excellent Hunting Conditions', 'Light wind, cool temp — animals are active.', { factors, checklist: ['Check regulations', 'Tag & license', 'Safety orange'] })
    return risk('medium', '🦌 Acceptable Conditions', `Wind ${Math.round(wind_mph)} mph may carry scent.`, { factors, checklist: ['Wind direction check', 'Scent control'] })
  },

  running(s) {
    const { temp_f, feels_like_f, uv_index, air_quality } = s
    const aqi = air_quality?.us_aqi ?? null
    const thunder = hasThunderstorm(s)
    const factors = [
      f('Feels Like', `${Math.round(feels_like_f)}°F`, feels_like_f > 90 || feels_like_f < 20),
      f('UV Index', String(uv_index), uv_index >= 8),
      f('AQI', aqi != null ? String(aqi) : 'N/A', (aqi ?? 0) > 100),
    ]
    if (thunder) return risk('critical', '⛈ Do Not Run Outdoors', 'Thunderstorm active.', { factors, checklist: ['Treadmill or wait'] })
    if (feels_like_f > 103) return risk('critical', '🌡 Heat Danger', `Feels like ${Math.round(feels_like_f)}°F. Heat exhaustion risk.`, { factors, checklist: ['Run indoors', 'Carry water', 'Know heat stroke signs'] })
    if ((aqi ?? 0) > 150) return risk('high', '😷 Unhealthy Air Quality', `AQI ${aqi} — harmful for all groups.`, { factors, checklist: ['Run indoors or skip', 'N95 if unavoidable'] })
    if (uv_index >= 8 || (aqi ?? 0) > 100)
      return risk('high', '⚠️ High UV or Moderate AQI', `UV ${uv_index}${aqi ? `, AQI ${aqi}` : ''}.`,
        { window: bestWindow(s, h => h.uv_index < 6), checklist: ['SPF 50', 'Route shaded roads', 'Hydrate +25%'], factors })
    if (feels_like_f > 85)
      return risk('medium', '🥵 Warm — Adjust Pace', `Feels like ${Math.round(feels_like_f)}°F.`,
        { window: bestWindow(s, h => h.temp_f < 75), checklist: ['Early morning run', 'Electrolytes', 'Short route'], factors })
    return risk('low', '✅ Great Running Conditions', `${Math.round(feels_like_f)}°F, UV ${uv_index}.`, { factors, checklist: ['Sunscreen', 'Water', 'Reflective gear if dusk'] })
  },

  cycling(s) {
    const { temp_f, wind_gust_mph, precip_prob_pct, visibility_mi } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [
      f('Wind Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 25),
      f('Rain Probability', `${precip_prob_pct}%`, precip_prob_pct > 40),
      f('Visibility', `${visibility_mi.toFixed(1)} mi`, visibility_mi < 2),
    ]
    if (thunder) return risk('critical', '⛈ Do Not Ride', 'Thunderstorm alert.', { factors, checklist: ['Shelter immediately', 'Avoid metal frame'] })
    if (wind_gust_mph > 35) return risk('high', '💨 Dangerous Cross-Winds', `${Math.round(wind_gust_mph)} mph gusts.`, { factors, checklist: ['Trainer ride instead', 'Avoid exposed roads'] })
    if (precip_prob_pct > 50 || wind_gust_mph > 25)
      return risk('medium', '🌦 Challenging Conditions', `${precip_prob_pct}% rain, ${Math.round(wind_gust_mph)} mph gusts.`,
        { window: bestWindow(s, h => h.precip_prob_pct < 20 && h.wind_gust_mph < 20), checklist: ['Fenders', 'Wet-weather braking caution', 'Bright lights'], factors })
    return risk('low', '✅ Good Cycling Conditions', `${Math.round(temp_f)}°F, manageable wind.`, { factors, checklist: ['Helmet', 'Sunglasses', 'Pump & spare tube'] })
  },

  outdoor_workout(s) {
    const { feels_like_f, uv_index } = s.current
    const aqi = s.air_quality?.us_aqi ?? null
    const thunder = hasThunderstorm(s)
    const factors = [f('Feels Like', `${Math.round(feels_like_f)}°F`, feels_like_f > 90 || feels_like_f < 32), f('UV', String(uv_index), uv_index >= 8), f('AQI', aqi != null ? String(aqi) : 'N/A', (aqi ?? 0) > 100)]
    if (thunder) return risk('critical', '⛈ Exercise Indoors', 'Thunderstorm.', { factors, checklist: ['Gym or home workout'] })
    if ((aqi ?? 0) > 150 || feels_like_f > 100) return risk('high', '⚠️ Health Risk Outdoors', `${(aqi ?? 0) > 150 ? `AQI ${aqi}` : `Feels like ${Math.round(feels_like_f)}°F`}.`, { factors, checklist: ['Move workout indoors'] })
    if (uv_index >= 8 || (aqi ?? 0) > 100) return risk('medium', '🌞 Limit Exposure', `UV ${uv_index}${aqi ? `, AQI ${aqi}` : ''}.`, { window: bestWindow(s, h => h.uv_index < 6), factors, checklist: ['Shaded area', 'Limit to 30 min', 'Hydrate'] })
    return risk('low', '✅ Good for Outdoor Training', `${Math.round(feels_like_f)}°F, UV ${uv_index}.`, { factors, checklist: ['Warm up properly', 'Water bottle'] })
  },

  gardening(s) {
    const { temp_f, precip_prob_pct, uv_index, wind_mph } = s.current
    const factors = [f('Temperature', `${Math.round(temp_f)}°F`, temp_f > 90 || temp_f < 35), f('Rain', `${precip_prob_pct}%`, precip_prob_pct > 60), f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 20)]
    if (temp_f < 32) return risk('high', '🧊 Frost Risk — Protect Plants', 'Below freezing. Tender plants at risk.', { factors, checklist: ['Cover tender plants', 'Drain irrigation lines', 'Move potted plants indoors'] })
    if (precip_prob_pct > 70) return risk('medium', '🌧 Rain Likely — Skip Seeding', `${precip_prob_pct}% rain chance.`, { factors, checklist: ['Good day for planning', 'Check drainage', 'Delay fertilizing'] })
    if (uv_index >= 8 || temp_f > 90) return risk('medium', '🌞 Work Early or Late', `UV ${uv_index}, ${Math.round(temp_f)}°F.`, { window: bestWindow(s, h => h.uv_index < 6 && h.temp_f < 85), factors, checklist: ['SPF 50', 'Wide-brim hat', 'Water every 20 min'] })
    return risk('low', '🌱 Good Gardening Day', `${Math.round(temp_f)}°F, ${precip_prob_pct}% rain.`, { factors, checklist: ['Check soil moisture', 'Gloves', 'Knee pad'] })
  },

  outdoor_cooking(s) {
    const { wind_mph, wind_gust_mph, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [f('Wind', `${Math.round(wind_mph)} mph gusts ${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 20), f('Rain', `${precip_prob_pct}%`, precip_prob_pct > 40)]
    if (thunder) return risk('critical', '⛈ No Open Fire — Storm Active', 'Thunderstorm + open flame = critical risk.', { factors, checklist: ['Move indoors', 'Extinguish all flames'] })
    if (wind_gust_mph > 30) return risk('high', '💨 Fire Hazard — High Winds', `Gusts ${Math.round(wind_gust_mph)} mph can spread embers.`, { factors, checklist: ['No open fire', 'Use enclosed grill only', 'Firebreak around pit'] })
    if (precip_prob_pct > 50) return risk('medium', '🌧 Rain May Disrupt Cooking', `${precip_prob_pct}% rain chance.`, { window: bestWindow(s, h => h.precip_prob_pct < 20), factors, checklist: ['Canopy or cover', 'Waterproof lighter', 'Dry wood storage'] })
    return risk('low', '🔥 Good BBQ Conditions', `Light wind, ${precip_prob_pct}% rain. Go for it.`, { factors, checklist: ['Fire extinguisher nearby', 'Thermometer', 'Check burn ban status'] })
  },

  family_outdoor(s) {
    const { temp_f, feels_like_f, uv_index, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const aqi = s.air_quality?.us_aqi ?? null
    const factors = [f('Feels Like', `${Math.round(feels_like_f)}°F`, feels_like_f > 88 || feels_like_f < 45), f('UV', String(uv_index), uv_index >= 6), f('Rain', `${precip_prob_pct}%`, precip_prob_pct > 30), f('AQI', aqi != null ? String(aqi) : 'N/A', (aqi ?? 0) > 100)]
    if (thunder) return risk('critical', '⛈ Stay Indoors', 'Thunderstorm active. Children especially at risk.', { factors, checklist: ['Indoor activities only', 'Monitor weather'] })
    if (feels_like_f > 95 || (aqi ?? 0) > 150) return risk('high', '⚠️ Not Suitable for Children', `${feels_like_f > 95 ? `Heat index ${Math.round(feels_like_f)}°F` : `AQI ${aqi}`}.`, { factors, checklist: ['AC environment', 'Shade + frequent water breaks if outside', 'Limit to 30 min max'] })
    if (uv_index >= 6 || precip_prob_pct > 40)
      return risk('medium', '☀️ Plan Around UV/Rain', `UV ${uv_index}, ${precip_prob_pct}% rain.`,
        { window: bestWindow(s, h => h.uv_index < 5 && h.precip_prob_pct < 20 && h.temp_f < 85), factors, checklist: ['Kids SPF 50+', 'Hats', 'Backup rain plan', 'Snacks + water'] })
    return risk('low', '✅ Great Family Outdoor Day', `${Math.round(temp_f)}°F, UV ${uv_index}. Enjoy.`, { factors, checklist: ['Sunscreen reapply every 2h', 'Water + snacks', 'First aid kit'] })
  },

  boating(s) {
    const { wind_mph, wind_gust_mph, precip_prob_pct, visibility_mi } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 20), f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 25), f('Visibility', `${visibility_mi.toFixed(1)} mi`, visibility_mi < 1), f('Rain', `${precip_prob_pct}%`, precip_prob_pct > 50)]
    if (thunder) return risk('critical', '⛈ Return to Dock Immediately', 'Thunderstorm. Water is most dangerous place during lightning.', { factors, checklist: ['30/30 rule: dock 30s after lightning', 'Life jackets on', 'File float plan'] })
    if (wind_gust_mph > 30 || visibility_mi < 0.5) return risk('high', '⛵ Dangerous Boating Conditions', `Gusts ${Math.round(wind_gust_mph)} mph / visibility ${visibility_mi.toFixed(1)} mi.`, { factors, checklist: ['Stay ashore', 'Check NOAA VHF channel 16', 'Monitor all alerts'] })
    if (wind_gust_mph > 20 || precip_prob_pct > 50)
      return risk('medium', '🌊 Choppy Conditions — Experienced Only', `${Math.round(wind_gust_mph)} mph gusts.`,
        { checklist: ['Life jackets mandatory', 'Float plan filed', 'Anchor capacity checked', 'VHF radio'], factors })
    return risk('low', '⛵ Good Boating Window', `${Math.round(wind_mph)} mph wind, ${visibility_mi.toFixed(1)} mi visibility.`, { factors, checklist: ['PFDs', 'Signal flares', 'Float plan', 'Check fuel'] })
  },

  kayaking(s) {
    const { wind_mph, wind_gust_mph, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 15), f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 20)]
    if (thunder) return risk('critical', '⛈ Exit Water Immediately', 'Thunderstorm. Paddle + open water = extreme risk.', { factors, checklist: ['Shore immediately', 'Crouch low if stranded'] })
    if (wind_gust_mph > 25) return risk('high', '💨 Too Windy for Safe Paddling', `Gusts ${Math.round(wind_gust_mph)} mph.`, { factors, checklist: ['Stay on shore', 'Flat water only if < 15 mph'] })
    if (wind_mph > 15 || precip_prob_pct > 50)
      return risk('medium', '🛶 Challenging Paddling Conditions', `${Math.round(wind_mph)} mph wind.`, { factors, checklist: ['PFD required', 'Wet suit if < 60°F water', 'Paddle float + bilge pump', 'Buddy system'] })
    return risk('low', '🛶 Favorable Paddling Conditions', `${Math.round(wind_mph)} mph wind, ${precip_prob_pct}% rain.`, { factors, checklist: ['PFD', 'Whistle', 'Float plan'] })
  },

  surfing(s) {
    const { wind_mph, wind_gust_mph, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 20), f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 25)]
    if (thunder) return risk('critical', '⛈ Exit Water Now', 'Thunderstorm + open ocean = extreme lightning risk.', { factors, checklist: ['Exit immediately', 'Wait 30 min after last thunder'] })
    if (wind_gust_mph > 30) return risk('high', '🌊 Dangerous Swell Conditions', `Gusts ${Math.round(wind_gust_mph)} mph.`, { factors, checklist: ['Rip current risk up', 'Lifeguard status', 'Experienced surfers only'] })
    return risk('low', '🏄 Check Local Swell Report', 'Wind OK — verify local wave height via Surfline or NOAA buoy.', { factors, checklist: ['Check swell height', 'Leash', 'Wax for temp', 'Buddy up'] })
  },

  drone_flying(s) {
    const { wind_mph, wind_gust_mph, visibility_mi, precip_prob_pct, cloud_cover_pct } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [
      f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 20),
      f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 20),
      f('Visibility', `${visibility_mi.toFixed(1)} mi`, visibility_mi < 3),
      f('Cloud Cover', `${cloud_cover_pct}%`, cloud_cover_pct > 85),
      f('Rain Probability', `${precip_prob_pct}%`, precip_prob_pct > 10),
    ]
    if (thunder || precip_prob_pct > 20) return risk('critical', '🚫 Do Not Fly — Rain/Storm',
      thunder ? 'Active thunderstorm. Drone is a lightning conductor.' : `${precip_prob_pct}% rain. Electronics damage risk.`,
      { factors, checklist: ['Ground drone', 'Check FAA TFR', 'Wait for clear window'] })
    if (wind_gust_mph > 25) return risk('critical', '💨 Gusts Exceed Safe Limit', `${Math.round(wind_gust_mph)} mph gusts exceed most drone specs (< 25 mph).`, { factors, checklist: ['Do not fly', 'Check manufacturer wind rating'] })
    if (wind_gust_mph > 20 || visibility_mi < 3) return risk('high', '⚠️ Marginal Flight Conditions', `Gusts ${Math.round(wind_gust_mph)} mph / visibility ${visibility_mi.toFixed(1)} mi.`, { factors, checklist: ['Stay in visual range', 'Low altitude flight only', 'RTH altitude set', 'FAA line-of-sight rules'] })
    if (wind_mph > 15) return risk('medium', '🌬 Windy — Monitor Battery Draw', `${Math.round(wind_mph)} mph. Higher power consumption, shorter flight time.`, { factors, checklist: ['Extra battery', 'Fly into wind on way out', 'Pre-flight home point'] })
    return risk('low', '✅ Excellent Flying Conditions', `Light wind, ${visibility_mi.toFixed(1)} mi visibility.`, { window: bestWindow(s, h => h.wind_gust_mph < 15 && h.precip_prob_pct < 10), factors, checklist: ['FAA registration', 'Check NOTAM', 'Pre-flight inspection', 'Battery charged'] })
  },

  off_road(s) {
    const { precip_prob_pct, temp_f } = s.current
    const rain24 = s.hourly.slice(0, 24).reduce((a, h) => a + h.precip_in, 0)
    const factors = [f('Rain 24h', `${rain24.toFixed(2)}"`, rain24 > 0.5), f('Temperature', `${Math.round(temp_f)}°F`, temp_f < 20)]
    if (rain24 > 1) return risk('high', '🌊 Trails May Be Flooded', `${rain24.toFixed(2)}" rain expected. Mud, wash-outs, creek crossings up.`, { factors, checklist: ['Check road conditions', 'High-clearance required', 'Recovery gear: tow strap, Hi-Lift jack', 'Never cross moving water'] })
    if (precip_prob_pct > 50) return risk('medium', '🌧 Muddy Conditions Likely', `${precip_prob_pct}% rain.`, { factors, checklist: ['4WD engaged', 'Tire pressure adjusted', 'Shovel + traction boards'] })
    return risk('low', '🚙 Favorable Off-Road Conditions', `Dry with ${precip_prob_pct}% rain chance.`, { factors, checklist: ['Full fuel', 'Recovery gear', 'Paper map', 'Tell someone your plan'] })
  },

  shooting_range(s) {
    const { visibility_mi, wind_mph, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [f('Visibility', `${visibility_mi.toFixed(1)} mi`, visibility_mi < 1), f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 20)]
    if (thunder) return risk('critical', '⛈ Close Range — Thunderstorm', 'Lightning on open range is lethal.', { factors, checklist: ['Cease fire', 'Clear range', 'Shelter in building'] })
    if (visibility_mi < 0.5) return risk('high', '🌫 Unsafe Visibility', `${visibility_mi.toFixed(1)} mi visibility. Target identification compromised.`, { factors, checklist: ['Range closed until clear', 'Safety first: never shoot at unknown target'] })
    if (wind_mph > 20) return risk('medium', '💨 Wind Affects Ballistics', `${Math.round(wind_mph)} mph. Hold adjustments required.`, { factors, checklist: ['Adjust holdover', 'Record wind calls', 'Spot impacts before proceeding'] })
    return risk('low', '🎯 Good Range Conditions', `${visibility_mi.toFixed(1)} mi visibility, ${Math.round(wind_mph)} mph wind.`, { factors, checklist: ['Eye/ear protection', 'Safe direction rule', 'Hydrate in heat'] })
  },

  outdoor_work(s) {
    const { temp_f, feels_like_f, uv_index, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const aqi = s.air_quality?.us_aqi ?? null
    const factors = [f('Feels Like', `${Math.round(feels_like_f)}°F`, feels_like_f > 95 || feels_like_f < 25), f('UV', String(uv_index), uv_index >= 8), f('AQI', aqi != null ? String(aqi) : 'N/A', (aqi ?? 0) > 150)]
    if (thunder) return risk('critical', '⛈ Stop All Outdoor Work', 'Thunderstorm. Metal tools and open fields attract lightning.', { factors, checklist: ['Shelter in building or vehicle', 'No tall equipment'] })
    if (feels_like_f > 103) return risk('critical', '🌡 Heat Emergency Risk', `Heat index ${Math.round(feels_like_f)}°F. OSHA heat illness thresholds exceeded.`, { factors, checklist: ['Water + shade every 30 min', 'Buddy system', 'Know heat stroke signs', 'Rotate workers indoors'] })
    if (uv_index >= 8 || feels_like_f > 90)
      return risk('high', '⚠️ High UV / Heat Load', `UV ${uv_index}, ${Math.round(feels_like_f)}°F.`,
        { window: bestWindow(s, h => h.uv_index < 6 && h.temp_f < 85), factors, checklist: ['UV-protective clothing', 'Work 6-10 AM / 4-7 PM', '1L water/hour minimum', 'Frequent shade breaks'] })
    if (precip_prob_pct > 50) return risk('medium', '🌧 Rain May Halt Work', `${precip_prob_pct}% rain chance.`, { window: bestWindow(s, h => h.precip_prob_pct < 20), factors, checklist: ['Stage work for dry window', 'Cover materials', 'Rain gear'] })
    return risk('low', '✅ Acceptable Work Conditions', `${Math.round(temp_f)}°F, UV ${uv_index}.`, { factors, checklist: ['Sunscreen', 'Hydrate', 'PPE per task'] })
  },

  construction(s) {
    const { temp_f, feels_like_f, wind_gust_mph, precip_prob_pct } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [f('Temperature', `${Math.round(temp_f)}°F`, temp_f > 95 || temp_f < 25), f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 30), f('Rain', `${precip_prob_pct}%`, precip_prob_pct > 40)]
    if (thunder) return risk('critical', '⛈ Cease Operations — Thunderstorm', 'All elevated and crane work must stop.', { factors, checklist: ['Lower crane boom', 'Scaffold cleared', 'All workers to shelter'] })
    if (wind_gust_mph > 35) return risk('critical', '💨 Crane / Scaffold Shutdown Threshold', `${Math.round(wind_gust_mph)} mph gusts exceed crane limits.`, { factors, checklist: ['No crane lifts', 'Secure loose materials', 'Scaffold inspected before resuming'] })
    if (feels_like_f > 100) return risk('high', '🌡 OSHA Heat Action Required', `Heat index ${Math.round(feels_like_f)}°F.`, { factors, checklist: ['Water + shade mandatory', 'Heat monitor on site', 'New worker acclimatization'] })
    if (precip_prob_pct > 50 || wind_gust_mph > 25)
      return risk('medium', '⚠️ Schedule Weather-Sensitive Tasks Carefully', `${precip_prob_pct}% rain, ${Math.round(wind_gust_mph)} mph gusts.`, { factors, checklist: ['Protect open concrete pours', 'No elevated work in wind', 'Tarp materials'] })
    return risk('low', '🏗 Favorable Construction Conditions', `${Math.round(temp_f)}°F, ${Math.round(wind_gust_mph)} mph gusts.`, { factors, checklist: ['Daily toolbox talk', 'PPE audit', 'Hydration station'] })
  },

  painting_exterior(s) {
    const { temp_f, humidity_pct, wind_gust_mph, precip_prob_pct } = s.current
    const rainNext6h = s.hourly.slice(0, 6).some(h => h.precip_prob_pct > 40)
    const factors = [
      f('Temperature', `${Math.round(temp_f)}°F`, temp_f < 50 || temp_f > 90),
      f('Humidity', `${humidity_pct}%`, humidity_pct > 75),
      f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 20),
      f('Rain Next 6h', rainNext6h ? 'Yes' : 'No', rainNext6h),
    ]
    if (rainNext6h || precip_prob_pct > 60) return risk('high', '🚫 Do Not Paint — Rain Coming', 'Paint won\'t cure if rain hits within 4h of application.', { factors, checklist: ['Check 24h window', 'Prime in dry weather first', 'Use porch if needed'] })
    if (temp_f < 50 || temp_f > 90 || humidity_pct > 80 || wind_gust_mph > 20)
      return risk('high', '⚠️ Paint Conditions Unacceptable',
        `Temp ${Math.round(temp_f)}°F / humidity ${humidity_pct}% / gusts ${Math.round(wind_gust_mph)} mph.`,
        { factors, checklist: ['Paint spec: 50–90°F, < 75% RH, < 20 mph', 'Check manufacturer data sheet'] })
    if (humidity_pct > 65 || wind_gust_mph > 12)
      return risk('medium', '🖌 Marginal — Monitor Conditions', `Humidity ${humidity_pct}%, gusts ${Math.round(wind_gust_mph)} mph.`,
        { window: bestWindow(s, h => h.precip_prob_pct < 20 && h.wind_gust_mph < 15), factors, checklist: ['Apply thin coat', 'Dry time extended', 'No second coat until fully cured'] })
    return risk('low', '✅ Excellent Painting Conditions', `${Math.round(temp_f)}°F, ${humidity_pct}% RH, ${Math.round(wind_gust_mph)} mph gusts.`, { window: bestWindow(s, h => h.temp_f >= 55 && h.temp_f <= 85 && h.humidity_pct < 70 && h.precip_prob_pct < 20 && h.wind_gust_mph < 15), factors, checklist: ['Prime first if bare wood', 'Two coats with full dry time', 'Mask edges'] })
  },

  concrete_work(s) {
    const { temp_f, humidity_pct, wind_mph, precip_prob_pct } = s.current
    const rainSoon = s.hourly.slice(0, 8).some(h => h.precip_prob_pct > 50)
    const cold = temp_f < 40, hot = temp_f > 90
    const factors = [
      f('Temperature', `${Math.round(temp_f)}°F`, cold || hot),
      f('Humidity', `${humidity_pct}%`, humidity_pct > 85),
      f('Wind', `${Math.round(wind_mph)} mph`, wind_mph > 15),
      f('Rain within 8h', rainSoon ? 'Yes' : 'No', rainSoon),
    ]
    if (rainSoon) return risk('critical', '🚫 Rain Will Ruin Pour', 'Water before cure = weak, honeycombed concrete.', { factors, checklist: ['Delay pour', 'Have plastic sheeting ready', 'Check 24h window'] })
    if (cold) return risk('high', '🧊 Cold Pour Risk — Freeze Damage', `${Math.round(temp_f)}°F. Concrete doesn't cure below 40°F.`, { factors, checklist: ['Cold-weather admixture', 'Blanket curing', 'Heated enclosure for large pours'] })
    if (hot && wind_mph > 15) return risk('high', '🌞 Rapid Evaporation Risk', 'Concrete surface dries faster than it cures — cracking.', { factors, checklist: ['Evaporation retarder', 'Moist cure immediately', 'Work before 10 AM'] })
    if (humidity_pct > 85 || precip_prob_pct > 30)
      return risk('medium', '💧 Moisture Risk', `${humidity_pct}% humidity, ${precip_prob_pct}% rain.`, { factors, checklist: ['Plastic sheeting on standby', 'Avoid finishing in rain', 'Bleed water check'] })
    return risk('low', '🧱 Good Concrete Pour Conditions', `${Math.round(temp_f)}°F, ${humidity_pct}% RH, light wind.`, { factors, checklist: ['Mix ratio checked', 'Form work prepped', 'Curing compound ready', 'No rain < 24h'] })
  },

  pressure_washing(s) {
    const { temp_f, wind_gust_mph, precip_prob_pct } = s.current
    const factors = [f('Temperature', `${Math.round(temp_f)}°F`, temp_f < 40), f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 25), f('Rain', `${precip_prob_pct}%`, precip_prob_pct > 50)]
    if (temp_f < 32) return risk('high', '🧊 Freeze Risk to Equipment', 'Water in pump may freeze and crack.', { factors, checklist: ['Drain pump after use', 'Store indoors', 'Anti-freeze additive'] })
    if (precip_prob_pct > 60) return risk('medium', '🌧 Surface Won\'t Dry Properly', `${precip_prob_pct}% rain. Surfaces need drying time after washing.`, { window: bestWindow(s, h => h.precip_prob_pct < 20 && h.wind_gust_mph < 20), factors, checklist: ['Wait for dry window', 'Dry time needed for sealing after wash'] })
    return risk('low', '💦 Good Pressure Washing Window', `${Math.round(temp_f)}°F, ${precip_prob_pct}% rain.`, { window: bestWindow(s, h => h.precip_prob_pct < 20 && h.wind_gust_mph < 20), factors, checklist: ['Eye protection', 'Slip hazard on wet surfaces', 'Seal if follow-up planned'] })
  },

  roof_work(s) {
    const { temp_f, wind_gust_mph, precip_prob_pct, visibility_mi } = s.current
    const thunder = hasThunderstorm(s)
    const factors = [
      f('Wind Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 20),
      f('Rain', `${precip_prob_pct}%`, precip_prob_pct > 30),
      f('Temperature', `${Math.round(temp_f)}°F`, temp_f > 95),
      f('Visibility', `${visibility_mi.toFixed(1)} mi`, visibility_mi < 1),
    ]
    if (thunder) return risk('critical', '⛈ No Roof Work — Lightning Risk', 'Highest point + storm = fatal risk.', { factors, checklist: ['Descend immediately', 'Shelter in building'] })
    if (wind_gust_mph > 25 || precip_prob_pct > 40) return risk('critical', '🚫 Unsafe Roof Conditions', `Gusts ${Math.round(wind_gust_mph)} mph, ${precip_prob_pct}% rain. Fall risk.`, { factors, checklist: ['No work above 6 ft in these conditions', 'OSHA: < 25 mph for most roof work'] })
    if (temp_f > 90 || wind_gust_mph > 15)
      return risk('high', '⚠️ Elevated Risk on Roof', `${Math.round(temp_f)}°F / ${Math.round(wind_gust_mph)} mph gusts.`, { window: bestWindow(s, h => h.temp_f < 85 && h.wind_gust_mph < 15 && h.precip_prob_pct < 20), factors, checklist: ['Fall harness required', 'Work early morning', 'Hydration + buddy on ground', 'Hot shingles = burn risk > 90°F'] })
    return risk('low', '✅ Acceptable Roof Conditions', `${Math.round(temp_f)}°F, gusts ${Math.round(wind_gust_mph)} mph.`, { factors, checklist: ['Safety harness', 'Non-slip boots', 'Clear debris from roof', '2-person crew'] })
  },

  emergency_prep(s) {
    const severe = hasSevereAlert(s)
    const thunder = hasThunderstorm(s)
    const rain48 = s.daily.slice(0, 2).reduce((a, d) => a + d.precip_sum_in, 0)
    const factors = [f('Active Alerts', String(s.alerts.length), severe), f('Rain 48h', `${rain48.toFixed(2)}"`, rain48 > 1)]
    if (thunder || severe) return risk('high', '🚨 Preparedness Action Required', `${s.alerts.length} active alert(s). Review your emergency kit now.`, { factors, checklist: ['72h food + water confirmed', 'Phone charged', 'Emergency contacts updated', 'Documents in go-bag', 'Fuel > half tank'] })
    return risk('medium', '📋 Good Time to Prep', 'No active alerts — ideal window to check and restock supplies.', { factors, checklist: ['Rotate food stock (check dates)', 'Test flashlights + radio', 'Review family meeting point', 'First aid kit complete?', 'Cash on hand'] })
  },

  bug_out(s) {
    const severe = hasSevereAlert(s)
    const rain48 = s.daily.slice(0, 2).reduce((a, d) => a + d.precip_sum_in, 0)
    const { wind_gust_mph, visibility_mi } = s.current
    const factors = [f('Active Alerts', String(s.alerts.length), severe), f('Rain 48h', `${rain48.toFixed(2)}"`, rain48 > 1), f('Visibility', `${visibility_mi.toFixed(1)} mi`, visibility_mi < 2), f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 30)]
    if (severe && rain48 > 1) return risk('critical', '🗺 Bug Out Conditions Active', `Severe alerts + ${rain48.toFixed(2)}" rain may flood routes.`, { factors, checklist: ['Primary + secondary route planned', 'Flood-prone roads identified', 'BOB fully packed', 'Meeting point confirmed', 'Fuel full'] })
    if (severe || rain48 > 0.5) return risk('high', '⚠️ Review Bug Out Routes', 'Potential route disruptions from weather.', { factors, checklist: ['Check road closures', 'Paper maps + offline GPS', '72h provisions in vehicle', 'Comms plan'] })
    return risk('low', '✅ Routes Clear — Good Prep Time', 'No immediate threats. Ideal for route planning and rehearsal.', { factors, checklist: ['Drive primary routes', 'Cache verification', 'Vehicle maintenance', 'Communication check'] })
  },

  storm_prep(s) {
    const severe = hasSevereAlert(s)
    const { wind_gust_mph } = s.current
    const factors = [f('Max Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 40), f('Severe Alerts', String(s.alerts.filter(a => a.severity === 'CRITICAL').length), severe)]
    if (severe && wind_gust_mph > 50) return risk('critical', '🌪 Storm Imminent — Shelter Now', 'Critical alerts active. Preparation window may be closing.', { factors, checklist: ['Interior room away from windows', 'Emergency kit accessible', 'Unplug electronics', 'Fill bathtub with water', 'Phone + battery bank charged'] })
    if (severe || wind_gust_mph > 35) return risk('high', '⚠️ Storm Approaching — Act Now', `${Math.round(wind_gust_mph)} mph gusts and ${s.alerts.length} alert(s).`, { factors, checklist: ['Board/shutter windows', 'Bring in outdoor furniture', 'Generator fueled', '7-day water supply', 'Tree limbs trimmed'] })
    return risk('medium', '📋 Storm Prep — Use This Window', 'No immediate threat but conditions could change.', { factors, checklist: ['Inspect roof and gutters', 'Emergency kit inventoried', 'NOAA radio programmed', 'Neighbors notified'] })
  },

  flood_prep(s) {
    const rain48 = s.daily.slice(0, 2).reduce((a, d) => a + d.precip_sum_in, 0)
    const floodAlert = s.alerts.some(a => a.type.includes('FLOOD'))
    const factors = [f('Rain 48h', `${rain48.toFixed(2)}"`, rain48 > 1), f('Flood Alert', floodAlert ? 'Active' : 'None', floodAlert)]
    if (floodAlert || rain48 > 2) return risk('critical', '🌊 Flood Risk — Move Valuables Now', `${floodAlert ? 'Flood alert active.' : ''} ${rain48.toFixed(2)}" expected.`, { factors, checklist: ['Sandbags at doors/garage', 'Electrical panels elevated', 'Car moved to high ground', 'Important documents in waterproof bag', 'Never drive through flooded road'] })
    if (rain48 > 0.75) return risk('high', '💧 Heavy Rain Prep Needed', `${rain48.toFixed(2)}" rain forecast.`, { factors, checklist: ['Check sump pump', 'Clear storm drains', 'Basement dry goods elevated', 'Emergency contacts ready'] })
    return risk('medium', '🌧 Monitor Conditions', `${rain48.toFixed(2)}" rain in next 48h.`, { factors, checklist: ['Know your flood zone', 'Sandbags location noted', 'Sump pump tested'] })
  },

  wildfire_prep(s) {
    const { humidity_pct, wind_gust_mph, temp_f } = s.current
    const fireAlert = s.alerts.some(a => a.type.includes('FIRE') || a.type.includes('RED_FLAG'))
    const highRisk = humidity_pct < 20 && wind_gust_mph > 20 && temp_f > 80
    const factors = [f('Humidity', `${humidity_pct}%`, humidity_pct < 25), f('Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 20), f('Fire Alert', fireAlert ? 'Active' : 'None', fireAlert), f('Temperature', `${Math.round(temp_f)}°F`, temp_f > 85)]
    if (fireAlert || highRisk) return risk('critical', '🔥 High Fire Danger — Prepare to Evacuate', `${fireAlert ? 'Fire/Red Flag alert active.' : `${humidity_pct}% humidity + ${Math.round(wind_gust_mph)} mph gusts.`}`, { factors, checklist: ['Go-bag packed', 'Evacuation route confirmed', 'Defensible space cleared', 'Power off to house if leaving', 'Pets ready to go', 'Embers can travel 1 mile — remove combustibles from home exterior'] })
    if (humidity_pct < 30 || wind_gust_mph > 15) return risk('high', '⚠️ Elevated Fire Conditions', `${humidity_pct}% RH, ${Math.round(wind_gust_mph)} mph gusts.`, { factors, checklist: ['No burning', 'Clear vegetation 30 ft from home', 'Check local burn bans', 'Monitor local fire scanner'] })
    return risk('medium', '🌿 Moderate — Maintain Readiness', 'Conditions could shift quickly with wind.', { factors, checklist: ['Defensible space maintained', 'Go-bag semi-ready', 'Emergency alerts enabled on phone'] })
  },

  cold_weather_prep(s) {
    const { temp_f, feels_like_f } = s.current
    const overnight = s.daily[0]?.temp_min_f ?? temp_f
    const factors = [f('Temperature', `${Math.round(temp_f)}°F`, temp_f < 32), f('Wind Chill', `${Math.round(feels_like_f)}°F`, feels_like_f < 20), f('Overnight Low', `${Math.round(overnight)}°F`, overnight < 25)]
    if (feels_like_f < 0 || overnight < 15) return risk('critical', '🧊 Extreme Cold — Immediate Action', `Wind chill ${Math.round(feels_like_f)}°F. Frostbite in < 30 min on exposed skin.`, { factors, checklist: ['Pipes insulated / dripping', 'No outdoor pets', 'Check on elderly neighbors', 'Generator / heat backup ready', 'Carbon monoxide detector if heating indoors'] })
    if (temp_f < 32 || overnight < 28) return risk('high', '❄️ Freeze Warning', `${Math.round(temp_f)}°F / low ${Math.round(overnight)}°F.`, { factors, checklist: ['Insulate exposed pipes', 'Drip faucets', 'Protect plants', 'Road ice likely — chains/4WD'] })
    if (temp_f < 45) return risk('medium', '🌬 Cold Prep Advisable', `${Math.round(temp_f)}°F. Layer up.`, { factors, checklist: ['Extra blankets', 'Fuel/firewood stock', 'Warm foods and hot drinks', 'Vehicle antifreeze checked'] })
    return risk('low', '📋 Mild Cold — Routine Prep', `${Math.round(temp_f)}°F overnight.`, { factors, checklist: ['Light jacket', 'Check forecast trend', 'Heating system serviced?'] })
  },

  heat_survival(s) {
    const { temp_f, feels_like_f, humidity_pct, uv_index } = s.current
    const factors = [f('Heat Index', `${Math.round(feels_like_f)}°F`, feels_like_f > 90), f('Humidity', `${humidity_pct}%`, humidity_pct > 70), f('UV', String(uv_index), uv_index >= 9)]
    if (feels_like_f > 103) return risk('critical', '🌡 Extreme Heat Emergency', `Heat index ${Math.round(feels_like_f)}°F. Heat stroke risk within minutes of exertion.`, { factors, checklist: ['Seek AC immediately', 'Water + electrolytes every 15 min', 'Mist + fan', 'Never leave anyone in car', 'Check on elderly/infants/pets', 'Know heat stroke signs: hot dry skin, confusion'] })
    if (feels_like_f > 90 || uv_index >= 9) return risk('high', '🥵 Dangerous Heat', `Feels like ${Math.round(feels_like_f)}°F, UV ${uv_index}.`, { window: bestWindow(s, h => h.temp_f < 85), factors, checklist: ['SPF 50+ every 2h', 'Avoid 10 AM–4 PM outdoors', 'Light/loose clothing', 'Cool water immersion if needed'] })
    if (temp_f > 85) return risk('medium', '☀️ Warm — Stay Hydrated', `${Math.round(temp_f)}°F.`, { factors, checklist: ['8+ glasses water', 'Electrolytes for exertion', 'Shade breaks', 'Monitor children/elderly'] })
    return risk('low', '✅ Comfortable Temperature', `${Math.round(temp_f)}°F.`, { factors, checklist: ['Normal hydration', 'Sunscreen'] })
  },

  power_outage_prep(s) {
    const severe = hasSevereAlert(s)
    const { wind_gust_mph } = s.current
    const factors = [f('Severe Alerts', String(s.alerts.length), severe), f('Max Gusts', `${Math.round(wind_gust_mph)} mph`, wind_gust_mph > 40)]
    if (severe && wind_gust_mph > 50) return risk('critical', '⚡ Outage Imminent — Last Call to Prep', 'Severe storm may down power lines. Window closing.', { factors, checklist: ['Charge all devices now', 'Generator fueled and tested', 'Freeze water in tupperware (cold reserve)', '72h water stored', 'Cash withdrawn', 'Medical devices backup power confirmed'] })
    if (severe || wind_gust_mph > 35) return risk('high', '⚠️ Elevated Outage Risk', `${Math.round(wind_gust_mph)} mph gusts / severe alerts.`, { factors, checklist: ['Generator test run', 'Battery bank charged', 'Flashlights ready', 'Food cooler prepped', 'NOAA radio operational'] })
    return risk('medium', '📋 Routine Preparedness Check', 'No immediate threat.', { factors, checklist: ['Surge protectors checked', 'Emergency contact list current', 'Know utility outage number', 'Food/water 72h supply'] })
  },
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function generateRecommendations(
  snapshot: WeatherSnapshot,
  activeActivities: ActivityId[],
): WeatherRecommendation[] {
  return activeActivities.map(id => {
    const activity = ACTIVITIES.find(a => a.id === id)!
    const base = RULES[id]?.(snapshot)
    if (!base) return null
    return {
      ...base,
      activity_id: id,
      activity_label: `${activity.icon} ${activity.label}`,
    } satisfies WeatherRecommendation
  }).filter((r): r is WeatherRecommendation => r !== null)
    .sort((a, b) => {
      const rank: Record<RiskLevel, number> = { critical: 3, high: 2, medium: 1, low: 0 }
      return rank[b.risk] - rank[a.risk]
    })
}
