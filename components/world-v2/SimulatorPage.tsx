'use client'

/**
 * Simulator — the Cenário page, rebuilt on the World v2 design system (D-067).
 *
 * Framed as a flight-sim briefing rather than a form: you set the environment,
 * you start the session, and the WHOLE app flies in it. The old page was a
 * one-shot question box in a different visual language; this one is the cockpit.
 *
 * It reuses `.wv2` tokens by wrapping in that scope, so the simulator and the
 * dashboard cannot drift apart.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/i18n'
import { useSimulation } from '@/components/SimulationProvider'
import {
  DEFAULT_SIMULATION,
  SOURCE_LABELS,
  THREATS,
  type ReserveLevel,
  type Severity,
  type SimulationConfig,
  type SimulationSources,
  type SimulationValues,
  type SourceMode,
  type ThreatType,
} from '@/lib/simulation'
import { Card, Pill, SectionLabel } from './primitives'
import MaisNav from './MaisNav'
import { SPRING, haptic } from './motion'
import './world-v2.css'

const COPY = {
  pt: {
    eyebrow: 'Simulador',
    title: 'Treine antes que seja real',
    lead: 'Configure a situação. O EOS inteiro passa a se comportar como se fosse verdade — índice de risco, Pilot, autonomia e mapa.',
    describe: 'Descreva a situação',
    placeholder: 'Ex.: furacão categoria 3 chegando em 12 horas. Minha filha machucou o joelho e não consegue andar rápido.',
    applyText: 'Aplicar nos painéis',
    applyingText: 'Interpretando…',
    parseHint: 'O EOS preenche os painéis com OpenAI. Revise antes de iniciar.',
    parseError: 'Não consegui interpretar. Ajuste os painéis manualmente.',
    threat: 'Ameaça',
    severity: 'Severidade',
    arrival: 'Chegada',
    now: 'agora',
    hours: 'h',
    conditions: 'O que já falhou',
    powerOut: 'Energia cortada',
    networkDown: 'Sem rede',
    roadsBlocked: 'Vias bloqueadas',
    household: 'A família nesta simulação',
    mobility: 'Alguém não consegue se locomover',
    medical: 'Alguém precisa de medicação',
    reserves: 'Reservas',
    reserveReal: 'Reais',
    reserveHalf: 'Metade',
    reserveCritical: 'No limite',
    start: 'Iniciar simulação',
    duration: 'Duração do exercício',
    durationWhy: 'O treino se encerra sozinho e gera o debrief. Dá para esticar durante, se precisar.',
    shareWith: 'Compartilhar com',
    shareHint: 'Cada pessoa recebe um convite e decide se entra. Quem aceitar vê o mesmo cenário.',
    guestLink: 'Convidar alguém de fora',
    guestHint: 'Qualquer pessoa com conta no EOS pode entrar por este link. Ela também precisa aceitar o convite.',
    copyLink: 'Copiar link',
    copied: 'Link copiado',
    noCircles: 'Você ainda não tem um círculo. A simulação roda só no seu aparelho.',
    people: 'pessoas',
    instruments: 'Instrumentos',
    instrumentsHint: 'Cada fonte pode ficar ao vivo, simulada, ou fora do ar. Treinar com a fonte caída é o cenário que mais importa — é para isso que o EOS existe.',
    live: 'Ao vivo',
    simulated: 'Simulado',
    down: 'Fora do ar',
    readings: 'Leituras simuladas',
    temp: 'Temperatura',
    wind: 'Vento',
    gust: 'Rajada',
    rain: 'Chuva',
    humidity: 'Umidade',
    uv: 'UV',
    visibility: 'Visibilidade',
    aqi: 'AQI',
    running: 'Simulação em andamento',
    runningHint: 'Abra o Mundo, o Pilot e o Checklist — tudo responde ao cenário agora.',
    goWorld: 'Ir para o Mundo',
    stop: 'Encerrar',
    safety: 'Nada é gravado no seu dado real. Ao recarregar o app, a simulação some. Se um alerta real chegar, a sessão é encerrada na hora.',
    sevLabel: ['', 'Leve', 'Moderada', 'Séria', 'Grave', 'Catastrófica'],
  },
  en: {
    eyebrow: 'Simulator',
    title: 'Train before it is real',
    lead: 'Set the situation. The whole of EOS starts behaving as if it were true — risk index, Pilot, autonomy and map.',
    describe: 'Describe the situation',
    placeholder: 'e.g. category 3 hurricane arriving in 12 hours. My daughter hurt her knee and cannot walk fast.',
    applyText: 'Apply to panels',
    applyingText: 'Interpreting…',
    parseHint: 'EOS fills the panels with OpenAI. Review before starting.',
    parseError: 'Could not interpret it. Adjust the panels manually.',
    threat: 'Threat',
    severity: 'Severity',
    arrival: 'Arrival',
    now: 'now',
    hours: 'h',
    conditions: 'What has already failed',
    powerOut: 'Power is out',
    networkDown: 'No network',
    roadsBlocked: 'Roads blocked',
    household: 'The household in this simulation',
    mobility: 'Someone cannot move freely',
    medical: 'Someone needs medication',
    reserves: 'Reserves',
    reserveReal: 'Real',
    reserveHalf: 'Half',
    reserveCritical: 'At the limit',
    start: 'Start simulation',
    duration: 'Exercise length',
    durationWhy: 'The drill ends by itself and produces the debrief. You can extend it while running.',
    shareWith: 'Share with',
    shareHint: 'Each person gets an invite and decides. Whoever accepts sees the same scenario.',
    guestLink: 'Invite someone outside',
    guestHint: 'Anyone with an EOS account can join through this link. They still have to accept the invite.',
    copyLink: 'Copy link',
    copied: 'Link copied',
    noCircles: 'You do not have a circle yet. The simulation runs on your device only.',
    people: 'people',
    instruments: 'Instruments',
    instrumentsHint: 'Each source can be live, simulated, or off the air. Training with a dead feed is the scenario that matters most — it is what EOS exists for.',
    live: 'Live',
    simulated: 'Simulated',
    down: 'Off the air',
    readings: 'Simulated readings',
    temp: 'Temperature',
    wind: 'Wind',
    gust: 'Gust',
    rain: 'Rain',
    humidity: 'Humidity',
    uv: 'UV',
    visibility: 'Visibility',
    aqi: 'AQI',
    running: 'Simulation running',
    runningHint: 'Open World, the Pilot and the Checklist — everything responds to the scenario now.',
    goWorld: 'Go to World',
    stop: 'End',
    safety: 'Nothing is written to your real data. Reloading the app ends the simulation. If a real alert arrives, the session ends immediately.',
    sevLabel: ['', 'Mild', 'Moderate', 'Serious', 'Severe', 'Catastrophic'],
  },
} as const

const ARRIVALS = [0, 3, 6, 12, 24, 48]

/** Opções de duração. 15 min é um ensaio curto; 120 é um exercício de família. */
const DURATIONS = [15, 30, 60, 120]

