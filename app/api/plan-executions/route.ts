import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanExecutionSnapshot } from '@/lib/plan-execution-mode'
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

type PlanRow = {
  id: string
  circle_id: string
  name: string
  version: number
  status: string
}

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

async function memberCircleIds(admin: Admin, userId: string): Promise<string[]> {
  const { data } = await admin.from('circle_members').select('circle_id').eq('user_id', userId)
  return (data ?? []).map(row => row.circle_id as string)
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

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ execution: null })

  const requestedCircleId = request.nextUrl.searchParams.get('circleId')
  const circleIds = requestedCircleId ? [requestedCircleId] : await memberCircleIds(admin, user.id)
  if (!circleIds.length) return NextResponse.json({ execution: null })
  if (requestedCircleId && !(await assertMember(admin, requestedCircleId, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('family_plan_executions')
    .select('*')
    .in('circle_id', circleIds)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tableMissing(error)) return NextResponse.json({ execution: null, migrationPending: true })
  if (error) return NextResponse.json({ execution: null })
  if (!data) return NextResponse.json({ execution: null })

  return NextResponse.json({ execution: await snapshotFor(admin, data as ExecutionRow) })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { circleId?: string; planId?: string; sessionId?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (!body.circleId) return NextResponse.json({ error: 'circleId é obrigatório.' }, { status: 400 })
  if (!body.planId) return NextResponse.json({ error: 'planId é obrigatório.' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!(await assertMember(admin, body.circleId, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  const { data: plan } = await admin
    .from('family_plans')
    .select('id, circle_id, name, version, status')
    .eq('id', body.planId)
    .eq('circle_id', body.circleId)
    .neq('status', 'archived')
    .maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plano não pertence a este círculo.' }, { status: 400 })

  if (body.sessionId) {
    const { data: session, error: sessionError } = await admin
      .from('plan_sessions')
      .select('id')
      .eq('id', body.sessionId)
      .eq('circle_id', body.circleId)
      .eq('status', 'armed')
      .maybeSingle()
    if (tableMissing(sessionError)) {
      return NextResponse.json({ error: 'Sessão indisponível neste ambiente.' }, { status: 400 })
    }
    if (!session) return NextResponse.json({ error: 'Sessão armada inválida.' }, { status: 400 })
  }

  const planRow = plan as PlanRow
  const { data: created, error } = await admin
    .from('family_plan_executions')
    .insert({
      circle_id: body.circleId,
      plan_id: body.planId,
      session_id: body.sessionId ?? null,
      plan_version: planRow.version,
      status: 'running',
      started_by: user.id,
    })
    .select('*')
    .single()

  if (tableMissing(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (error || !created) return NextResponse.json({ error: error?.message ?? 'Falha ao executar plano.' }, { status: 500 })

  await admin.from('family_plan_execution_events').insert({
    execution_id: created.id,
    actor_user_id: user.id,
    kind: 'started',
    payload: { plan_id: body.planId, plan_version: planRow.version, session_id: body.sessionId ?? null },
  })

  const notice = await notifyPlanExecution({
    admin,
    circleId: body.circleId,
    actorId: user.id,
    executionId: created.id,
    planName: planRow.name,
    kind: 'started',
  })

  const execution = await snapshotFor(admin, created as ExecutionRow)
  return NextResponse.json({
    execution: {
      ...execution,
      notice: {
        attempted: notice.push !== 'no_recipients',
        delivered: notice.push === 'delivered',
        pending: false,
      },
    },
    notice,
  }, { status: 201 })
}
