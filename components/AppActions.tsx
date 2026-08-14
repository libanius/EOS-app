'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n'

/**
 * As três portas fixas do app, atrás de uma só (D-131).
 *
 * Eram três círculos sem rótulo no canto superior direito — um alfinete, uma
 * engrenagem e uma silhueta. Nenhum dizia para onde ia, e os três dividiam
 * aquele canto com o orbe do Pilot e com a coluna de controles do mapa: três
 * grupos disputando o mesmo pedaço de tela.
 *
 * Agora é um botão só. Tocá-lo abre uma lista com os nomes escritos — o que
 * custava adivinhação passa a custar um toque, e o canto para de gritar.
 *
 * Um ícone sem rótulo só se sustenta quando o significado é universal (o ✕, a
 * lupa). "Engrenagem" e "silhueta" não são: eram duas apostas do usuário sobre
 * qual leva a Configurações e qual leva à Ficha.
 */

const orbe: React.CSSProperties = {
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
  cursor: 'pointer',
}

const GearIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.35.7.6 1 .29.3.68.45 1.1.45h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
  </svg>
)

const PersonIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

export default function AppActions() {
  const { t } = useLanguage()
  const caminho = usePathname()

  /**
   * Some ao descer, volta ao subir (D-126).
   *
   * Estes orbes são `position: fixed` e ficam por cima de tudo. Numa lista
   * rolada eles cobrem a primeira linha — e não é só estética: eles
   * INTERCEPTAM O TOQUE. Uma pessoa da lista de Círculos parada embaixo do orbe
   * simplesmente não abre.
   *
   * O padrão é o do iOS: quando a pessoa desce, ela está lendo — o chrome sai
   * da frente. Quando sobe, está procurando — o chrome volta.
   *
   * O container que rola neste app é o `body`, não o `documentElement`; por isso
   * o ouvinte é de captura, e não `window.scroll`.
   */
  const [oculto, setOculto] = useState(false)
  const ultimo = useRef(0)
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

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

  /* Três saídas, porque um menu que só fecha de um jeito é uma armadilha. */
  useEffect(() => {
    if (!aberto) return
    const porTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    const porFora = (e: Event) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('keydown', porTecla)
    document.addEventListener('pointerdown', porFora)
    return () => {
      document.removeEventListener('keydown', porTecla)
      document.removeEventListener('pointerdown', porFora)
    }
  }, [aberto])

  /* Navegar fecha o menu — senão ele fica aberto por cima da tela nova. */
  useEffect(() => { setAberto(false) }, [caminho])

  // Rolar com o menu aberto o esconderia junto com o orbe, deixando um menu
  // órfão no ar.
  useEffect(() => { if (oculto) setAberto(false) }, [oculto])

  /*
   * NAV-T04 / D-177: o Plano saiu daqui.
   *
   * Eram 1409 linhas de funcionalidade atrás de um hambúrguer sem rótulo. Ele
   * agora é subtópico da Preparação, com chip próprio — onde a preparação vive.
   *
   * Ficha e Configurações saem em NAV-T05 e NAV-T06, e aí este menu deixa de
   * existir: duas navegações concorrentes é uma a mais.
   */
  const portas = [
    { href: '/ficha', rotulo: t('actions.emergencyCard'), icone: <PersonIcon /> },
    { href: '/settings', rotulo: t('actions.settings'), icone: <GearIcon /> },
  ]

  return (
    <div
      className="app-actions"
      ref={caixa}
      data-hidden={oculto ? '' : undefined}
      /*
        `display` saiu daqui de propósito (D-128).
        Um estilo inline vence qualquer declaração da folha que não tenha
        `!important` — e era por isso que
        `body:has(.wv2-pilot-chat) .app-actions { display: none }` NUNCA valia.
        O ✕ do Pilot ficava coberto: quem tocava nele ia parar em /ficha, com a
        conversa perdida. A saída não é mais um `!important`: é a folha voltar a
        ser dona do layout.
      */
      style={{ position: 'fixed', top: 'max(16px, calc(env(safe-area-inset-top, 0px) + 8px))', right: 16, zIndex: 200, gap: 8 }}
    >
      <button
        type="button"
        className="app-actions-trigger"
        aria-label={t('actions.menu')}
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => setAberto(v => !v)}
        style={{ ...orbe, color: aberto ? '#fafafa' : '#a1a1aa' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {aberto && (
        <div className="app-actions-menu" role="menu">
          {portas.map(p => (
            <Link key={p.href} href={p.href} role="menuitem" className="app-actions-item" onClick={() => setAberto(false)}>
              <span className="aa-icon" aria-hidden="true">{p.icone}</span>
              <span>{p.rotulo}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
