'use client'

import { useEffect, useMemo, useState } from 'react'
import { executionUndoRemainingMs } from '@/lib/plan-execution-mode'
import { PLAN_EXECUTION_LEGIBILITY_CLASS } from '@/lib/plan-playbook'
import { useLanguage } from '@/lib/i18n'
import PlanExecutionPlaybook from './PlanExecutionPlaybook'
import { usePlanExecution } from './PlanExecutionProvider'

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function formatSeconds(ms: number) {
  return `${Math.ceil(ms / 1000)}s`
}

export default function PlanExecutionBanner() {
  const { execution, active, cancel } = usePlanExecution()
  const { language } = useLanguage()
  const pt = language === 'pt'
  const [open, setOpen] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const now = useNow(active)
  const remainingUndoMs = useMemo(
    () => execution ? executionUndoRemainingMs(execution.startedAt, now) : 0,
    [execution, now],
  )

  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    document.body.classList.add(PLAN_EXECUTION_LEGIBILITY_CLASS)
    return () => document.body.classList.remove(PLAN_EXECUTION_LEGIBILITY_CLASS)
  }, [active])

  if (!active || !execution) return null

  const undoOpen = remainingUndoMs > 0
  const noticeText = execution.notice?.pending
    ? (pt ? 'aviso pendente' : 'notice pending')
    : execution.notice?.delivered
      ? (pt ? 'aviso entregue' : 'notice delivered')
      : (pt ? 'aviso registrado' : 'notice recorded')

  const handleCancel = async () => {
    setMessage(null)
    const result = await cancel()
    if (!result.ok) {
      setMessage(result.message ?? (pt ? 'Não foi possível cancelar.' : 'Could not cancel.'))
      return
    }
    if (result.message) setMessage(result.message)
  }

  return (
    <div className="sim-banner plan-execution-banner" role="status">
      <span className="sim-dot" aria-hidden="true" />
      <button type="button" className="sim-text as-button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <strong>{pt ? 'PLANO EM EXECUÇÃO' : 'PLAN RUNNING'}</strong>
        <em>{execution.planName} · v{execution.planVersion} · {noticeText}</em>
      </button>
      {undoOpen && <span className="sim-clock">{formatSeconds(remainingUndoMs)}</span>}
      {undoOpen ? (
        <button type="button" onClick={() => { void handleCancel() }}>
          {pt ? 'Falso alarme' : 'False alarm'}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(value => !value)}>
          {open ? (pt ? 'Recolher' : 'Collapse') : (pt ? 'Abrir' : 'Open')}
        </button>
      )}

      {open && (
        <div className="sim-controls plan-execution-controls">
          <PlanExecutionPlaybook execution={execution} />
          {message && <em className="plan-execution-msg">{message}</em>}
        </div>
      )}
    </div>
  )
}
