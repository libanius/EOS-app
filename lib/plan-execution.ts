import type { PlanDocument, PlanRoute, PlanTrigger, PlanWaypoint } from './family-plan'

export type PlanExecutionStepKind = 'circle' | 'trigger' | 'role' | 'rendezvous' | 'route' | 'finish'

export type PlanExecutionStep = {
  id: string
  kind: PlanExecutionStepKind
  title: string
  body: string
}

const ORDER: Record<string, number> = {
  rendezvous_1: 1,
  rendezvous_2: 2,
  rendezvous_3: 3,
}

function orderedRendezvous(waypoints: PlanWaypoint[]) {
  return waypoints
    .filter(w => w.kind in ORDER)
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

function routeSummary(route: PlanRoute, pt: boolean) {
  const mode = route.mode === 'foot' ? (pt ? 'a pé' : 'on foot') : (pt ? 'de carro' : 'by car')
  return route.notes?.trim()
    ? `${mode}. ${route.notes.trim()}`
    : mode
}

/**
 * PLAN-T08 / D-079: turn the approved plan into a local execution script.
 *
 * This is deliberately deterministic. In a crisis, the Pilot host reads the
 * family's approved plan; it does not invent a new plan because a model found a
 * persuasive sentence.
 */
export function buildPlanExecutionSteps(doc: PlanDocument, pt: boolean): PlanExecutionStep[] {
  const steps: PlanExecutionStep[] = []
  const version = doc.plan?.version ? `v${doc.plan.version}` : pt ? 'versão atual' : 'current version'

  steps.push({
    id: 'circle-alert',
    kind: 'circle',
    title: pt ? 'Alerte o círculo' : 'Alert the circle',
    body: pt
      ? `Diga que o plano ${version} está em execução. Depois peça status e localização de todos.`
      : `Tell the circle that plan ${version} is now running. Then ask everyone for status and location.`,
  })

  ;(doc.triggers ?? []).forEach((trigger, index) => {
    steps.push(triggerStep(trigger, index, pt))
  })

  ;(doc.roles ?? []).forEach((role, index) => {
    steps.push({
      id: `role-${index}`,
      kind: 'role',
      title: pt ? `Papel ${index + 1}` : `Role ${index + 1}`,
      body: role.responsibility,
    })
  })

  for (const point of orderedRendezvous(doc.waypoints ?? [])) {
    const rank = ORDER[point.kind]
    steps.push({
      id: `rendezvous-${point.kind}`,
      kind: 'rendezvous',
      title: pt ? `Ponto ${rank}: ${point.name}` : `Point ${rank}: ${point.name}`,
      body: point.notes?.trim()
        ? point.notes.trim()
        : pt
          ? 'Use este ponto apenas se ele combina com o gatilho e com a orientação oficial.'
          : 'Use this point only if it matches the trigger and official guidance.',
    })
  }

  ;(doc.routes ?? []).forEach((route, index) => {
    steps.push({
      id: `route-${index}`,
      kind: 'route',
      title: route.label,
      body: routeSummary(route, pt),
    })
  })

  steps.push({
    id: 'finish',
    kind: 'finish',
    title: pt ? 'Encerrar só com estado claro' : 'Close only with clear status',
    body: pt
      ? 'Todos precisam estar localizados, seguros/orientados, ou marcados como pendentes com próxima tentativa definida.'
      : 'Everyone must be located, safe/oriented, or marked as pending with a defined next attempt.',
  })

  return steps
}

function triggerStep(trigger: PlanTrigger, index: number, pt: boolean): PlanExecutionStep {
  return {
    id: `trigger-${index}`,
    kind: 'trigger',
    title: pt ? `Gatilho: ${trigger.condition}` : `Trigger: ${trigger.condition}`,
    body: pt ? `Ação combinada: ${trigger.action}` : `Agreed action: ${trigger.action}`,
  }
}
