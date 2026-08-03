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
    radioStatus: 'Frequências locais ainda não configuradas',
    radioItems: [
      'Use os canais combinados no plano da família.',
      'Ouça antes de transmitir e fale curto.',
      'Se houver risco imediato e rede disponível, use 911/serviços locais primeiro.',
    ],
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
    radioStatus: 'Local frequencies are not configured yet',
    radioItems: [
      'Use the channels agreed in the family plan.',
      'Listen before transmitting and keep messages short.',
      'If there is immediate danger and network is available, use 911/local services first.',
    ],
    mesh: 'Mesh',
    meshStatus: 'Operational reference only',
    meshBody: 'App-level Comms can evolve in Web/PWA. LoRa/Mesh hardware remains blocked by G-05.',
  },
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
          <ul className="t-body ink-2" style={{ margin: '0.9rem 0 0', paddingLeft: '1.2rem' }}>
            {c.radioItems.map(item => <li key={item} style={{ marginBottom: '0.45rem' }}>{item}</li>)}
          </ul>
        </Card>

        <Card>
          <SectionLabel trailing={c.meshStatus}>{c.mesh}</SectionLabel>
          <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.meshBody}</p>
        </Card>
      </div>
    </div>
  )
}
