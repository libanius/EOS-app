'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useLanguage } from '@/lib/i18n'
import { Card, PillLink, SectionLabel } from '@/components/world-v2/primitives'
import '@/components/world-v2/world-v2.css'

type CircleRow = {
  id: string
  name: string
  role?: string
}

type MessageRow = {
  id: string
  circle_id: string
  sender_id: string
  sender_name: string
  body: string
  kind: 'text' | 'system' | 'alert'
  created_at: string
  is_me: boolean
}

type FrequencyRow = {
  channel: string
  name: string
  frequency: string
  use: string
  why: string[]
}

const COPY = {
  pt: {
    eyebrow: 'EOS · Comms',
    title: 'Comunicações',
    circle: 'Círculo',
    noCircle: 'Nenhum círculo ativo',
    noCircleBody: 'Crie ou entre em um círculo para liberar o chat da família.',
    openCircles: 'Abrir círculos',
    openFamily: 'Família',
    chat: 'Chat do círculo',
    loading: 'Carregando mensagens...',
    empty: 'Nenhuma mensagem ainda.',
    unavailable: 'Mensagens indisponíveis agora.',
    placeholder: 'Escreva para o círculo',
    send: 'Enviar',
    sending: 'Enviando...',
    radio: 'Rádio',
    radioStatus: 'Canais familiares pré-programados',
    vhf: 'VHF · 144-148 MHz · longa distância',
    uhf: 'UHF · 420-450 MHz · curta / média distância',
    bestFor: 'Melhor para',
    vhfBestFor: 'estradas, áreas abertas, viagens e comboios',
    uhfBestFor: 'cidades, bairros, dentro de casa e obstáculos',
    national: 'Nacionais e emergência',
    quickUse: 'Como usar Baofeng UV-5R / similares',
    otherOptions: 'Outras opções úteis',
    legal: 'Atenção legal',
    legalBody: 'Transmissão em faixas VHF/UHF de radioamador nos EUA exige licença apropriada em operação normal. Ouvir é permitido. Em risco imediato, priorize 911/autoridades quando disponíveis e confirme regras FCC/locais antes de transmitir.',
    mesh: 'Mesh',
    meshStatus: 'Somente referência operacional',
    meshBody: 'Comms app-level pode evoluir no Web/PWA. Hardware LoRa/Mesh continua bloqueado por G-05.',
  },
  en: {
    eyebrow: 'EOS · Comms',
    title: 'Communications',
    circle: 'Circle',
    noCircle: 'No active circle',
    noCircleBody: 'Create or join a circle to unlock family chat.',
    openCircles: 'Open circles',
    openFamily: 'Family',
    chat: 'Circle chat',
    loading: 'Loading messages...',
    empty: 'No messages yet.',
    unavailable: 'Messages are unavailable right now.',
    placeholder: 'Write to the circle',
    send: 'Send',
    sending: 'Sending...',
    radio: 'Radio',
    radioStatus: 'Pre-programmed family channels',
    vhf: 'VHF · 144-148 MHz · long distance',
    uhf: 'UHF · 420-450 MHz · short / medium distance',
    bestFor: 'Best for',
    vhfBestFor: 'roads, open areas, trips, and convoys',
    uhfBestFor: 'cities, neighborhoods, indoors, and obstacles',
    national: 'National and emergency',
    quickUse: 'How to use Baofeng UV-5R / similar radios',
    otherOptions: 'Other useful options',
    legal: 'Legal attention',
    legalBody: 'Transmitting on amateur VHF/UHF bands in the US requires the appropriate license during normal operation. Listening is allowed. In immediate danger, prioritize 911/authorities when available and verify FCC/local rules before transmitting.',
    mesh: 'Mesh',
    meshStatus: 'Operational reference only',
    meshBody: 'App-level Comms can evolve in Web/PWA. LoRa/Mesh hardware remains blocked by G-05.',
  },
} as const

