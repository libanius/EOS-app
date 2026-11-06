import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { ingestEduContent } from '@/lib/edu-rag-ingest'

export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 })

  const result = await ingestEduContent(admin, id, user.id)
  if (!result.ok) {
    const { ok: _ok, status, ...rest } = result
    void _ok
    return NextResponse.json(rest, { status })
  }
  const { ok: _ok, ...rest } = result
  void _ok
  return NextResponse.json({ ok: true, ...rest })
}
