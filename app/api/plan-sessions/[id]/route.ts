import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

async function readSessionForMember(admin: Admin, sessionId: string, userId: string) {
  const { data: session, error } = await admin
    .from('plan_sessions')
    .select('id, circle_id, status')
    .eq('id', sessionId)
    .maybeSingle()
  if (error || !session) return { session: null, error }

  const { data: membership } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', session.circle_id)
    .eq('user_id', userId)
    .maybeSingle()
  return { session: membership ? session : null, error: null }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { action?: 'disarm' | 'expire' }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (body.action !== 'disarm' && body.action !== 'expire') {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { session, error: readError } = await readSessionForMember(admin, params.id, user.id)
  if (tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 })

  const status = body.action === 'expire' ? 'expired' : 'disarmed'
  const { error } = await admin
    .from('plan_sessions')
    .update({ status, disarmed_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
