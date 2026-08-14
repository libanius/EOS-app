'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useLanguage, type MessageKey } from '@/lib/i18n'
import { emptySurfaceCounts, type NotificationSurface } from '@/lib/notification-surface'
import { createClient } from '@/lib/supabase/client'

type NavItem = { href: string; labelKey: MessageKey; surface?: NotificationSurface; icon: React.ReactNode }

/**
 * A barra global, em cinco destinos (NAV-T06 / D-180).
 *
 * ```
 * [ FAMÍLIA ] [ PREPARAÇÃO ] (( MUNDO )) [ COMMS ] [ MAIS ]
 * ```
 *
 * Eram sete. Sete competiam pelo mesmo pedaço de tela, e três deles não eram
 * domínios: Círculos é assunto de Família (D-178), Clima é detalhe do MUNDO
 * (NAV-T07) e Cenário é MODO, não lugar (NAV-T08). Um menu sem rótulo no canto
 * superior direito guardava o resto — duas navegações concorrentes, e a
 * segunda invisível.
 *
 * `docs/35` §RECOMMENDED: cinco slots, sempre os mesmos, e todo o resto abaixo
 * deles em faixa de domínio com rota real. **A barra nunca muda.** É a única
 * coisa da tela que a pessoa pode aprender uma vez.
 *
 * ── O que NÃO some junto ──────────────────────────────────────────────────
 *
 * Clima e Cenário perderam o ícone, não o endereço: os dois continuam a um
 * toque no MUNDO (`PillLink` "Ver alertas" e "Abrir cenário"), que é onde a
 * pessoa já está quando pergunta por eles. NAV-T07 e T08 terminam a mudança.
 */

/**
 * The World dashboard is the app's home, so it does not compete as one tab
 * among five — it sits raised at the centre, always the largest target and
 * always in the same place. The remaining destinations split evenly around it.
 *
 * Ele herda o badge de `weather` (D-180): alerta é assunto do MUNDO na tabela
 * de propriedade do `docs/35`, e uma notificação sem ícone onde pousar é uma
 * notificação que ninguém vê.
 */
const HOME: NavItem = {
  href: '/dashboard',
  labelKey: 'nav.world',
  surface: 'weather',
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
    href: '/family',
    labelKey: 'nav.family',
    surface: 'family',
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
    surface: 'preparedness',
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
    href: '/comms?view=chat',
    labelKey: 'nav.comms',
    surface: 'comms',
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
    /*
     * MAIS herda o badge de `scenario` porque o Treino mora aqui até NAV-T08
     * (`docs/35`, tabela de propriedade). Convite de treino chega por overlay
     * bloqueante (D-071), mas o resumo pós-treino não — e sem este badge ele
     * não teria onde aparecer.
     */
    href: '/mais',
    labelKey: 'nav.more',
    surface: 'scenario',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [unreadBySurface, setUnreadBySurface] = useState<Record<NotificationSurface, number>>(() => emptySurfaceCounts())

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const hrefPath = (href: string) => href.split('?')[0] || href

  const loadNotificationBadges = useCallback(async () => {
    try {
      const response = await fetch('/api/comms/notifications', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        const counts = { ...emptySurfaceCounts(), ...(data.unread_by_surface ?? {}) }
        setUnreadBySurface({
          weather: Number(counts.weather ?? 0),
          family: Number(counts.family ?? 0),
          comms: Number(counts.comms ?? 0),
          preparedness: Number(counts.preparedness ?? 0),
          scenario: Number(counts.scenario ?? 0),
          system: Number(counts.system ?? 0),
        })
      }
    } catch {
      /* Badge is additive; navigation must keep working without it. */
    }
  }, [])

  useEffect(() => {
    void loadNotificationBadges()
    const timer = window.setInterval(() => { void loadNotificationBadges() }, 15_000)
    window.addEventListener('eos-comms-read', loadNotificationBadges)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('eos-comms-read', loadNotificationBadges)
    }
  }, [loadNotificationBadges])

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    void supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id
      if (!mounted || !userId) return
      channel = supabase
        .channel(`comms-notification-badge:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'circle_notifications',
            filter: `recipient_id=eq.${userId}`,
          },
          () => { void loadNotificationBadges() },
        )
        .subscribe()
    })

    return () => {
      mounted = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [loadNotificationBadges])

  /**
   * O selo de não lidas, num lugar só.
   *
   * Com cinco slots, o MUNDO passou a carregar o badge de `weather` — e o orbe
   * elevado desenha diferente das abas comuns. Copiar o selo para lá criaria a
   * sexta duplicação desta frente (a régua da água chegou a existir em cinco
   * lugares antes de D-174); então ele virou função, e as duas formas a chamam.
   */
  const selo = (surface: NotificationSurface | undefined, label: string) => {
    const unreadCount = surface ? unreadBySurface[surface] ?? 0 : 0
    if (!surface || unreadCount <= 0) return null
    const abrirCaixa = (event: React.MouseEvent | React.KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new CustomEvent('eos-open-inbox', { detail: { surface } }))
    }
    return (
      <span
        className="nb-badge"
        role="button"
        tabIndex={0}
        aria-label={`${unreadCount} notificações não lidas em ${label}`}
        onClick={abrirCaixa}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') abrirCaixa(event)
        }}
      >
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    )
  }

  const tab = ({ href, labelKey, surface, icon }: NavItem) => {
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
          {selo(surface, label)}
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
          <span className="nb-home-orb">
            {HOME.icon}
            {selo(HOME.surface, homeLabel)}
          </span>
          <span>{homeLabel}</span>
        </Link>

        {NAV_RIGHT.map(tab)}
      </div>
    </nav>
  )
}
