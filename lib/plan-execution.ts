import {
  protocolActionTypeLabel,
  type PlanDocument,
  type PlanRoute,
  type PlanTrigger,
  type PlanWaypoint,
  type WaypointKind,
} from './family-plan'

export type PlanExecutionStepKind = 'circle' | 'trigger' | 'role' | 'rendezvous' | 'route' | 'finish'

export type PlanExecutionStep = {
  id: string
  kind: PlanExecutionStepKind
  title: string
  body: string
}

export type PlanExecutionProtocol = {
  id: string
  label: string
  trigger: PlanTrigger | null
  triggerIndex: number | null
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

export function inferRendezvousKind(trigger: PlanTrigger | null): WaypointKind | null {
  if (trigger?.destination_kind) return trigger.destination_kind

  const text = `${trigger?.condition ?? ''} ${trigger?.action ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (/(evacu|fora da regiao|out-of-region|regional|saida)/.test(text)) return 'rendezvous_3'
  if (/\b(bairro|neighbourhood|neighborhood|escola|school)\b/.test(text)) return 'rendezvous_2'
  if (/\b(casa|porta|imovel|doorstep|home|building)\b/.test(text)) return 'rendezvous_1'
  return null
}

function destinationCopy(kind: WaypointKind | null, pt: boolean) {
  if (!kind) {
    return pt
      ? 'Revise os pontos do plano e escolha o destino que combina com este protocolo.'
      : 'Review the plan points and choose the destination that matches this protocol.'
  }
  return pt
    ? 'Destino provável para este protocolo. Confirme se a orientação oficial não mudou.'
    : 'Likely destination for this protocol. Confirm official guidance has not changed.'
}

export function buildPlanExecutionProtocols(doc: PlanDocument, pt: boolean): PlanExecutionProtocol[] {
  const triggers = doc.triggers ?? []
  if (!triggers.length) {
    return [{
      id: 'general',
      label: pt ? 'Execução geral do plano' : 'General plan execution',
      trigger: null,
      triggerIndex: null,
    }]
  }

  return triggers.map((trigger, index) => ({
    id: `trigger-${index}`,
    label: trigger.condition,
    trigger,
    triggerIndex: index,
  }))
}

/**
 * PLAN-T08 / D-079: turn the approved plan into a local execution script.
 *
 * This is deliberately deterministic. In a crisis, the Pilot host reads the
 * family's approved plan; it does not invent a new plan because a model found a
 * persuasive sentence.
 */
export function buildPlanExecutionSteps(
  doc: PlanDocument,
  pt: boolean,
  protocol: PlanExecutionProtocol | PlanTrigger | null = null,
): PlanExecutionStep[] {
  const steps: PlanExecutionStep[] = []
  const version = doc.plan?.version ? `v${doc.plan.version}` : pt ? 'versão atual' : 'current version'
  const trigger = protocol && 'trigger' in protocol ? protocol.trigger : protocol
  const inferredKind = inferRendezvousKind(trigger)

  steps.push({
    id: 'circle-alert',
    kind: 'circle',
    title: pt ? 'Alerte o círculo' : 'Alert the circle',
    body: pt
      ? `Diga que o plano ${version} está em execução. Depois peça status e localização de todos.`
      : `Tell the circle that plan ${version} is now running. Then ask everyone for status and location.`,
  })

  if (trigger) {
    steps.push(triggerStep(trigger, pt))
  } else if (doc.triggers?.length) {
    steps.push({
      id: 'protocol-missing',
      kind: 'trigger',
      title: pt ? 'Escolha o protocolo' : 'Choose the protocol',
      body: pt
        ? 'Antes de avançar, selecione qual gatilho está acontecendo agora.'
        : 'Before continuing, select which trigger is happening now.',
    })
  }

  ;(doc.roles ?? []).forEach((role, index) => {
    steps.push({
      id: `role-${index}`,
      kind: 'role',
      title: pt ? `Papel ${index + 1}` : `Role ${index + 1}`,
      body: role.responsibility,
    })
  })

  const rendezvous = orderedRendezvous(doc.waypoints ?? [])
  const matchingRendezvous = inferredKind
    ? rendezvous.filter(point => point.kind === inferredKind)
    : []
  const selectedRendezvous = matchingRendezvous.length ? matchingRendezvous : rendezvous

  for (const point of selectedRendezvous) {
    const rank = ORDER[point.kind]
    steps.push({
      id: `rendezvous-${point.kind}`,
      kind: 'rendezvous',
      title: pt ? `Ponto ${rank}: ${point.name}` : `Point ${rank}: ${point.name}`,
      body: point.notes?.trim()
        ? point.notes.trim()
        : destinationCopy(inferredKind, pt),
    })
  }

  const matchingRoutes = trigger?.route_label
    ? (doc.routes ?? []).filter(route => route.label === trigger.route_label)
    : []
  const routes = matchingRoutes.length ? matchingRoutes : (doc.routes ?? [])

  routes.forEach((route, index) => {
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

function triggerStep(trigger: PlanTrigger, pt: boolean): PlanExecutionStep {
  const type = protocolActionTypeLabel(trigger.action_type, pt)
  const notify = trigger.notify_circle === false
    ? pt
      ? ' Este protocolo não depende de push: execute mesmo sem rede.'
      : ' This protocol does not depend on push: run it even offline.'
    : ''

  return {
    id: 'active-protocol',
    kind: 'trigger',
    title: `${type}: ${trigger.condition}`,
    body: (pt ? `Ação combinada: ${trigger.action}` : `Agreed action: ${trigger.action}`) + notify,
  }
}
