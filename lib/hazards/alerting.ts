// ─── Synthesized events + notification copy (D-220) ───────────────────────────
//
// Two of the five alert types the competitor sends are not "events" in any feed:
// air quality is a number, and the rain nowcast is a forecast curve. This file
// turns both into HazardEvents with stable ids, so they flow through the exact
// same transition → dedup → delivery machinery as a hurricane. One pipeline,
// one set of rules, one place to be wrong.

import { HAZARD_CONFIG } from './config'
import type { AirQualitySnapshot } from '@/lib/weather/types'
import type { Coordinates, HazardEvent, HazardSeverity, UpcomingPrecipitationResult } from './types'
import { tropicalStateLabel, type HazardTransition } from './transitions'

const A = HAZARD_CONFIG.alerting

// ─── Hazard types a user can switch off individually ──────────────────────────
// Empty preferences mean "all of these". Every type here is something a family
// can act on; nothing informational-only earns a push by default.
export const DEFAULT_ALERT_TYPES = [
  'tropical_cyclone',
  'severe_weather',
  'earthquake',
  'earthquake_tsunami',
  'air_quality',
  'precipitation',
] as const

/** Maps an event onto the preference key that governs it. */
export function preferenceKey(hazardType: string): string {
  if (hazardType.startsWith('earthquake')) return hazardType
  if (hazardType === 'tropical_cyclone' || hazardType === 'air_quality' || hazardType === 'precipitation') {
    return hazardType
  }
  // Everything NWS/IPAWS issues (tornado, flood, heat, winter storm…) is one lane.
  return 'severe_weather'
}

// ─── Air quality ──────────────────────────────────────────────────────────────

export interface AqiBand {
  key: string
  min: number
  severity: HazardSeverity
  pt: string
  en: string
}

// US EPA bands. The EOS only ever notifies from `sensitive` up — telling someone
// the air is "good" is not an alert, it is trivia.
export const AQI_BANDS: AqiBand[] = [
  { key: 'good', min: 0, severity: 'info', pt: 'Boa', en: 'Good' },
  { key: 'moderate', min: 51, severity: 'minor', pt: 'Moderada', en: 'Moderate' },
  { key: 'sensitive', min: A.aqiSensitiveThreshold, severity: 'moderate', pt: 'Insalubre para grupos sensíveis', en: 'Unhealthy for sensitive groups' },
  { key: 'unhealthy', min: A.aqiUnhealthyThreshold, severity: 'severe', pt: 'Insalubre', en: 'Unhealthy' },
  { key: 'very_unhealthy', min: A.aqiVeryUnhealthyThreshold, severity: 'extreme', pt: 'Muito insalubre', en: 'Very unhealthy' },
  { key: 'hazardous', min: A.aqiHazardousThreshold, severity: 'extreme', pt: 'Perigosa', en: 'Hazardous' },
]

export function aqiBand(aqi: number): AqiBand {
  let band = AQI_BANDS[0]
  for (const candidate of AQI_BANDS) if (aqi >= candidate.min) band = candidate
  return band
}

/**
 * An air-quality event, or null when the air is clean enough that silence is
 * the honest answer. The id is per-location: AQI is a local measurement, unlike
 * a hurricane that carries the same identity everywhere.
 */
export function airQualityEvent(
  aq: AirQualitySnapshot | null,
  scanKey: string,
  location: Coordinates,
  now = new Date(),
): HazardEvent | null {
  const aqi = aq?.us_aqi
  if (aqi == null) return null
  const band = aqiBand(aqi)
  if (aqi < A.aqiSensitiveThreshold) return null

  const iso = now.toISOString()
  return {
    id: `eos:aqi:${scanKey}`,
    sourceEventId: `aqi:${scanKey}`,
    source: 'open-meteo',
    authority: 'observational',
    visualClass: 'DETECTED_EVENT',
    hazardType: 'air_quality',
    eventType: `air_quality_${band.key}`,
    title: `Air quality: ${band.en}`,
    summary: `AQI ${aqi} — ${band.en}.${aq?.pm25 != null ? ` PM2.5 ${aq.pm25} µg/m³.` : ''}`,
    severity: band.severity,
    urgency: 'immediate',
    certainty: 'observed',
    confidence: 'high',
    location,
    metrics: { aqi },
    detectedAt: iso,
    updatedAt: iso,
  }
}

