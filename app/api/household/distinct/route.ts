/**
 * POST /api/household/distinct — "São duas pessoas" (HOUSEHOLD-FIX-001 §3.6).
 *
 * Grava o par para o alerta de duplicata não perguntar de novo, nem nesta nem
 * em outra sessão. Não mexe em nenhuma pessoa: é só a resposta do usuário.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pairKeys, type PersonKind } from '@/lib/household-names'
import { logError } from '@/lib/error-log'

export const dynamic = 'force-dynamic'

const TIPOS: PersonKind[] = ['account', 'dependent', 'invite']
type Ref = { kind?: string; id?: string }
const valido = (r: Ref | undefined): r is { kind: PersonKind; id: string } =>
  Boolean(r && typeof r.id === 'string' && r.id && TIPOS.includes(r.kind as PersonKind))

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  let body: { a?: Ref; b?: Ref }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!valido(body.a) || !valido(body.b)) {
    return NextResponse.json({ error: 'a e b precisam de kind e id' }, { status: 400 })
  }

  const [a_key, b_key] = pairKeys(body.a, body.b)
  if (a_key === b_key) return NextResponse.json({ error: 'par inválido' }, { status: 400 })

  const { error } = await admin
    .from('household_distinct_pairs')
    .upsert({ owner_id: auth.user.id, a_key, b_key }, { ignoreDuplicates: true })

  if (error) {
    await logError('api/household/distinct', error, { userId: auth.user.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
