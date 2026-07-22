import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'

export const runtime = 'nodejs'

/**
 * Owner-only gift-code administration (D-060). Only ADMIN_EMAILS may list or
 * create codes. gift_codes is RLS-locked, so all access is via the service-role
 * client here, AFTER verifying the caller is the app owner.
 */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })
  const { data } = await admin
    .from('gift_codes')
    .select('code, plan, grant_days, note, redeemed_by, redeemed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  return NextResponse.json({ codes: data ?? [] })
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const code = String(body?.code ?? '').trim().toUpperCase()
  const plan = body?.plan
  const grantDays = Number(body?.grantDays)
  const note = body?.note ? String(body.note).slice(0, 200) : null

  if (!code || code.length > 64 || !/^[A-Z0-9._-]+$/.test(code)) {
    return NextResponse.json({ error: 'Código inválido (use A-Z, 0-9, . _ -).' }, { status: 400 })
  }
  if (plan !== 'family' && plan !== 'premium') {
    return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 })
  }
  if (!Number.isInteger(grantDays) || grantDays < 1 || grantDays > 366) {
    return NextResponse.json({ error: 'Dias inválidos (1–366).' }, { status: 400 })
  }

  const { error } = await admin.from('gift_codes').insert({ code, plan, grant_days: grantDays, note })
  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
    return NextResponse.json({ error: dup ? 'Código já existe.' : error.message }, { status: dup ? 409 : 500 })
  }
  return NextResponse.json({ ok: true, code, plan, grantDays })
}