// ─── Rain nowcast ─────────────────────────────────────────────────────────────

const INTENSITY_RANK = { none: 0, light: 1, moderate: 2, heavy: 3 } as const

const INTENSITY_PT = { none: '', light: 'Chuva fraca', moderate: 'Chuva moderada', heavy: 'Chuva forte' } as const
const INTENSITY_EN = { none: '', light: 'Light rain', moderate: 'Moderate rain', heavy: 'Heavy rain' } as const

/**
 * A precipitation event, or null when nothing worth a buzz is coming. Light
 * drizzle in 55 minutes is not a notification; moderate rain in 15 is.
 */
export function precipitationEvent(
  precip: UpcomingPrecipitationResult | null,
  scanKey: string,
  location: Coordinates,
  now = new Date(),
): HazardEvent | null {
  if (!precip || precip.eventType !== 'rain_starting_soon') return null
  if (precip.startsInMinutes == null || precip.startsInMinutes > A.precipAlertWithinMinutes) return null
  if (INTENSITY_RANK[precip.intensity] < INTENSITY_RANK[A.precipMinimumIntensity]) return null

  const iso = now.toISOString()
  const label = INTENSITY_EN[precip.intensity]
  const duration = precip.expectedDurationMinutes
  return {
    id: `eos:precip:${scanKey}`,
    sourceEventId: `precip:${scanKey}`,
    source: precip.source,
    authority: 'forecast',
    visualClass: 'FORECAST',
    hazardType: 'precipitation',
    eventType: 'rain_starting_soon',
    title: `${label} starting in ${precip.startsInMinutes} min`,
    summary: duration
      ? `${label} starting in ${precip.startsInMinutes} minutes, probably stopping within ${duration} minutes.`
      : `${label} starting in ${precip.startsInMinutes} minutes.`,
    severity: precip.intensity === 'heavy' ? 'moderate' : 'minor',
    urgency: 'expected',
    certainty: precip.probability >= 0.7 ? 'likely' : 'possible',
    confidence: precip.confidence,
    location,
    metrics: {
      startsInMinutes: precip.startsInMinutes,
      precipIntensity: precip.intensity,
      precipDurationMinutes: duration ?? undefined,
    },
    detectedAt: iso,
    updatedAt: iso,
  }
}

// ─── Notification copy ────────────────────────────────────────────────────────

export interface NotificationCopy {
  title: string
  body: string
  url: string
}

/**
 * What the phone actually shows. Written as a sentence about the CHANGE, never
 * a state dump — "Moke foi elevado a Tempestade Tropical" tells you something
 * happened; "Tempestade Tropical Moke" makes you go find out whether it did.
 */
