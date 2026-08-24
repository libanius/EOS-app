import {
  buildPlanExecutionSharedState,
  escalationButtonEffects,
  normalizeEscalationMinutes,
} from '../plan-execution-state'
import { isPlanExecutionActive, type PlanExecutionSnapshot } from '../plan-execution-mode'

describe('EXEC-T05 — estado compartilhado e encerramento', () => {
  it('deriva o estado de cada adulto com idade em minutos', () => {
    const state = buildPlanExecutionSharedState({
      members: [{ userId: 'ana', name: 'Ana' }],
      dependents: [],
      startedAt: '2026-08-19T12:00:00.000Z',
      escalationMinutes: 15,
      nowMs: Date.parse('2026-08-19T12:09:00.000Z'),
      pt: true,
      events: [{
        actorUserId: 'ana',
        kind: 'status',
        payload: { status: 'on_the_way' },
        createdAt: '2026-08-19T12:05:00.000Z',
      }],
    })

    expect(state.members).toEqual([{
      userId: 'ana',
      name: 'Ana',
      status: 'on_the_way',
      label: 'a caminho',
      updatedAt: '2026-08-19T12:05:00.000Z',
      ageMinutes: 4,
    }])
  })

  it('mantém dependentes na lista como sem aparelho', () => {
    const state = buildPlanExecutionSharedState({
      members: [],
      dependents: [{ memberId: 'child', name: 'Lia', guardianUserId: 'ana', guardianName: 'Ana' }],
      events: [],
      startedAt: '2026-08-19T12:00:00.000Z',
      nowMs: Date.parse('2026-08-19T12:01:00.000Z'),
      pt: true,
    })

    expect(state.dependents).toEqual([{
      memberId: 'child',
      name: 'Lia',
      status: 'no_device',
      label: 'sem aparelho',
      guardianUserId: 'ana',
      guardianName: 'Ana',
    }])
  })

  it('usa escalonamento por protocolo com padrão e faixa segura', () => {
    expect(normalizeEscalationMinutes(null)).toBe(15)
    expect(normalizeEscalationMinutes(1)).toBe(5)
    expect(normalizeEscalationMinutes(999)).toBe(120)

    const state = buildPlanExecutionSharedState({
      members: [],
      dependents: [],
      events: [],
      startedAt: '2026-08-19T12:00:00.000Z',
      escalationMinutes: 5,
      nowMs: Date.parse('2026-08-19T12:06:00.000Z'),
      pt: true,
    })

    expect(state.escalation).toMatchObject({
      due: true,
      intervalMinutes: 5,
      stepIndex: 0,
      stepLabel: 'segurança do evento',
      ageMinutes: 6,
    })
  })

  it('botões de escalonamento só registram evento, sem ação externa', () => {
    expect(escalationButtonEffects()).toEqual({
      recordsEvent: true,
      executesExternalAction: false,
    })
  })

  it('execução resolvida deixa de ser modo ativo', () => {
    const execution = { status: 'resolved' } as PlanExecutionSnapshot
    expect(isPlanExecutionActive(execution)).toBe(false)
  })
})
