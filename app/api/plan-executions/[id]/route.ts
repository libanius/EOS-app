import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanExecutionSnapshot } from '@/lib/plan-execution-mode'
import type { PlanExecutionMemberStatusValue } from '@/lib/plan-execution-state'
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

function columnMissing(error: { code?: string } | null) {
  return error?.code === '42703' || error?.code === 'PGRST204'
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

async function readExecutionForMember(admin: Admin, executionId: string, userId: string) {
  const { data: current, error } = await admin
    .from('family_plan_executions')
    .select('*')
    .eq('id', executionId)
    .maybeSingle()

  if (error || !current) return { row: null, error }
  const row = current as ExecutionRow
  if (!(await assertMember(admin, row.circle_id, userId))) return { row: null, error: null }
  return { row, error: null }
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

async function readExecutionState(admin: Admin, row: ExecutionRow) {
  const [
    { data: events },
    sessionMembersResult,
    sessionDependentsResult,
    { data: circleMembers },
    triggerResult,
  ] = await Promise.all([
    admin
      .from('family_plan_execution_events')
      .select('actor_user_id, kind, payload, created_at')
      .eq('execution_id', row.id)
      .order('created_at', { ascending: true }),
    row.session_id
      ? admin.from('plan_session_members').select('user_id').eq('session_id', row.session_id)
      : Promise.resolve({ data: null, error: null }),
    row.session_id
      ? admin.from('plan_session_dependents').select('member_id, guardian_user_id').eq('session_id', row.session_id)
      : Promise.resolve({ data: null, error: null }),
    admin.from('circle_members').select('user_id').eq('circle_id', row.circle_id),
    admin
      .from('family_plan_triggers')
      .select('escalation_minutes')
      .eq('plan_id', row.plan_id)
      .order('sort_order', { ascending: true }),
  ])

  const sessionMemberIds = uniqueStrings((sessionMembersResult.data ?? []).map(item => item.user_id))
  const circleMemberIds = uniqueStrings((circleMembers ?? []).map(item => item.user_id))
  const memberIds = sessionMemberIds.length ? sessionMemberIds : circleMemberIds
  const sessionDependents = sessionDependentsResult.data ?? []

  const fallbackDependentsResult = !sessionDependents.length && memberIds.length
    ? await admin
      .from('family_members')
      .select('id, name, profile_id, linked_user_id, age, mobility_impaired, is_infant')
      .in('profile_id', memberIds)
    : { data: [], error: null }

  const fallbackDependents = columnMissing(fallbackDependentsResult.error)
    ? []
    : (fallbackDependentsResult.data ?? [])
      .filter(member => {
        const age = typeof member.age === 'number' ? member.age : null
        return !member.linked_user_id && (member.is_infant || member.mobility_impaired || (age !== null && age < 12))
      })

  const guardianIds = uniqueStrings((sessionDependents ?? []).map(item => item.guardian_user_id))
  const dependentIds = uniqueStrings([
    ...(sessionDependents ?? []).map(item => item.member_id),
    ...fallbackDependents.map(item => item.id),
  ])

  const [{ data: profiles }, { data: familyMembers }] = await Promise.all([
    memberIds.length || guardianIds.length
      ? admin.from('profiles').select('id, name').in('id', uniqueStrings([...memberIds, ...guardianIds]))
      : Promise.resolve({ data: [] }),
    dependentIds.length
      ? admin.from('family_members').select('id, name').in('id', dependentIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileName = new Map((profiles ?? []).map(profile => [profile.id as string, profile.name as string | null]))
  const dependentName = new Map((familyMembers ?? []).map(member => [member.id as string, member.name as string | null]))
  const triggerRows = columnMissing(triggerResult.error) ? [] : (triggerResult.data ?? [])
  const triggerIndex = typeof row.protocol_index === 'number' ? row.protocol_index : 0

  return {
    members: memberIds.map(userId => ({ userId, name: profileName.get(userId) ?? null })),
    dependents: sessionDependents.length
      ? sessionDependents.map(item => ({
        memberId: item.member_id as string,
        name: dependentName.get(item.member_id as string) ?? null,
        guardianUserId: (item.guardian_user_id as string | null) ?? null,
        guardianName: item.guardian_user_id ? profileName.get(item.guardian_user_id as string) ?? null : null,
      }))
      : fallbackDependents.map(item => ({
        memberId: item.id as string,
        name: (item.name as string | null) ?? null,
        guardianUserId: (item.profile_id as string | null) ?? null,
        guardianName: item.profile_id ? profileName.get(item.profile_id as string) ?? null : null,
      })),
    events: (events ?? []).map(event => ({
      actorUserId: event.actor_user_id as string,
      kind: event.kind as string,
      payload: (event.payload as Record<string, unknown> | null) ?? {},
      createdAt: event.created_at as string,
    })),
    escalationMinutes: (triggerRows[triggerIndex]?.escalation_minutes as number | null | undefined) ?? null,
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { row, error } = await readExecutionForMember(admin, params.id, user.id)
  if (tableMissing(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Execução não encontrada.' }, { status: 404 })

  return NextResponse.json({
    execution: await snapshotFor(admin, row),
    state: await readExecutionState(admin, row),
  })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: {
    action?: string
    protocolIndex?: number
    status?: PlanExecutionMemberStatusValue
    decision?: 'taken' | 'deferred'
    stepIndex?: number
    stepLabel?: string
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (
    body.action !== 'cancel' &&
    body.action !== 'set_protocol' &&
    body.action !== 'status' &&
    body.action !== 'escalation' &&
    body.action !== 'resolve'
  ) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { row, error: readError } = await readExecutionForMember(admin, params.id, user.id)
  if (tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Execução não encontrada.' }, { status: 404 })
  if (row.status !== 'running') return NextResponse.json({ execution: await snapshotFor(admin, row) })

  if (body.action === 'set_protocol') {
    const protocolIndex = body.protocolIndex
    if (!Number.isInteger(protocolIndex) || protocolIndex === undefined || protocolIndex < 0 || protocolIndex > 99) {
      return NextResponse.json({ error: 'Protocolo inválido.' }, { status: 400 })
    }

    const { count, error: triggerCountError } = await admin
      .from('family_plan_triggers')
      .select('*', { count: 'exact', head: true })
      .eq('plan_id', row.plan_id)
    if (triggerCountError && !tableMissing(triggerCountError)) {
      return NextResponse.json({ error: triggerCountError.message }, { status: 500 })
    }
    const protocolCount = Math.max(1, count ?? 0)
    if (protocolIndex >= protocolCount) {
      return NextResponse.json({ error: 'Protocolo não existe neste plano.' }, { status: 400 })
    }

    const { data: updated, error } = await admin
      .from('family_plan_executions')
      .update({ protocol_index: protocolIndex })
      .eq('id', params.id)
      .select('*')
      .single()

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? 'Falha ao escolher protocolo.' }, { status: 500 })
    }

    await admin.from('family_plan_execution_events').insert({
      execution_id: params.id,
      actor_user_id: user.id,
      kind: 'protocol_set',
      payload: { protocol_index: protocolIndex },
    })

    return NextResponse.json({ execution: await snapshotFor(admin, updated as ExecutionRow) })
  }

  if (body.action === 'status') {
    const status = body.status
    if (status !== 'at_place' && status !== 'on_the_way' && status !== 'searching' && status !== 'no_signal') {
      return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
    }
    await admin.from('family_plan_execution_events').insert({
      execution_id: params.id,
      actor_user_id: user.id,
      kind: status === 'at_place' ? 'arrived' : 'status',
      payload: { status },
    })
    return NextResponse.json({
      execution: await snapshotFor(admin, row),
      state: await readExecutionState(admin, row),
    })
  }

  if (body.action === 'escalation') {
    if (body.decision !== 'taken' && body.decision !== 'deferred') {
      return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 })
    }
    await admin.from('family_plan_execution_events').insert({
      execution_id: params.id,
      actor_user_id: user.id,
      kind: body.decision === 'taken' ? 'escalation_taken' : 'escalation_suggested',
      payload: {
        decision: body.decision,
        step_index: Number.isInteger(body.stepIndex) ? body.stepIndex : null,
        step_label: body.stepLabel?.trim()?.slice(0, 80) ?? null,
      },
    })
    return NextResponse.json({
      execution: await snapshotFor(admin, row),
      state: await readExecutionState(admin, row),
    })
  }

  if (body.action === 'resolve') {
    const endedAt = new Date().toISOString()
    const { data: updated, error } = await admin
      .from('family_plan_executions')
      .update({ status: 'resolved', ended_at: endedAt, outcome: 'resolved' })
      .eq('id', params.id)
      .select('*')
      .single()

    if (error || !updated) return NextResponse.json({ error: error?.message ?? 'Falha ao encerrar.' }, { status: 500 })

    await admin.from('family_plan_execution_events').insert({
      execution_id: params.id,
      actor_user_id: user.id,
      kind: 'resolved',
      payload: { outcome: 'resolved' },
    })

    const { data: plan } = await admin.from('family_plans').select('name').eq('id', row.plan_id).maybeSingle()
    const notice = await notifyPlanExecution({
      admin,
      circleId: row.circle_id,
      actorId: user.id,
      executionId: params.id,
      planName: (plan?.name as string | null | undefined)?.trim() || 'Plano da família',
      kind: 'resolved',
    })

    return NextResponse.json({ execution: await snapshotFor(admin, updated as ExecutionRow), notice })
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
