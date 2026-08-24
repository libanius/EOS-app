import type { PlanDocument, PlanSummary } from '../family-plan'
import {
  familyPlanDocumentKey,
  selectOfflineFamilyPlan,
  type StoredFamilyPlan,
} from '../offline-storage'

function summary(id: string, name: string): PlanSummary {
  return {
    id,
    name,
    version: 1,
    status: 'draft',
    updated_at: '2026-08-19T00:00:00.000Z',
  }
}

function cachedPlan(circleId: string, plan: PlanSummary): StoredFamilyPlan {
  return {
    circleId,
    planId: plan.id,
    document: {
      plan,
      waypoints: [],
      routes: [],
      roles: [],
      triggers: [],
      acknowledgedBy: [],
      myAck: null,
    } satisfies PlanDocument,
    version: plan.version,
    syncedAt: '2026-08-19T00:00:00.000Z',
  }
}

describe('offline family plan cache', () => {
  it('keys plan documents by circle and plan', () => {
    expect(familyPlanDocumentKey('circle-1', 'plan-a')).toBe('family-plan:circle-1:plan-a')
    expect(familyPlanDocumentKey('circle-1', 'plan-b')).toBe('family-plan:circle-1:plan-b')
  })

  it('lists every cached plan offline and opens the chosen plan', () => {
    const circleId = 'circle-1'
    const plans = [
      summary('plan-a', 'Incendio em casa'),
      summary('plan-b', 'Furacao'),
      summary('plan-c', 'Encontro em evento'),
    ]
    const cachedPlans = plans.map(plan => cachedPlan(circleId, plan))

    const selection = selectOfflineFamilyPlan(plans, cachedPlans, 'plan-b')

    expect(selection.plans).toHaveLength(3)
    expect(selection.plans.map(plan => plan.id)).toEqual(['plan-a', 'plan-b', 'plan-c'])
    expect(selection.planId).toBe('plan-b')
    expect(selection.cached?.document.plan?.name).toBe('Furacao')
  })
})
