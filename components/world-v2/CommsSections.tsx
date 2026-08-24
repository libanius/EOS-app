'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n'
import { cloneDefaultRadioConfig, type RadioConfig, type RadioLanguageConfig } from '@/lib/comms-radio'
import CommsNav from '@/components/world-v2/CommsNav'
import { createClient } from '@/lib/supabase/client'
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

type NotificationRow = {
  id: string
  circle_id: string | null
  circle_name: string | null
  actor_name: string | null
  scope?: string
  kind: string
  title: string
  body: string
  href: string
  created_at: string
  is_read: boolean
}

type NotificationRealtimeRow = {
  circle_id?: string | null
  kind?: string | null
  scope?: string | null
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
    timeline: 'Timeline',
    timelineTitle: 'Notificações',
    timelineEmpty: 'Nenhuma interação registrada ainda.',
    timelineUnread: 'não lidas',
    markRead: 'Marcar lidas',
    showOlder: 'Ver antigas',
    hideOlder: 'Recolher antigas',
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
    timeline: 'Timeline',
    timelineTitle: 'Notifications',
    timelineEmpty: 'No interactions recorded yet.',
    timelineUnread: 'unread',
    markRead: 'Mark read',
    showOlder: 'Show older',
    hideOlder: 'Collapse older',
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

function formatTimelineTime(value: string, language: 'pt' | 'en') {
  try {
    return new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
      month: 'short',
      day: '2-digit',
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

export type CommsSection = 'chat' | 'timeline' | 'radio'

/**
 * As seções do Comms (COMMS-T12 / D-188).
 *
 * Este arquivo era `app/(app)/comms/page.tsx` — uma tela só com chat, linha do
 * tempo e rádio empilhados, alternados por `?view=` em memória. COMMS era o
 * **último domínio sem rota de verdade** (`docs/35` §ROUTE HIERARCHY): o Pilot
 * não conseguia apontar para uma seção, push não conseguia abrir uma, e nada
 * disso sobrevivia a um compartilhamento de link.
 *
 * Agora a seção é PROP, vinda da rota. O componente é o mesmo; quem decide o
 * que mostrar é o endereço.
 */
function CommsContent({ section, conversationId }: { section: CommsSection; conversationId?: string }) {
  const searchParams = useSearchParams()
  const { language } = useLanguage()
  const c = COPY[language]
  const [circles, setCircles] = useState<CircleRow[]>([])
  const [circleId, setCircleId] = useState('')
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [circlesLoading, setCirclesLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const view = section
  const [focusedMessageId, setFocusedMessageId] = useState('')
  const [timelineExpanded, setTimelineExpanded] = useState(false)
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
  // O título repete o nome do chip (D-180 §3): quando os dois discordam, a
  // pessoa duvida que chegou onde queria.
  const tituloDaSecao = section === 'radio' ? c.radio : section === 'timeline' ? c.timelineTitle : c.title
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const visibleNotifications = timelineExpanded ? notifications : notifications.slice(0, 4)

  /*
   * `?view=` saiu daqui: a seção agora vem da ROTA.
   *
   * O que ficou é `messageId` — ele não é estado de navegação, é o alvo dentro
   * da conversa: o Inbox aponta para UMA mensagem e a tela precisa destacá-la.
   * `circleId` continua sendo aceito porque `href` de notificações **já
   * gravadas no banco** o carregam, e histórico não se reescreve.
   */
  useEffect(() => {
    const nextCircleId = searchParams.get('circleId')
    const nextMessageId = searchParams.get('messageId')
    if (nextCircleId) setCircleId(nextCircleId)
    setFocusedMessageId(nextMessageId ?? '')
  }, [searchParams])

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

  const loadMessages = useCallback(async (nextCircleId: string, options?: { silent?: boolean }) => {
    /*
     * O guarda pergunta se há ALVO, e não se há círculo.
     *
     * Ele era `if (!nextCircleId) return`, escrito quando círculo era o único
     * caminho possível. Com conversa direta isso virava um retorno silencioso:
     * a tela abria **vazia**, dizendo "nenhuma mensagem ainda" para um thread
     * cheio. Sem erro, sem log — a mesma forma dos defeitos de D-183 e D-187.
     */
    if (!conversationId && !nextCircleId) return
    if (!options?.silent) setMessagesLoading(true)
    setError(null)
    try {
      /*
       * Quando a rota traz `conversationId`, ele manda — é o único caminho que
       * alcança conversa DIRETA. Sem ele, cai no círculo, que é o que os links
       * antigos carregam.
       */
      const alvo = conversationId
        ? `conversationId=${encodeURIComponent(conversationId)}`
        : `circleId=${encodeURIComponent(nextCircleId)}`
      const response = await fetch(`/api/comms/messages?${alvo}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'messages unavailable')
      setMessages((data.messages ?? []) as MessageRow[])
    } catch {
      if (!options?.silent) {
        setMessages([])
        setError(c.unavailable)
      }
    } finally {
      if (!options?.silent) setMessagesLoading(false)
    }
  }, [c.unavailable, conversationId])

  /*
   * Com `conversationId` a conversa carrega SOZINHA — ela não espera a lista de
   * círculos chegar. Antes, um thread direto ficava em "Carregando" até os
   * círculos responderem, e numa rede ruim isso é a tela inteira parada
   * esperando um dado que ela nem usa.
   */
  useEffect(() => {
    if (conversationId || circleId) void loadMessages(circleId)
  }, [circleId, conversationId, loadMessages])

  /*
   * Abrir a conversa é lê-la (COMMS-T14 / D-195).
   *
   * `conversation_members.last_read_at` existia no schema e a API sabia
   * gravá-lo — e **nenhuma tela chamava**. Sem isso `hasUnread` respondia
   * `true` para sempre: o ponto vermelho aparecia na primeira mensagem e não
   * apagava nunca, transformando o único sinal de "tem coisa nova" em enfeite
   * permanente.
   *
   * Roda a cada mensagem nova também, e não só na entrada: ficar com a conversa
   * aberta é continuar lendo.
   */
  useEffect(() => {
    if (!conversationId || section !== 'chat') return
    void fetch('/api/comms/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, read: true }),
    }).catch(() => { /* marcar como lida nunca pode derrubar a leitura */ })
  }, [conversationId, section, messages.length])

  useEffect(() => {
    if (!focusedMessageId || !messages.length) return
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`message-${focusedMessageId}`)
      const box = chatScrollRef.current
      if (target && box) {
        const top = target.offsetTop - box.offsetTop - ((box.clientHeight - target.clientHeight) / 2)
        box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      } else {
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }, 100)
    const clearFocus = window.setTimeout(() => {
      setFocusedMessageId(current => current === focusedMessageId ? '' : current)
    }, 5000)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(clearFocus)
    }
  }, [focusedMessageId, messages])

  useEffect(() => {
    if (view !== 'chat' || !messages.length || focusedMessageId) return
    const scrollToEnd = () => {
      const box = chatScrollRef.current
      if (box) box.scrollTop = box.scrollHeight
      chatEndRef.current?.scrollIntoView({ block: 'nearest' })
    }
    requestAnimationFrame(scrollToEnd)
    const timer = window.setTimeout(scrollToEnd, 80)
    return () => window.clearTimeout(timer)
  }, [messages, view, focusedMessageId])

  /*
   * O realtime assina a CONVERSA, não o círculo (COMMS-T16 / D-197).
   *
   * O filtro era `circle_id=eq.…`, escrito quando havia uma conversa por
   * círculo. Com conversa direta ele passou a acordar a tela para mensagens de
   * OUTRO thread do mesmo círculo — e, pior, numa conversa direta o `circleId`
   * do estado é o primeiro círculo da lista, que pode nem ser o da conversa.
   * Funcionava por coincidência: o recarregamento usa `conversationId` e traz
   * o thread certo de qualquer jeito.
   *
   * Agora ele acorda pelo que realmente mudou.
   */
  useEffect(() => {
    const alvo = conversationId
      ? { chave: `conversation_id=eq.${conversationId}`, canal: `comms:conv:${conversationId}` }
      : circleId
        ? { chave: `circle_id=eq.${circleId}`, canal: `comms:circle:${circleId}` }
        : null
    if (!alvo) return

    const supabase = createClient()
    const channel = supabase
      .channel(alvo.canal)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'circle_messages', filter: alvo.chave },
        () => { void loadMessages(circleId, { silent: true }) },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [circleId, conversationId, loadMessages])

  useEffect(() => {
    if (!circleId || view !== 'chat') return
    const timer = window.setInterval(() => {
      void loadMessages(circleId, { silent: true })
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [circleId, loadMessages, view])

  const loadNotifications = useCallback(async (markRead = false) => {
    setNotificationsLoading(true)
    try {
      const response = await fetch('/api/comms/notifications', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'notifications unavailable')
      const count = Number(data.unread_count ?? 0)
      setNotifications((data.notifications ?? []) as NotificationRow[])
      setUnreadCount(count)
      if (markRead && count > 0) {
        await fetch('/api/comms/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_read' }),
        })
        setUnreadCount(0)
        setNotifications(current => current.map(item => ({ ...item, is_read: true })))
        window.dispatchEvent(new Event('eos-comms-read'))
      }
    } catch {
      setNotifications([])
    } finally {
      setNotificationsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNotifications(false)
  }, [loadNotifications, view])

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    void supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id
      if (!mounted || !userId) return
      channel = supabase
        .channel(`comms-notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'circle_notifications',
            filter: `recipient_id=eq.${userId}`,
          },
          payload => {
            void loadNotifications(false)
            const row = (payload.new ?? {}) as NotificationRealtimeRow
            if (row.kind === 'message' && row.circle_id && row.circle_id === circleId) {
              void loadMessages(circleId, { silent: true })
            }
          },
        )
        .subscribe()
    })

    return () => {
      mounted = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [circleId, loadMessages, loadNotifications])

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
    // Numa conversa direta não há círculo selecionado na tela — e não precisa
    // haver: o `conversationId` já é a autorização e o destino.
    if ((!selectedCircle && !conversationId) || !text || sending) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/comms/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          conversationId ? { conversationId, body: text } : { circleId: selectedCircle!.id, body: text },
        ),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'send failed')
      setMessages(current => [...current, data.message as MessageRow])
      setDraft('')
      void loadNotifications(false)
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
          <h1 className="list-title">{tituloDaSecao}</h1>
        </header>

        <CommsNav />


        {view === 'timeline' ? (
          <Card style={{ marginBottom: '1rem' }}>
            <SectionLabel trailing={unreadCount ? `${unreadCount} ${c.timelineUnread}` : undefined}>{c.timelineTitle}</SectionLabel>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => { void loadNotifications(true) }}
                style={{ margin: '0.6rem 0 0.75rem', border: '1px solid rgba(255,69,58,0.35)', background: 'rgba(255,69,58,0.08)', color: '#ff453a', borderRadius: 999, padding: '0.35rem 0.75rem', fontWeight: 750, cursor: 'pointer' }}
              >
                {c.markRead}
              </button>
            )}
            {notificationsLoading ? (
              <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.loading}</p>
            ) : notifications.length === 0 ? (
              <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.timelineEmpty}</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.75rem' }}>
                {visibleNotifications.map(item => (
                  <article
                    key={item.id}
                    style={{
                      display: 'grid',
                      gap: '0.2rem',
                      padding: '0.85rem 0.9rem',
                      borderRadius: 14,
                      border: item.is_read ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,69,58,0.35)',
                      background: item.is_read ? 'rgba(255,255,255,0.035)' : 'rgba(255,69,58,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                      <strong className="t-body" style={{ color: 'var(--ink)' }}>{item.title}</strong>
                      {!item.is_read && <span style={{ width: 9, height: 9, borderRadius: 999, background: '#ff453a', flex: '0 0 auto' }} />}
                    </div>
                    <p className="t-foot ink-2" style={{ margin: 0 }}>{item.body}</p>
                    <span className="t-caption ink-3">{item.circle_name ? `${item.circle_name} · ` : ''}{formatTimelineTime(item.created_at, language)}</span>
                  </article>
                ))}
                {notifications.length > 4 ? (
                  <button
                    type="button"
                    className="wv2-pill"
                    onClick={() => setTimelineExpanded(current => !current)}
                    style={{ justifySelf: 'start' }}
                  >
                    {timelineExpanded ? c.hideOlder : `${c.showOlder} (${notifications.length - 4})`}
                  </button>
                ) : null}
              </div>
            )}
          </Card>
        ) : null}

        {section !== 'chat' ? null : circlesLoading ? (
          <Card accented>
            <SectionLabel>{c.circle}</SectionLabel>
            <p className="t-body ink-2" style={{ margin: '0.75rem 0 0' }}>{c.loading}</p>
          </Card>
        ) : circles.length === 0 ? (
          <Card accented>
            <SectionLabel>{c.noCircle}</SectionLabel>
            <p className="t-body ink-2" style={{ margin: '0.75rem 0 1rem' }}>{c.noCircleBody}</p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <PillLink href="/family/circulos" primary>{c.openCircles}</PillLink>
              <PillLink href="/family">{c.openFamily}</PillLink>
            </div>
          </Card>
        ) : (
          <>
            {/*
              O seletor de círculo só faz sentido SEM conversa escolhida.
              Dentro de um thread ele é ruído — e num thread DIRETO é pior que
              ruído: sugere que trocar o círculo troca a conversa, o que não
              acontece. Quem escolhe a conversa agora é a lista (D-188).
            */}
            {conversationId ? null : (
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
            )}

            <Card>
              <SectionLabel>{c.chat}</SectionLabel>
              <div
                ref={chatScrollRef}
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
                    id={`message-${message.id}`}
                    style={{
                      alignSelf: message.is_me ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      border: message.id === focusedMessageId ? '1px solid rgba(0,229,160,0.75)' : '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '0.85rem',
                      padding: '0.7rem 0.85rem',
                      background: message.id === focusedMessageId ? 'rgba(0,229,160,0.12)' : message.is_me ? 'rgba(244, 199, 91, 0.14)' : 'rgba(255,255,255,0.06)',
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
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={submitMessage} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem' }}>
                <input
                  className="wv2-input"
                  value={draft}
                  maxLength={1000}
                  onChange={event => setDraft(event.target.value)}
                  placeholder={c.placeholder}
                  aria-label={c.placeholder}
                  disabled={sending || (!selectedCircle && !conversationId)}
                />
                <button className="wv2-pill primary" type="submit" disabled={sending || !draft.trim()}>
                  {sending ? c.sending : c.send}
                </button>
              </form>
            </Card>
          </>
        )}

        {section !== 'radio' ? null : <>
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
        </>}
      </div>
    </div>
  )
}

export default function CommsSections({ section, conversationId }: { section: CommsSection; conversationId?: string }) {
  return (
    <Suspense fallback={null}>
      <CommsContent section={section} conversationId={conversationId} />
    </Suspense>
  )
}
