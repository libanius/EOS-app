'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  clearPlanExecution,
  getPlanExecution,
  savePlanExecution,
} from '@/lib/offline-storage'
import { isPlanExecutionActive, type PlanExecutionSnapshot } from '@/lib/plan-execution-mode'
import type { PlanExecutionEscalationDecision, PlanExecutionMemberStatusValue } from '@/lib/plan-execution-state'
import type { PlanSummary } from '@/lib/family-plan'

type StartExecutionInput = {
  circleId: string
  circleName?: string | null
  plan: PlanSummary
  sessionId?: string | null
}

type PlanExecutionCtx = {
  execution: PlanExecutionSnapshot | null
  active: boolean
  loading: boolean
  refresh: () => Promise<void>
  start: (input: StartExecutionInput) => Promise<{ ok: boolean; message?: string }>
  cancel: () => Promise<{ ok: boolean; message?: string }>
  setProtocol: (protocolIndex: number) => Promise<{ ok: boolean; message?: string }>
  setStatus: (status: PlanExecutionMemberStatusValue) => Promise<{ ok: boolean; message?: string }>
  recordEscalation: (decision: PlanExecutionEscalationDecision, stepIndex: number, stepLabel: string) => Promise<{ ok: boolean; message?: string }>
  resolve: () => Promise<{ ok: boolean; message?: string }>
  clearLocal: () => void
}

const Ctx = createContext<PlanExecutionCtx | null>(null)

export function usePlanExecution(): PlanExecutionCtx {
  return (
    useContext(Ctx) ?? {
      execution: null,
      active: false,
      loading: false,
      refresh: async () => {},
      start: async () => ({ ok: false, message: 'Execução indisponível.' }),
      cancel: async () => ({ ok: false, message: 'Execução indisponível.' }),
      setProtocol: async () => ({ ok: false, message: 'Execução indisponível.' }),
      setStatus: async () => ({ ok: false, message: 'Execução indisponível.' }),
      recordEscalation: async () => ({ ok: false, message: 'Execução indisponível.' }),
      resolve: async () => ({ ok: false, message: 'Execução indisponível.' }),
      clearLocal: () => {},
    }
  )
}

