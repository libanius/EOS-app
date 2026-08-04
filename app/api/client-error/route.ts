/**
 * POST /api/client-error — o erro que acontece no telefone do usuário (D-119).
 *
 * O `error_log` do D-118 cobre o servidor. Erro de JavaScript no navegador
 * continuava invisível — e é justamente o que quebra a tela na mão da pessoa,
 * onde ninguém do outro lado consegue ver.
 *
 * SEM LOGIN DE PROPÓSITO. A tela de entrada é onde uma falha dói mais: quem não
 * consegue entrar não consegue reportar nada, e é exatamente aí que o erro
 * precisa chegar. Em troca, a rota é tratada como hostil:
 *
 *  - teto por IP no Postgres (D-118), minuto e dia;
 *  - corpo pequeno e truncado, nada de payload aberto;
 *  - a URL perde query e hash antes de ser gravada — um link de convite ou de
 *    recuperação de senha carrega token na query, e ele não pode virar log;
 *  - ruído conhecido é descartado aqui também, não só no navegador.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceAiBudget } from '@/lib/rate-limit'
import { logError } from '@/lib/error-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Ruído que não é defeito do EOS.
 *
 * `Script error.` é o que o navegador entrega quando o erro veio de outra
 * origem: sem mensagem, sem linha, sem pilha. Registrar isso enche a tabela e
 * não permite corrigir nada. `ResizeObserver loop` é um aviso benigno que o
 * Chrome emite às pantadas. Extensão do usuário não é código nosso.
 */
const RUIDO = [
  /^Script error\.?$/i,
  /ResizeObserver loop/i,
  /^Load failed$/i,
  /extension context invalidated/i,
]

/** Query e hash saem: é ali que token de convite e de sessão viajam. */
function urlLimpa(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || !bruto) return null
  try {
    const u = new URL(bruto)
    return `${u.origin}${u.pathname}`.slice(0, 200)
  } catch {
    return bruto.split('?')[0].split('#')[0].slice(0, 200)
  }
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'desconhecido'

  // Um endpoint de escrita aberto precisa de teto, senão vira canal de entulho.
  // Generoso o bastante para uma tela que quebra em laço, apertado o bastante
  // para não ser útil a quem quiser encher a tabela.
  const estourou = await enforceAiBudget(`clienterr:${ip}`, { perMinute: 10, perDay: 200 })
  if (estourou) {
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 })
  }

  const bruto = await request.text()
  // 8 KB dá folga para uma pilha de chamadas e nada além disso.
  if (bruto.length > 8_192) {
    return NextResponse.json({ ok: false, reason: 'too_large' }, { status: 413 })
  }

  let corpo: Record<string, unknown>
  try {
    corpo = JSON.parse(bruto) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 })
  }

  const mensagem = typeof corpo.message === 'string' ? corpo.message.trim().slice(0, 500) : ''
  if (!mensagem) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 })
  if (RUIDO.some(r => r.test(mensagem))) {
    // Descartado não é erro: quem chamou fez a coisa certa.
    return NextResponse.json({ ok: true, ignored: true })
  }

  const pagina = urlLimpa(corpo.url)
  const escopo = `client${pagina ? new URL(pagina, 'http://x').pathname : ''}`.slice(0, 120)

  // `logError` monta mensagem e pilha a partir de um Error; aqui a pilha vem do
  // navegador, então ela é enxertada num Error de verdade.
  const erro = new Error(mensagem)
  erro.stack = typeof corpo.stack === 'string' ? corpo.stack.slice(0, 6_000) : undefined

  // Quem estava logado, quando dava para saber. Sem sessão a linha ainda vale:
  // o defeito é o mesmo, só falta o nome.
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    /* Sem sessão é o caso esperado na tela de entrada. */
  }

  await logError(escopo, erro, {
    userId,
    context: {
      origem: 'navegador',
      tipo: typeof corpo.kind === 'string' ? corpo.kind.slice(0, 40) : 'error',
      pagina: pagina ?? 'desconhecida',
      agente: (request.headers.get('user-agent') ?? '').slice(0, 200),
    },
  })

  return NextResponse.json({ ok: true })
}