const FAMILY_CHANNELS: { pt: { vhf: FrequencyRow[]; uhf: FrequencyRow[] }; en: { vhf: FrequencyRow[]; uhf: FrequencyRow[] } } = {
  pt: {
    vhf: [
      { channel: '1', name: 'VHF-A · principal', frequency: '145.500', use: 'Família principal', why: ['Baixo tráfego', 'Comunicação privada', 'Boa para longas distâncias'] },
      { channel: '2', name: 'VHF-B · secundário', frequency: '146.550', use: 'Fallback backup', why: ['Frequência simplex tranquila', 'Boa alternativa se A estiver ocupada'] },
      { channel: '3', name: 'VHF-C · emergência', frequency: '146.520', use: 'Contato externo', why: ['Chamada nacional', 'Muito monitorada por radioamadores', 'Use para pedir ajuda'] },
    ],
    uhf: [
      { channel: '4', name: 'UHF-A · principal', frequency: '446.100', use: 'Local / bairro', why: ['Boa penetração urbana', 'Menos interferência'] },
      { channel: '5', name: 'UHF-B · secundário', frequency: '446.050', use: 'Fallback local', why: ['Simplex limpa', 'Backup se A estiver ocupada'] },
      { channel: '6', name: 'UHF-C · geral', frequency: '446.000', use: 'Geral / simplex', why: ['Simplex universal', 'Muitos rádios monitoram'] },
    ],
  },
  en: {
    vhf: [
      { channel: '1', name: 'VHF-A · primary', frequency: '145.500', use: 'Main family', why: ['Low traffic', 'Private coordination', 'Useful over longer distances'] },
      { channel: '2', name: 'VHF-B · secondary', frequency: '146.550', use: 'Fallback backup', why: ['Quiet simplex frequency', 'Alternative if A is busy'] },
      { channel: '3', name: 'VHF-C · emergency', frequency: '146.520', use: 'External contact', why: ['National calling frequency', 'Often monitored by amateur operators', 'Use to request help'] },
    ],
    uhf: [
      { channel: '4', name: 'UHF-A · primary', frequency: '446.100', use: 'Local / neighborhood', why: ['Good urban penetration', 'Less interference'] },
      { channel: '5', name: 'UHF-B · secondary', frequency: '446.050', use: 'Local fallback', why: ['Clean simplex', 'Backup if A is busy'] },
      { channel: '6', name: 'UHF-C · general', frequency: '446.000', use: 'General / simplex', why: ['Universal simplex', 'Many radios monitor'] },
    ],
  },
} as const

const NATIONAL_REFERENCES = {
  pt: [
    { title: 'NOAA Weather Radio', body: 'Alertas oficiais de furacões, tornados, tempestades severas, inundações, calor extremo e emergências civis.', lines: ['162.400', '162.425', '162.450', '162.475', '162.500', '162.525', '162.550'] },
    { title: 'Radioamador nacional', body: 'Frequências muito monitoradas por radioamadores.', lines: ['146.520 MHz · chamada nacional VHF', '446.000 MHz · chamada nacional UHF'] },
    { title: 'Marítima · ouvir costa/águas', body: 'Use apenas quando aplicável e conforme licença/regra local.', lines: ['156.800 MHz · Canal 16'] },
    { title: 'Serviços de emergência · ouvir', body: 'Não transmita em frequências oficiais.', lines: ['Polícia FL · 155.340 MHz', 'Fire/EMS · 155.160 MHz', 'SAR/Resgate aéreo · 121.500 MHz', 'Guarda Costeira · 161.975 MHz'] },
  ],
  en: [
    { title: 'NOAA Weather Radio', body: 'Official alerts for hurricanes, tornadoes, severe storms, floods, extreme heat, and civil emergencies.', lines: ['162.400', '162.425', '162.450', '162.475', '162.500', '162.525', '162.550'] },
    { title: 'National amateur radio', body: 'Commonly monitored amateur radio frequencies.', lines: ['146.520 MHz · VHF national calling', '446.000 MHz · UHF national calling'] },
    { title: 'Marine · listen coast/water', body: 'Use only when applicable and under the right license/local rule.', lines: ['156.800 MHz · Channel 16'] },
    { title: 'Emergency services · listen', body: 'Do not transmit on official frequencies.', lines: ['Police FL · 155.340 MHz', 'Fire/EMS · 155.160 MHz', 'SAR/air rescue · 121.500 MHz', 'Coast Guard · 161.975 MHz'] },
  ],
} as const

const QUICK_STEPS = {
  pt: [
    'Ligar/desligar: gire o knob de volume.',
    'Selecionar canal: use setas para trocar canais salvos.',
    'Transmitir: segure PTT, fale curto e solte para ouvir.',
    'Modo/banda: BAND alterna VHF e UHF.',
    'Volume: ajuste para nível audível e confortável.',
    'Monitor/squelch: use MONI para abrir o squelch e ouvir sinais fracos.',
    'Scan: pressione SCAN para varrer canais; pressione novamente para parar.',
    'Lanterna/teclado: segure a tecla da lanterna; use lock quando necessário.',
  ],
  en: [
    'Power: turn the volume knob.',
    'Select channel: use arrows to move through saved channels.',
    'Transmit: hold PTT, speak briefly, release to listen.',
    'Mode/band: BAND switches VHF and UHF.',
    'Volume: set a clear and comfortable level.',
    'Monitor/squelch: use MONI to open squelch and hear weak signals.',
    'Scan: press SCAN to sweep channels; press again to stop.',
    'Light/keypad: hold the flashlight key; lock when needed.',
  ],
} as const

