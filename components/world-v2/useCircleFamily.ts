'use client'

/**
 * useCircleFamily — consented circle members as map markers (D-064).
 *
 * `/api/circles` already applies the consent gate server-side: a member who has
 * not enabled the location toggle comes back with null coordinates, so there is
 * nothing here to filter. This hook's only real job is turning the server's
 * `location_source` + `location_at` into an honest freshness label — a stale
 * point shown as a current one is worse than no point at all.
 */

import { useCallback, useEffect, useState } from 'react'
import type { WorldFamilyMember } from '@/components/world-dashboard/WorldMap'

type CircleMember = {
  user_id: string
  name: string
  is_me: boolean
  location_lat: number | null
  location_lng: number | null
  location_source: 'live' | 'profile' | null
  location_at: string | null
  avatar_url: string | null
}

type CircleRow = { id: string; members?: CircleMember[] }

/** How often the map re-reads circle positions while the screen is open. */
const REFRESH_MS = 90_000

function freshnessLabel(member: CircleMember, pt: boolean): string {
  if (member.location_source === 'profile') return pt ? 'perfil' : 'profile'
  if (!member.location_at) return pt ? 'agora' : 'now'

  const ageMinutes = Math.floor((Date.now() - Date.parse(member.location_at)) / 60_000)
  if (!Number.isFinite(ageMinutes) || ageMinutes < 2) return pt ? 'agora' : 'now'
  if (ageMinutes < 60) return pt ? `há ${ageMinutes} min` : `${ageMinutes} min ago`
  const hours = Math.floor(ageMinutes / 60)
  return pt ? `há ${hours} h` : `${hours} h ago`
}

export function useCircleFamily(
  pt: boolean,
  selfCoords: { lat: number; lng: number } | null,
  selfAvatarUrl: string | null,
) {
  const [family, setFamily] = useState<WorldFamilyMember[]>([])

  const load = useCallback(async () => {
    const response = await fetch('/api/circles').catch(() => null)
    if (!response?.ok) return
    const data = (await response.json().catch(() => null)) as { circles?: CircleRow[] } | null

    // A person can appear in several circles; the map shows each human once.
    const byUser = new Map<string, WorldFamilyMember>()
    for (const circle of data?.circles ?? []) {
      for (const member of circle.members ?? []) {
        if (typeof member.location_lat !== 'number' || typeof member.location_lng !== 'number') continue
        byUser.set(member.user_id, {
          id: member.user_id,
          name: member.is_me ? (pt ? 'Você' : 'You') : member.name || '—',
          lat: member.location_lat,
          lng: member.location_lng,
          isMe: member.is_me,
          freshness: freshnessLabel(member, pt),
          avatarUrl: member.is_me ? selfAvatarUrl : member.avatar_url,
          // Only a live GPS fix pulses; a profile point is a place, not a presence.
          live: member.location_source === 'live',
          approximate: member.location_source === 'profile',
        })
      }
    }
    setFamily(Array.from(byUser.values()))
  }, [pt, selfAvatarUrl])

  useEffect(() => {
    void load()
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void load()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  // The user's own live GPS beats whatever the server last recorded for them.
  const withSelf = [...family]
  if (selfCoords) {
    const meIndex = withSelf.findIndex(m => m.isMe)
    const me: WorldFamilyMember = {
      id: 'me-live',
      name: pt ? 'Você' : 'You',
      lat: selfCoords.lat,
      lng: selfCoords.lng,
      isMe: true,
      freshness: pt ? 'agora' : 'now',
      avatarUrl: selfAvatarUrl,
      live: true,
    }
    if (meIndex >= 0) withSelf[meIndex] = { ...me, id: withSelf[meIndex].id }
    else withSelf.push(me)
  }

  return withSelf
}
