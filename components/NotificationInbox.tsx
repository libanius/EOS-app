'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n'
import { isNotificationSurface, type NotificationSurface } from '@/lib/notification-surface'

type NotificationRow = {
  id: string
  circle_id: string | null
  actor_id: string | null
  circle_name: string | null
  actor_name: string | null
  scope: 'circle' | 'weather' | 'edu' | 'simulation' | 'system'
  kind: string
  title: string
  body: string
  href: string
  severity: string | null
  source_key: string | null
  surface: NotificationSurface
  metadata: Record<string, unknown>
  created_at: string
  is_read: boolean
}

type InboxItem = NotificationRow & {
  ids: string[]
  count: number
  displayTitle: string
  displayBody: string
}

type InboxSection = {
  key: 'today' | 'last7' | 'earlier'
  title: string
  items: InboxItem[]
}

const COPY = {
  pt: {
    title: 'Inbox EOS',
    titleWeather: 'Clima',
    titleFamily: 'Família',
    titleComms: 'Comms',
    titlePreparedness: 'Preparação',
    titleScenario: 'Cenário',
    titleSystem: 'Sistema',
    unread: 'não lidas',
    empty: 'Nenhuma notificação nova.',
    loading: 'Carregando...',
    markAll: 'Marcar todas',
    close: 'Fechar',
    open: 'Abrir',
    today: 'Hoje',
    last7: 'Últimos 7 dias',
    earlier: 'Anteriores',
    messages: 'msgs',
    message: 'msg',
  },
  en: {
    title: 'EOS Inbox',
    titleWeather: 'Weather',
    titleFamily: 'Family',
    titleComms: 'Comms',
    titlePreparedness: 'Preparedness',
    titleScenario: 'Scenario',
    titleSystem: 'System',
    unread: 'unread',
    empty: 'No new notifications.',
    loading: 'Loading...',
    markAll: 'Mark all',
    close: 'Close',
    open: 'Open',
    today: 'Today',
    last7: 'Last 7 days',
    earlier: 'Earlier',
    messages: 'msgs',
    message: 'msg',
  },
} as const

