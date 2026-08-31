import { type NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { enviarNativoParaUsuarios } from '@/lib/push-native-fanout'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/error-log'

/**
 * DELETE /api/plans/:id — tirar um plano de circulação.
 *
 * Faltava a saída. Dava para criar plano e nunca desfazer: um plano de teste,
 * um duplicado, um que a família descartou, ficavam para sempre no seletor
 * competindo com o plano de verdade. Num momento de execução, escolher entre
 * "Furacão" e "Furacão (teste)" é exatamente a hesitação que o EOS existe para
 * remover.
 *
 * ARQUIVA, NÃO APAGA A LINHA. `family_plan_executions.plan_id` é
 * `ON DELETE CASCADE`: um DELETE de verdade levaria junto o registro de que a
 * família executou aquele plano — histórico de emergência real, que ninguém
 * pediu para destruir. `status = 'archived'` já é estado de primeira classe no
 * schema e TODA listagem filtra `.neq('status', 'archived')`, então para quem
 * usa o app o plano some. O que sobra é a memória de que ele existiu.
 *
 * Duas travas:
 * - Só Admin ou Editor. Viewer lê o plano, não decide o que a família perde.
 * - Plano em execução AGORA não sai. Arquivar o roteiro que as pessoas estão
 *   seguindo na rua é a pior coisa que esta rota poderia fazer. É a mesma regra
 *   que EXEC-T01 aplicou a `circle_places` em uso.
 *
 * Some para todos, então avisa todos — pela mesma razão que salvar avisa
 * (doc 18 §6.3). Um plano que desaparece em silêncio é a família descobrindo
 * na hora errada.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:brightscalegroup@gmail.com'

const CAN_DELETE = ['Admin', 'Editor']

type Ctx = { params: { id: string } }

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  const { data: plan } = await admin
    .from('family_plans')
    .select('id, circle_id, name, status')
    .eq('id', params.id)
    .maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 })
  if (plan.status === 'archived') {
    return NextResponse.json({ error: 'Este plano já foi excluído.' }, { status: 409 })
  }

  const { data: membership } = await admin
    .from('circle_members')
    .select('role')
    .eq('circle_id', plan.circle_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Não é membro deste círculo.' }, { status: 403 })
  if (!CAN_DELETE.includes(String(membership.role))) {
    return NextResponse.json({ error: 'Só Admin ou Editor pode excluir um plano.' }, { status: 403 })
  }

  /*
   * A execução em curso é a única coisa que vence a vontade de excluir. Se a
   * tabela ainda não existe (migration EXEC-T03 não aplicada), a ausência não
   * pode virar recusa: sem execuções registradas não há execução em curso.
   */
  const { data: running, error: runningError } = await admin
    .from('family_plan_executions')
    .select('id')
    .eq('plan_id', plan.id)
    .eq('status', 'running')
    .limit(1)

  if (runningError && !isMissingTable(runningError)) {
    await logError('api/plans:delete_running_check', runningError, { userId: user.id })
    return NextResponse.json({ error: 'Não foi possível verificar se o plano está em execução.' }, { status: 500 })
  }
  if (running?.length) {
    return NextResponse.json(
      { error: 'Este plano está em execução agora. Encerre a execução antes de excluir.' },
      { status: 409 },
    )
  }

  const { error: archiveError } = await admin
    .from('family_plans')
    .update({ status: 'archived', updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', plan.id)

  if (archiveError) {
    await logError('api/plans:delete', archiveError, { userId: user.id, context: { planId: plan.id } })
    return NextResponse.json({ error: 'Não foi possível excluir o plano.' }, { status: 500 })
  }

  const { count } = await admin
    .from('family_plans')
    .select('*', { count: 'exact', head: true })
    .eq('circle_id', plan.circle_id)
    .neq('status', 'archived')

  await notifyCircle(admin, plan.circle_id, user.id, plan.name)

  return NextResponse.json({ ok: true, planId: plan.id, remaining: count ?? 0 })
}

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === '42P01' || /does not exist/i.test(error.message ?? '')
}

async function notifyCircle(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  circleId: string,
  actorId: string,
  planName: string,
) {
  const { data: members } = await admin.from('circle_members').select('user_id').eq('circle_id', circleId)
  const others = (members ?? []).map(m => m.user_id).filter(id => id !== actorId)
  if (!others.length) return

  /*
   * Aparelhos da loja ANTES do guard de VAPID (D-228 §4): dentro da casca não
   * existe `PushManager`, então APNs/FCM é o único caminho até eles.
   */
  await enviarNativoParaUsuarios(admin, others, {
    title: 'EOS · Um plano foi excluído',
    body: `"${planName}" saiu dos planos da família. Abra para ver o que ficou.`,
    url: '/preparedness/plano',
  })

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', others)
  if (!subs?.length) return

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const payload = JSON.stringify({
    title: 'EOS · Um plano foi excluído',
    body: `"${planName}" saiu dos planos da família. Abra para ver o que ficou.`,
    url: '/preparedness/plano',
  })
  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload),
    ),
  )
}
