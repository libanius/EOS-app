'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PlanDocument } from '@/lib/family-plan'
import type { PlanExecutionSnapshot } from '@/lib/plan-execution-mode'
import { buildPlanPlaybook, type PlanCoordinate } from '@/lib/plan-playbook'
import { promotableSessionPlaces, type PlanSessionPlace, type PlanSessionSnapshot } from '@/lib/plan-session'
import {
  buildPlanExecutionSharedState,
  type PlanExecutionAdult,
  type PlanExecutionDependent,
  type PlanExecutionMemberStatusValue,
  type PlanExecutionStateEvent,
} from '@/lib/plan-execution-state'
import { getFamilyPlan, getProfile, saveFamilyPlan } from '@/lib/offline-storage'
import { useLanguage } from '@/lib/i18n'
import PlanChart from './world-v2/PlanChart'
import { usePlanExecution } from './PlanExecutionProvider'
import { usePlanSession } from './PlanSessionProvider'

type ProfileState = {
  id: string | null
  origin: PlanCoordinate | null
}

type FichaResponse = {
  ficha?: {
    id?: string
    location_lat?: number | null
    location_lng?: number | null
  }
}

type ExecutionStateSeed = {
  members: PlanExecutionAdult[]
  dependents: PlanExecutionDependent[]
  events: PlanExecutionStateEvent[]
  escalationMinutes: number | null
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

export default function PlanExecutionPlaybook({ execution }: { execution: PlanExecutionSnapshot }) {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const { setProtocol, setStatus, recordEscalation, resolve, cancel, refresh } = usePlanExecution()
  const { refresh: refreshPlanSession } = usePlanSession()
  const [doc, setDoc] = useState<PlanDocument | null>(null)
  const [profile, setProfile] = useState<ProfileState>({ id: null, origin: null })
  const [stateSeed, setStateSeed] = useState<ExecutionStateSeed | null>(null)
  const [source, setSource] = useState<'cache' | 'network' | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [closingPlaces, setClosingPlaces] = useState<PlanSessionPlace[] | null>(null)
  const [closingReviewed, setClosingReviewed] = useState(false)
  const [promotingIds, setPromotingIds] = useState<Set<string>>(() => new Set())
  const now = useNow(true)

  useEffect(() => {
    let cancelled = false
    getProfile()
      .then(cached => {
        if (!cancelled && cached?.id) setProfile(value => ({ ...value, id: cached.id }))
      })
      .catch(() => {})

    fetch('/api/profile/ficha', { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<FichaResponse> : null)
      .then(data => {
        const ficha = data?.ficha
        if (cancelled || !ficha?.id) return
        const lat = ficha.location_lat
        const lng = ficha.location_lng
        setProfile({
          id: ficha.id,
          origin: Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat as number, lng: lng as number } : null,
        })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setMessage(null)
      const cached = await getFamilyPlan(execution.circleId, execution.planId).catch(() => null)
      if (!cancelled && cached?.document) {
        setDoc(cached.document)
        setSource('cache')
      }

      try {
        const response = await fetch(
          `/api/plans?circleId=${encodeURIComponent(execution.circleId)}&planId=${encodeURIComponent(execution.planId)}`,
          { cache: 'no-store' },
        )
        const data = response.ok ? await response.json().catch(() => null) as PlanDocument | null : null
        if (!data?.plan) {
          if (!cached?.document && !cancelled) setMessage(pt ? 'Plano indisponível neste aparelho.' : 'Plan unavailable on this device.')
          return
        }
        if (cancelled) return
        setDoc(data)
        setSource('network')
        void saveFamilyPlan({
          circleId: execution.circleId,
          planId: execution.planId,
          document: data,
          version: data.plan.version,
          syncedAt: new Date().toISOString(),
        })
      } catch {
        if (!cached?.document && !cancelled) {
          setMessage(pt ? 'Sem rede e sem cache deste plano.' : 'Offline and this plan is not cached.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [execution.circleId, execution.planId, pt])

  useEffect(() => {
    let cancelled = false

    async function loadState() {
      if (execution.id.startsWith('local:')) return
      try {
        const response = await fetch(`/api/plan-executions/${encodeURIComponent(execution.id)}`, { cache: 'no-store' })
        const data = response.ok ? await response.json().catch(() => null) : null
        if (cancelled) return
        if (data?.execution) {
          if (data.execution.status !== 'running') {
            await refresh()
            return
          }
        }
        if (data?.state) setStateSeed(data.state as ExecutionStateSeed)
      } catch {
        /* Sem rede: mantemos a última leitura de estado na tela. */
      }
    }

    void loadState()
    const timer = window.setInterval(() => { void loadState() }, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [execution.id, execution.protocolIndex, refresh])

  const playbook = useMemo(() => doc
    ? buildPlanPlaybook({
        doc,
        execution,
        userId: profile.id ?? execution.startedBy,
        origin: profile.origin,
        pt,
      })
    : null,
  [doc, execution, profile.id, profile.origin, pt])

  const handleProtocol = async (index: number) => {
    setMessage(null)
    const result = await setProtocol(index)
    if (!result.ok || result.message) {
      setMessage(result.message ?? (pt ? 'Não foi possível escolher o protocolo.' : 'Could not choose protocol.'))
    }
  }

  const fallbackStateSeed = useMemo<ExecutionStateSeed>(() => ({
    members: [{ userId: profile.id ?? execution.startedBy, name: execution.startedByName ?? null }],
    dependents: [],
    events: [],
    escalationMinutes: playbook?.activeProtocol?.trigger?.escalation_minutes ?? null,
  }), [execution.startedBy, execution.startedByName, playbook?.activeProtocol?.trigger?.escalation_minutes, profile.id])

  const sharedState = useMemo(() => buildPlanExecutionSharedState({
    ...(stateSeed ?? fallbackStateSeed),
    escalationMinutes: stateSeed?.escalationMinutes ?? fallbackStateSeed.escalationMinutes,
    startedAt: execution.startedAt,
    nowMs: now,
    pt,
  }), [execution.startedAt, fallbackStateSeed, now, pt, stateSeed])

  const handleStatus = async (status: PlanExecutionMemberStatusValue) => {
    setMessage(null)
    const result = await setStatus(status)
    const actorUserId = profile.id ?? execution.startedBy
    setStateSeed(current => ({
      ...(current ?? fallbackStateSeed),
      events: [
        ...((current ?? fallbackStateSeed).events),
        {
          actorUserId,
          kind: status === 'at_place' ? 'arrived' : 'status',
          payload: { status },
          createdAt: new Date().toISOString(),
        },
      ],
    }))
    if (!result.ok || result.message) {
      setMessage(result.message ?? (pt ? 'Não foi possível atualizar seu estado.' : 'Could not update your status.'))
    }
  }

  const handleEscalation = async (decision: 'taken' | 'deferred') => {
    setMessage(null)
    const result = await recordEscalation(decision, sharedState.escalation.stepIndex, sharedState.escalation.stepLabel)
    setStateSeed(current => ({
      ...(current ?? fallbackStateSeed),
      events: [
        ...((current ?? fallbackStateSeed).events),
        {
          actorUserId: profile.id ?? execution.startedBy,
          kind: decision === 'taken' ? 'escalation_taken' : 'escalation_suggested',
          payload: {
            decision,
            step_index: sharedState.escalation.stepIndex,
            step_label: sharedState.escalation.stepLabel,
          },
          createdAt: new Date().toISOString(),
        },
      ],
    }))
    if (!result.ok || result.message) {
      setMessage(result.message ?? (pt ? 'Não foi possível registrar.' : 'Could not record.'))
    }
  }

  const finishResolve = async () => {
    setMessage(null)
    const result = await resolve()
    if (!result.ok || result.message) {
      setMessage(result.message ?? (pt ? 'Não foi possível encerrar.' : 'Could not close.'))
    }
  }

  const handleResolve = async () => {
    setMessage(null)
    if (!closingReviewed && execution.sessionId && !execution.sessionId.startsWith('local:')) {
      try {
        const response = await fetch(`/api/plan-sessions/${encodeURIComponent(execution.sessionId)}`, { cache: 'no-store' })
        const data = response.ok ? await response.json().catch(() => null) : null
        const session = data?.session as PlanSessionSnapshot | undefined
        const places = session ? promotableSessionPlaces(session) : []
        if (places.length > 0) {
          setClosingPlaces(places)
          return
        }
      } catch {
        setMessage(pt
          ? 'Não consegui carregar os pontos do dia agora. O registro da execução será mantido.'
          : 'Could not load day points now. The execution record will be kept.')
      }
      setClosingReviewed(true)
    }
    await finishResolve()
  }

  const handleSkipPromotions = async () => {
    setClosingReviewed(true)
    setClosingPlaces(null)
    await finishResolve()
  }

  const handlePromotePlace = async (place: PlanSessionPlace) => {
    if (!execution.sessionId || place.id.startsWith('local:')) {
      setMessage(pt ? 'Este ponto ainda não sincronizou.' : 'This point is not synced yet.')
      return
    }
    setMessage(null)
    setPromotingIds(current => new Set(current).add(place.id))
    try {
      const response = await fetch(`/api/plan-sessions/${encodeURIComponent(execution.sessionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote_place', placeId: place.id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.error || !data?.place) {
        setMessage(data?.message ?? data?.error ?? (pt ? 'Não foi possível promover.' : 'Could not promote.'))
        return
      }
      const promoted = data.place as PlanSessionPlace
      setClosingPlaces(current => (current ?? []).map(item => item.id === promoted.id ? promoted : item))
      await refreshPlanSession()
    } catch {
      setMessage(pt ? 'Sem rede para promover este ponto agora.' : 'Offline; cannot promote this point now.')
    } finally {
      setPromotingIds(current => {
        const next = new Set(current)
        next.delete(place.id)
        return next
      })
    }
  }

  const handleFalseAlarm = async () => {
    setMessage(null)
    const result = await cancel()
    if (!result.ok || result.message) {
      setMessage(result.message ?? (pt ? 'Não foi possível cancelar.' : 'Could not cancel.'))
    }
  }

  if (loading && !doc) {
    return <div className="plan-playbook"><p>{pt ? 'Carregando playbook...' : 'Loading playbook...'}</p></div>
  }

  if (!doc || !playbook) {
    return <div className="plan-playbook"><p>{message ?? (pt ? 'Playbook indisponível.' : 'Playbook unavailable.')}</p></div>
  }

  const nav = playbook.navigation
  const openPromotionPlaces = (closingPlaces ?? []).filter(place => !place.promotedPlaceId)

  return (
    <div className="plan-playbook">
      <div className="plan-playbook-head">
        <span>{pt ? 'Playbook offline' : 'Offline playbook'}</span>
        <strong>{playbook.activeProtocol?.label ?? (pt ? 'Escolha o protocolo' : 'Choose protocol')}</strong>
        {source === 'cache' && <em>{pt ? 'do cache' : 'from cache'}</em>}
      </div>

      {playbook.needsProtocolChoice && (
        <div className="plan-protocol-choices" aria-label={pt ? 'Protocolos' : 'Protocols'}>
          {playbook.protocolChoices.map((choice, index) => (
            <button key={choice.id} type="button" onClick={() => { void handleProtocol(index) }}>
              {choice.label}
            </button>
          ))}
        </div>
      )}

      {nav && (
        <div className="plan-playbook-nav" aria-label={pt ? 'Rumo até o ponto ativo' : 'Bearing to active point'}>
          <span>{nav.targetName}</span>
          <strong>{nav.compass} · {nav.bearingDegrees}°</strong>
          <em>{nav.distanceText} · ~{nav.walkingMinutes} min {pt ? 'a pé' : 'on foot'}</em>
        </div>
      )}

      {playbook.systemNotices.map(notice => (
        <p key={notice} className="plan-system-notice">{notice}</p>
      ))}

      <section className="plan-next-action" aria-label={pt ? 'Próximas ações' : 'Next actions'}>
        <span>{pt ? 'Próxima ação' : 'Next action'}</span>
        <ol>
          {playbook.numberedSteps.map((step, index) => {
            const checked = done.has(step.id)
            return (
              <li key={step.id} className={checked ? 'done' : undefined}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => setDone(current => {
                    const next = new Set(current)
                    if (next.has(step.id)) next.delete(step.id)
                    else next.add(step.id)
                    return next
                  })}
                >
                  <b>{index + 1}</b>
                  <span>
                    <strong>{step.title}</strong>
                    <em>{step.body}</em>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {playbook.dependentBriefs.length > 0 && (
        <section className="plan-dependent-briefs" aria-label={pt ? 'Carta do dependente' : 'Dependent brief'}>
          <span>{pt ? 'Carta do dependente' : 'Dependent brief'}</span>
          {playbook.dependentBriefs.map(brief => (
            <blockquote key={brief.id}>{brief.instruction}</blockquote>
          ))}
        </section>
      )}

      <section className="plan-execution-state" aria-label={pt ? 'Estado da execução' : 'Execution status'}>
        <div className="plan-state-actions">
          {([
            ['at_place', pt ? 'No local' : 'At place'],
            ['on_the_way', pt ? 'A caminho' : 'On the way'],
            ['searching', pt ? 'Procurando' : 'Searching'],
            ['no_signal', pt ? 'Sem sinal' : 'No signal'],
          ] as Array<[PlanExecutionMemberStatusValue, string]>).map(([status, label]) => (
            <button key={status} type="button" onClick={() => { void handleStatus(status) }}>
              {label}
            </button>
          ))}
        </div>

        <div className="plan-state-list">
          {sharedState.members.map(member => (
            <div key={member.userId} className="plan-state-row">
              <strong>{member.name}</strong>
              <span>{member.label}</span>
              <em>{member.ageMinutes === null ? (pt ? 'sem leitura' : 'no reading') : `${member.ageMinutes} min`}</em>
            </div>
          ))}
          {sharedState.dependents.map(dependent => (
            <div key={dependent.memberId} className="plan-state-row dependent">
              <strong>{dependent.name}</strong>
              <span>{dependent.label}</span>
              <em>{dependent.guardianName ?? (pt ? 'responsável pendente' : 'guardian pending')}</em>
            </div>
          ))}
        </div>

        <div className={`plan-escalation${sharedState.escalation.due ? ' due' : ''}`}>
          <span>{pt ? 'Escalonamento' : 'Escalation'}</span>
          <strong>
            {sharedState.escalation.due
              ? (pt ? `Sugerido: ${sharedState.escalation.stepLabel}` : `Suggested: ${sharedState.escalation.stepLabel}`)
              : (pt
                ? `Próxima sugestão em ${Math.max(0, sharedState.escalation.intervalMinutes - sharedState.escalation.ageMinutes)} min`
                : `Next suggestion in ${Math.max(0, sharedState.escalation.intervalMinutes - sharedState.escalation.ageMinutes)} min`)}
          </strong>
          <em>{pt ? `Intervalo do protocolo: ${sharedState.escalation.intervalMinutes} min` : `Protocol interval: ${sharedState.escalation.intervalMinutes} min`}</em>
          <div>
            <button type="button" onClick={() => { void handleEscalation('taken') }}>
              {pt ? 'Fiz isso' : 'Did it'}
            </button>
            <button type="button" onClick={() => { void handleEscalation('deferred') }}>
              {pt ? 'Ainda não' : 'Not yet'}
            </button>
          </div>
        </div>

        {closingPlaces && (
          <div className="plan-promotion-panel" aria-label={pt ? 'Promover pontos do dia' : 'Promote day points'}>
            <span>{pt ? 'Pontos do dia' : 'Day points'}</span>
            <strong>{pt ? 'Guardar algum no catálogo do círculo?' : 'Save any to the circle catalog?'}</strong>
            <em>{pt
              ? 'Isso não muda a versão do plano. Recusar não apaga o registro da execução.'
              : 'This does not change the plan version. Refusing does not erase the execution record.'}</em>
            {closingPlaces.map(place => {
              const promoted = Boolean(place.promotedPlaceId)
              const localOnly = place.id.startsWith('local:')
              return (
                <div key={place.id} className="plan-promotion-row">
                  <span>
                    <b>{place.name}</b>
                    <small>{place.lat.toFixed(5)}, {place.lng.toFixed(5)}</small>
                  </span>
                  <button
                    type="button"
                    disabled={promoted || localOnly || promotingIds.has(place.id)}
                    onClick={() => { void handlePromotePlace(place) }}
                  >
                    {promoted
                      ? (pt ? 'Guardado' : 'Saved')
                      : localOnly
                        ? (pt ? 'Pendente' : 'Pending')
                        : promotingIds.has(place.id)
                          ? (pt ? 'Guardando...' : 'Saving...')
                          : (pt ? 'Guardar' : 'Save')}
                  </button>
                </div>
              )
            })}
            <div className="plan-promotion-actions">
              <button type="button" onClick={() => { void handleSkipPromotions() }}>
                {openPromotionPlaces.length > 0
                  ? (pt ? 'Encerrar sem guardar' : 'Close without saving')
                  : (pt ? 'Encerrar' : 'Close')}
              </button>
            </div>
          </div>
        )}

        {!closingPlaces && (
          <div className="plan-close-actions">
            <button type="button" onClick={() => { void handleResolve() }}>
              {pt ? 'Encontrada — encerrar' : 'Found — close'}
            </button>
            <button type="button" onClick={() => { void handleFalseAlarm() }}>
              {pt ? 'Falso alarme' : 'False alarm'}
            </button>
          </div>
        )}
      </section>

      <PlanChart waypoints={doc.waypoints ?? []} routes={doc.routes ?? []} pt={pt} />

      {playbook.otherRoleSteps.length > 0 && (
        <details className="plan-other-roles">
          <summary>{pt ? 'Outros papéis' : 'Other roles'}</summary>
          <ul>
            {playbook.otherRoleSteps.map(step => (
              <li key={step.id}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {message && <p className="plan-execution-msg">{message}</p>}
    </div>
  )
}
