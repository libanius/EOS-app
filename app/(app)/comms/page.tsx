'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useLanguage } from '@/lib/i18n'
import { cloneDefaultRadioConfig, type RadioConfig, type RadioLanguageConfig } from '@/lib/comms-radio'
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
    save: 'Salvar',
    saving: 'Salvando...',
    cancel: 'Cancelar',
    edit: 'Editar',
    resetDefaults: 'Restaurar padrão',
    editorOnly: 'Admin/Editor podem editar esta referência.',
    saved: 'Referência salva.',
    saveError: 'Não foi possível salvar a referência.',
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
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    edit: 'Edit',
    resetDefaults: 'Reset default',
    editorOnly: 'Admin/Editor can edit this reference.',
    saved: 'Reference saved.',
    saveError: 'Could not save the reference.',
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

function linesToText(lines: string[]) {
  return lines.join('\n')
}

function textToLines(value: string) {
  return value.split('\n').map(line => line.trim()).filter(Boolean)
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
  const [radioConfig, setRadioConfig] = useState<RadioConfig>(() => cloneDefaultRadioConfig())
  const [radioDraft, setRadioDraft] = useState<RadioConfig>(() => cloneDefaultRadioConfig())
  const [radioEditing, setRadioEditing] = useState(false)
  const [radioSaving, setRadioSaving] = useState(false)
  const [radioCanEdit, setRadioCanEdit] = useState(false)
  const [radioStatus, setRadioStatus] = useState<string | null>(null)

  const selectedCircle = useMemo(
    () => circles.find(circle => circle.id === circleId) ?? null,
    [circles, circleId],
  )
  const activeRadio = radioEditing ? radioDraft[language] : radioConfig[language]

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

  const loadRadio = useCallback(async (nextCircleId: string) => {
    if (!nextCircleId) return
    setRadioStatus(null)
    setRadioEditing(false)
    try {
      const response = await fetch(`/api/comms/radio?circleId=${encodeURIComponent(nextCircleId)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'radio unavailable')
      const next = (data.config ?? cloneDefaultRadioConfig()) as RadioConfig
      setRadioConfig(next)
      setRadioDraft(JSON.parse(JSON.stringify(next)) as RadioConfig)
      setRadioCanEdit(Boolean(data.canEdit))
    } catch {
      const fallback = cloneDefaultRadioConfig()
      setRadioConfig(fallback)
      setRadioDraft(JSON.parse(JSON.stringify(fallback)) as RadioConfig)
      setRadioCanEdit(false)
    }
  }, [])

  useEffect(() => {
    if (circleId) void loadRadio(circleId)
  }, [circleId, loadRadio])

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

  function updateRadioLanguage(updater: (current: RadioLanguageConfig) => RadioLanguageConfig) {
    setRadioDraft(current => ({
      ...current,
      [language]: updater(current[language]),
    }))
  }

  async function saveRadio() {
    if (!selectedCircle || radioSaving) return
    setRadioSaving(true)
    setRadioStatus(null)
    try {
      const response = await fetch('/api/comms/radio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId: selectedCircle.id, config: radioDraft }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.error === 'migration_pending') throw new Error(data?.error ?? 'save failed')
      const next = data.config as RadioConfig
      setRadioConfig(next)
      setRadioDraft(JSON.parse(JSON.stringify(next)) as RadioConfig)
      setRadioCanEdit(Boolean(data.canEdit))
      setRadioEditing(false)
      setRadioStatus(c.saved)
    } catch {
      setRadioStatus(c.saveError)
    } finally {
      setRadioSaving(false)
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <p className="t-foot ink-3" style={{ margin: 0 }}>{c.editorOnly}</p>
            {radioCanEdit ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {radioEditing ? (
                  <>
                    <button
                      type="button"
                      className="wv2-pill primary"
                      onClick={saveRadio}
                      disabled={radioSaving}
                    >
                      {radioSaving ? c.saving : c.save}
                    </button>
                    <button
                      type="button"
                      className="wv2-pill"
                      onClick={() => {
                        setRadioDraft(JSON.parse(JSON.stringify(radioConfig)) as RadioConfig)
                        setRadioEditing(false)
                        setRadioStatus(null)
                      }}
                    >
                      {c.cancel}
                    </button>
                    <button
                      type="button"
                      className="wv2-pill"
                      onClick={() => setRadioDraft(cloneDefaultRadioConfig())}
                    >
                      {c.resetDefaults}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="wv2-pill primary"
                    onClick={() => {
                      setRadioDraft(JSON.parse(JSON.stringify(radioConfig)) as RadioConfig)
                      setRadioEditing(true)
                      setRadioStatus(null)
                    }}
                  >
                    {c.edit}
                  </button>
                )}
              </div>
            ) : null}
          </div>
          {radioStatus ? <p className="t-foot ink-2" style={{ margin: '0.65rem 0 0' }}>{radioStatus}</p> : null}
          <div style={{ display: 'grid', gap: '1rem', marginTop: '0.9rem' }}>
            {[
              { key: 'vhf' as const, title: c.vhf, best: c.vhfBestFor, rows: activeRadio.family.vhf },
              { key: 'uhf' as const, title: c.uhf, best: c.uhfBestFor, rows: activeRadio.family.uhf },
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
                      {radioEditing ? (
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          <input
                            className="wv2-input"
                            value={row.frequency}
                            onChange={event => updateRadioLanguage(current => ({
                              ...current,
                              family: {
                                ...current.family,
                                [section.key]: current.family[section.key].map(item => item.channel === row.channel ? { ...item, frequency: event.target.value } : item),
                              },
                            }))}
                            aria-label="frequency"
                          />
                          <input
                            className="wv2-input"
                            value={row.name}
                            onChange={event => updateRadioLanguage(current => ({
                              ...current,
                              family: {
                                ...current.family,
                                [section.key]: current.family[section.key].map(item => item.channel === row.channel ? { ...item, name: event.target.value } : item),
                              },
                            }))}
                            aria-label="name"
                          />
                          <input
                            className="wv2-input"
                            value={row.use}
                            onChange={event => updateRadioLanguage(current => ({
                              ...current,
                              family: {
                                ...current.family,
                                [section.key]: current.family[section.key].map(item => item.channel === row.channel ? { ...item, use: event.target.value } : item),
                              },
                            }))}
                            aria-label="use"
                          />
                          <textarea
                            className="wv2-input"
                            value={linesToText(row.why)}
                            rows={3}
                            onChange={event => updateRadioLanguage(current => ({
                              ...current,
                              family: {
                                ...current.family,
                                [section.key]: current.family[section.key].map(item => item.channel === row.channel ? { ...item, why: textToLines(event.target.value) } : item),
                              },
                            }))}
                            aria-label="reasons"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="t-title2" style={{ marginBottom: '0.2rem' }}>{row.frequency}</div>
                          <div className="t-sub">{row.name} · {row.use}</div>
                          <ul className="t-foot ink-2" style={{ margin: '0.45rem 0 0', paddingLeft: '1rem' }}>
                            {row.why.map(reason => <li key={reason}>{reason}</li>)}
                          </ul>
                        </div>
                      )}
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
            {activeRadio.national.map((group, index) => (
              <section
                key={group.title}
                style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '0.85rem',
                  padding: '0.85rem',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                {radioEditing ? (
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <input
                      className="wv2-input"
                      value={group.title}
                      onChange={event => updateRadioLanguage(current => ({
                        ...current,
                        national: current.national.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item),
                      }))}
                      aria-label="title"
                    />
                    <textarea
                      className="wv2-input"
                      value={group.body}
                      rows={2}
                      onChange={event => updateRadioLanguage(current => ({
                        ...current,
                        national: current.national.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item),
                      }))}
                      aria-label="body"
                    />
                    <textarea
                      className="wv2-input"
                      value={linesToText(group.lines)}
                      rows={4}
                      onChange={event => updateRadioLanguage(current => ({
                        ...current,
                        national: current.national.map((item, itemIndex) => itemIndex === index ? { ...item, lines: textToLines(event.target.value) } : item),
                      }))}
                      aria-label="lines"
                    />
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </section>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel>{c.quickUse}</SectionLabel>
          {radioEditing ? (
            <textarea
              className="wv2-input"
              value={linesToText(activeRadio.quickSteps)}
              rows={8}
              onChange={event => updateRadioLanguage(current => ({ ...current, quickSteps: textToLines(event.target.value) }))}
              style={{ marginTop: '0.9rem' }}
              aria-label={c.quickUse}
            />
          ) : (
            <ol className="t-body ink-2" style={{ display: 'grid', gap: '0.55rem', margin: '0.9rem 0 0', paddingLeft: '1.2rem' }}>
              {activeRadio.quickSteps.map(step => <li key={step}>{step}</li>)}
            </ol>
          )}
        </Card>

        <Card>
          <SectionLabel>{c.otherOptions}</SectionLabel>
          {radioEditing ? (
            <textarea
              className="wv2-input"
              value={linesToText(activeRadio.otherOptions)}
              rows={5}
              onChange={event => updateRadioLanguage(current => ({ ...current, otherOptions: textToLines(event.target.value) }))}
              style={{ marginTop: '0.9rem' }}
              aria-label={c.otherOptions}
            />
          ) : (
            <ul className="t-body ink-2" style={{ margin: '0.9rem 0 0', paddingLeft: '1.2rem' }}>
              {activeRadio.otherOptions.map(option => <li key={option} style={{ marginBottom: '0.45rem' }}>{option}</li>)}
            </ul>
          )}
        </Card>

        <Card accented>
          <SectionLabel>{c.legal}</SectionLabel>
          {radioEditing ? (
            <textarea
              className="wv2-input"
              value={activeRadio.legalBody}
              rows={4}
              onChange={event => updateRadioLanguage(current => ({ ...current, legalBody: event.target.value }))}
              style={{ marginTop: '0.75rem' }}
              aria-label={c.legal}
            />
          ) : (
            <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{activeRadio.legalBody}</p>
          )}
        </Card>

        <Card>
          <SectionLabel trailing={c.meshStatus}>{c.mesh}</SectionLabel>
          <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.meshBody}</p>
        </Card>
      </div>
    </div>
  )
}
