'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * D-238 — decide a tela de destino sem esperar o servidor.
 *
 * `getSession()` lê a sessão guardada no próprio aparelho (cookie), sem ida ao
 * Supabase na maioria das vezes. Com sessão → /dashboard; sem → "/" (a mesma
 * escolha que "/" fazia no servidor). O middleware e as páginas continuam
 * validando a sessão de verdade — aqui é só para onde ir primeiro.
 *
 * `router.replace` é navegação de cliente: o layout raiz (com a abertura)
 * continua montado e a abertura cobre o carregamento da tela seguinte.
 * Se a navegação não acontecer em 7 s (rede ruim), cai para um carregamento
 * normal da página, que tem o seu próprio caminho offline no service worker.
 */
export default function AbrirRedirect() {
  const router = useRouter()

  useEffect(() => {
    let alvo = '/'
    let foi = false
    const ir = () => {
      if (foi) return
      foi = true
      router.replace(alvo)
    }
    const reserva = window.setTimeout(() => {
      if (window.location.pathname === '/abrir') window.location.replace(alvo)
    }, 7000)

    createClient()
      .auth.getSession()
      .then(({ data }) => {
        alvo = data.session ? '/dashboard' : '/'
      })
      .catch(() => {})
      .finally(ir)

    return () => window.clearTimeout(reserva)
  }, [router])

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        color: 'var(--mu)',
        fontFamily: "'DM Mono', ui-monospace, monospace",
        fontSize: 11,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
      }}
    >
      Abrindo o EOS
    </main>
  )
}
