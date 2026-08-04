'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n'

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

const COPY = {
  pt: {
    title: 'Inbox EOS',
    unread: 'não lidas',
    empty: 'Nenhuma notificação nova.',
    loading: 'Carregando...',
    markAll: 'Marcar todas',
    close: 'Fechar',
    open: 'Abrir',
    messages: 'msgs',
    message: 'msg',
  },
  en: {
    title: 'EOS Inbox',
    unread: 'unread',
    empty: 'No new notifications.',
    loading: 'Loading...',
    markAll: 'Mark all',
    close: 'Close',
    open: 'Open',
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

function iconFor(scope: NotificationRow['scope']) {
  if (scope === 'weather') return '!'
  if (scope === 'edu') return 'EDU'
  if (scope === 'simulation') return 'SIM'
  if (scope === 'circle') return 'MSG'
  return 'EOS'
}

function groupNotifications(rows: NotificationRow[], language: 'pt' | 'en'): InboxItem[] {
  const unread = rows.filter(row => !row.is_read)
  const groups = new Map<string, NotificationRow[]>()

  for (const row of unread) {
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
  })
}

export default function NotificationInbox() {
  const { language } = useLanguage()
  const c = COPY[language]
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const unreadCount = rows.filter(row => !row.is_read).length
  const items = useMemo(() => groupNotifications(rows, language), [rows, language])

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

  useEffect(() => {
    const openInbox = () => {
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

  async function openItem(item: InboxItem) {
    await markRead(item.ids)
    window.location.href = item.href
  }

  if (!open) return null

  return (
    <div className="inbox-scrim" role="dialog" aria-modal="true" aria-label={c.title}>
      <section className="inbox-panel">
        <header className="inbox-head">
          <div>
            <p className="inbox-kicker">EOS</p>
            <h2>{c.title}</h2>
          </div>
          <button type="button" className="inbox-close" onClick={() => setOpen(false)} aria-label={c.close}>
            x
          </button>
        </header>

        <div className="inbox-actions">
          <span>{unreadCount} {c.unread}</span>
          {unreadCount > 0 ? (
            <button type="button" onClick={() => { void markRead() }}>{c.markAll}</button>
          ) : null}
        </div>

        {loading ? (
          <p className="inbox-empty">{c.loading}</p>
        ) : items.length === 0 ? (
          <p className="inbox-empty">{c.empty}</p>
        ) : (
          <div className="inbox-list">
            {items.map(item => (
              <button key={item.id} type="button" className={`inbox-item ${item.scope}`} onClick={() => { void openItem(item) }}>
                <span className="inbox-icon">{iconFor(item.scope)}</span>
                <span className="inbox-copy">
                  <strong>{item.displayTitle}</strong>
                  <span>{item.displayBody}</span>
                  <em>{item.circle_name ? `${item.circle_name} · ` : ''}{formatTime(item.created_at, language)}</em>
                </span>
                {item.severity ? <span className="inbox-severity">{item.severity}</span> : null}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
