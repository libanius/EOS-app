import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXECUTION_UNDO_WINDOW_MS, type PlanExecutionSnapshot } from '@/lib/plan-execution-mode'
import { notifyPlanExecution } from '@/lib/plan-execution-notices'

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

type ExecutionRow = {
  id: string
  plan_id: string
  circle_id: string
  session_id: string | null
  protocol_index: number | null
  plan_version: number
  status: 'running' | 'resolved' | 'cancelled'
  started_by: string
  started_at: string
  ended_at: string | null
  outcome: string | null
}

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

async function assertMember(admin: Admin, circleId: string, userId: string) {
  const { data } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}

async function snapshotFor(admin: Admin, row: ExecutionRow): Promise<PlanExecutionSnapshot> {
  const [{ data: plan }, { data: circle }, { data: starter }] = await Promise.all([
    admin.from('family_plans').select('name').eq('id', row.plan_id).maybeSingle(),
    admin.from('circles').select('name').eq('id', row.circle_id).maybeSingle(),
    admin.from('profiles').select('name').eq('id', row.started_by).maybeSingle(),
  ])

  return {
    id: row.id,
    circleId: row.circle_id,
    circleName: (circle?.name as string | null | undefined) ?? null,
    planId: row.plan_id,
    planName: (plan?.name as string | null | undefined)?.trim() || 'Plano da família',
    planVersion: row.plan_version,
    sessionId: row.session_id,
    protocolIndex: row.protocol_index,
    status: row.status,
    startedBy: row.started_by,
    startedByName: (starter?.name as string | null | undefined) ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    outcome: row.outcome,
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { action?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: current, error: readError } = await admin
    .from('family_plan_executions')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (readError || !current) return NextResponse.json({ error: 'Execução não encontrada.' }, { status: 404 })

  const row = current as ExecutionRow
  if (!(await assertMember(admin, row.circle_id, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }
  if (row.status !== 'running') return NextResponse.json({ execution: await snapshotFor(admin, row) })

  const startedMs = Date.parse(row.started_at)
  if (!Number.isFinite(startedMs) || Date.now() - startedMs >= EXECUTION_UNDO_WINDOW_MS) {
    return NextResponse.json({ error: 'A janela de desfazer expirou.' }, { status: 409 })
  }

  const endedAt = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('family_plan_executions')
    .update({ status: 'cancelled', ended_at: endedAt, outcome: 'false_alarm' })
    .eq('id', params.id)
    .select('*')
    .single()

  if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Falha ao cancelar.' }, { status: 500 })

  await admin.from('family_plan_execution_events').insert({
    execution_id: params.id,
    actor_user_id: user.id,
    kind: 'cancelled',
    payload: { outcome: 'false_alarm' },
  })

  const { data: plan } = await admin.from('family_plans').select('name').eq('id', row.plan_id).maybeSingle()
  const notice = await notifyPlanExecution({
    admin,
    circleId: row.circle_id,
    actorId: user.id,
    executionId: params.id,
    planName: (plan?.name as string | null | undefined)?.trim() || 'Plano da família',
    kind: 'cancelled',
  })

  return NextResponse.json({ execution: await snapshotFor(admin, updated as ExecutionRow), notice })
}
