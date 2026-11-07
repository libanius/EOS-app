/** GET /api/signals/house-state — a resposta da casa por recurso (SIGNAL-002 §3.4, §4.2). */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readHouseState } from '@/lib/signal-house-server'
import { logError } from '@/lib/error-log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })
  try {
    return NextResponse.json(await readHouseState(admin, auth.user.id), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    await logError('api/signals/house-state', e, { userId: auth.user.id })
    return NextResponse.json({ error: 'Falha ao ler a casa.' }, { status: 500 })
  }
}
