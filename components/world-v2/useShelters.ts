'use client'

/**
 * useShelters — official FEMA shelters near the user (D-065).
 *
 * `empty` is a first-class state, not an error: shelters open only during an
 * active disaster, so "none open near you" is the correct answer most days. The
 * UI must be able to tell that apart from "we could not reach FEMA", which is
 * why the two are separate fields all the way from the provider.
 */

import { useEffect, useState } from 'react'
import type { ShelterSnapshot } from '@/lib/world/shelters'

/** Shelter status moves in minutes during an event, but the feed is small. */
const REFRESH_MS = 5 * 60 * 1000

export function useShelters(coords: { lat: number; lng: number } | null) {
  const [snapshot, setSnapshot] = useState<ShelterSnapshot | null>(null)

  useEffect(() => {
    if (!coords) return
    let cancelled = false

    const load = () => {
      fetch(`/api/shelters?lat=${coords.lat}&lng=${coords.lng}`)
        .then(response => (response.ok ? response.json() : null))
        .then((data: ShelterSnapshot | null) => {
          if (!cancelled && data) setSnapshot(data)
        })
        .catch(() => {
          /* Shelters are additive to the screen; never blank the dashboard. */
        })
    }

    load()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      load()
    }, REFRESH_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [coords])

  return snapshot
}
