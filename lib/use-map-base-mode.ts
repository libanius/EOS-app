'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_MAP_BASE_MODE,
  normalizeMapBaseMode,
  type MapBaseMode,
} from '@/lib/map-base-mode'

const STORAGE_KEY = 'eos-map-base'

type FichaMapResponse = {
  ficha?: {
    map_base_mode?: unknown
  }
}

function readLocalBase(): MapBaseMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'wind') {
      return 'dark'
    }
    return normalizeMapBaseMode(stored)
  } catch {
    return null
  }
}

function writeLocalBase(next: MapBaseMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* private mode */
  }
}

export function useMapBaseMode() {
  const [mapBase, setMapBaseState] = useState<MapBaseMode>(DEFAULT_MAP_BASE_MODE)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const local = readLocalBase()
    if (local) setMapBaseState(local)

    let cancelled = false
    fetch('/api/profile/ficha', { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<FichaMapResponse> : null)
      .then(data => {
        if (cancelled) return
        const remote = normalizeMapBaseMode(data?.ficha?.map_base_mode)
        if (remote) {
          setMapBaseState(remote)
          writeLocalBase(remote)
        } else if (!local) {
          writeLocalBase(DEFAULT_MAP_BASE_MODE)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const setMapBase = useCallback((next: MapBaseMode) => {
    setMapBaseState(next)
    writeLocalBase(next)
    void fetch('/api/profile/ficha', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_base_mode: next }),
    }).catch(() => {})
  }, [])

  return { mapBase, setMapBase, loaded }
}
