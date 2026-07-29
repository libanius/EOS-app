'use client'

/**
 * useShelters — official FEMA shelters near the user (D-065).
 *
 * `empty` is a first-class state, not an error: shelters open only during an
 * active disaster, so "none open near you" is the correct answer most days. The
 * UI must be able to tell that apart from "we could not reach FEMA", which is
 * why the two are separate fields all the way from the provider.
 *
 * FAM-T08: the last good list is cached on the device and served when the
 * network is gone. Distances are RECOMPUTED against the current position, since
 * the user has almost certainly moved since it was stored. The cached snapshot
 * keeps its original `fetchedAt` — an old list shown as current is the same lie
 * as an old position shown as a live one.
 */

import { useEffect, useState } from 'react'
import type { ShelterSnapshot } from '@/lib/world/shelters'
import { bearing, distanceKm } from '@/lib/world/shelters'
import { getShelters, saveShelters } from '@/lib/offline-storage'

/** Shelter status moves in minutes during an event, but the feed is small. */
const REFRESH_MS = 5 * 60 * 1000

export function useShelters(coords: { lat: number; lng: number } | null) {
  const [snapshot, setSnapshot] = useState<ShelterSnapshot | null>(null)

  useEffect(() => {
    if (!coords) return
    let cancelled = false

    const fromCache = async () => {
      const cached = await getShelters().catch(() => null)
      if (!cached || cancelled) return
      setSnapshot({
        source: 'FEMA National Shelter System',
        fetchedAt: cached.fetchedAt,
        empty: cached.shelters.length === 0,
        shelters: cached.shelters
          .map(s => ({
            ...s,
            distanceKm: distanceKm(coords, s),
            bearing: bearing(coords, s),
            status: 'OPEN',
            capacity: null,
            occupancy: null,
            organization: null,
            wheelchairAccessible: 'unknown' as const,
            acceptsPets: 'unknown' as const,
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm),
      })
    }

    const load = () => {
      fetch(`/api/shelters?lat=${coords.lat}&lng=${coords.lng}`)
        .then(response => (response.ok ? response.json() : null))
        .then((data: ShelterSnapshot | null) => {
          if (cancelled || !data) return
          setSnapshot(data)
          if (!data.error) {
            void saveShelters({
              shelters: data.shelters.map(s => ({
                id: s.id, name: s.name, lat: s.lat, lng: s.lng,
                address: s.address, city: s.city, state: s.state,
              })),
              origin: coords,
              fetchedAt: data.fetchedAt,
            })
          }
        })
        .catch(() => {
          // Network gone: the destination still has to be knowable.
          void fromCache()
        })
    }

    void fromCache()

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
