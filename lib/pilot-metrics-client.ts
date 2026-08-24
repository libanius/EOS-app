'use client'

/**
 * Como a tela avisa que algo aconteceu (PILOT-T04 / D-132).
 *
 * Três regras, e todas existem por causa de erros já pagos neste repositório:
 *
 * 1. **Nunca atrasa o produto.** Dispara e esquece. Nenhuma tela espera esta
 *    chamada, nenhuma falha dela aparece para a pessoa. Métrica que segura um
 *    botão é métrica que sai do produto na primeira madrugada.
 *
 * 2. **Nunca carrega texto.** A assinatura não tem onde pôr a pergunta. Isso é
 *    de tipo, não de disciplina: `notePilot` só aceita enums e um número.
 *
 * 3. **Sobrevive ao fechamento.** `sendBeacon` entrega mesmo quando a aba
 *    fecha; `fetch` comum é cancelado no meio e o evento `closed` — que é
 *    justamente o de fechar — nunca chegaria. Só uma vez este arquivo já teria
 *    produzido um funil onde ninguém fecha o Pilot.
 */

import type { PilotEventName, PilotIntent, PilotSurface, PilotVerdict } from '@/lib/pilot-metrics'

type Campos = {
  verdict?: PilotVerdict | null
  intent?: PilotIntent | null
  surface?: PilotSurface | null
  ms?: number | null
}

const ROTA = '/api/pilot/metrics'

export function notePilot(event: PilotEventName, campos: Campos = {}): void {
  if (typeof window === 'undefined') return

  const corpo = JSON.stringify({
    event,
    ...(campos.verdict ? { verdict: campos.verdict } : {}),
    ...(campos.intent ? { intent: campos.intent } : {}),
    ...(campos.surface ? { surface: campos.surface } : {}),
    ...(typeof campos.ms === 'number' ? { ms: Math.max(0, Math.round(campos.ms)) } : {}),
  })

  try {
    if (navigator.sendBeacon) {
      // O tipo importa: sem `application/json` o Next trata como texto simples
      // e `request.json()` estoura do outro lado.
      const ok = navigator.sendBeacon(ROTA, new Blob([corpo], { type: 'application/json' }))
      if (ok) return
      // `sendBeacon` devolve false quando a fila do navegador está cheia. Cair
      // no fetch é melhor que perder o evento em silêncio.
    }
    void fetch(ROTA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Nada. Um erro de telemetria não pode virar erro de produto.
  }
}

/**
 * Quanto tempo a pessoa levou para tocar no Pilot nesta sessão.
 *
 * `performance.now()` conta desde que a página carregou, que é exatamente a
 * pergunta da spec ("time to first tap"). `Date.now()` mediria desde 1970 e
 * daria um número sem sentido — já quase escrevi assim.
 */
export function msDesdeQueAbriu(): number | null {
  if (typeof performance === 'undefined') return null
  const n = performance.now()
  return Number.isFinite(n) ? Math.round(n) : null
}
