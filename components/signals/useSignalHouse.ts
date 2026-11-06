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

type ChecklistApiRow = {
  canonical_key?: string
  status?: string
  kit_slug?: string | null
  scenario_id?: string | null
}
type ChecklistApi = { items?: ChecklistApiRow[] }

/** Linha de base = sem kit e sem cenário. Campo ausente conta como escopo desconhecido, não como base. */
export function isBaseline(row: ChecklistApiRow): boolean {
  return row.kit_slug === null && row.scenario_id === null
}

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
        // E7/E7b: o protocolo só herda a linha de base. Um requisito de kit ou
        // de cenário é outra identidade (docs/37 §26) e não é tocado.
        if (!isBaseline(item)) continue
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
