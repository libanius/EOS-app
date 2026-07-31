'use client'

/**
 * MemberSheet — tap a face on the map, act on that person (D-073).
 *
 * A marker that only says where someone is answers half a question. The half
 * that matters during an event is "and what do I do about it": go to them, or
 * tell them something.
 *
 * Messages are PRESETS, not free text. Under stress people do not compose, they
 * pick — and a fixed vocabulary is recognised instantly by whoever receives it.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { distanceKm } from '@/lib/world/shelters'
import { directionsUrl, formatDistance, walkingMinutes } from '@/lib/world/navigation'
import { FADE, SPRING, haptic } from './motion'
import { PING_PRESETS, type PingPreset } from '@/lib/family-ping'
import type { PlanDocument } from '@/lib/family-plan'
import { buildPlanExecutionSteps } from '@/lib/plan-execution'

export type MapMember = {
  id: string
  name: string
  lat: number
  lng: number
  freshness: string
  isMe?: boolean
  avatarUrl?: string | null
  approximate?: boolean
}

// The order is the order of likelihood in an event, not alphabetical.
const PRESETS: PingPreset[] = ['where', 'ok', 'on_my_way', 'come_home', 'meet', 'help']

type CircleMember = { user_id: string; name: string; is_me: boolean }
type CircleRow = { id: string; name: string; members?: CircleMember[] }
type ExecutionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; circle: CircleRow; doc: PlanDocument }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string }

export default function MemberSheet({
  member,
  pt,
  myCoords,
  onClose,
  onShowCourse,
}: {
  member: MapMember | null
  pt: boolean
  myCoords: { lat: number; lng: number } | null
  onClose: () => void
  onShowCourse: (destination: { label: string; lat: number; lng: number }) => void
}) {
  const reduceMotion = useReducedMotion()
  const [sent, setSent] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [execution, setExecution] = useState<ExecutionState>({ status: 'idle' })
  const [broadcast, setBroadcast] = useState<string | null>(null)
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set())

  const away = member && myCoords ? distanceKm(myCoords, member) : null
  const executionSteps = useMemo(
    () => execution.status === 'ready' ? buildPlanExecutionSteps(execution.doc, pt) : [],
    [execution, pt],
  )

  const send = async (preset: string) => {
    if (!member) return
    haptic.impact()
    setFailed(null)
    const response = await fetch('/api/family/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: member.id, preset, pt }),
    })
      .then(r => r.json())
      .catch(() => null)

    if (response?.ok) setSent(preset)
    // Honest failure: the sender must not believe a message arrived when the
    // recipient has no device registered for notifications.
    else setFailed(response?.reason === 'no_device'
      ? (pt ? 'Ela ainda não ativou os alertas no aparelho.' : 'They have not enabled alerts on their device.')
      : (pt ? 'Não foi possível entregar agora.' : 'Could not deliver right now.'))
  }

  const loadExecution = async () => {
    haptic.impact()
    setExecution({ status: 'loading' })
    setBroadcast(null)
    setDoneSteps(new Set())

    const circlesResponse = await fetch('/api/circles').catch(() => null)
    const circlesData = circlesResponse?.ok
      ? ((await circlesResponse.json().catch(() => null)) as { circles?: CircleRow[] } | null)
      : null
    const circle = circlesData?.circles?.find(c => (c.members ?? []).some(m => !m.is_me)) ?? circlesData?.circles?.[0] ?? null
    if (!circle) {
      setExecution({
        status: 'empty',
        message: pt ? 'Crie ou entre em um círculo antes de executar um plano.' : 'Create or join a circle before running a plan.',
      })
      return
    }

    const planResponse = await fetch(`/api/plans?circleId=${circle.id}`, { cache: 'no-store' }).catch(() => null)
    const doc = planResponse?.ok ? ((await planResponse.json().catch(() => null)) as PlanDocument | null) : null
    if (!doc?.plan) {
      setExecution({
        status: 'empty',
        message: pt ? 'Este círculo ainda não tem um plano salvo.' : 'This circle does not have a saved plan yet.',
      })
      return
    }

    setExecution({ status: 'ready', circle, doc })
  }

  const alertCircle = async () => {
    if (execution.status !== 'ready') return
    haptic.impact()
    setBroadcast(pt ? 'Enviando alerta...' : 'Sending alert...')
    const targets = (execution.circle.members ?? []).filter(m => !m.is_me)
    if (!targets.length) {
      setBroadcast(pt ? 'Nenhum outro membro neste círculo.' : 'No other member in this circle.')
      return
    }

    const results = await Promise.all(
      targets.map(target =>
        fetch('/api/family/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toUserId: target.user_id, preset: 'execute_plan', pt }),
        })
          .then(r => r.json())
          .catch(() => null),
      ),
    )
    const delivered = results.filter(r => r?.ok).length
    setBroadcast(
      delivered
        ? pt
          ? `Alerta entregue a ${delivered}/${targets.length}.`
          : `Alert delivered to ${delivered}/${targets.length}.`
        : pt
          ? 'Nenhum aparelho recebeu o push agora.'
          : 'No device received the push right now.',
    )
  }

  const toggleStep = (id: string) => {
    haptic.selection()
    setDoneSteps(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <AnimatePresence>
      {member && (
        <>
          <motion.button
            type="button"
            className="wv2-pilot-scrim"
            aria-label={pt ? 'Fechar' : 'Close'}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          />
          <motion.section
            className="wv2-member wv2-fume"
            role="dialog"
            aria-label={member.name}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, filter: 'blur(12px)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30 }}
            transition={reduceMotion ? { duration: 0.12 } : SPRING.sheet}
          >
            <header>
              <span className="face" aria-hidden="true">
                {member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatarUrl} alt="" />
                ) : (
                  member.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="who">
                <strong className="t-title2">{member.name}</strong>
                <em className="t-foot ink-2">
                  {member.approximate
                    ? pt
                      ? 'Endereço do perfil, não posição atual'
                      : 'Profile address, not a current position'
                    : `${pt ? 'Leitura' : 'Reading'} ${member.freshness}`}
                  {away !== null && ` · ${formatDistance(away, pt)}`}
                  {away !== null && away <= 12 && ` · ~${walkingMinutes(away)} min ${pt ? 'a pé' : 'on foot'}`}
                </em>
              </span>
            </header>

            {!member.isMe && (
              <>
                <div className="go">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      haptic.impact()
                      onShowCourse({ label: member.name, lat: member.lat, lng: member.lng })
                      onClose()
                    }}
                  >
                    {pt ? 'Rota até ela' : 'Route to them'}
                  </button>
                  <a
                    href={directionsUrl({ lat: member.lat, lng: member.lng }, member.name)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => haptic.impact()}
                  >
                    {pt ? 'Abrir no app de mapas' : 'Open in maps'}
                  </a>
                </div>

                <p className="t-caps ink-3 label">{pt ? 'Mandar mensagem' : 'Send a message'}</p>
                <div className="presets">
                  {PRESETS.map(key => (
                    <button
                      key={key}
                      type="button"
                      className={sent === key ? 'done' : ''}
                      disabled={sent === key}
                      onClick={() => send(key)}
                    >
                      {sent === key ? `✓ ${pt ? 'Enviado' : 'Sent'}` : PING_PRESETS[key][pt ? 'pt' : 'en']}
                    </button>
                  ))}
                </div>
                {failed && <p className="t-foot warn">{failed}</p>}
              </>
            )}

            {member.isMe && (
              <section className="execute-plan">
                <p className="t-caps ink-3 label">{pt ? 'Comando familiar' : 'Family command'}</p>
                <div className="go">
                  <button type="button" className="primary" onClick={loadExecution} disabled={execution.status === 'loading'}>
                    {execution.status === 'loading'
                      ? pt ? 'Carregando...' : 'Loading...'
                      : pt ? 'Executar plano' : 'Run plan'}
                  </button>
                  <button type="button" className={sent === 'ok' ? 'marked' : ''} onClick={() => setSent('ok')}>
                    {sent === 'ok' ? pt ? 'Seguro marcado' : 'Safe marked' : pt ? 'Estou seguro' : 'I am safe'}
                  </button>
                </div>

                {execution.status === 'idle' && (
                  <p className="t-foot ink-3 note">
                    {pt
                      ? 'O Pilot vira host: carrega a versão atual do plano, alerta o círculo e guia a ordem de ação.'
                      : 'Pilot becomes the host: it loads the current plan, alerts the circle and guides the action order.'}
                  </p>
                )}

                {(execution.status === 'empty' || execution.status === 'error') && (
                  <p className="t-foot warn">{execution.message}</p>
                )}

                {execution.status === 'ready' && (
                  <>
                    <div className="execution-head">
                      <strong className="t-title2">{execution.doc.plan?.name ?? (pt ? 'Plano da família' : 'Family plan')}</strong>
                      <span className="t-foot ink-3">
                        {pt ? 'Host local' : 'Local host'} · v{execution.doc.plan?.version ?? '—'}
                      </span>
                    </div>
                    <button type="button" className="broadcast" onClick={alertCircle}>
                      {pt ? 'Alertar círculo: executar agora' : 'Alert circle: run now'}
                    </button>
                    {broadcast && <p className="t-foot ink-3 note">{broadcast}</p>}

                    <div className="execution-steps">
                      {executionSteps.map((step, index) => {
                        const done = doneSteps.has(step.id)
                        return (
                          <button
                            key={step.id}
                            type="button"
                            className={done ? 'done' : ''}
                            onClick={() => toggleStep(step.id)}
                          >
                            <span className="num">{done ? '✓' : index + 1}</span>
                            <span>
                              <strong>{step.title}</strong>
                              <em>{step.body}</em>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </section>
            )}

            {member.approximate && (
              <p className="t-foot ink-3 note">
                {pt
                  ? 'Para ver onde ela realmente está, ela precisa abrir o Mundo e conceder o GPS uma vez.'
                  : 'To see where they actually are, they need to open World and grant GPS once.'}
              </p>
            )}
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}
