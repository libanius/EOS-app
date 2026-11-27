/**
 * Recibo de entrega de push (PUSH-403-001 §8).
 *
 * O service worker chama esta rota quando um push ACORDA o app no aparelho.
 * Só registra no log — sem tabela, sem dado pessoal além do prefixo do usuário.
 * Serve para separar "a Apple não entregou / o worker não rodou" de "o iPhone
 * recebeu e escondeu" (Foco, ajustes de notificação).
 */
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const TAG = /^[a-z0-9-]{1,40}$/
const ERRO = /^[A-Za-z_]{1,40}$/

export async function POST(req: NextRequest) {
  const input = await req.json().catch(() => null) as
    { tag?: unknown; shown?: unknown; error?: unknown } | null
  const tag = typeof input?.tag === 'string' && TAG.test(input.tag) ? input.tag : 'none'
  const shown = input?.shown === true
  const erro = typeof input?.error === 'string' && ERRO.test(input.error) ? input.error : null

  let quem = 'anon'
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (user) quem = user.id.slice(0, 8)
  } catch { /* recibo vale mesmo sem sessão */ }

  console.warn('[EOS push-receipt] user=' + quem + ' tag=' + tag + ' shown=' + shown + (erro ? ' error=' + erro : ''))
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
