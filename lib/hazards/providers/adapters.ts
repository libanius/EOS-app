// ─── Credentialed provider adapters (prepared, not simulated) ─────────────────
// These wrap commercial/government APIs that require secrets or authorization.
// Without valid credentials each reports NOT_CONFIGURED and is never called.
// The real request branch is intentionally left as a documented boundary — we
// never fabricate a response or ship a fake key. See docs/hazard-provider-setup.md.

import { hazardEnv } from '../env'
import type { Coordinates } from '../types'
import type {
  WeatherProvider,
  MinuteForecastProvider,
  LightningProvider,
  EarthquakeEarlyWarningProvider,
  HazardEventProvider,
  ProviderResult,
  CurrentConditions,
  HourlyForecastPoint,
} from './interfaces'
import type { MinuteForecast, LightningStrike, HazardEvent } from '../types'

const PENDING = 'Adapter pronto; implementação da chamada real pendente de credenciais (ver docs/hazard-provider-setup.md).'

function notConfigured<T>(provider: ProviderResult<T>['provider'], data: T, message: string): ProviderResult<T> {
  return { provider, status: 'not_configured', data, message }
}

// A. Apple WeatherKit — primary forecast when configured.
export const weatherKitProvider: WeatherProvider = {
  source: 'weatherkit',
  isConfigured: () => hazardEnv.weatherkit.configured,
  async getCurrentConditions(_location: Coordinates): Promise<ProviderResult<CurrentConditions | null>> {
    if (!hazardEnv.weatherkit.configured) {
      return notConfigured('weatherkit', null, 'WeatherKit requer credenciais Apple Developer.')
    }
    return { provider: 'weatherkit', status: 'offline', data: null, message: PENDING }
  },
  async getHourlyForecast(_location: Coordinates): Promise<ProviderResult<HourlyForecastPoint[]>> {
    if (!hazardEnv.weatherkit.configured) {
      return notConfigured('weatherkit', [], 'WeatherKit requer credenciais Apple Developer.')
    }
    return { provider: 'weatherkit', status: 'offline', data: [], message: PENDING }
  },
}

// B/C. AccuWeather MinuteCast — minute nowcast fallback when configured.
export const accuWeatherNowcastProvider: MinuteForecastProvider = {
  source: 'accuweather',
  isConfigured: () => hazardEnv.accuweather.configured,
  async getMinuteForecast(_location: Coordinates): Promise<ProviderResult<MinuteForecast[]>> {
    if (!hazardEnv.accuweather.configured) {
      return notConfigured('accuweather', [], 'AccuWeather MinuteCast requer ACCUWEATHER_API_KEY.')
    }
    return { provider: 'accuweather', status: 'offline', data: [], message: PENDING }
  },
}

// H. Xweather lightning detection.
export const xweatherLightningProvider: LightningProvider = {
  source: 'xweather',
  isConfigured: () => hazardEnv.xweather.configured,
  async getRecentStrikes(_location: Coordinates, _radiusMiles: number, _since: Date): Promise<ProviderResult<LightningStrike[]>> {
    if (!hazardEnv.xweather.configured) {
      return notConfigured('xweather', [], 'Detecção de raios requer XWEATHER_CLIENT_ID/SECRET.')
    }
    return { provider: 'xweather', status: 'offline', data: [], message: PENDING }
  },
}

// E. USGS ShakeAlert early warning.
export const shakeAlertProvider: EarthquakeEarlyWarningProvider = {
  source: 'shakealert',
  isConfigured: () => hazardEnv.shakealert.configured,
  async getActiveWarning(_location: Coordinates): Promise<ProviderResult<HazardEvent | null>> {
    if (!hazardEnv.shakealert.configured) {
      return notConfigured('shakealert', null, 'ShakeAlert exige licenciamento/parceria autorizada.')
    }
    return { provider: 'shakealert', status: 'offline', data: null, message: PENDING }
  },
}

// I. FEMA IPAWS public alerts.
export const femaIpawsProvider: HazardEventProvider = {
  source: 'fema_ipaws',
  isConfigured: () => hazardEnv.femaIpaws.configured,
  async getEvents(_location: Coordinates): Promise<ProviderResult<HazardEvent[]>> {
    if (!hazardEnv.femaIpaws.configured) {
      return notConfigured('fema_ipaws', [], 'FEMA IPAWS-OPEN exige COG ID e autorização FEMA.')
    }
    return { provider: 'fema_ipaws', status: 'offline', data: [], message: PENDING }
  },
}