export function notificationCopy(transition: HazardTransition, pt: boolean): NotificationCopy {
  const { event, kind, toState } = transition
  const name = stormName(event.title)
  const wind = event.metrics?.windMph
  const windNote = wind ? (pt ? `, ventos de ${wind} mph` : `, sustained winds of ${wind} mph`) : ''
  const distance = event.distanceMiles
  const distanceNote =
    distance != null && event.hazardType === 'tropical_cyclone'
      ? pt
        ? ` A ~${Math.round(distance)} mi de você.`
        : ` ~${Math.round(distance)} mi from you.`
      : ''

  switch (event.hazardType) {
    case 'tropical_cyclone': {
      const title = pt ? 'Atividade de ciclone tropical' : 'Tropical Cyclone Activity'
      // The state name is rendered HERE, from the metrics, in the reader's
      // language. The `toState` carried on the transition is the audit record
      // written at detection time — reusing it would ship "downgraded to
      // Furacão Categoria 1" to an English phone.
      const to = tropicalStateLabel(transition.toMetrics ?? event.metrics, pt)
      const from = transition.fromMetrics ? tropicalStateLabel(transition.fromMetrics, pt) : null
      if (kind === 'formed') {
        return {
          title,
          body: pt
            ? `${to} ${name} se formou${windNote}.${distanceNote}`
            : `${to} ${name} has formed${windNote}.${distanceNote}`,
          url: '/dashboard',
        }
      }
      if (kind === 'upgraded') {
        return {
          title,
          body: pt
            ? `${name} foi elevado a ${to}${windNote}.${distanceNote}`
            : `${name} has been upgraded to ${to}${windNote}.${distanceNote}`,
          url: '/dashboard',
        }
      }
      if (kind === 'downgraded') {
        return {
          title,
          body: pt
            ? `${name} foi rebaixado para ${to}${windNote}.${distanceNote}`
            : `${name} has been downgraded to ${to}${windNote}.${distanceNote}`,
          url: '/dashboard',
        }
      }
      return {
        title,
        body: pt ? `${name}: ${from ?? ''} encerrado.` : `${name}: ${from ?? ''} has ended.`,
        url: '/dashboard',
      }
    }

    case 'air_quality': {
      const aqi = event.metrics?.aqi
      const band = aqi != null ? aqiBand(aqi) : null
      const title = pt ? 'Alerta de qualidade do ar' : 'Air Quality Alert'
      if (kind === 'cleared') {
        return {
          title,
          body: pt ? 'A qualidade do ar na sua área voltou ao normal.' : 'Air quality in your area is back to normal.',
          url: '/weather',
        }
      }
      const label = band ? (pt ? band.pt.toLowerCase() : band.en.toLowerCase()) : ''
      return {
        title,
        body: pt
          ? `A qualidade do ar na sua área está ${label} (AQI ${aqi}).`
          : `Reported air quality in your area is ${label} (AQI ${aqi}).`,
        url: '/weather',
      }
    }

    case 'precipitation': {
      const minutes = event.metrics?.startsInMinutes
      const intensity = event.metrics?.precipIntensity ?? 'moderate'
      const duration = event.metrics?.precipDurationMinutes
      const label = pt ? INTENSITY_PT[intensity] : INTENSITY_EN[intensity]
      return {
        title: 'EOS',
        body: pt
          ? `${label} começando em ${minutes} minutos${duration ? `, deve durar cerca de ${duration} minutos` : ''}.`
          : `${label} starting in ${minutes} minutes${duration ? `, probably stopping within ${duration} minutes` : ''}.`,
        url: '/dashboard',
      }
    }

    default: {
      // NWS / IPAWS official warnings and USGS earthquakes.
      if (kind === 'cleared') {
        return {
          title: pt ? 'Alerta encerrado' : 'Alert cleared',
          body: pt ? `${event.title} não está mais em vigor.` : `${event.title} is no longer in effect.`,
          url: '/dashboard',
        }
      }
      if (event.hazardType.startsWith('earthquake')) {
        return {
          title: pt ? 'Terremoto detectado' : 'Earthquake detected',
          body: event.summary || event.title,
          url: '/dashboard',
        }
      }
      const verb = kind === 'upgraded' ? (pt ? 'agravado' : 'upgraded') : kind === 'downgraded' ? (pt ? 'reduzido' : 'downgraded') : null
      return {
        title: pt ? 'Alerta oficial' : 'Official alert',
        body: verb
          ? pt
            ? `${event.title} — ${verb} para ${toState}.`
            : `${event.title} — ${verb} to ${toState}.`
          : event.title,
        url: '/dashboard',
      }
    }
  }
}

/** "Hurricane Lala" → "Lala". The classification is already in `toState`. */
function stormName(title: string): string {
  return title
    .replace(/^(Major Hurricane|Hurricane|Tropical Storm|Tropical Depression|Subtropical Storm|Subtropical Depression|Potential Tropical Cyclone|Remnants|Tropical Cyclone)\s*/i, '')
    .trim()
}
