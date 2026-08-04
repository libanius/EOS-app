import { type NextRequest, NextResponse } from 'next/server'
import { ensureProfile } from '@/lib/ensure-profile'
import { normalizeMarkdown, normalizeOptionalText } from '@/lib/profile-personalization'
import { createClient } from '@/lib/supabase/server'

type Body = {
  proposal_md: string
  reason?: string
  source?: string
}

function tableOrRpcMissing(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || error?.code === '42883'
}

function appendMemory(current: string, proposal: string, source: string) {
  const date = new Date().toISOString().slice(0, 10)
  const block = `## ${date} — ${source}\n\n${proposal.trim()}`
  return current.trim() ? `${current.trim()}\n\n${block}` : block
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  await ensureProfile(supabase, user)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const proposal = normalizeMarkdown(body.proposal_md, 4000)
  if (!proposal?.trim()) {
    return NextResponse.json({ error: 'proposal_md inválido.' }, { status: 400 })
  }

  const reason = normalizeOptionalText(body.reason ?? '', 500)
  if (reason === undefined) return NextResponse.json({ error: 'reason inválido.' }, { status: 400 })

  const source = normalizeOptionalText(body.source ?? 'pilot_chat', 80)
  if (source === undefined) return NextResponse.json({ error: 'source inválido.' }, { status: 400 })
  const sourceLabel = source ?? 'pilot_chat'

  const { data: personalization, error: readError } = await supabase
    .from('profile_personalization')
    .select('pilot_memory_md')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }

  const previous = typeof personalization?.pilot_memory_md === 'string'
    ? personalization.pilot_memory_md
    : ''
  const next = appendMemory(previous, proposal, sourceLabel).slice(0, 20000)

  const { data, error } = await supabase.rpc('confirm_pilot_memory', {
    p_profile_id: user.id,
    p_source: sourceLabel,
    p_reason: reason ?? '',
    p_proposal_md: proposal,
    p_next_memory_md: next,
  })

  if (error) {
    if (tableOrRpcMissing(error)) {
      return NextResponse.json({ error: 'Migration pilot_memory_events pendente.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, event: data, pilot_memory_md: next })
}
