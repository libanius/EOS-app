import { HAZARD_CONFIG } from './config'
import type { HazardChannel, NetworkHeadlineKey, NetworkStatus, NetworkTone, ProviderStatus } from './types'
import type { ProviderResult } from './providers/interfaces'

/**
 * Derive the honest channel status from a provider result, downgrading to
 * `degraded` if a "live" response is actually stale.
 */
export function deriveStatus<T>(result: ProviderResult<T>): ProviderStatus {
  if (result.status === 'live' && (result.dataAgeSeconds ?? 0) > HAZARD_CONFIG.health.maxDataAgeSeconds) {
    return 'degraded'
  }
  return result.status
}

/**
 * Aggregate channel states into a single network status. The critical rule
 * (section 5): "ALL SYSTEMS LIVE" is only possible when every REQUIRED and
 * CONFIGURED channel is genuinely live and none is on a fallback source.
 */
export function aggregateNetworkStatus(channels: HazardChannel[], syncedAt: string): NetworkStatus {
  const req = channels.filter(c => c.required && c.configured && c.status !== 'unavailable_here')
  const reqLive = req.filter(c => c.status === 'live')
  const reqDown = req.filter(c => c.status === 'degraded' || c.status === 'offline')
  const reqFallback = reqLive.filter(c => c.usingFallback)

  const liveCount = channels.filter(c => c.status === 'live').length
  const configuredCount = channels.filter(c => c.configured).length
  const notConfiguredCount = channels.filter(c => !c.configured).length

  let headline: string
  let headlineKey: NetworkHeadlineKey
  let tone: NetworkTone

  if (reqDown.length > 0) {
    if (reqLive.length === 0) {
      headline = 'MONITORING WITH LIMITED COVERAGE'
      headlineKey = 'limited_coverage'
      tone = 'red'
    } else {
      headline = `${reqLive.length} OF ${req.length} CHANNELS LIVE`
      headlineKey = 'partial_channels'
      tone = 'amber'
    }
  } else if (reqFallback.length > 0) {
    headline = 'USING BACKUP WEATHER SOURCE'
    headlineKey = 'backup_source'
    tone = 'amber'
  } else if (notConfiguredCount === 0) {
    headline = 'ALL SYSTEMS LIVE'
    headlineKey = 'all_live'
    tone = 'mint'
  } else {
    headline = `${liveCount} OF ${channels.length} CHANNELS LIVE`
    headlineKey = 'partial_channels'
    tone = 'mint'
  }

  return {
    headline,
    headlineKey,
    tone,
    liveCount,
    configuredCount,
    totalChannels: channels.length,
    degradedCount: reqDown.length,
    notConfiguredCount,
    syncedAt,
  }
}
