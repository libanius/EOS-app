import {
  HOLD_TO_EXECUTE_MS,
  UNDO_BANNER_BEHAVIOR,
  executionUndoRemainingMs,
  holdDurationTriggersExecution,
  isExecutionUndoOpen,
  planExecutionEntryState,
  planExecutionTriggerEffects,
} from '../plan-execution-mode'
import type { PlanSummary } from '../family-plan'

const plan = (id: string, name = `Plano ${id}`): PlanSummary => ({
  id,
  name,
  version: 3,
  status: 'active',
  updated_at: '2026-08-19T12:00:00.000Z',
})

describe('EXEC-T03 — disparo de execução', () => {
  it('não dispara com toque curto', () => {
    expect(holdDurationTriggersExecution(HOLD_TO_EXECUTE_MS - 1)).toBe(false)
    expect(holdDurationTriggersExecution(HOLD_TO_EXECUTE_MS)).toBe(true)
  })

  it('modela o gesto como uma ação única: criar execução, avisar e abrir playbook', () => {
    expect(planExecutionTriggerEffects()).toEqual({
      createsExecution: true,
      sendsNotice: true,
      opensPlaybook: true,
    })
  })

  it('com um plano só, não abre escolha e mantém o nome visível na tela de segurar', () => {
    expect(planExecutionEntryState([plan('fire', 'Incêndio em casa')])).toEqual({
      kind: 'hold',
      plan: plan('fire', 'Incêndio em casa'),
      highlightedPlanId: null,
    })
  })

  it('com vários planos, destaca o plano da sessão sem esconder os demais', () => {
    expect(planExecutionEntryState([plan('a'), plan('b'), plan('c')], 'b')).toEqual({
      kind: 'select',
      plans: [plan('b'), plan('a'), plan('c')],
      highlightedPlanId: 'b',
    })
  })

  it('fecha a janela de desfazer depois de 30 segundos', () => {
    const startedAt = '2026-08-19T12:00:00.000Z'
    expect(isExecutionUndoOpen(startedAt, Date.parse('2026-08-19T12:00:29.999Z'))).toBe(true)
    expect(executionUndoRemainingMs(startedAt, Date.parse('2026-08-19T12:00:29.999Z'))).toBe(1)
    expect(isExecutionUndoOpen(startedAt, Date.parse('2026-08-19T12:00:30.000Z'))).toBe(false)
  })

  it('mantém a faixa de desfazer fora do bloqueio do playbook', () => {
    expect(UNDO_BANNER_BEHAVIOR).toEqual({
      presentation: 'banner',
      blocksPlaybook: false,
    })
  })
})