function formatTime(value: string, language: 'pt' | 'en') {
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

function surfaceTitle(surface: NotificationSurface | null, labels: typeof COPY.pt | typeof COPY.en) {
  if (surface === 'weather') return labels.titleWeather
  if (surface === 'family') return labels.titleFamily
  if (surface === 'comms') return labels.titleComms
  if (surface === 'preparedness') return labels.titlePreparedness
  if (surface === 'scenario') return labels.titleScenario
  if (surface === 'system') return labels.titleSystem
  return labels.title
}

function iconFor(surface: NotificationSurface) {
  if (surface === 'weather') return '!'
  if (surface === 'preparedness') return 'PREP'
  if (surface === 'scenario') return 'SIM'
  if (surface === 'family') return 'FAM'
  if (surface === 'comms') return 'MSG'
  return 'EOS'
}

function groupNotifications(rows: NotificationRow[], language: 'pt' | 'en'): InboxItem[] {
  const groups = new Map<string, NotificationRow[]>()

  for (const row of rows) {
    const key = row.kind === 'message'
      ? `message:${row.circle_id ?? 'none'}:${row.actor_name ?? row.actor_id ?? 'unknown'}`
      : row.id
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups.values()).map(group => {
    const sorted = [...group].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    const latest = sorted[0]
    if (latest.kind === 'message') {
      const count = sorted.length
      const name = latest.actor_name ?? (language === 'pt' ? 'Alguém' : 'Someone')
      const unit = language === 'pt'
        ? `${count} ${count === 1 ? 'msg' : 'msgs'} de ${name}`
        : `${count} ${count === 1 ? 'msg' : 'msgs'} from ${name}`
      return {
        ...latest,
        ids: sorted.map(row => row.id),
        count,
        displayTitle: unit,
        displayBody: latest.body,
      }
    }
    return {
      ...latest,
      ids: [latest.id],
      count: 1,
      displayTitle: latest.title,
      displayBody: latest.body,
    }
  }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}

function sectionItems(items: InboxItem[], labels: Record<'today' | 'last7' | 'earlier', string>): InboxSection[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const last7Start = Date.now() - 7 * 24 * 60 * 60 * 1000
  const sections: InboxSection[] = [
    { key: 'today', title: labels.today, items: [] },
    { key: 'last7', title: labels.last7, items: [] },
    { key: 'earlier', title: labels.earlier, items: [] },
  ]

  for (const item of items) {
    const time = Date.parse(item.created_at)
    if (time >= todayStart) sections[0].items.push(item)
    else if (time >= last7Start) sections[1].items.push(item)
    else sections[2].items.push(item)
  }

  return sections.filter(section => section.items.length > 0)
}

export default function NotificationInbox() {
  const { language } = useLanguage()
  const c = COPY[language]
  const [open, setOpen] = useState(false)
  const [surfaceFilter, setSurfaceFilter] = useState<NotificationSurface | null>(null)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const visibleRows = useMemo(
    () => surfaceFilter ? rows.filter(row => row.surface === surfaceFilter) : rows,
    [rows, surfaceFilter],
  )
  const unreadCount = visibleRows.filter(row => !row.is_read).length
  const items = useMemo(() => groupNotifications(visibleRows, language), [visibleRows, language])
  const sections = useMemo(() => sectionItems(items, c), [items, c])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/comms/notifications', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (response.ok) setRows((data.notifications ?? []) as NotificationRow[])
    } finally {
      setLoading(false)
    }
  }, [])

  const markRead = useCallback(async (ids?: string[]) => {
    await fetch('/api/comms/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', ids }),
    }).catch(() => null)
    setRows(current => current.map(row => (!ids || ids.includes(row.id)) ? { ...row, is_read: true } : row))
    window.dispatchEvent(new Event('eos-comms-read'))
  }, [])

  const markReadKeepalive = useCallback((ids: string[]) => {
    const body = JSON.stringify({ action: 'mark_read', ids })
    void fetch('/api/comms/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => null)
    setRows(current => current.map(row => ids.includes(row.id) ? { ...row, is_read: true } : row))
    window.dispatchEvent(new Event('eos-comms-read'))
  }, [])

  useEffect(() => {
    const openInbox = (event: Event) => {
      const surface = (event as CustomEvent<{ surface?: unknown }>).detail?.surface
      setSurfaceFilter(isNotificationSurface(surface) ? surface : null)
      setOpen(true)
      void load()
    }
    window.addEventListener('eos-open-inbox', openInbox)
    return () => window.removeEventListener('eos-open-inbox', openInbox)
  }, [load])

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    void supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id
      if (!mounted || !userId) return
      channel = supabase
        .channel(`inbox-eos:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'circle_notifications',
            filter: `recipient_id=eq.${userId}`,
          },
          () => { void load() },
        )
        .subscribe()
    })

    return () => {
      mounted = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [load])

  function openItem(item: InboxItem) {
    setOpen(false)
    markReadKeepalive(item.ids)
    window.location.assign(item.href || '/comms?view=chat')
  }

  if (!open) return null

  const title = surfaceTitle(surfaceFilter, c)
  const unreadIds = visibleRows.filter(row => !row.is_read).map(row => row.id)

  return (
    <div className="inbox-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <section className="inbox-panel">
        <header className="inbox-head">
          <div>
            <p className="inbox-kicker">EOS</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="inbox-close" onClick={() => setOpen(false)} aria-label={c.close}>
            x
          </button>
        </header>

        <div className="inbox-actions">
          <span>{unreadCount} {c.unread}</span>
          {unreadCount > 0 ? (
            <button type="button" onClick={() => { void markRead(surfaceFilter ? unreadIds : undefined) }}>{c.markAll}</button>
          ) : null}
        </div>

        {loading ? (
          <p className="inbox-empty">{c.loading}</p>
        ) : items.length === 0 ? (
          <p className="inbox-empty">{c.empty}</p>
        ) : (
          <div className="inbox-list">
            {sections.map(section => (
              <section key={section.key} className="inbox-section">
                <h3>{section.title}</h3>
                {section.items.map(item => (
                  <button key={item.id} type="button" className={`inbox-item ${item.surface}${item.is_read ? ' read' : ''}`} onClick={() => { void openItem(item) }}>
                    <span className="inbox-icon">{iconFor(item.surface)}</span>
                    <span className="inbox-copy">
                      <strong>{item.displayTitle}</strong>
                      <span>{item.displayBody}</span>
                      <em>{item.circle_name ? `${item.circle_name} · ` : ''}{formatTime(item.created_at, language)}</em>
                    </span>
                    {item.severity ? <span className="inbox-severity">{item.severity}</span> : null}
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
