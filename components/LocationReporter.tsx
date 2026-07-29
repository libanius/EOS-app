'use client'

/**
 * LocationReporter — reports the user's live position while the app is open (D-064).
 *
 * Three rules keep this from becoming a surveillance component:
 *
 *  1. CONSENT FIRST. It reports only if the user turned the location toggle on
 *     in at least one circle. No consent anywhere → it never reads the GPS.
 *  2. IT NEVER RAISES A PERMISSION PROMPT. It checks the Permissions API and
 *     stays silent unless geolocation is ALREADY granted. Asking for location
 *     from an invisible background component, with no context for why, is
 *     exactly the pattern that trains people to deny. The prompt belongs to a
 *     deliberate action — the GPS button on the dashboard.
 *  3. IT STOPS WHEN THE APP IS NOT VISIBLE. "Live while the app is open" is the
 *     decision; a hidden tab is not open.
 *
 * Server-side, /api/location keeps only the latest point.
 */

import { useEffect } from 'react'

/** Battery matters more than seconds of precision for a family map. */
const REPORT_INTERVAL_MS = 120_000
const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 60_000,
}

export default function LocationReporter() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    const report = (position: GeolocationPosition) => {
      if (cancelled) return
      void fetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
        }),
      }).catch(() => {
        /* Reporting is additive. A failed post must never surface to the user. */
      })
    }

    const tick = () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      navigator.geolocation.getCurrentPosition(report, () => {}, GPS_OPTIONS)
    }

    const start = async () => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return

      // Rule 2: only proceed on an already-granted permission.
      //
      // iOS Safari does not implement navigator.permissions for geolocation, so
      // the strict version of this check silently disabled live location on
      // every iPhone. The flag is written by RiskProvider the first time the app
      // actually receives a position — evidence of a grant that already
      // happened, which keeps the "never prompt from the background" rule.
      let granted = false
      try {
        granted = localStorage.getItem('eos-geo-ok') === '1'
      } catch {
        /* private mode */
      }
      if (!granted) {
        try {
          const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
          granted = status?.state === 'granted'
        } catch {
          granted = false
        }
      }
      if (!granted) return
      if (cancelled) return

      // Rule 1: consent, read from the circles the user actually belongs to.
      const response = await fetch('/api/circles').catch(() => null)
      if (!response?.ok || cancelled) return
      const data = (await response.json().catch(() => null)) as
        | { circles?: Array<{ shared_fields?: string[] }> }
        | null
      const consented = (data?.circles ?? []).some(circle =>
        (circle.shared_fields ?? []).includes('location'),
      )
      if (!consented || cancelled) return

      tick()
      timer = setInterval(tick, REPORT_INTERVAL_MS)
    }

    void start()

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [])

  return null
}
