import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCommsNotifications, getCircleMemberIds, getCircleName, getProfileName } from '@/lib/comms-notifications'

interface Ctx { params: { id: string; reqId: string } }

/**
 * POST /api/circles/:id/requests/:reqId — Admin approves or rejects a join request.
 * Body: { action: 'approve' | 'reject' }
 * On approve: inserts the requester into circle_members (Viewer) and marks the
 * request approved. On reject: marks it rejected (the requester may re-request).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = body.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  // Caller must be Admin of this circle.
  const { data: caller } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (caller?.role !== 'Admin') {
    return NextResponse.json({ error: 'Only Admins can decide requests' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 })

  const { data: request } = await admin
    .from('circle_join_requests')
    .select('id, circle_id, requester_id, status, wants_family_access')
    .eq('id', params.reqId)
    .eq('circle_id', params.id)
    .maybeSingle()
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${request.status}` }, { status: 409 })
  }

  let existingMemberIds: string[] = []
  if (action === 'approve') {
    existingMemberIds = await getCircleMemberIds(admin, params.id)

    /**
     * O link pedia Família íntima (D-112)?
     *
     * Então o membro nasce com o convite PENDENTE — `requested`, nunca
     * `approved`. Quem decide abrir a própria ficha médica é a pessoa, na conta
     * dela. Um link de convite pode fazer a pergunta; não pode responder por
     * ninguém.
     */
    const wants = (request as { wants_family_access?: boolean }).wants_family_access === true
    const { error: memErr } = await admin.from('circle_members').upsert(
      {
        circle_id: params.id,
        user_id: request.requester_id,
        role: 'Viewer',
        share_inventory: false,
        ...(wants
          ? {
              family_access_status: 'requested',
              family_access_requested_at: new Date().toISOString(),
              family_access_requested_by: user.id,
            }
          : {}),
      },
      { onConflict: 'circle_id,user_id', ignoreDuplicates: true },
    )
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  }

  const { error: updErr } = await admin
    .from('circle_join_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by: user.id })
    .eq('id', params.reqId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  if (action === 'approve') {
    const [circleName, requesterName] = await Promise.all([
      getCircleName(admin, params.id),
      getProfileName(admin, request.requester_id),
    ])
    await Promise.all([
      createCommsNotifications({
        admin,
        circleId: params.id,
        actorId: user.id,
        recipientIds: [request.requester_id],
        kind: 'join_request_approved',
        title: `Você entrou em ${circleName}`,
        body: `Seu pedido para entrar em ${circleName} foi aceito.`,
      }),
      createCommsNotifications({
        admin,
        circleId: params.id,
        actorId: request.requester_id,
        recipientIds: existingMemberIds,
        kind: 'member_joined',
        title: `${requesterName} entrou no círculo`,
        body: `${requesterName} agora faz parte de ${circleName}.`,
      }),
    ])
  }

  return NextResponse.json({ ok: true, action })
}
