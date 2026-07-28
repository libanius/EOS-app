'use client'

/**
 * Pilot — the specialist you talk to.
 *
 * This is the highest-value surface in EOS, so it is a CONVERSATION, not a card
 * with a verdict. The plan a family executes is built here, in dialogue.
 *
 * Three ideas hold it together:
 *
 *  1. THE ANSWER IS ALREADY THERE. The first message is produced by the local,
 *     synchronous engine (pilot-engine.ts) the instant the surface opens — no
 *     spinner, and it still works with no network. Conversation is ADDITIVE
 *     (D-062.1): when there is a connection you can also talk to it.
 *
 *  2. TONE FOLLOWS THE RISK INDEX. Calm and teaching on a quiet day; imperative
 *     and three-steps-max when it is critical. The instructor in a crisis does
 *     not open with "great question".
 *
 *  3. ADVICE BECOMES WORK. If the specialist says to buy fuel, that arrives as a
 *     TASK you can add to the checklist with one tap. Advice that evaporates
 *     when the screen closes is why preparedness apps fail. The tap is required:
 *     nothing edits the family's plan silently (UPP-03, D-067).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { FADE, SPRING, haptic } from './motion'
import {
  PILOT_INTENTS,
  askPilot,
  type PilotAnswer,
  type PilotContext,
  type PilotIntentId,
  type PilotVerdict,
} from './pilot-engine'
import type { PilotDestination, PilotTask } from '@/app/api/pilot/chat/route'
import { bearing, compassPoint, distanceKm } from '@/lib/world/shelters'
import { directionsUrl, formatDistance } from '@/lib/world/navigation'

type Message = {
  id: string
  role: 'pilot' | 'user'
  text: string
  detail?: string
  verdict?: PilotVerdict
  factors?: Array<{ label: string; value: string }>
  actions?: PilotAnswer['actions']
  tasks?: PilotTask[]
  destinations?: PilotDestination[]
  caveat?: string
}

const COPY = {
  pt: {
    title: 'Pilot',
    subtitleByState: {
      safe: 'modo calmo · há tempo',
      watch: 'atento · priorize',
      warning: 'focado · aja hoje',
      critical: 'resposta imediata',
    },
    placeholder: 'Pergunte ao seu especialista',
    send: 'Enviar',
    thinking: 'Analisando com a base de conhecimento…',
    offline: 'Sem rede. O Pilot segue respondendo pelo motor local — toque nas perguntas abaixo.',
    unavailable: 'Não consegui falar com a base agora. As respostas locais continuam funcionando.',
    addTask: 'Adicionar',
    added: 'No checklist',
    tasksTitle: 'Vira tarefa',
    goTitle: 'Ir até lá',
    navigate: 'Iniciar navegação',
    open: 'Abrir o Pilot, seu especialista EOS',
    close: 'Fechar',
    suggestions: 'Perguntas',
  },
  en: {
    title: 'Pilot',
    subtitleByState: {
      safe: 'calm mode · there is time',
      watch: 'alert · prioritise',
      warning: 'focused · act today',
      critical: 'immediate response',
    },
    placeholder: 'Ask your specialist',
    send: 'Send',
    thinking: 'Checking the knowledge base…',
    offline: 'No network. The Pilot still answers from the local engine — tap a question below.',
    unavailable: 'I could not reach the knowledge base. Local answers still work.',
    addTask: 'Add',
    added: 'On checklist',
    tasksTitle: 'Becomes a task',
    goTitle: 'Go there',
    navigate: 'Start navigation',
    open: 'Open the Pilot, your EOS specialist',
    close: 'Close',
    suggestions: 'Questions',
  },
} as const

const VERDICT_LABEL: Record<PilotVerdict, { pt: string; en: string }> = {
  ready: { pt: 'Tudo certo', en: 'All clear' },
  watch: { pt: 'Atenção', en: 'Watch' },
  hold: { pt: 'Prepare', en: 'Prepare' },
  act: { pt: 'Aja agora', en: 'Act now' },
}

let seq = 0
const nextId = () => `m${++seq}`

function fromAnswer(answer: PilotAnswer): Message {
  return {
    id: nextId(),
    role: 'pilot',
    text: answer.headline,
    detail: answer.body,
    verdict: answer.verdict,
    factors: answer.factors,
    actions: answer.actions,
    caveat: answer.caveat,
  }
}

export default function Pilot({ ctx, online }: { ctx: PilotContext; online: boolean }) {
  const { language } = useLanguage()
  const reduceMotion = useReducedMotion()
  const c = COPY[language]
  const pt = ctx.pt

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set())
  const streamRef = useRef<HTMLDivElement>(null)

  const opening = useMemo(() => askPilot('now', ctx), [ctx])

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = streamRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  // Opening brief: local, instant, offline-safe. Never a spinner.
  useEffect(() => {
    if (!open) return
    setMessages(current => (current.length ? current : [fromAnswer(opening)]))
    scrollToEnd()
  }, [open, opening, scrollToEnd])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const push = (message: Message) => {
    setMessages(current => [...current, message])
    scrollToEnd()
  }

  /** Local engine — instant and offline. Used by the suggestion chips. */
  const askLocal = (intent: PilotIntentId, label: string) => {
    haptic.selection()
    push({ id: nextId(), role: 'user', text: label })
    push(fromAnswer(askPilot(intent, ctx)))
  }

  /** The specialist. Needs network; degrades honestly when it is missing. */
  const send = async () => {
    const question = draft.trim()
    if (!question || busy) return
    haptic.impact()
    setDraft('')
    push({ id: nextId(), role: 'user', text: question })

    if (!online) {
      push({ id: nextId(), role: 'pilot', text: c.offline })
      return
    }

    setBusy(true)
    const history = [...messages, { id: 'x', role: 'user' as const, text: question }]
      .filter(m => m.role === 'user' || m.text)
      .slice(-8)
      .map(m => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }))

    try {
      const response = await fetch('/api/pilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          context: {
            pt,
            riskState: ctx.riskState,
            score: ctx.score,
            headline: opening.headline,
            autonomyDays: ctx.autonomyDays,
            waterDays: ctx.waterDays,
            foodDays: ctx.foodDays,
            powerDays: ctx.powerDays,
            fuelDays: ctx.fuelDays,
            checklistPct: ctx.checklistPct,
            people: ctx.household.people,
            hasInfants: ctx.household.hasInfants,
            hasMedicalConditions: ctx.household.hasMedicalConditions,
            mobilityImpaired: ctx.household.mobilityImpaired,
            simulated: ctx.simulated ?? false,
            // Everything the app already knows. Withholding this is what made
            // the Pilot answer "I have no real-time access" while the dashboard
            // was showing the temperature two centimetres away.
            weather: ctx.snapshot?.current
              ? {
                  tempF: ctx.snapshot.current.temp_f,
                  feelsF: ctx.snapshot.current.feels_like_f,
                  humidityPct: ctx.snapshot.current.humidity_pct,
                  windMph: ctx.snapshot.current.wind_mph,
                  gustMph: ctx.snapshot.current.wind_gust_mph,
                  uvIndex: ctx.snapshot.current.uv_index,
                  visibilityMi: ctx.snapshot.current.visibility_mi,
                  pressureHpa: ctx.snapshot.current.pressure_hpa,
                  precipProbPct: ctx.snapshot.current.precip_prob_pct,
                  condition: ctx.snapshot.current.condition,
                }
              : null,
            airQualityAqi: ctx.snapshot?.air_quality?.us_aqi ?? null,
            alerts: (ctx.snapshot?.alerts ?? []).map(a => ({
              severity: a.severity,
              type: a.type,
              headline: a.headline,
            })),
            earthquakes: (ctx.snapshot?.earthquakes ?? []).map(e => ({
              magnitude: e.magnitude,
              place: e.place,
            })),
            hourly: (ctx.snapshot?.hourly ?? []).slice(0, 8).map(h => ({
              hour: new Date(h.time_iso).toLocaleTimeString(pt ? 'pt-BR' : 'en-US', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              tempF: h.temp_f,
              precipProbPct: h.precip_prob_pct,
              gustMph: h.wind_gust_mph,
            })),
            nearestShelter: ctx.nearestShelter,
            sheltersKnown: ctx.sheltersKnown,
            inventory: ctx.inventory
              ? {
                  waterLiters: ctx.inventory.water_liters,
                  foodDays: ctx.inventory.food_days,
                  fuelLiters: ctx.inventory.fuel_liters,
                  batteryPercent: ctx.inventory.battery_percent,
                  hasMedicalKit: ctx.inventory.has_medical_kit,
                  hasCommsDevice: ctx.inventory.has_communication_device,
                }
              : null,
            locationLabel: ctx.locationLabel ?? null,
            selfCoords: ctx.coords ?? null,
            // Geometry is computed HERE, not by the model. Language models get
            // trigonometry confidently wrong, and a wrong bearing in an
            // emergency points a family the wrong way.
            family: (ctx.family ?? []).map(m => ({
              name: m.name,
              lat: m.lat,
              lng: m.lng,
              freshness: m.freshness,
              isMe: Boolean(m.isMe),
              distanceKm: ctx.coords ? distanceKm(ctx.coords, m) : 0,
              heading: ctx.coords ? compassPoint(bearing(ctx.coords, m), pt) : '—',
            })),
            searchedPlace: ctx.searchedPlace
              ? {
                  label: ctx.searchedPlace.label,
                  lat: ctx.searchedPlace.lat,
                  lng: ctx.searchedPlace.lng,
                  distanceKm: ctx.coords ? distanceKm(ctx.coords, ctx.searchedPlace) : 0,
                  heading: ctx.coords ? compassPoint(bearing(ctx.coords, ctx.searchedPlace), pt) : '—',
                }
              : null,
            shelterList: (ctx.shelters ?? []).map(sh => ({
              name: sh.name,
              lat: sh.lat,
              lng: sh.lng,
              distanceKm: sh.distanceKm,
              heading: ctx.coords ? compassPoint(bearing(ctx.coords, sh), pt) : '—',
            })),
            fetchedAt: ctx.snapshot?.fetched_at
              ? new Date(ctx.snapshot.fetched_at).toLocaleTimeString(pt ? 'pt-BR' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : null,
          },
        }),
      })
      const data = (await response.json()) as {
        reply?: string | null
        tasks?: PilotTask[]
        destinations?: PilotDestination[]
        error?: string
      }
      push({
        id: nextId(),
        role: 'pilot',
        text: data.reply || c.unavailable,
        tasks: data.tasks?.length ? data.tasks : undefined,
        destinations: data.destinations?.length ? data.destinations : undefined,
      })
    } catch {
      push({ id: nextId(), role: 'pilot', text: c.unavailable })
    } finally {
      setBusy(false)
      scrollToEnd()
    }
  }

  /** One tap turns advice into work. Never automatic. */
  const addTask = async (task: PilotTask) => {
    haptic.impact()
    setAddedTasks(current => new Set(current).add(task.name))
    await fetch('/api/checklist/save-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kitType: 'GERAL',
        items: [{ name: task.name, tier: task.tier, quantity: task.quantity ?? 1, unit: task.unit ?? null }],
      }),
    }).catch(() => {
      setAddedTasks(current => {
        const next = new Set(current)
        next.delete(task.name)
        return next
      })
    })
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            className="wv2-pilot-scrim"
            aria-label={c.close}
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            className="wv2-pilot-chat wv2-fume"
            data-state={ctx.riskState}
            role="dialog"
            aria-label={c.title}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, filter: 'blur(14px)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, filter: 'blur(10px)' }}
            transition={reduceMotion ? { duration: 0.12 } : SPRING.sheet}
          >
            <header className="chat-head">
              <span className="chat-id">
                <strong className="t-title2">{c.title}</strong>
                <em className="t-foot">{c.subtitleByState[ctx.riskState]}</em>
              </span>
              <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label={c.close}>
                <CloseIcon />
              </button>
            </header>

            <div className="chat-stream" ref={streamRef}>
              {messages.map(message =>
                message.role === 'user' ? (
                  <p key={message.id} className="chat-user t-body">{message.text}</p>
                ) : (
                  <article key={message.id} className="chat-pilot" data-verdict={message.verdict}>
                    {message.verdict && (
                      <span className="chat-verdict t-caps">{VERDICT_LABEL[message.verdict][pt ? 'pt' : 'en']}</span>
                    )}
                    <p className="chat-headline t-title2">{message.text}</p>
                    {message.detail && <p className="t-body ink-2">{message.detail}</p>}

                    {message.factors && message.factors.length > 0 && (
                      <div className="chat-factors">
                        {message.factors.map(f => (
                          <span key={`${f.label}${f.value}`}>
                            <em className="t-caps ink-3">{f.label}</em>
                            <b className="t-foot">{f.value}</b>
                          </span>
                        ))}
                      </div>
                    )}

                    {message.caveat && <p className="chat-caveat t-foot">{message.caveat}</p>}

                    {message.tasks && (
                      <div className="chat-tasks">
                        <p className="t-caps ink-3">{c.tasksTitle}</p>
                        {message.tasks.map(task => {
                          const done = addedTasks.has(task.name)
                          return (
                            <div key={task.name} className="chat-task">
                              <span>
                                <strong className="t-sub">{task.name}</strong>
                                {task.why && <em className="t-foot ink-3">{task.why}</em>}
                              </span>
                              <button
                                type="button"
                                className={done ? 'done' : ''}
                                disabled={done}
                                onClick={() => addTask(task)}
                              >
                                {done ? c.added : c.addTask}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {message.destinations && (
                      <div className="chat-destinations">
                        <p className="t-caps ink-3">{c.goTitle}</p>
                        {message.destinations.map(destination => {
                          const away = ctx.coords ? distanceKm(ctx.coords, destination) : null
                          const heading = ctx.coords
                            ? compassPoint(bearing(ctx.coords, destination), pt)
                            : null
                          return (
                            <div key={`${destination.lat},${destination.lng}`} className="chat-destination">
                              <span>
                                <strong className="t-sub">{destination.label}</strong>
                                {away !== null && (
                                  <em className="t-foot ink-3">
                                    {formatDistance(away, pt)} · {heading}
                                  </em>
                                )}
                              </span>
                              <a
                                href={directionsUrl(destination, destination.label)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => haptic.impact()}
                              >
                                {c.navigate}
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {message.actions && message.actions.length > 0 && (
                      <div className="chat-actions">
                        {message.actions.map(action => (
                          <Link
                            key={action.href + action.label}
                            href={action.href}
                            className={`wv2-pill${action.primary ? ' primary' : ''}`}
                            onClick={() => haptic.impact()}
                          >
                            {action.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </article>
                ),
              )}
              {busy && <p className="chat-thinking t-sub ink-2">{c.thinking}</p>}
            </div>

            <div className="chat-suggestions" aria-label={c.suggestions}>
              {PILOT_INTENTS.map(intent => (
                <button
                  key={intent.id}
                  type="button"
                  className="pilot-chip"
                  onClick={() => askLocal(intent.id, pt ? intent.pt : intent.en)}
                >
                  {pt ? intent.pt : intent.en}
                </button>
              ))}
            </div>

            <form
              className="chat-compose"
              onSubmit={event => {
                event.preventDefault()
                void send()
              }}
            >
              <input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder={online ? c.placeholder : c.offline}
                aria-label={c.placeholder}
                disabled={busy}
                enterKeyHint="send"
              />
              <button type="submit" disabled={busy || !draft.trim()} aria-label={c.send}>
                <SendIcon />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {/* The orb steps aside once the conversation is open — the header owns
          the close from then on, and two stacked close buttons is noise. */}
      {!open && (
        <button
          type="button"
          className="wv2-pilot-orb wv2-fume"
          data-open="false"
          aria-expanded={false}
          aria-label={c.open}
          onClick={() => {
            haptic.impact()
            setOpen(true)
          }}
        >
          <SparkIcon />
        </button>
      )}
    </>
  )
}

function SparkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5C10.1 8 11.5 6.6 12 3Z" fill="currentColor" />
      <path d="M17.8 14.5c.28 2 1.05 2.77 3.05 3.05-2 .28-2.77 1.05-3.05 3.05-.28-2-1.05-2.77-3.05-3.05 2-.28 2.77-1.05 3.05-3.05Z" fill="currentColor" opacity="0.72" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
