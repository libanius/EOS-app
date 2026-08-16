/**
 * Simulation engine (D-067 / doc 19).
 *
 * "Mesmos instrumentos, entradas injetadas." This module turns a scenario
 * configuration into a synthetic WeatherSnapshot, which RiskProvider serves in
 * place of the real one. Every screen keeps reading `useRisk()` and none of them
 * needs to know a simulation exists — exactly like the instruments in a flight
 * simulator.
 *
 * SAFETY (doc 19 §5): this module never persists. A simulation lives in memory
 * only, so reloading the app always returns to reality.
 */

import type { WeatherSnapshot, WeatherAlert, HourlyForecast } from './weather/types'

/*
 * `fallout` entrou em SIM-T12 / D-200, a pedido do dono.
 *
 * Ele já existia no vocabulário do app — `checklist.fallout` gera itens de
 * contaminação radioativa desde o começo — e faltava do lado do treino. Um
 * cenário que o checklist sabe preparar e o simulador não sabe encenar é meia
 * ferramenta.
 */
export type ThreatType = 'hurricane' | 'flood' | 'wildfire' | 'earthquake' | 'fallout' | 'winter' | 'blackout' | 'general'
export type Severity = 1 | 2 | 3 | 4 | 5
export type ReserveLevel = 'real' | 'half' | 'critical'

/**
 * Every data source can be flown live, faked, or FAILED.
 *
 * 'down' is the point of this panel. EOS exists for degraded operation, so the
 * drill that matters most is not "a storm is coming" but "a storm is coming and
 * the weather feed is dead". A flight simulator lets you fail an instrument;
 * so does this.
 */
export type SourceMode = 'live' | 'sim' | 'down'

export type SimulationSources = {
  weather: SourceMode
  alerts: SourceMode
  airQuality: SourceMode
  earthquakes: SourceMode
  radar: SourceMode
  shelters: SourceMode
  family: SourceMode
}

/** Values used when a source is set to 'sim'. Metric — converted on the way in. */
export type SimulationValues = {
  tempC: number
  windKmh: number
  gustKmh: number
  rainPct: number
  humidityPct: number
  uvIndex: number
  visibilityKm: number
  aqi: number
}

export type SimulationConfig = {
  threat: ThreatType
  /** 1 = nuisance, 5 = catastrophic. Maps to hurricane category when relevant. */
  severity: Severity
  /** Hours until impact. 0 = it is happening now. */
  arrivalHours: number
  /** Free-text description the user typed; feeds the Pilot briefing. */
  description: string
  /*
   * O nome e a direção do evento encenado (SIM-T12 / D-201).
   *
   * Opcionais porque cenário sem geografia (apagão, inverno) não encena nada, e
   * exigir nome ali seria pedir um dado que não vai a lugar nenhum.
   */
  eventName?: string
  /** De onde ele vem, em graus. 135 = sudeste, a rota clássica na Flórida. */
  eventBearingDeg?: number
  /**
   * Onde ele está, apontado no mapa (D-202). Quando existe, manda sobre o rumo.
   */
  eventLat?: number | null
  eventLng?: number | null
  powerOut: boolean
  networkDown: boolean
  roadsBlocked: boolean
  /** Someone in the household cannot move normally — changes every route call. */
  mobilityLimited: boolean
  medicalNeed: boolean
  reserves: ReserveLevel
  /**
   * Quanto o exercício deve durar, em minutos.
   *
   * Um treino sem hora para acabar vira estado permanente — e o EOS em simulação
   * mostra risco simulado, autonomia simulada e um Pilot falando de um evento
   * que não existe. Combinar a duração ANTES é o que separa um exercício de um
   * app com o dado errado.
   */
  durationMin: number
  sources: SimulationSources
  values: SimulationValues
}

