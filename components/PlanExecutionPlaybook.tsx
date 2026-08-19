'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PlanDocument } from '@/lib/family-plan'
import type { PlanExecutionSnapshot } from '@/lib/plan-execution-mode'
import { buildPlanPlaybook, type PlanCoordinate } from '@/lib/plan-playbook'
import { getFamilyPlan, getProfile, saveFamilyPlan } from '@/lib/offline-storage'
import { useLanguage } from '@/lib/i18n'
import PlanChart from './world-v2/PlanChart'
import { usePlanExecution } from './PlanExecutionProvider'

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

export default function PlanExecutionPlaybook({ execution }: { execution: PlanExecutionSnapshot }) {
  const { language } = useLanguage()
  const pt = language === 'pt'
  const { setProtocol } = usePlanExecution()
  const [doc, setDoc] = useState<PlanDocument | null>(null)
  const [profile, setProfile] = useState<ProfileState>({ id: null, origin: null })
  const [source, setSource] = useState<'cache' | 'network' | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(() => new Set())

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

  if (loading && !doc) {
    return <div className="plan-playbook"><p>{pt ? 'Carregando playbook...' : 'Loading playbook...'}</p></div>
  }

  if (!doc || !playbook) {
    return <div className="plan-playbook"><p>{message ?? (pt ? 'Playbook indisponível.' : 'Playbook unavailable.')}</p></div>
  }

  const nav = playbook.navigation

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
