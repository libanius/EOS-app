'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/lib/i18n'

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'rgba(14,14,14,0.85)',
  border: '1px solid rgba(255,255,255,0.1)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  color: '#a1a1aa',
  textDecoration: 'none',
}

export default function AppActions() {
  const { t } = useLanguage()

  /**
   * Some ao descer, volta ao subir (D-126).
   *
   * Estes três orbes são `position: fixed` e ficam por cima de tudo. Numa lista
   * rolada eles cobrem a primeira linha — e não é só estética: eles
   * INTERCEPTAM O TOQUE. Uma pessoa da lista de Círculos parada embaixo do orbe
   * simplesmente não abre.
   *
   * O padrão é o do iOS, e o próprio código já usava a ideia numa forma bruta
   * (`body:has(.wv2-pilot-chat) .app-actions { display: none }`): quando a
   * pessoa desce, ela está lendo — o chrome sai da frente. Quando sobe, está
   * procurando — o chrome volta.
   *
   * O container que rola neste app é o `body`, não o `documentElement`; por isso
   * o ouvinte é de captura, e não `window.scroll`.
   */
  const [oculto, setOculto] = useState(false)
  const ultimo = useRef(0)

  useEffect(() => {
    const alvo = () => document.body.scrollTop || document.documentElement.scrollTop || window.scrollY || 0
    let travado = false
    const aoRolar = () => {
      if (travado) return
      travado = true
      requestAnimationFrame(() => {
        const y = alvo()
        const delta = y - ultimo.current
        // 8px de histerese: sem isso o chrome pisca com o tremor do dedo.
        if (Math.abs(delta) > 8) {
          // Perto do topo o chrome sempre aparece: é onde ele é procurado.
          setOculto(delta > 0 && y > 72)
          ultimo.current = y
        }
        travado = false
      })
    }
    document.addEventListener('scroll', aoRolar, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', aoRolar, { capture: true })
  }, [])

  return (
    <div
      className="app-actions"
      data-hidden={oculto ? '' : undefined}
      /*
        `display` saiu daqui de propósito (D-128).
        Um estilo inline vence qualquer declaração da folha que não tenha
        `!important` — e era por isso que
        `body:has(.wv2-pilot-chat) .app-actions { display: none }` NUNCA valia.
        O ✕ do Pilot ficava coberto: quem tocava nele ia parar em /ficha, com a
        conversa perdida. Eu já tinha tropeçado nisto e posto `!important` no
        `top`, sem perceber que o `display` tinha o mesmo problema. A saída não
        é mais um `!important`: é a folha voltar a ser dona do layout.
      */
      style={{ position: 'fixed', top: 'max(16px, calc(env(safe-area-inset-top, 0px) + 8px))', right: 16, zIndex: 200, gap: 8 }}
    >
      {/*
        O plano da família vivia só dentro do painel do dashboard — para chegar
        nele era preciso arrastar a folha para cima e rolar. Um plano que se
        edita em tempo de calma e se lê em tempo de evento precisa de porta
        própria, visível de qualquer tela.
      */}
      <Link href="/plan" aria-label={t('actions.familyPlan')} style={buttonStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-4.5-7-10a7 7 0 1 1 14 0c0 5.5-7 10-7 10Z" />
          <circle cx="12" cy="11" r="2.5" />
        </svg>
      </Link>
      <Link href="/settings" aria-label={t('actions.settings')} style={buttonStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.35.7.6 1 .29.3.68.45 1.1.45h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
      </Link>
      <Link href="/ficha" aria-label={t('actions.emergencyCard')} style={buttonStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </Link>
    </div>
  )
}