export const DEFAULT_SIMULATION: SimulationConfig = {
  threat: 'hurricane',
  severity: 3,
  arrivalHours: 12,
  description: '',
  eventName: '',
  eventBearingDeg: 135,
  eventLat: null,
  eventLng: null,
  durationMin: 30,
  powerOut: false,
  networkDown: false,
  roadsBlocked: false,
  mobilityLimited: false,
  medicalNeed: false,
  reserves: 'real',
  // Default: the scenario drives the weather, everything else stays live. The
  // owner turns instruments off deliberately.
  sources: {
    weather: 'sim',
    alerts: 'sim',
    airQuality: 'live',
    earthquakes: 'live',
    radar: 'live',
    shelters: 'live',
    family: 'live',
  },
  values: {
    tempC: 28,
    windKmh: 45,
    gustKmh: 80,
    rainPct: 90,
    humidityPct: 88,
    uvIndex: 3,
    visibilityKm: 2,
    aqi: 60,
  },
}

export const SOURCE_LABELS: Array<{ key: keyof SimulationSources; pt: string; en: string }> = [
  { key: 'weather', pt: 'Clima', en: 'Weather' },
  { key: 'alerts', pt: 'Alertas oficiais', en: 'Official alerts' },
  { key: 'radar', pt: 'Radar de chuva', en: 'Rain radar' },
  { key: 'airQuality', pt: 'Qualidade do ar', en: 'Air quality' },
  { key: 'earthquakes', pt: 'Sismos', en: 'Earthquakes' },
  { key: 'shelters', pt: 'Abrigos oficiais', en: 'Official shelters' },
  { key: 'family', pt: 'Posição da família', en: 'Family position' },
]

/** True when the drill has deliberately taken this source off the air. */
export function isSourceDown(config: SimulationConfig | null, key: keyof SimulationSources): boolean {
  return config?.sources?.[key] === 'down'
}

export const THREATS: Array<{ id: ThreatType; pt: string; en: string }> = [
  { id: 'hurricane', pt: 'Furacão', en: 'Hurricane' },
  { id: 'flood', pt: 'Enchente', en: 'Flood' },
  { id: 'wildfire', pt: 'Incêndio', en: 'Wildfire' },
  { id: 'earthquake', pt: 'Terremoto', en: 'Earthquake' },
  { id: 'fallout', pt: 'Contaminação radioativa', en: 'Radioactive fallout' },
  { id: 'winter', pt: 'Tempestade de inverno', en: 'Winter storm' },
  { id: 'blackout', pt: 'Apagão prolongado', en: 'Extended blackout' },
  { id: 'general', pt: 'Geral', en: 'General' },
]

/** Wind that each severity implies, in mph — anchored on Saffir-Simpson. */
const WIND_BY_SEVERITY: Record<Severity, number> = { 1: 40, 2: 60, 3: 85, 4: 115, 5: 145 }

function threatHeadline(config: SimulationConfig, pt: boolean): string {
  const t = THREATS.find(x => x.id === config.threat)
  const name = pt ? t?.pt : t?.en
  const when =
    config.arrivalHours <= 0
      ? pt ? 'em curso' : 'in progress'
      : pt ? `chega em ${config.arrivalHours}h` : `arriving in ${config.arrivalHours}h`
  const cat = config.threat === 'hurricane' ? (pt ? ` categoria ${config.severity}` : ` category ${config.severity}`) : ''
  return `${name}${cat} — ${when}`
}

/** Severity 4–5, or anything already on top of you, is CRITICAL. */
function alertSeverity(config: SimulationConfig): WeatherAlert['severity'] {
  if (config.severity >= 4 || config.arrivalHours <= 0) return 'CRITICAL'
  if (config.severity === 3) return 'HIGH'
  if (config.severity === 2) return 'WATCH'
  return 'MODERATE'
}

/**
 * Build the synthetic snapshot. The real snapshot is passed in so untouched
 * fields (sunrise, air quality, the user's actual location) stay truthful —
 * a simulator injects the failure, it does not invent the whole world.
 */
