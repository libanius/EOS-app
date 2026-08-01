import { type NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * /api/plans — the family's emergency plan (D-066 / doc 18, PLAN-T01).
 *
 * GET  ?circleId=…  reads the whole plan as one document.
 * PUT               saves the whole plan as one document and bumps the version.
 *
 * Whole-document reads and writes on purpose: a plan is small, and its parts are
 * only meaningful together. A rendezvous point saved without the role that says
 * who goes there is not half a plan — it is a wrong one.
 *
 * MÚLTIPLOS PLANOS POR CÍRCULO (D-080). Uma família precisa de planos separados
 * para situações separadas: queda de energia, sem sinal de celular, incidente na
 * escola. A migration removeu o índice de plano-ativo-único, e isso tornou
 * PERIGOSO o comportamento antigo desta rota — ela pegava "o mais recente" e
 * sobrescrevia. Com dois planos, salvar um sobrescreveria o outro em silêncio.
 *
 * Agora o plano é escolhido por `planId`, sempre. Sem `planId` o GET devolve o
 * mais recente (e a lista completa, para a UI escolher) e o PUT **cria um plano
 * novo** em vez de adivinhar qual sobrescrever.
 *
 * VERSIONING IS THE SAFETY FEATURE (doc 18 §6). Every save increments `version`
 * and clears nothing: acks from older versions stay, so the UI can show exactly
 * who has and has not seen the change. A save also pushes the circle, because
 * moving a meeting point is a safety event, not a profile edit.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:brightscalegroup@gmail.com'

type Waypoint = { kind: string; name: string; lat: number; lng: number; notes?: string | null; sort_order?: number }
type Route = { label: string; geometry: unknown; mode?: string; notes?: string | null }
type Role = { member_user_id: string; responsibility: string }
type Trigger = { condition: string; action: string; sort_order?: number }
type PlanRow = { id: string; circle_id: string; name: string; version: number; status: string; updated_at: string }

const KINDS = ['rendezvous_1', 'rendezvous_2', 'rendezvous_3', 'home', 'school', 'work', 'custom']

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

async function assertMember(admin: NonNullable<ReturnType<typeof createAdminClient>>, circleId: string, userId: string) {
  const { data } = await admin
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}

async function readPlanDocument(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  plan: PlanRow,
  userId: string,
) {
  const [{ data: waypoints }, { data: routes }, { data: roles }, { data: acks }, triggerResult] =
    await Promise.all([
      admin.from('family_plan_waypoints').select('*').eq('plan_id', plan.id).order('sort_order'),
      admin.from('family_plan_routes').select('*').eq('plan_id', plan.id),
      admin.from('family_plan_roles').select('*').eq('plan_id', plan.id),
      admin.from('family_plan_acks').select('member_user_id, acked_version, acked_at').eq('plan_id', plan.id),
      admin.from('family_plan_triggers').select('*').eq('plan_id', plan.id).order('sort_order'),
    ])

  const acknowledged = (acks ?? []).filter(a => a.acked_version === plan.version).map(a => a.member_user_id)

  return {
    plan,
    waypoints: waypoints ?? [],
    routes: routes ?? [],
    roles: roles ?? [],
    triggers: triggerResult.data ?? [],
    triggersPending: tableMissing(triggerResult.error),
    acknowledgedBy: acknowledged,
    myAck: (acks ?? []).find(a => a.member_user_id === userId)?.acked_version ?? null,
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const circleId = request.nextUrl.searchParams.get('circleId')
  const planId = request.nextUrl.searchParams.get('planId')
  const listOnly = request.nextUrl.searchParams.get('all') === '1'
  if (!circleId) return NextResponse.json({ error: 'circleId é obrigatório.' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!(await assertMember(admin, circleId, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  if (listOnly) {
    const { data: plans, error } = await admin
      .from('family_plans')
      .select('id, circle_id, name, version, status, updated_at')
      .eq('circle_id', circleId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })

    if (error && tableMissing(error)) {
      return NextResponse.json({ plans: [], migrationPending: true })
    }
    return NextResponse.json({ plans: plans ?? [] })
  }

  let query = admin
    .from('family_plans')
    .select('id, circle_id, name, version, status, updated_at')
    .eq('circle_id', circleId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (planId) query = query.eq('id', planId)

  const { data: plan, error } = await query.maybeSingle()

  if (error && tableMissing(error)) {
    return NextResponse.json({ plan: null, migrationPending: true })
  }
  if (!plan) return NextResponse.json({ plan: null })

  return NextResponse.json(await readPlanDocument(admin, plan as PlanRow, user.id))
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: {
    circleId?: string
    planId?: string | null
    createNew?: boolean
    name?: string
    status?: string
    waypoints?: Waypoint[]
    routes?: Route[]
    roles?: Role[]
    triggers?: Trigger[]
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  if (!body.circleId) return NextResponse.json({ error: 'circleId é obrigatório.' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  if (!(await assertMember(admin, body.circleId, user.id))) {
    return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  }

  /**
   * Sem `planId`, só se atualiza quando NÃO HÁ AMBIGUIDADE.
   *
   * Depois que D-080 permitiu vários planos por círculo, cair no "mais recente"
   * virou sobrescrever o plano errado em silêncio — perder o plano que a família
   * combinou é a pior falha que este código pode ter. Com dois ou mais planos e
   * nenhum id, a resposta certa é recusar e pedir qual, não adivinhar.
   */
  let existingQuery = admin
    .from('family_plans')
    .select('id, version, circle_id')
    .eq('circle_id', body.circleId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (body.planId && !body.createNew) {
    // Por id, sem filtrar por círculo: é a checagem de posse logo abaixo que
    // decide, e assim um id de outro círculo é RECUSADO em vez de ignorado.
    existingQuery = admin
      .from('family_plans')
      .select('id, version, circle_id')
      .eq('id', body.planId)
      .limit(1)
  } else if (!body.createNew) {
    const { count } = await admin
      .from('family_plans')
      .select('*', { count: 'exact', head: true })
      .eq('circle_id', body.circleId)
      .neq('status', 'archived')
    if ((count ?? 0) > 1) {
      return NextResponse.json(
        { error: 'ambiguous_plan', message: 'Este círculo tem mais de um plano. Diga qual (planId) ou peça um novo (createNew).' },
        { status: 409 },
      )
    }
  }

  const { data: existing, error: readError } = body.createNew
    ? { data: null, error: null }
    : await existingQuery.maybeSingle()

  if (body.planId && !body.createNew && !existing) {
    return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 })
  }
  // Um plano de outro círculo nunca é editável por aqui, nem com id válido.
  if (existing && (existing as { circle_id?: string }).circle_id !== body.circleId) {
    return NextResponse.json({ error: 'Plano não pertence a este círculo.' }, { status: 403 })
  }

  if (readError && tableMissing(readError)) {
    return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  }

  let planId = existing?.id as string | undefined
  let version = (existing?.version ?? 0) + 1

  if (planId) {
    await admin
      .from('family_plans')
      .update({
        name: body.name?.trim() ? body.name.trim().slice(0, 80) : undefined,
        status: body.status ?? undefined,
        version,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
  } else {
    const { data: created, error } = await admin
      .from('family_plans')
      .insert({
        circle_id: body.circleId,
        name: body.name?.trim() ? body.name.trim().slice(0, 80) : 'Plano da família',
        status: body.status ?? 'active',
        created_by: user.id,
        updated_by: user.id,
        version: 1,
      })
      .select('id, version')
      .single()
    if (error || !created) return NextResponse.json({ error: error?.message ?? 'Falha ao criar.' }, { status: 500 })
    planId = created.id
    version = created.version
  }

  // The document is replaced wholesale; acks are NOT touched, so the UI can
  // still show who was on the previous version and has not seen this one.
  await Promise.all([
    admin.from('family_plan_waypoints').delete().eq('plan_id', planId),
    admin.from('family_plan_routes').delete().eq('plan_id', planId),
    admin.from('family_plan_roles').delete().eq('plan_id', planId),
  ])

  const waypoints = (body.waypoints ?? [])
    .filter(w => w?.name?.trim() && Number.isFinite(w.lat) && Number.isFinite(w.lng) && KINDS.includes(w.kind))
    .map((w, index) => ({
      plan_id: planId,
      kind: w.kind,
      name: w.name.trim().slice(0, 80),
      lat: w.lat,
      lng: w.lng,
      notes: w.notes?.slice(0, 300) ?? null,
      sort_order: w.sort_order ?? index,
    }))
  if (waypoints.length) await admin.from('family_plan_waypoints').insert(waypoints)

  const routes = (body.routes ?? [])
    .filter(r => r?.label?.trim() && r.geometry)
    .map(r => ({
      plan_id: planId,
      label: r.label.trim().slice(0, 80),
      geometry: r.geometry,
      mode: r.mode === 'foot' ? 'foot' : 'car',
      notes: r.notes?.slice(0, 300) ?? null,
    }))
  if (routes.length) await admin.from('family_plan_routes').insert(routes)

  const roles = (body.roles ?? [])
    .filter(r => r?.member_user_id && r?.responsibility?.trim())
    .map(r => ({
      plan_id: planId,
      member_user_id: r.member_user_id,
      responsibility: r.responsibility.trim().slice(0, 200),
    }))
  if (roles.length) await admin.from('family_plan_roles').insert(roles)

  // Triggers degrade on their own: a database without the migration saves the
  // rest of the plan instead of failing the whole write.
  const { error: triggerWipe } = await admin.from('family_plan_triggers').delete().eq('plan_id', planId)
  let triggersPending = tableMissing(triggerWipe)
  if (!triggersPending) {
    const triggers = (body.triggers ?? [])
      .filter(t => t?.condition?.trim() && t?.action?.trim())
      .map((t, index) => ({
        plan_id: planId,
        condition: t.condition.trim().slice(0, 200),
        action: t.action.trim().slice(0, 200),
        sort_order: t.sort_order ?? index,
      }))
    if (triggers.length) {
      const { error } = await admin.from('family_plan_triggers').insert(triggers)
      triggersPending = tableMissing(error)
    }
  }

  // The author is on the version they just wrote.
  await admin
    .from('family_plan_acks')
    .upsert({ plan_id: planId, member_user_id: user.id, acked_version: version, acked_at: new Date().toISOString() })

  // Moving a meeting point is a safety event, not a profile edit (doc 18 §6.3).
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    const { data: members } = await admin.from('circle_members').select('user_id').eq('circle_id', body.circleId)
    const others = (members ?? []).map(m => m.user_id).filter(id => id !== user.id)
    if (others.length) {
      const { data: subs } = await admin
        // A coluna é user_id. profile_id não existe — escrevi errado três vezes e
    // todo push que eu adicionei falhava em silêncio.
    .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .in('user_id', others)
      if (subs?.length) {
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
        const payload = JSON.stringify({
          title: 'EOS · Plano da família mudou',
          body: `O plano foi atualizado (v${version}). Abra para confirmar que você viu.`,
          url: '/plan',
        })
        await Promise.allSettled(
          subs.map(sub =>
            webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload),
          ),
        )
      }
    }
  }

  return NextResponse.json({ ok: true, planId, version, triggersPending })
}
