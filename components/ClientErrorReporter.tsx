'use client'

/**
 * Erro na tela do usuário deixa de morrer na tela do usuário (D-119).
 *
 * Fica no layout raiz de propósito, e não no layout autenticado: a tela de
 * entrada é onde uma falha dói mais, porque quem não consegue entrar não
 * consegue reportar nada.
 *
 * Três travas, porque um reportador de erro mal-feito vira a origem do próximo
 * incidente:
 *
 *  1. NUNCA reporta a própria falha de envio. Um erro dentro do `fetch` que
 *     reporta erros geraria outro erro, que geraria outro — laço infinito com
 *     a rede do usuário no meio.
 *  2. Teto por sessão. Uma tela que quebra dentro de um `requestAnimationFrame`
 *     dispara centenas de vezes por segundo; o primeiro punhado já conta a
 *     história inteira.
 *  3. Sem repetição. A mesma mensagem só viaja uma vez por sessão.
 */

import { useEffect } from 'react'

const TETO_POR_SESSAO = 5

export default function ClientErrorReporter() {
  useEffect(() => {
    let enviados = 0
    let enviando = false
    const vistos = new Set<string>()

    const reportar = (message: string, stack: string | undefined, kind: string) => {
      if (!message) return
      if (enviados >= TETO_POR_SESSAO) return
      // Trava 1: se estamos no meio de um envio, um erro novo não pode
      // realimentar o envio.
      if (enviando) return

      const chave = `${kind}:${message}`.slice(0, 200)
      if (vistos.has(chave)) return
      vistos.add(chave)
      enviados += 1
      enviando = true

      // `keepalive` garante a entrega mesmo se o erro derrubar a página logo em
      // seguida — que é o caso mais comum e o mais importante de capturar.
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ message, stack, kind, url: window.location.href }),
      })
        .catch(() => {
          /* Trava 1 de novo: falhar ao reportar não gera reporte. */
        })
        .finally(() => {
          enviando = false
        })
    }

    const onError = (e: ErrorEvent) => {
      reportar(e.message || String(e.error ?? ''), e.error instanceof Error ? e.error.stack : undefined, 'error')
    }

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      reportar(
        r instanceof Error ? r.message : String(r ?? 'promessa rejeitada sem motivo'),
        r instanceof Error ? r.stack : undefined,
        'unhandledrejection',
      )
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