export default function SimulatorPage() {
  const { language } = useLanguage()
  const router = useRouter()
  const c = COPY[language]
  const pt = language === 'pt'
  const { config: active, start, stop, setSharedSession } = useSimulation()
  const [circles, setCircles] = useState<Array<{ id: string; name: string; members: number }>>([])
  const [selected, setSelected] = useState<string[]>([])
  const [joinLink, setJoinLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseNotes, setParseNotes] = useState<string[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/circles')
      .then(r => (r.ok ? r.json() : null))
      .then((d: { circles?: Array<{ id: string; name: string; members?: unknown[] }> } | null) => {
        const list = (d?.circles ?? []).map(c => ({ id: c.id, name: c.name, members: (c.members ?? []).length }))
        setCircles(list)
        // Pre-select everything: the common case is "train with my family".
        setSelected(list.map(c => c.id))
      })
      .catch(() => setCircles([]))
  }, [])

  const [draft, setDraft] = useState<SimulationConfig>(DEFAULT_SIMULATION)
  const set = (patch: Partial<SimulationConfig>) => setDraft(current => ({ ...current, ...patch }))

  const applyDescription = async () => {
    const description = draft.description.trim()
    if (!description) return
    setParsing(true)
    setParseError(null)
    setParseNotes([])
    try {
      const response = await fetch('/api/simulation/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, pt }),
      })
      const data = await response.json().catch(() => null) as {
        ok?: boolean
        patch?: Partial<SimulationConfig>
        notes?: string[]
        error?: string
      } | null
      if (!response.ok || !data?.ok || !data.patch) {
        setParseError(data?.error ?? c.parseError)
        return
      }
      setDraft(current => ({
        ...current,
        ...data.patch,
        description,
        sources: { ...current.sources, ...(data.patch?.sources ?? {}) },
        values: { ...current.values, ...(data.patch?.values ?? {}) },
      }))
      setParseNotes(Array.isArray(data.notes) ? data.notes : [])
      haptic.impact()
    } catch {
      setParseError(c.parseError)
    } finally {
      setParsing(false)
    }
  }

  const launch = async () => {
    haptic.impact()
    start(draft)

    // D-071: invite the circle. Everyone gets a pop-up asking to join; nobody is
    // placed in the drill without answering it.
    if (selected.length) {
      const created = await fetch('/api/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleIds: selected, config: draft }),
      })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)

      if (created?.sessionId) {
        setSharedSession(created.sessionId)
        if (created.joinToken) {
          // Kept on this screen instead of navigating away: the link is only
          // useful while the owner is still deciding who else to pull in.
          setJoinLink(`${window.location.origin}/sim/${created.joinToken}`)
          return
        }
      }
    }

    router.push('/dashboard')
  }

  return (
    <div className="wv2 wv2-sim-page" data-risk="watch" data-ready="true">
      <MaisNav />
      <div className="sim-scroll">
        <header className="sim-header">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="t-display sim-title">{c.title}</h1>
          <p className="t-body ink-2">{c.lead}</p>
        </header>

        {joinLink ? (
          <Card accented>
            <SectionLabel>{c.guestLink}</SectionLabel>
            <p className="t-body ink-2" style={{ margin: '0.25rem 0 0.75rem' }}>{c.guestHint}</p>
            <p className="sim-link">{joinLink}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <Pill
                primary
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ url: joinLink, title: 'EOS' })
                    else await navigator.clipboard.writeText(joinLink)
                    setCopied(true)
                  } catch {
                    /* the user dismissed the share sheet */
                  }
                }}
              >
                {copied ? c.copied : c.copyLink}
              </Pill>
              <Pill onClick={() => router.push('/dashboard')}>{c.goWorld}</Pill>
            </div>
          </Card>
        ) : active ? (
          <Card accented>
            <SectionLabel>{c.running}</SectionLabel>
            <p className="t-body" style={{ marginTop: '0.25rem' }}>{c.runningHint}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <Pill primary onClick={() => router.push('/dashboard')}>{c.goWorld}</Pill>
              <Pill onClick={stop}>{c.stop}</Pill>
            </div>
          </Card>
        ) : (
          <>
            {/* ── Free text: the way the owner described it ── */}
            <Card>
              <SectionLabel>{c.describe}</SectionLabel>
              <textarea
                className="sim-textarea"
                value={draft.description}
                onChange={event => set({ description: event.target.value })}
                placeholder={c.placeholder}
                rows={3}
              />
              <div className="sim-parse">
                <Pill onClick={applyDescription}>
                  {parsing ? c.applyingText : c.applyText}
                </Pill>
                <span className="t-foot ink-3">{c.parseHint}</span>
              </div>
              {parseError && <p className="sim-parse-error t-foot">{parseError}</p>}
              {parseNotes.length > 0 && (
                <ul className="sim-parse-notes">
                  {parseNotes.map(note => <li key={note} className="t-foot ink-2">{note}</li>)}
                </ul>
              )}
            </Card>

            {/* ── Threat ── */}
            <Card>
              <SectionLabel>{c.threat}</SectionLabel>
              <div className="sim-chips">
                {THREATS.map(threat => (
                  <Chip
                    key={threat.id}
                    on={draft.threat === threat.id}
                    onClick={() => set({ threat: threat.id as ThreatType })}
                  >
                    {pt ? threat.pt : threat.en}
                  </Chip>
                ))}
              </div>

              <div className="sim-row">
                <span className="t-caps ink-3">{c.severity}</span>
                <strong className="t-sub">{c.sevLabel[draft.severity]}</strong>
              </div>
              <div className="sim-scale" role="group" aria-label={c.severity}>
                {([1, 2, 3, 4, 5] as Severity[]).map(level => (
                  <button
                    key={level}
                    type="button"
                    className={draft.severity >= level ? 'on' : ''}
                    aria-pressed={draft.severity === level}
                    onClick={() => { haptic.selection(); set({ severity: level }) }}
                  >
                    {level}
                  </button>
                ))}
              </div>

              <div className="sim-row">
                <span className="t-caps ink-3">{c.arrival}</span>
              </div>
              <div className="sim-chips">
                {ARRIVALS.map(hours => (
                  <Chip key={hours} on={draft.arrivalHours === hours} onClick={() => set({ arrivalHours: hours })}>
                    {hours === 0 ? c.now : `${hours}${c.hours}`}
                  </Chip>
                ))}
              </div>
            </Card>

            {/* ── Infrastructure ── */}
            <Card>
              <SectionLabel>{c.conditions}</SectionLabel>
              <Toggle label={c.powerOut} on={draft.powerOut} onChange={v => set({ powerOut: v })} />
              <Toggle label={c.networkDown} on={draft.networkDown} onChange={v => set({ networkDown: v })} />
              <Toggle label={c.roadsBlocked} on={draft.roadsBlocked} onChange={v => set({ roadsBlocked: v })} />
            </Card>

            {/* ── Household: the knee-injury case lives here ── */}
            <Card>
              <SectionLabel>{c.household}</SectionLabel>
              <Toggle label={c.mobility} on={draft.mobilityLimited} onChange={v => set({ mobilityLimited: v })} />
              <Toggle label={c.medical} on={draft.medicalNeed} onChange={v => set({ medicalNeed: v })} />

              <div className="sim-row" style={{ marginTop: '0.75rem' }}>
                <span className="t-caps ink-3">{c.reserves}</span>
              </div>
              <div className="sim-chips">
                {([
                  ['real', c.reserveReal],
                  ['half', c.reserveHalf],
                  ['critical', c.reserveCritical],
                ] as Array<[ReserveLevel, string]>).map(([value, label]) => (
                  <Chip key={value} on={draft.reserves === value} onClick={() => set({ reserves: value })}>
                    {label}
                  </Chip>
                ))}
              </div>
            </Card>

            {/* ── Instruments: live, simulated, or failed ── */}
            <Card>
              <SectionLabel>{c.instruments}</SectionLabel>
              <p className="t-foot ink-3" style={{ margin: '0 0 0.75rem' }}>{c.instrumentsHint}</p>
              {SOURCE_LABELS.map(source => (
                <div key={source.key} className="sim-source">
                  <span className="t-sub">{pt ? source.pt : source.en}</span>
                  <div className="sim-source-modes" role="group" aria-label={pt ? source.pt : source.en}>
                    {(['live', 'sim', 'down'] as SourceMode[]).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        className={draft.sources[source.key] === mode ? `on ${mode}` : ''}
                        aria-pressed={draft.sources[source.key] === mode}
                        onClick={() => {
                          haptic.selection()
                          set({ sources: { ...draft.sources, [source.key]: mode } as SimulationSources })
                        }}
                      >
                        {mode === 'live' ? c.live : mode === 'sim' ? c.simulated : c.down}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Card>

            {/* ── Values, only when something is actually simulated ── */}
            {(draft.sources.weather === 'sim' || draft.sources.airQuality === 'sim') && (
              <Card>
                <SectionLabel>{c.readings}</SectionLabel>
                {draft.sources.weather === 'sim' && (
                  <>
                    <Stepper label={c.temp} value={draft.values.tempC} unit="°C" step={1} min={-20} max={50}
                      onChange={n => set({ values: { ...draft.values, tempC: n } as SimulationValues })} />
                    <Stepper label={c.wind} value={draft.values.windKmh} unit="km/h" step={5} min={0} max={250}
                      onChange={n => set({ values: { ...draft.values, windKmh: n } as SimulationValues })} />
                    <Stepper label={c.gust} value={draft.values.gustKmh} unit="km/h" step={5} min={0} max={300}
                      onChange={n => set({ values: { ...draft.values, gustKmh: n } as SimulationValues })} />
                    <Stepper label={c.rain} value={draft.values.rainPct} unit="%" step={5} min={0} max={100}
                      onChange={n => set({ values: { ...draft.values, rainPct: n } as SimulationValues })} />
                    <Stepper label={c.humidity} value={draft.values.humidityPct} unit="%" step={5} min={0} max={100}
                      onChange={n => set({ values: { ...draft.values, humidityPct: n } as SimulationValues })} />
                    <Stepper label={c.uv} value={draft.values.uvIndex} unit="" step={1} min={0} max={12}
                      onChange={n => set({ values: { ...draft.values, uvIndex: n } as SimulationValues })} />
                    <Stepper label={c.visibility} value={draft.values.visibilityKm} unit="km" step={1} min={0} max={30}
                      onChange={n => set({ values: { ...draft.values, visibilityKm: n } as SimulationValues })} />
                  </>
                )}
                {draft.sources.airQuality === 'sim' && (
                  <Stepper label={c.aqi} value={draft.values.aqi} unit="" step={10} min={0} max={500}
                    onChange={n => set({ values: { ...draft.values, aqi: n } as SimulationValues })} />
                )}
              </Card>
            )}

            {/* ── Who trains with you ── */}
            <Card>
              <SectionLabel>{c.shareWith}</SectionLabel>
              {circles.length === 0 ? (
                <p className="t-body ink-2" style={{ marginTop: '0.25rem' }}>{c.noCircles}</p>
              ) : (
                <>
                  <p className="t-foot ink-3" style={{ margin: '0 0 0.5rem' }}>{c.shareHint}</p>
                  {circles.map(circle => (
                    <Toggle
                      key={circle.id}
                      label={`${circle.name} · ${circle.members} ${c.people}`}
                      on={selected.includes(circle.id)}
                      onChange={on =>
                        setSelected(current =>
                          on ? [...current, circle.id] : current.filter(id => id !== circle.id),
                        )
                      }
                    />
                  ))}
                </>
              )}
            </Card>

            {/*
              A duração é escolhida ANTES de começar, e não depois.
              Um treino sem hora para acabar vira estado permanente — e o EOS em
              simulação mostra risco simulado, autonomia simulada e um Pilot
              falando de um evento que não existe.
            */}
            <Card>
              <SectionLabel trailing={`${draft.durationMin} min`}>{c.duration}</SectionLabel>
              <p className="t-foot ink-3">{c.durationWhy}</p>
              <div className="sim-durations">
                {DURATIONS.map(minutes => (
                  <button
                    key={minutes}
                    type="button"
                    className={`wv2-chip${draft.durationMin === minutes ? ' on' : ''}`}
                    onClick={() => { haptic.selection(); set({ durationMin: minutes }) }}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </Card>

            <motion.div whileTap={{ scale: 0.98 }} transition={SPRING.quick}>
              <Pill primary wide onClick={launch}>{c.start} · {draft.durationMin} min</Pill>
            </motion.div>

            <p className="sim-safety t-foot ink-3">{c.safety}</p>
          </>
        )}
      </div>
    </div>
  )
}

function Stepper({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  unit: string
  step: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  return (
    <div className="sim-stepper">
      <span className="t-sub">{label}</span>
      <div>
        <button type="button" aria-label="-" onClick={() => { haptic.selection(); onChange(clamp(value - step)) }}>−</button>
        <strong className="t-sub">{value}{unit}</strong>
        <button type="button" aria-label="+" onClick={() => { haptic.selection(); onChange(clamp(value + step)) }}>+</button>
      </div>
    </div>
  )
}

function Chip({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`sim-chip${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={() => { haptic.selection(); onClick() }}
    >
      {children}
    </button>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={`sim-toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={() => { haptic.selection(); onChange(!on) }}
    >
      <span className="t-body">{label}</span>
      <span className="track" aria-hidden="true"><i /></span>
    </button>
  )
}
