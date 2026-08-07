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
 *     preparedness proposal with source and type. Advice that evaporates when
 *     the screen closes is why preparedness apps fail. The tap is required:
 *     nothing edits the family's plan or readiness silently (UPP-03, D-067,
 *     D-092).
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
import type { PilotDestination, PilotMemoryProposal, PilotTask } from '@/app/api/pilot/chat/route'
import { bearing, compassPoint, distanceKm } from '@/lib/world/shelters'
import { directionsUrl, formatDistance } from '@/lib/world/navigation'

type Message = {
  id: string
  role: 'pilot' | 'user'
  /**
   * `brief` é a resposta do motor local: uma manchete curta, com fatores e
   * ressalva. `chat` é conversa livre — prosa, que precisa ser lida como prosa.
   *
   * Antes tudo caía no mesmo molde e o texto do chat era renderizado em
   * `t-title2`: parágrafos inteiros em corpo de manchete. Era a poluição que o
   * dono apontou, e a razão de não sobrar espaço para a etiqueta.
   */
  kind?: 'brief' | 'chat'
  text: string
  detail?: string
  verdict?: PilotVerdict
  factors?: Array<{ label: string; value: string }>
  actions?: PilotAnswer['actions']
  tasks?: PilotTask[]
  memory?: PilotMemoryProposal[]
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
    added: 'Na preparação',
    tasksTitle: 'Propostas de preparação',
    source: 'Fonte',
    destination: 'Destino',
    taskKind: {
      resource: 'Recurso',
      task: 'Tarefa',
      plan_review: 'Plano',
      comms_setup: 'Comms',
    },
    memoryTitle: 'Memória do Pilot',
    saveMemory: 'Salvar memória',
    memorySaved: 'Memória salva',
    goTitle: 'Ir até lá',
    showOnMap: 'Ver no mapa',
    navigate: 'Abrir no app de mapas',
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
    added: 'In preparedness',
    tasksTitle: 'Preparedness proposals',
    source: 'Source',
    destination: 'Destination',
    taskKind: {
      resource: 'Resource',
      task: 'Task',
      plan_review: 'Plan',
      comms_setup: 'Comms',
    },
    memoryTitle: 'Pilot memory',
    saveMemory: 'Save memory',
    memorySaved: 'Memory saved',
    goTitle: 'Go there',
    showOnMap: 'Show on map',
    navigate: 'Open in maps app',
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

/** O veredito do servidor entra no MESMO vocabulário de etiqueta do motor local. */
const GUARD_TAG: Record<string, PilotVerdict> = {
  GO: 'ready', LIMITED: 'watch', WAIT: 'hold', AVOID: 'act', PRIORITY_OVERRIDE: 'act',
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

export default function Pilot({
  ctx,
  online,
  open,
  onOpenChange,
  incoming,
  onShowCourse,
}: {
  ctx: PilotContext
  online: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A question typed in the PilotBar. The nonce lets the same text be re-asked. */
  incoming: { text: string; nonce: number } | null
  onShowCourse: (destination: PilotDestination) => void
}) {
  const { language } = useLanguage()
  const reduceMotion = useReducedMotion()
  const c = COPY[language]
  const pt = ctx.pt

  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set())
  const [savedMemory, setSavedMemory] = useState<Set<string>>(new Set())
  const streamRef = useRef<HTMLDivElement>(null)
  /** Há resposta nova abaixo e a pessoa está lendo mais acima. */
  const [temNovidade, setTemNovidade] = useState(false)

  const opening = useMemo(() => askPilot('now', ctx), [ctx])

  /**
   * Rolagem que respeita quem está lendo (D-125).
   *
   * A versão anterior puxava a conversa para o fim SEMPRE. O dono relatou o
   * efeito: começa a ler a resposta, o cartão de tarefas chega no final, a tela
   * salta para baixo e ele perde a linha — tendo que subir de novo, para o
   * texto fugir outra vez.
   *
   * A regra é a de qualquer conversa boa: **só acompanha o fim quem já estava
   * no fim.** Quem subiu para reler fica onde está, e um aviso discreto diz que
   * há coisa nova embaixo.
   */
  const grudadoNoFim = useRef(true)

  const perto = useCallback(() => {
    const el = streamRef.current
    if (!el) return true
    // 64px de folga: o dedo raramente para exatamente no fim.
    return el.scrollHeight - el.scrollTop - el.clientHeight < 64
  }, [])

  const scrollToEnd = useCallback((forcar = false) => {
    if (!forcar && !grudadoNoFim.current) {
      setTemNovidade(true)
      return
    }
    requestAnimationFrame(() => {
      const el = streamRef.current
      if (el) el.scrollTop = el.scrollHeight
      setTemNovidade(false)
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
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Mobile keyboards shrink the visual viewport WITHOUT changing dvh, so the
  // compose field slid under the keyboard and vanished. Track the real visible
  // height and lift the sheet by the covered amount.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      document.documentElement.style.setProperty('--wv2-keyboard', `${Math.round(covered)}px`)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      document.documentElement.style.setProperty('--wv2-keyboard', '0px')
    }
  }, [open])

  // A question typed in the bar arrives here and is sent as if it had been
  // typed in the conversation — one entry point, one behaviour.
  const lastIncoming = useRef(0)
  useEffect(() => {
    if (!incoming || incoming.nonce === lastIncoming.current) return
    lastIncoming.current = incoming.nonce
    setMessages(current => (current.length ? current : [fromAnswer(opening)]))
    setDraft(incoming.text)
    void sendQuestion(incoming.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming])

  const push = (message: Message) => {
    setMessages(current => [...current, message])
    scrollToEnd()
  }

  /**
   * Atualiza uma bolha que já está na tela.
   *
   * É o que permite a resposta crescer enquanto chega, em vez de aparecer
   * inteira de uma vez. Sem isto, cada pedaço viraria uma bolha nova.
   */
  const replace = (id: string, fn: (m: Message) => Message) => {
    setMessages(current => current.map(m => (m.id === id ? fn(m) : m)))
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
    setDraft('')
    await sendQuestion(question)
  }

  const sendQuestion = async (question: string) => {
    if (!question.trim() || busy) return
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
      const response = await fetch('/api/pilot/chat?stream=1', {
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
            downSources: ctx.downSources ?? [],
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
            // Ciclones e vento medido: sem isto, o Pilot dizia não enxergar um
            // evento que o mapa ao lado estava desenhando (D-079).
            cyclones: ctx.cyclones ?? [],
            wind: ctx.wind ?? null,
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
      /*
       * A resposta CHEGA ESCREVENDO (D-125).
       *
       * Antes o cliente esperava o JSON inteiro e despejava tudo de uma vez —
       * o dono descreveu como "explode na tela". Agora o servidor manda a
       * etiqueta determinística primeiro, depois o texto em pedaços, e só no
       * fim as tarefas e destinos.
       *
       * A ordem importa: a etiqueta não depende do modelo, então não faz
       * sentido esperar o texto para saber que há uma regra crítica ativa.
       */
      const idResposta = nextId()
      let acumulado = ''
      let criada = false

      const leitor = response.body?.getReader()
      if (!leitor) throw new Error('sem corpo')
      const decoder = new TextDecoder()
      let buffer = ''

      const aplicar = (evento: string, dados: Record<string, unknown>) => {
        if (evento === 'guard') {
          const g = dados as unknown as { verdict: string; binding: boolean; headline: string; rules: string[] }
          push({
            id: idResposta,
            role: 'pilot',
            kind: 'chat',
            text: '',
            verdict: GUARD_TAG[g.verdict] ?? undefined,
            // A frase determinística só aparece quando é vinculante. Nos casos
            // tranquilos ela seria ruído em cima de uma conversa normal.
            caveat: g.binding ? g.headline : undefined,
            factors: g.binding && g.rules.length ? g.rules.map(r => ({ label: '', value: r })) : undefined,
          })
          criada = true
          scrollToEnd()
          return
        }
        if (evento === 'delta') {
          acumulado += String((dados as { text?: string }).text ?? '')
          if (!criada) { push({ id: idResposta, role: 'pilot', kind: 'chat', text: acumulado }); criada = true }
          else replace(idResposta, m => ({ ...m, text: acumulado }))
          scrollToEnd()
          return
        }
        if (evento === 'done') {
          const d = dados as unknown as {
            reply?: string; tasks?: PilotTask[]; memory?: PilotMemoryProposal[]; destinations?: PilotDestination[]
          }
          replace(idResposta, m => ({
            ...m,
            text: d.reply || acumulado || c.unavailable,
            tasks: d.tasks?.length ? d.tasks : undefined,
            memory: d.memory?.length ? d.memory : undefined,
            destinations: d.destinations?.length ? d.destinations : undefined,
          }))
          scrollToEnd()
        }
      }

      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocos = buffer.split('\n\n')
        buffer = blocos.pop() ?? ''
        for (const bloco of blocos) {
          const evento = bloco.match(/^event: (.+)$/m)?.[1]
          const dados = bloco.match(/^data: (.+)$/m)?.[1]
          if (!evento || !dados) continue
          try { aplicar(evento, JSON.parse(dados)) } catch { /* bloco parcial: o próximo fecha */ }
        }
      }
      if (!criada) push({ id: idResposta, role: 'pilot', kind: 'chat', text: c.unavailable })
    } catch {
      push({ id: nextId(), role: 'pilot', kind: 'chat', text: c.unavailable })
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
        kitType: 'PILOT_RECOMMENDATION',
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

  const saveMemory = async (memory: PilotMemoryProposal) => {
    haptic.impact()
    setSavedMemory(current => new Set(current).add(memory.proposal_md))
    await fetch('/api/profile/personalization/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'pilot_chat',
        reason: memory.reason,
        proposal_md: memory.proposal_md,
      }),
    }).catch(() => {
      setSavedMemory(current => {
        const next = new Set(current)
        next.delete(memory.proposal_md)
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
            onClick={() => onOpenChange(false)}
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
              <button type="button" className="chat-close" onClick={() => onOpenChange(false)} aria-label={c.close}>
                <CloseIcon />
              </button>
            </header>

            <div
              className="chat-stream"
              ref={streamRef}
              onScroll={() => {
                // Quem chegou ao fim volta a ser levado pelo fim; quem subiu
                // para reler deixa de ser arrastado.
                grudadoNoFim.current = perto()
                if (grudadoNoFim.current) setTemNovidade(false)
              }}
            >
              {messages.map(message =>
                message.role === 'user' ? (
                  <p key={message.id} className="chat-user t-body">{message.text}</p>
                ) : (
                  <article key={message.id} className="chat-pilot" data-verdict={message.verdict}>
                    {message.verdict && (
                      <span className="chat-verdict t-caps">{VERDICT_LABEL[message.verdict][pt ? 'pt' : 'en']}</span>
                    )}
                    {message.text && (
                      <p className={message.kind === 'chat' ? 'chat-prose t-body' : 'chat-headline t-title2'}>
                        {message.text}
                      </p>
                    )}
                    {message.detail && <p className="t-body ink-2">{message.detail}</p>}

                    {message.factors && message.factors.length > 0 && (
                      <div className="chat-factors">
                        {message.factors.map(f => (
                          <span key={`${f.label}${f.value}`}>
                            {f.label && <em className="t-caps ink-3">{f.label}</em>}
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
                                <i className="chat-task-kind">{c.taskKind[task.kind]}</i>
                                <strong className="t-sub">{task.name}</strong>
                                {task.why && <em className="t-foot ink-3">{task.why}</em>}
                                <em className="t-foot ink-3">{c.source}: {task.source}</em>
                                <em className="t-foot ink-3">{c.destination}: {task.destination}</em>
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

                    {message.memory && (
                      <div className="chat-memory">
                        <p className="t-caps ink-3">{c.memoryTitle}</p>
                        {message.memory.map(memory => {
                          const done = savedMemory.has(memory.proposal_md)
                          return (
                            <div key={memory.proposal_md} className="chat-memory-item">
                              <span>
                                <strong className="t-sub">{memory.title}</strong>
                                {memory.reason && <em className="t-foot ink-3">{memory.reason}</em>}
                                <code>{memory.proposal_md}</code>
                              </span>
                              <button
                                type="button"
                                className={done ? 'done' : ''}
                                disabled={done}
                                onClick={() => saveMemory(memory)}
                              >
                                {done ? c.memorySaved : c.saveMemory}
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
                              <span className="go">
                                {/* EOS answers first, on its own map. The phone's
                                    maps app is the second step, for turn-by-turn. */}
                                <button
                                  type="button"
                                  className="primary"
                                  onClick={() => {
                                    haptic.impact()
                                    onShowCourse(destination)
                                    onOpenChange(false)
                                  }}
                                >
                                  {c.showOnMap}
                                </button>
                                <a
                                  href={directionsUrl(destination, destination.label)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => haptic.impact()}
                                >
                                  {c.navigate}
                                </a>
                              </span>
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

            {/*
              Aviso de conteúdo novo, para quem está lendo mais acima.
              Substitui o salto automático: em vez de arrastar a pessoa, avisa
              e deixa ela decidir quando descer.
            */}
            {temNovidade && (
              <button
                type="button"
                className="chat-jump"
                onClick={() => { grudadoNoFim.current = true; scrollToEnd(true) }}
              >
                {pt ? 'Resposta nova ↓' : 'New answer ↓'}
              </button>
            )}

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

    </>
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
