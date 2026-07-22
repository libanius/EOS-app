import { type NextRequest, NextResponse } from 'next/server'
import { ensureProfile } from '@/lib/ensure-profile'
import {
  DEFAULT_PERSONALIZATION,
  isDecisionStyle,
  isRiskTolerance,
  normalizeMarkdown,
  normalizeOptionalText,
} from '@/lib/profile-personalization'
import { createClient } from '@/lib/supabase/server'

const FIELDS = 'profile_id, avatar_url, user_context_md, pilot_memory_md, decision_style, risk_tolerance, updated_at, pilot_memory_updated_at'

function tableMissing(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /profile_personalization/i.test(error?.message ?? '')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  await ensureProfile(supabase, user)
  const { data, error } = await supabase
    .from('profile_personalization')
    .select(FIELDS)
    .eq('profile_id', user.id)
    .maybeSingle()

  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json({
        personalization: { ...DEFAULT_PERSONALIZATION, configured: false },
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    personalization: data ?? { ...DEFAULT_PERSONALIZATION, profile_id: user.id },
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  await ensureProfile(supabase, user)
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { profile_id: user.id }

  if ('avatar_url' in body) {
    const avatar = normalizeOptionalText(body.avatar_url, 2048)
    if (avatar === undefined) return NextResponse.json({ error: 'avatar_url inválido.' }, { status: 400 })
    patch.avatar_url = avatar
  }
  if ('user_context_md' in body) {
    const md = normalizeMarkdown(body.user_context_md)
    if (md === undefined) return NextResponse.json({ error: 'user_context_md inválido.' }, { status: 400 })
    patch.user_context_md = md
  }
  if ('pilot_memory_md' in body) {
    const md = normalizeMarkdown(body.pilot_memory_md)
    if (md === undefined) return NextResponse.json({ error: 'pilot_memory_md inválido.' }, { status: 400 })
    patch.pilot_memory_md = md
  }
  if ('decision_style' in body) {
    if (!isDecisionStyle(body.decision_style)) {
      return NextResponse.json({ error: 'decision_style inválido.' }, { status: 400 })
    }
    patch.decision_style = body.decision_style
  }
  if ('risk_tolerance' in body) {
    if (!isRiskTolerance(body.risk_tolerance)) {
      return NextResponse.json({ error: 'risk_tolerance inválido.' }, { status: 400 })
    }
    patch.risk_tolerance = body.risk_tolerance
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profile_personalization')
    .upsert(patch, { onConflict: 'profile_id' })
    .select(FIELDS)
    .single()

  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json({ error: 'Migration profile_personalization pendente.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ personalization: data })
}
