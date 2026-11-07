/**
 * Moldura comum das rotas do estoque (INVENTORY-001 §4.3): sessão, service
 * role, corpo JSON e a tradução de erro. Cada rota só escreve a regra dela.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/error-log'
import { StockError } from '@/lib/inventory-server'

export type StockCtx = { userId: string; admin: SupabaseClient; body: Record<string, unknown> }

export async function stockRoute(
  req: Request,
  scope: string,
  handler: (ctx: StockCtx) => Promise<Response>,
  opts: { body?: boolean } = {},
): Promise<Response> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  let body: Record<string, unknown> = {}
  if (opts.body !== false) {
    const text = await req.text()
    if (text) {
      try {
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
        body = parsed as Record<string, unknown>
      } catch {
        return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
      }
    }
  }

  try {
    return await handler({ userId: auth.user.id, admin, body })
  } catch (e) {
    if (e instanceof StockError) return NextResponse.json({ error: e.message }, { status: e.status })
    await logError(scope, e, { userId: auth.user.id })
    return NextResponse.json({ error: 'Não foi possível gravar.' }, { status: 500 })
  }
}
