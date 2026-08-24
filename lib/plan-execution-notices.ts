import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createCommsNotifications,
  getCircleMemberIds,
  getCircleName,
  getProfileName,
} from '@/lib/comms-notifications'
import { logError } from '@/lib/error-log'

type AdminClient = SupabaseClient

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:brightscalegroup@gmail.com'

type NoticeResult = {
  recipients: number
  push: 'delivered' | 'failed' | 'unconfigured' | 'no_recipients' | 'no_device'
}

type NoticeInput = {
  admin: AdminClient
  circleId: string
  actorId: string
  executionId: string
  planName: string
  kind: 'started' | 'cancelled' | 'resolved'
}

export async function notifyPlanExecution({
  admin,
  circleId,
  actorId,
  executionId,
  planName,
  kind,
}: NoticeInput): Promise<NoticeResult> {
  const [memberIds, actorName, circleName] = await Promise.all([
    getCircleMemberIds(admin, circleId),
    getProfileName(admin, actorId),
    getCircleName(admin, circleId),
  ])
  const recipients = memberIds.filter(id => id !== actorId)
  if (!recipients.length) return { recipients: 0, push: 'no_recipients' }

  const started = kind === 'started'
  const resolved = kind === 'resolved'
  const title = started
    ? `${actorName} executou um plano`
    : resolved
      ? `${actorName} encerrou o plano`
      : `${actorName} cancelou o plano`
  const body = started
    ? `${circleName}: ${planName} está em execução.`
    : resolved
      ? `${circleName}: ${planName} foi marcado como resolvido.`
      : `${circleName}: falso alarme, ${planName} foi cancelado.`
  const notificationKind = started
    ? 'plan_execution'
    : resolved
      ? 'plan_execution_resolved'
      : 'plan_execution_cancelled'

  await createCommsNotifications({
    admin,
    circleId,
    actorId,
    recipientIds: recipients,
    scope: 'circle',
    surface: 'comms',
    kind: notificationKind,
    title,
    body,
    href: `/dashboard?execution=${encodeURIComponent(executionId)}`,
    sourceKey: `plan-execution:${executionId}:${kind}`,
    metadata: {
      execution_id: executionId,
      circle_id: circleId,
      plan_name: planName,
      notice: kind,
    },
  })

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { recipients: recipients.length, push: 'unconfigured' }
  }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', recipients)

  if (!subs?.length) {
    return { recipients: recipients.length, push: 'no_device' }
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const payload = JSON.stringify({
    title: `EOS · ${started ? 'Plano em execução' : resolved ? 'Plano resolvido' : 'Falso alarme'}`,
    body,
    url: `/dashboard?execution=${encodeURIComponent(executionId)}`,
  })

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
        payload,
      ),
    ),
  )
  const delivered = results.some(result => result.status === 'fulfilled')

  const deadEndpoints: string[] = []
  const statusCodes: number[] = []
  results.forEach((result, index) => {
    if (result.status !== 'rejected') return
    const status = Number((result.reason as { statusCode?: number })?.statusCode ?? 0)
    statusCodes.push(status)
    if (status === 404 || status === 410) deadEndpoints.push(subs[index].endpoint as string)
  })

  if (deadEndpoints.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', deadEndpoints)
  }

  if (!delivered) {
    await logError(
      `api/plan-executions:${kind}:push`,
      `falhou para ${subs.length} assinatura(s): status ${statusCodes.join(',') || 'desconhecido'}${deadEndpoints.length ? ` · ${deadEndpoints.length} removida(s)` : ''}`,
      { userId: actorId, context: { executionId, circleId, planName } },
    )
  }

  return {
    recipients: recipients.length,
    push: delivered ? 'delivered' : 'failed',
  }
}