export default function PlanExecutionProvider({ children }: { children: ReactNode }) {
  const [execution, setExecution] = useState<PlanExecutionSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const remember = useCallback((next: PlanExecutionSnapshot | null, pendingSync = false) => {
    setExecution(next)
    if (next?.status === 'running') {
      void savePlanExecution({ execution: next, syncedAt: new Date().toISOString(), pendingSync })
    } else {
      void clearPlanExecution()
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/plan-executions', { cache: 'no-store' })
      const data = response.ok ? await response.json().catch(() => null) : null
      remember(data?.execution ?? null)
    } catch {
      const cached = await getPlanExecution().catch(() => null)
      if (cached?.execution) setExecution(cached.execution)
    } finally {
      setLoading(false)
    }
  }, [remember])

  useEffect(() => {
    let cancelled = false
    getPlanExecution()
      .then(cached => {
        if (!cancelled && cached?.execution) setExecution(cached.execution)
      })
      .finally(() => {
        if (!cancelled) void refresh()
      })
    return () => { cancelled = true }
  }, [refresh])

  useEffect(() => {
    if (!isPlanExecutionActive(execution)) return
    const timer = window.setInterval(() => { void refresh() }, 15000)
    return () => window.clearInterval(timer)
  }, [execution, refresh])

  const start = useCallback(async (input: StartExecutionInput) => {
    const localStart = new Date().toISOString()
    try {
      const response = await fetch('/api/plan-executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circleId: input.circleId,
          planId: input.plan.id,
          sessionId: input.sessionId ?? null,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível executar.' }
      }
      if (!data.execution) return { ok: false, message: 'Execução não retornou do servidor.' }
      remember(data.execution as PlanExecutionSnapshot)
      return { ok: true }
    } catch {
      const local: PlanExecutionSnapshot = {
        id: `local:${crypto.randomUUID()}`,
        circleId: input.circleId,
        circleName: input.circleName ?? null,
        planId: input.plan.id,
        planName: input.plan.name,
        planVersion: input.plan.version,
        sessionId: input.sessionId ?? null,
        protocolIndex: null,
        status: 'running',
        startedBy: 'local',
        startedByName: null,
        startedAt: localStart,
        endedAt: null,
        outcome: null,
        notice: { attempted: true, delivered: false, pending: true },
      }
      remember(local, true)
      return { ok: true, message: 'Execução iniciada neste aparelho; aviso pendente de rede.' }
    }
  }, [remember])

  const cancel = useCallback(async () => {
    const current = execution
    if (!current) return { ok: false, message: 'Nenhuma execução ativa.' }
    if (current.id.startsWith('local:')) {
      remember(null, true)
      return { ok: true }
    }
    try {
      const response = await fetch(`/api/plan-executions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível cancelar.' }
      }
      remember(null)
      return { ok: true }
    } catch {
      remember(null, true)
      return { ok: true, message: 'Cancelado neste aparelho; aviso de falso alarme pendente de rede.' }
    }
  }, [execution, remember])

  const setProtocol = useCallback(async (protocolIndex: number) => {
    const current = execution
    if (!current) return { ok: false, message: 'Nenhuma execução ativa.' }
    const localUpdate = { ...current, protocolIndex }
    if (current.id.startsWith('local:')) {
      remember(localUpdate, true)
      return { ok: true }
    }
    try {
      const response = await fetch(`/api/plan-executions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_protocol', protocolIndex }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível escolher o protocolo.' }
      }
      remember((data.execution as PlanExecutionSnapshot | undefined) ?? localUpdate)
      return { ok: true }
    } catch {
      remember(localUpdate, true)
      return { ok: true, message: 'Protocolo escolhido neste aparelho; sincronização pendente de rede.' }
    }
  }, [execution, remember])

  const setStatus = useCallback(async (status: PlanExecutionMemberStatusValue) => {
    const current = execution
    if (!current) return { ok: false, message: 'Nenhuma execução ativa.' }
    if (current.id.startsWith('local:')) {
      return { ok: true, message: 'Estado registrado neste aparelho; sincronização pendente de rede.' }
    }
    try {
      const response = await fetch(`/api/plan-executions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', status }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível atualizar o estado.' }
      }
      return { ok: true }
    } catch {
      return { ok: true, message: 'Estado registrado neste aparelho; sincronização pendente de rede.' }
    }
  }, [execution])

  const recordEscalation = useCallback(async (
    decision: PlanExecutionEscalationDecision,
    stepIndex: number,
    stepLabel: string,
  ) => {
    const current = execution
    if (!current) return { ok: false, message: 'Nenhuma execução ativa.' }
    if (current.id.startsWith('local:')) {
      return { ok: true, message: 'Escalonamento registrado neste aparelho; sincronização pendente de rede.' }
    }
    try {
      const response = await fetch(`/api/plan-executions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'escalation', decision, stepIndex, stepLabel }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível registrar o escalonamento.' }
      }
      return { ok: true }
    } catch {
      return { ok: true, message: 'Escalonamento registrado neste aparelho; sincronização pendente de rede.' }
    }
  }, [execution])

  const resolve = useCallback(async () => {
    const current = execution
    if (!current) return { ok: false, message: 'Nenhuma execução ativa.' }
    if (current.id.startsWith('local:')) {
      remember(null, true)
      return { ok: true, message: 'Encerrado neste aparelho; sincronização pendente de rede.' }
    }
    try {
      const response = await fetch(`/api/plan-executions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error) {
        return { ok: false, message: data?.message ?? data?.error ?? 'Não foi possível encerrar.' }
      }
      remember((data.execution as PlanExecutionSnapshot | undefined) ?? null)
      return { ok: true }
    } catch {
      return { ok: false, message: 'Sem rede para encerrar em todos os aparelhos. Tente novamente quando voltar.' }
    }
  }, [execution, remember])

  const clearLocal = useCallback(() => remember(null), [remember])

  const value = useMemo<PlanExecutionCtx>(() => ({
    execution,
    active: isPlanExecutionActive(execution),
    loading,
    refresh,
    start,
    cancel,
    setProtocol,
    setStatus,
    recordEscalation,
    resolve,
    clearLocal,
  }), [cancel, clearLocal, execution, loading, recordEscalation, refresh, resolve, setProtocol, setStatus, start])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
