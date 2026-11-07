'use client'

/**
 * A casa e as respostas dela, como os Sinais os leem.
 *
 * `/api/household` dá a casa e a conta de dias (D-123/D-174). Desde o
 * SIGNAL-002, as respostas vêm de `/api/signals/house-state`: as linhas de base
 * de TODAS as contas confirmadas da casa, valendo a mais recente (D-M1). Antes
 * vinham de `/api/checklist`, que só enxerga a minha conta.
 */

import { useCallback, useEffect, useState } from 'react'
import type { HouseInput } from '@/lib/signals'
import { houseKeys, type HouseItemState } from '@/lib/signal-house'

export type SignalHouse = {
  loading: boolean
  /** `null` quando a leitura falhou — a tela diz isso, não inventa uma casa. */
  house: HouseInput | null
  metKeys: Set<string>
  notApplicableKeys: Set<string>
  /** Resposta da casa por `resource_key`. */
  states: Record<string, HouseItemState>
  /** Quantas contas respondem pela casa. 1 = só eu. */
  accounts: number
  /** Relê tudo depois de gravar água ou comida. */
  reload: () => Promise<void>
  /** Aplica na hora a resposta que o servidor devolveu (§3.2). */
  applyState: (resourceKey: string, state: HouseItemState | null) => void
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

type HouseStateApi = { accounts?: number; items?: Record<string, HouseItemState> }

type ChecklistApiRow = {
  canonical_key?: string
  status?: string
  kit_slug?: string | null
  scenario_id?: string | null
}

/** Linha de base = sem kit e sem cenário. Campo ausente conta como escopo desconhecido, não como base. */
export function isBaseline(row: ChecklistApiRow): boolean {
  return row.kit_slug === null && row.scenario_id === null
}

type Data = { loading: boolean; house: HouseInput | null; states: Record<string, HouseItemState>; accounts: number }

export function useSignalHouse(): SignalHouse {
  const [data, setData] = useState<Data>({ loading: true, house: null, states: {}, accounts: 1 })

  const load = useCallback(async () => {
    const [hRes, sRes] = await Promise.allSettled([
      fetch('/api/household', { cache: 'no-store' }).then(r => (r.ok ? (r.json() as Promise<HouseholdApi>) : null)),
      fetch('/api/signals/house-state', { cache: 'no-store' }).then(r => (r.ok ? (r.json() as Promise<HouseStateApi>) : null)),
    ])
    const h = hRes.status === 'fulfilled' ? hRes.value : null
    const s = sRes.status === 'fulfilled' ? sRes.value : null
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
    setData({ loading: false, house, states: s?.items ?? {}, accounts: Number(s?.accounts) || 1 })
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      if (alive) await load()
    })()
    return () => {
      alive = false
    }
  }, [load])

  const applyState = useCallback((resourceKey: string, state: HouseItemState | null) => {
    setData(d => {
      const states = { ...d.states }
      if (state) states[resourceKey] = state
      else delete states[resourceKey]
      return { ...d, states }
    })
  }, [])

  const { metKeys, notApplicableKeys } = houseKeys(data.states)
  return { ...data, metKeys, notApplicableKeys, reload: load, applyState }
}
