'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useLanguage, type MessageKey } from '@/lib/i18n'

type NavItem = { href: string; labelKey: MessageKey; icon: React.ReactNode }

/**
 * The World dashboard is the app's home, so it does not compete as one tab
 * among seven — it sits raised at the centre, always the largest target and
 * always in the same place. The remaining destinations split evenly around it.
 */
const HOME: NavItem = {
  href: '/dashboard',
  labelKey: 'nav.world',
  icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
    </svg>
  ),
}

const NAV_LEFT: NavItem[] = [
  {
    href: '/scenario',
    labelKey: 'nav.scenario',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    href: '/family',
    labelKey: 'nav.family',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/preparedness',
    labelKey: 'nav.preparedness',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
]

const NAV_RIGHT: NavItem[] = [
  {
    href: '/comms?view=notifications',
    labelKey: 'nav.comms',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.9 19.1a10 10 0 0 1 0-14.2" />
        <path d="M8.4 15.6a5 5 0 0 1 0-7.2" />
        <path d="M15.6 8.4a5 5 0 0 1 0 7.2" />
        <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
        <circle cx="12" cy="12" r="1.6" />
      </svg>
    ),
  },
  {
    href: '/circles',
    labelKey: 'nav.circles',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
  {
    href: '/weather',
    labelKey: 'nav.weather',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M5.2 14.8A5 5 0 0 1 9 10h8a3 3 0 0 1 0 6H9a5 5 0 0 1-3.8-1.2z" />
        <path d="M3 13h1M20 13h1M12 3V2M12 16v5M5.6 5.6l-.7-.7M19.1 19.1l-.7-.7M19.1 5.6l.7-.7M5.6 19.1l.7-.7" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [commsUnread, setCommsUnread] = useState(0)

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const hrefPath = (href: string) => href.split('?')[0] || href

  const loadCommsUnread = useCallback(async () => {
    try {
      const response = await fetch('/api/comms/notifications', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (response.ok) setCommsUnread(Number(data.unread_count ?? 0))
    } catch {
      /* Badge is additive; navigation must keep working without it. */
    }
  }, [])

  useEffect(() => {
    void loadCommsUnread()
    const timer = window.setInterval(() => { void loadCommsUnread() }, 60_000)
    window.addEventListener('eos-comms-read', loadCommsUnread)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('eos-comms-read', loadCommsUnread)
    }
  }, [loadCommsUnread])

  const tab = ({ href, labelKey, icon }: NavItem) => {
    const active = isActive(hrefPath(href))
    const label = t(labelKey)
    return (
      <Link
        key={href}
        href={href}
        className={`nb${active ? ' on' : ''}`}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
      >
        <span className="nb-icon">
          {icon}
          {hrefPath(href) === '/comms' && commsUnread > 0 && (
            <span className="nb-badge" aria-label={`${commsUnread} notificações não lidas`}>
              {commsUnread > 99 ? '99+' : commsUnread}
            </span>
          )}
        </span>
        <span>{label}</span>
      </Link>
    )
  }

  const homeActive = isActive(HOME.href)
  const homeLabel = t(HOME.labelKey)

  return (
    <nav className="nav" role="navigation" aria-label={t('nav.main')}>
      <div className="nav-tabs">
        {NAV_LEFT.map(tab)}

        <Link
          href={HOME.href}
          className={`nb nb-home${homeActive ? ' on' : ''}`}
          aria-label={homeLabel}
          aria-current={homeActive ? 'page' : undefined}
        >
          <span className="nb-home-orb">{HOME.icon}</span>
          <span>{homeLabel}</span>
        </Link>

        {NAV_RIGHT.map(tab)}
      </div>
    </nav>
  )
}
