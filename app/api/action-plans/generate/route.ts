import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAndSaveActionPlan } from '@/lib/action-plans'
import { ScenarioType } from '@/lib/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body: {
    scenarioType?: string
    description?: string | null
    severity?: number
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  if (!body.scenarioType || !Object.values(ScenarioType).includes(body.scenarioType as ScenarioType)) {
    return NextResponse.json({ error: 'scenarioType inválido.' }, { status: 422 })
  }

  try {
    const result = await generateAndSaveActionPlan(supabase, user.id, {
      scenarioType: body.scenarioType as ScenarioType,
      description: body.description ?? null,
      severity: body.severity,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao gerar plano.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