const OTHER_OPTIONS = {
  pt: ['MURS: 151.820, 151.880, 151.940, 154.570, 154.600 MHz', 'GMRS: 462.550, 462.5625, 462.675, 462.725, 467.550 MHz', 'FRS: canais 1-14, 462/467 MHz, baixa potência'],
  en: ['MURS: 151.820, 151.880, 151.940, 154.570, 154.600 MHz', 'GMRS: 462.550, 462.5625, 462.675, 462.725, 467.550 MHz', 'FRS: channels 1-14, 462/467 MHz, low power'],
} as const

function formatTime(value: string, language: 'pt' | 'en') {
  try {
    return new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

export default function CommsPage() {
  const { language } = useLanguage()
  const c = COPY[language]
  const [circles, setCircles] = useState<CircleRow[]>([])
  const [circleId, setCircleId] = useState('')
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [circlesLoading, setCirclesLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selectedCircle = useMemo(
    () => circles.find(circle => circle.id === circleId) ?? null,
    [circles, circleId],
  )

  useEffect(() => {
    let cancelled = false
    async function loadCircles() {
      setCirclesLoading(true)
      try {
        const response = await fetch('/api/circles', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error ?? 'circles unavailable')
        if (cancelled) return
        const next = (data.circles ?? []) as CircleRow[]
        setCircles(next)
        setCircleId(current => current || next[0]?.id || '')
      } catch {
        if (!cancelled) setError(c.unavailable)
      } finally {
        if (!cancelled) setCirclesLoading(false)
      }
    }
    loadCircles()
    return () => { cancelled = true }
  }, [c.unavailable])

  const loadMessages = useCallback(async (nextCircleId: string) => {
    if (!nextCircleId) return
    setMessagesLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/comms/messages?circleId=${encodeURIComponent(nextCircleId)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'messages unavailable')
      setMessages((data.messages ?? []) as MessageRow[])
    } catch {
      setMessages([])
      setError(c.unavailable)
    } finally {
      setMessagesLoading(false)
    }
  }, [c.unavailable])

  useEffect(() => {
    if (circleId) void loadMessages(circleId)
  }, [circleId, loadMessages])

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!selectedCircle || !text || sending) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/comms/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId: selectedCircle.id, body: text }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'send failed')
      setMessages(current => [...current, data.message as MessageRow])
      setDraft('')
    } catch {
      setError(c.unavailable)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="list-title">{c.title}</h1>
        </header>

        {circlesLoading ? (
          <Card accented>
            <SectionLabel>{c.circle}</SectionLabel>
            <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.loading}</p>
          </Card>
        ) : circles.length === 0 ? (
          <Card accented>
            <SectionLabel>{c.noCircle}</SectionLabel>
            <p className="t-body ink-2" style={{ margin: '0.75rem 0 1rem' }}>{c.noCircleBody}</p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <PillLink href="/circles" primary>{c.openCircles}</PillLink>
              <PillLink href="/family">{c.openFamily}</PillLink>
            </div>
          </Card>
        ) : (
          <>
            <Card accented>
              <SectionLabel trailing={selectedCircle?.role}>{c.circle}</SectionLabel>
              {circles.length > 1 ? (
                <select
                  className="wv2-input"
                  value={circleId}
                  onChange={event => setCircleId(event.target.value)}
                  aria-label={c.circle}
                  style={{ marginTop: '0.75rem' }}
                >
                  {circles.map(circle => (
                    <option key={circle.id} value={circle.id}>{circle.name}</option>
                  ))}
                </select>
              ) : (
                <h2 className="t-title2" style={{ margin: '0.5rem 0 0' }}>{selectedCircle?.name}</h2>
              )}
            </Card>

            <Card>
              <SectionLabel>{c.chat}</SectionLabel>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  minHeight: '16rem',
                  maxHeight: '24rem',
                  overflowY: 'auto',
                  padding: '1rem 0',
                }}
                aria-live="polite"
              >
                {messagesLoading ? (
                  <p className="t-body ink-2" style={{ margin: 0 }}>{c.loading}</p>
                ) : error ? (
                  <p className="t-body ink-2" style={{ margin: 0 }}>{error}</p>
                ) : messages.length === 0 ? (
                  <p className="t-body ink-2" style={{ margin: 0 }}>{c.empty}</p>
                ) : messages.map(message => (
                  <article
                    key={message.id}
                    style={{
                      alignSelf: message.is_me ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '0.85rem',
                      padding: '0.7rem 0.85rem',
                      background: message.is_me ? 'rgba(244, 199, 91, 0.14)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="t-caps ink-3" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <span>{message.sender_name}</span>
                      <time dateTime={message.created_at}>{formatTime(message.created_at, language)}</time>
                    </div>
                    <p className="t-body" style={{ margin: '0.4rem 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {message.body}
                    </p>
                  </article>
                ))}
              </div>

              <form onSubmit={submitMessage} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem' }}>
                <input
                  className="wv2-input"
                  value={draft}
                  maxLength={1000}
                  onChange={event => setDraft(event.target.value)}
                  placeholder={c.placeholder}
                  aria-label={c.placeholder}
                  disabled={sending || !selectedCircle}
                />
                <button className="wv2-pill primary" type="submit" disabled={sending || !draft.trim()}>
                  {sending ? c.sending : c.send}
                </button>
              </form>
            </Card>
          </>
        )}

        <Card>
          <SectionLabel trailing={c.radioStatus}>{c.radio}</SectionLabel>
          <div style={{ display: 'grid', gap: '1rem', marginTop: '0.9rem' }}>
            {[
              { title: c.vhf, best: c.vhfBestFor, rows: FAMILY_CHANNELS[language].vhf },
              { title: c.uhf, best: c.uhfBestFor, rows: FAMILY_CHANNELS[language].uhf },
            ].map(section => (
              <section
                key={section.title}
                style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '0.85rem',
                  padding: '0.85rem',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div className="t-caps ink-3">{section.title}</div>
                <p className="t-foot ink-2" style={{ margin: '0.35rem 0 0.75rem' }}>
                  {c.bestFor}: {section.best}
                </p>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {section.rows.map(row => (
                    <article
                      key={row.channel}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2.2rem 1fr',
                        gap: '0.75rem',
                        alignItems: 'start',
                      }}
                    >
                      <strong
                        className="t-title2"
                        style={{
                          display: 'grid',
                          placeItems: 'center',
                          width: '2.2rem',
                          height: '2.2rem',
                          borderRadius: '999px',
                          background: 'rgba(244, 199, 91, 0.14)',
                        }}
                      >
                        {row.channel}
                      </strong>
                      <div>
                        <div className="t-title2" style={{ marginBottom: '0.2rem' }}>{row.frequency}</div>
                        <div className="t-sub">{row.name} · {row.use}</div>
                        <ul className="t-foot ink-2" style={{ margin: '0.45rem 0 0', paddingLeft: '1rem' }}>
                          {row.why.map(reason => <li key={reason}>{reason}</li>)}
                        </ul>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel>{c.national}</SectionLabel>
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.9rem' }}>
            {NATIONAL_REFERENCES[language].map(group => (
              <section
                key={group.title}
                style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '0.85rem',
                  padding: '0.85rem',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <h2 className="t-title2" style={{ margin: 0 }}>{group.title}</h2>
                <p className="t-foot ink-2" style={{ margin: '0.45rem 0 0.65rem' }}>{group.body}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {group.lines.map(line => (
                    <span
                      key={line}
                      className="t-foot"
                      style={{
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '999px',
                        padding: '0.35rem 0.55rem',
                        background: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {line}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel>{c.quickUse}</SectionLabel>
          <ol className="t-body ink-2" style={{ display: 'grid', gap: '0.55rem', margin: '0.9rem 0 0', paddingLeft: '1.2rem' }}>
            {QUICK_STEPS[language].map(step => <li key={step}>{step}</li>)}
          </ol>
        </Card>

        <Card>
          <SectionLabel>{c.otherOptions}</SectionLabel>
          <ul className="t-body ink-2" style={{ margin: '0.9rem 0 0', paddingLeft: '1.2rem' }}>
            {OTHER_OPTIONS[language].map(option => <li key={option} style={{ marginBottom: '0.45rem' }}>{option}</li>)}
          </ul>
        </Card>

        <Card accented>
          <SectionLabel>{c.legal}</SectionLabel>
          <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.legalBody}</p>
        </Card>

        <Card>
          <SectionLabel trailing={c.meshStatus}>{c.mesh}</SectionLabel>
          <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.meshBody}</p>
        </Card>
      </div>
    </div>
  )
}
