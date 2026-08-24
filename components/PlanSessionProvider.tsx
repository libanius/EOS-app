'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  clearPlanSession,
  getPlanSession,
  savePlanSession,
} from '@/lib/offline-storage'
import type { PlanSessionPlace, PlanSessionSnapshot } from '@/lib/plan-session'

type ArmPlanSessionInput = {
  circleId: string
  planId: string | null
  name: string
  startsAt: string
  endsAt: string
  memberUserIds: string[]
  dependents: Array<{ memberId: string; guardianUserId: string | null }>
}

type AddDayPointInput = {
  name: string
  lat: number
  lng: number
  notes?: string | null
}

type PlanSessionCtx = {
  session: PlanSessionSnapshot | null
  active: boolean
  loading: boolean
  refresh: () => Promise<void>
  arm: (input: ArmPlanSessionInput) => Promise<{ ok: boolean; message?: string }>
  disarm: (reason: 'manual' | 'expired') => Promise<void>
  addDayPoint: (input: AddDayPointInput) => Promise<{ ok: boolean; message?: string }>
}

const Ctx = createContext<PlanSessionCtx | null>(null)

export function usePlanSession(): PlanSessionCtx {
  return (
    useContext(Ctx) ?? {
      session: null,
      active: false,
      loading: false,
      refresh: async () => {},
      arm: async () => ({ ok: false, message: 'Sessão indisponível.' }),
      disarm: async () => {},
      addDayPoint: async () => ({ ok: false, message: 'Sessão indisponível.' }),
    }
  )
}

export default function PlanSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PlanSessionSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const remember = useCallback((next: PlanSessionSnapshot | null, pendingSync = false) => {
    setSession(next)
    if (next) {
      void savePlanSession({ session: next, syncedAt: new Date().toISOString(), pendingSync })
    } else {
      void clearPlanSession()
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/plan-sessions', { cache: 'no-store' })
      const data = response.ok ? await response.json().catch(() => null) : null
      remember(data?.session ?? null)
    } catch {
      const cached = await getPlanSession().catch(() => null)
      if (cached?.session) setSession(cached.session)
    } finally {
      setLoading(false)
    }
  }, [remember])

  useEffect(() => {
    let cancelled = false
    getPlanSession()
      .then(cached => {
        if (!cancelled && cached?.session) setSession(cached.session)
      })
      .finally(() => {
        if (!cancelled) void refresh()
      })
    return () => { cancelled = true }
  }, [refresh])

  const arm = useCallback(async (input: ArmPlanSessionInput) => {
    try {
      const response = await fetch('/api/plan-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível armar.' }
      }
      remember(data.session)
      return { ok: true }
    } catch {
      return { ok: false, message: 'Sem rede para armar uma nova sessão.' }
    }
  }, [remember])

  const disarm = useCallback(async (reason: 'manual' | 'expired') => {
    const current = session
    if (!current) return
    remember(null, true)
    try {
      await fetch(`/api/plan-sessions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: reason === 'expired' ? 'expire' : 'disarm' }),
      })
    } catch {
      // Local-first: the visible mode ends now; server reconciliation is a later phase.
    }
  }, [remember, session])

  const addDayPoint = useCallback(async (input: AddDayPointInput) => {
    const current = session
    if (!current) return { ok: false, message: 'Nenhuma sessão armada.' }

    try {
      const response = await fetch(`/api/plan-sessions/${current.id}/places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível marcar.' }
      }
      const next = { ...current, places: [data.place as PlanSessionPlace, ...current.places] }
      remember(next)
      return { ok: true }
    } catch {
      const localPlace: PlanSessionPlace = {
        id: `local:${crypto.randomUUID()}`,
        sessionId: current.id,
        name: input.name,
        lat: input.lat,
        lng: input.lng,
        notes: input.notes ?? null,
        createdBy: current.createdBy,
        createdAt: new Date().toISOString(),
        promotedPlaceId: null,
      }
      remember({ ...current, places: [localPlace, ...current.places] }, true)
      return { ok: true, message: 'Ponto guardado neste aparelho; sincronização fica pendente.' }
    }
  }, [remember, session])

  const value = useMemo<PlanSessionCtx>(() => ({
    session,
    active: session?.status === 'armed',
    loading,
    refresh,
    arm,
    disarm,
    addDayPoint,
  }), [addDayPoint, arm, disarm, loading, refresh, session])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
