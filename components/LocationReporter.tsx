'use client'

/**
 * LocationReporter — continuous live location for the circle (D-064 / D-073).
 *
 * REWRITTEN because the first version had two defects that made it useless in
 * practice:
 *
 *  1. It checked readiness ONCE on mount. The permission flag is written when the
 *     dashboard first obtains a position — which happens *after* this component
 *     mounts — so the reporter had already given up and never tried again for the
 *     rest of the session. One member reported, the other never did.
 *  2. A `getCurrentPosition` every two minutes is not live. The owner asked for
 *     Life360 behaviour, and a family looking for each other during an event
 *     cannot wait two minutes per update.
 *
 * Now it WATCHES position continuously and posts when the person has actually
 * moved, or when the last report is getting old. Still bounded by the same two
 * rules: consent per circle, and never a permission prompt from the background.
 */

import { useEffect, useRef } from 'react'

/** Post when the person moved at least this far — movement, not jitter. */
const MOVE_THRESHOLD_M = 25
/** …or when the last report is this old, so a stationary person stays fresh. */
const HEARTBEAT_MS = 45_000
/** How often to re-check whether we are allowed to start. */
const READY_POLL_MS = 10_000

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 10_000,
}

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export default function LocationReporter() {
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let watchId: number | null = null
    let readyTimer: ReturnType<typeof setInterval> | null = null

    const post = (position: GeolocationPosition) => {
      if (cancelled) return
      const point = { lat: position.coords.latitude, lng: position.coords.longitude }
      const previous = lastSent.current
      const moved = previous ? metresBetween(previous, point) : Infinity
      const stale = previous ? Date.now() - previous.at > HEARTBEAT_MS : true

      // Movement or staleness — never both required, never every single fix.
      if (moved < MOVE_THRESHOLD_M && !stale) return

      lastSent.current = { ...point, at: Date.now() }
      void fetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...point, accuracy_m: position.coords.accuracy }),
      }).catch(() => {
        // Let the next fix try again rather than losing the position entirely.
        lastSent.current = previous
      })
    }

    /** Consent + an already-granted permission. Both required, neither prompted. */
    const canReport = async () => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return false

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
      if (!granted) return false

      const response = await fetch('/api/circles').catch(() => null)
      if (!response?.ok) return false
      const data = (await response.json().catch(() => null)) as
        | { circles?: Array<{ shared_fields?: string[] }> }
        | null
      return (data?.circles ?? []).some(circle => (circle.shared_fields ?? []).includes('location'))
    }

    const startWatching = () => {
      if (cancelled || watchId !== null) return
      watchId = navigator.geolocation.watchPosition(post, () => {}, GPS_OPTIONS)
      if (readyTimer) {
        clearInterval(readyTimer)
        readyTimer = null
      }
    }

    // Keep asking until allowed. The permission flag arrives when the dashboard
    // first gets a fix, which is after this mounts — checking once was the bug.
    const attempt = async () => {
      if (cancelled || watchId !== null) return
      if (await canReport()) startWatching()
    }

    void attempt()
    readyTimer = setInterval(() => void attempt(), READY_POLL_MS)

    return () => {
      cancelled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (readyTimer) clearInterval(readyTimer)
    }
  }, [])

  return null
}
