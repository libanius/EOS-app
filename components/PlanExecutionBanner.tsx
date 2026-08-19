'use client'

import { useEffect, useMemo, useState } from 'react'
import { EXECUTION_UNDO_WINDOW_MS, executionUndoRemainingMs } from '@/lib/plan-execution-mode'
import { useLanguage } from '@/lib/i18n'
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
          <span>{pt ? 'Playbook' : 'Playbook'}</span>
          <strong>{execution.circleName ?? (pt ? 'Círculo' : 'Circle')}</strong>
          <em>
            {pt
              ? `Iniciado ${Math.min(EXECUTION_UNDO_WINDOW_MS, Math.max(0, now - Date.parse(execution.startedAt))) >= EXECUTION_UNDO_WINDOW_MS ? 'há 30s+' : 'agora'}`
              : `Started ${Math.min(EXECUTION_UNDO_WINDOW_MS, Math.max(0, now - Date.parse(execution.startedAt))) >= EXECUTION_UNDO_WINDOW_MS ? '30s+ ago' : 'now'}`}
          </em>
          {message && <em className="plan-execution-msg">{message}</em>}
        </div>
      )}
    </div>
  )
}
