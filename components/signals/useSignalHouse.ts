'use client'

/**
 * A casa e os requisitos, como os Sinais os leem (SIGNAL-001 §12.1).
 *
 * Duas portas que já existem, nenhuma nova: `/api/household` dá a casa e a
 * conta de dias (D-123/D-174) e `/api/checklist` dá os requisitos com status.
 * Nada é gravado.
 */

import { useEffect, useState } from 'react'
import type { HouseInput } from '@/lib/signals'

export type SignalHouse = {
  loading: boolean
  /** `null` quando a leitura falhou — a tela diz isso, não inventa uma casa. */
  house: HouseInput | null
  metKeys: Set<string>
  notApplicableKeys: Set<string>
}

type HouseholdApi = {
  size?: number
  known?: boolean
  inventory?: {
    waterLiters?: number
    foodPersonDays?: number
    hasMedicalKit?: boolean
    hasCommunicationDevice?: boolean
  }
}

type ChecklistApi = { items?: Array<{ canonical_key?: string; status?: string }> }

export function useSignalHouse(): SignalHouse {
  const [state, setState] = useState<SignalHouse>({
    loading: true,
    house: null,
    metKeys: new Set(),
    notApplicableKeys: new Set(),
  })

  useEffect(() => {
    let alive = true
    void (async () => {
      const [hRes, cRes] = await Promise.allSettled([
        fetch('/api/household', { cache: 'no-store' }).then(r => (r.ok ? (r.json() as Promise<HouseholdApi>) : null)),
        fetch('/api/checklist', { cache: 'no-store' }).then(r => (r.ok ? (r.json() as Promise<ChecklistApi>) : null)),
      ])
      if (!alive) return

      const h = hRes.status === 'fulfilled' ? hRes.value : null
      const c = cRes.status === 'fulfilled' ? cRes.value : null

      const house: HouseInput | null = h
        ? {
            size: Number(h.size) || 0,
            known: Boolean(h.known),
            waterLiters: Number(h.inventory?.waterLiters) || 0,
            foodPersonDays: Number(h.inventory?.foodPersonDays) || 0,
            hasMedicalKit: Boolean(h.inventory?.hasMedicalKit),
            hasCommunicationDevice: Boolean(h.inventory?.hasCommunicationDevice),
          }
        : null

      const metKeys = new Set<string>()
      const notApplicableKeys = new Set<string>()
      for (const item of c?.items ?? []) {
        if (!item.canonical_key) continue
        if (item.status === 'met') metKeys.add(item.canonical_key)
        if (item.status === 'not_applicable') notApplicableKeys.add(item.canonical_key)
      }

      setState({ loading: false, house, metKeys, notApplicableKeys })
    })()
    return () => {
      alive = false
    }
  }, [])

  return state
}
