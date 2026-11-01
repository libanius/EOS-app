import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AI_HEALTH_CONSENT_COLUMN, isConsentColumnMissing } from '@/lib/ai-health-consent'

/**
 * A chave "a IA pode ler minha saúde" (STORE-T01 · D-231).
 *
 * Só a própria pessoa liga ou desliga — a escrita vai pelo cliente do usuário,
 * e a RLS de `profiles` só deixa cada um atualizar a própria linha.
 *
 * `available: false` quer dizer migração pendente. A tela mostra isso em vez
 * de fingir que gravou: uma chave que volta desligada sozinha ensina a pessoa
 * a desconfiar de todas as outras.
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(AI_HEALTH_CONSENT_COLUMN)
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    if (isConsentColumnMissing(error)) {
      return NextResponse.json({ available: false, consented: false, consentedAt: null })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const at = (data as Record<string, unknown> | null)?.[AI_HEALTH_CONSENT_COLUMN]
  return NextResponse.json({
    available: true,
    consented: typeof at === 'string',
    consentedAt: typeof at === 'string' ? at : null,
  })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body: { consent?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }
  // Só `true` liga. Qualquer outra coisa não é um "sim".
  if (typeof body.consent !== 'boolean') {
    return NextResponse.json({ error: 'consent precisa ser true ou false.' }, { status: 400 })
  }

  const consentedAt = body.consent ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('profiles')
    .update({ [AI_HEALTH_CONSENT_COLUMN]: consentedAt })
    .eq('id', user.id)
    .select(AI_HEALTH_CONSENT_COLUMN)
    .maybeSingle()

  if (error) {
    if (isConsentColumnMissing(error)) {
      return NextResponse.json({ error: 'migration_pending', available: false }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
  }

  const at = (data as Record<string, unknown>)[AI_HEALTH_CONSENT_COLUMN]
  return NextResponse.json({
    available: true,
    consented: typeof at === 'string',
    consentedAt: typeof at === 'string' ? at : null,
  })
}