export function synthesizeSnapshot(config: SimulationConfig, base: WeatherSnapshot | null, pt: boolean): WeatherSnapshot {
  const now = new Date()
  const wind = WIND_BY_SEVERITY[config.severity]
  const imminent = config.arrivalHours <= 6

  const v = config.values
  const toF = (c: number) => c * 9 / 5 + 32
  const toMph = (kmh: number) => kmh / 1.609
  const toMi = (km: number) => km / 1.609
  const weatherMode = config.sources?.weather ?? 'sim'

  // 'live' hands back the real reading untouched: the drill can put a hurricane
  // on the map while the thermometer still tells the truth.
  const current = weatherMode === 'live' && base?.current
    ? base.current
    : weatherMode === 'sim'
    ? ({
        ...(base?.current ?? {}),
        temp_f: toF(v.tempC),
        feels_like_f: toF(v.tempC + 2),
        humidity_pct: v.humidityPct,
        dew_point_f: base?.current?.dew_point_f ?? 70,
        pressure_hpa: config.threat === 'hurricane' ? 985 - config.severity * 8 : 1010,
        wind_mph: toMph(v.windKmh),
        wind_gust_mph: toMph(v.gustKmh),
        wind_dir_deg: base?.current?.wind_dir_deg ?? 90,
        wind_dir_label: base?.current?.wind_dir_label ?? 'E',
        precip_in: (v.rainPct / 100) * 1.5,
        precip_prob_pct: v.rainPct,
        uv_index: v.uvIndex,
        cloud_cover_pct: v.rainPct > 50 ? 95 : 40,
        visibility_mi: toMi(v.visibilityKm),
        weather_code: v.rainPct > 80 ? 99 : 80,
        condition: threatHeadline(config, pt),
        condition_icon: base?.current?.condition_icon ?? '⛈',
        is_daytime: base?.current?.is_daytime ?? true,
        sunrise_iso: base?.current?.sunrise_iso ?? now.toISOString(),
        sunset_iso: base?.current?.sunset_iso ?? now.toISOString(),
      } as WeatherSnapshot['current'])
    : ({
    ...(base?.current ?? {}),
    temp_f: base?.current?.temp_f ?? 78,
    feels_like_f: base?.current?.feels_like_f ?? 80,
    humidity_pct: config.threat === 'wildfire' ? 18 : 88,
    dew_point_f: base?.current?.dew_point_f ?? 70,
    pressure_hpa: config.threat === 'hurricane' ? 985 - config.severity * 8 : 1010,
    wind_mph: imminent ? wind * 0.7 : wind * 0.3,
    wind_gust_mph: imminent ? wind : wind * 0.5,
    wind_dir_deg: base?.current?.wind_dir_deg ?? 90,
    wind_dir_label: base?.current?.wind_dir_label ?? 'E',
    precip_in: config.threat === 'wildfire' ? 0 : imminent ? 1.4 : 0.2,
    precip_prob_pct: config.threat === 'wildfire' ? 0 : imminent ? 95 : 60,
    uv_index: base?.current?.uv_index ?? 3,
    cloud_cover_pct: config.threat === 'wildfire' ? 40 : 95,
    visibility_mi: config.threat === 'wildfire' ? 0.5 : imminent ? 1.2 : 6,
    weather_code: config.threat === 'wildfire' ? 45 : imminent ? 99 : 80,
    condition: threatHeadline(config, pt),
    condition_icon: base?.current?.condition_icon ?? '⛈',
    is_daytime: base?.current?.is_daytime ?? true,
    sunrise_iso: base?.current?.sunrise_iso ?? now.toISOString(),
    sunset_iso: base?.current?.sunset_iso ?? now.toISOString(),
  } as WeatherSnapshot['current'])

  // The forecast ramps toward impact, so "+6 horas" means something.
  const hourly: HourlyForecast[] = Array.from({ length: 24 }, (_, i) => {
    const distance = Math.abs(i - config.arrivalHours)
    const intensity = Math.max(0, 1 - distance / 8)
    return {
      time_iso: new Date(now.getTime() + i * 3600_000).toISOString(),
      temp_f: current.temp_f,
      feels_like_f: current.feels_like_f,
      precip_prob_pct: Math.round(intensity * 95),
      precip_in: intensity * 1.5,
      wind_mph: Math.round(wind * (0.3 + intensity * 0.7)),
      wind_gust_mph: Math.round(wind * (0.4 + intensity * 0.6)),
      uv_index: 2,
      cloud_cover_pct: 90,
      visibility_mi: Math.max(0.3, 8 - intensity * 7),
      weather_code: intensity > 0.6 ? 99 : 80,
      condition: current.condition,
      condition_icon: current.condition_icon,
    }
  })

  const alertsMode = config.sources?.alerts ?? 'sim'
  const alerts: WeatherAlert[] = alertsMode === 'live'
    ? (base?.alerts ?? [])
    : alertsMode === 'down'
    ? []
    : [
    {
      id: 'sim-primary',
      source: pt ? 'SIMULAÇÃO' : 'SIMULATION',
      type: config.threat.toUpperCase(),
      severity: alertSeverity(config),
      headline: threatHeadline(config, pt),
      expires: new Date(now.getTime() + 12 * 3600_000).toISOString(),
      url: null,
    },
  ]
  if (config.powerOut && alertsMode === 'sim') {
    alerts.push({
      id: 'sim-power', source: pt ? 'SIMULAÇÃO' : 'SIMULATION', type: 'POWER_OUTAGE',
      severity: 'HIGH', headline: pt ? 'Energia elétrica cortada na região' : 'Power is out in the area',
      expires: null, url: null,
    })
  }
  if (config.roadsBlocked && alertsMode === 'sim') {
    alerts.push({
      id: 'sim-roads', source: pt ? 'SIMULAÇÃO' : 'SIMULATION', type: 'ROAD_CLOSURE',
      severity: 'HIGH', headline: pt ? 'Vias principais bloqueadas' : 'Main roads are blocked',
      expires: null, url: null,
    })
  }

  return {
    location: base?.location ?? { lat: 0, lng: 0 },
    current,
    hourly,
    daily: base?.daily ?? [],
    air_quality: config.sources?.airQuality === 'down'
      ? null
      : config.sources?.airQuality === 'sim'
      ? { us_aqi: v.aqi, pm25: null, pm10: null, ozone: null, dust: null, category: pt ? 'Simulado' : 'Simulated', source: pt ? 'SIMULAÇÃO' : 'SIMULATION' }
      : config.threat === 'wildfire'
      ? { us_aqi: 210, pm25: 160, pm10: 190, ozone: null, dust: null, category: pt ? 'Muito insalubre' : 'Very unhealthy', source: pt ? 'SIMULAÇÃO' : 'SIMULATION' }
      : base?.air_quality ?? null,
    alerts,
    earthquakes: config.sources?.earthquakes === 'down'
      ? []
      : config.sources?.earthquakes === 'live'
      ? (base?.earthquakes ?? [])
      : config.threat === 'earthquake'
      ? [{ magnitude: 4 + config.severity * 0.5, place: pt ? 'Próximo à sua área' : 'Near your area', time_iso: now.toISOString(), severity: alertSeverity(config) }]
      : [],
    fetched_at: now.toISOString(),
    // Providers reflect what the drill switched off, so any screen that reads
    // provider health tells the truth about the simulated outage too.
    providers: {
      simulation: 'ok',
      weather: weatherMode === 'down' ? 'unavailable' : 'ok',
      alerts: alertsMode === 'down' ? 'unavailable' : 'ok',
      air_quality: config.sources?.airQuality === 'down' ? 'unavailable' : 'ok',
      earthquakes: config.sources?.earthquakes === 'down' ? 'unavailable' : 'ok',
      radar: config.sources?.radar === 'down' ? 'unavailable' : 'ok',
    },
  }
}

/** Reserve multiplier applied to the household's real inventory. */
export function reserveFactor(level: ReserveLevel): number {
  if (level === 'half') return 0.5
  if (level === 'critical') return 0.2
  return 1
}

/** One-line summary for the persistent simulation banner. */
export function simulationLabel(config: SimulationConfig, pt: boolean): string {
  return threatHeadline(config, pt)
}
