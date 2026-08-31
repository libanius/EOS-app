import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import webpush from 'web-push'
import { enviarNativoParaUsuarios } from '@/lib/push-native-fanout'
import { canAccess } from '@/lib/feature-gates'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:brightscalegroup@gmail.com'

interface Ctx { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!VAPID_PRIVATE || !VAPID_PUBLIC) {
    return NextResponse.json({ error: 'Push notifications not configured' }, { status: 503 })
  }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
  const plan = (profile?.plan ?? 'free') as 'free' | 'family' | 'premium'
  if (!canAccess('monitoring_push', plan)) {
    return NextResponse.json({ error: 'Premium plan required' }, { status: 403 })
  }
  const { data: membership } = await supabase.from('circle_members')
    .select('role').eq('circle_id', params.id).eq('user_id', user.id).maybeSingle()
  if (membership?.role !== 'Admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }

  let body: { title?: string; message?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.title?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: 'title and message required' }, { status: 400 })
  }

  const { data: members } = await supabase.from('circle_members').select('user_id').eq('circle_id', params.id)
  const memberIds = (members ?? []).map(m => m.user_id)
  if (!memberIds.length) return NextResponse.json({ sent: 0 })

  /*
   * ── O broadcast do círculo não chegava a ninguém (D-229) ────────────────
   *
   * Estas duas linhas liam `push_subscriptions` com o cliente do USUÁRIO. A
   * única política da tabela é `auth.uid() = user_id` (migração de 2026-06-30),
   * então a RLS devolvia no máximo a assinatura de quem estava enviando.
   *
   * O resultado: o alerta do administrador do círculo chegava ao próprio
   * administrador — ou a ninguém — e a rota respondia `sent: 1` sem mentir sobre
   * o que fez, só sobre o que significava. Nenhum membro jamais recebeu um
   * alerta manual de círculo.
   *
   * O envio precisa de service role, como já acontece em todos os outros
   * lugares que enviam push (`plans`, `simulation`, `plan-execution-notices`,
   * `family/ping`). Esta rota era a única exceção, e por isso a única quebrada.
   */
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Push indisponível.' }, { status: 503 })

  /*
   * Aparelhos da loja primeiro, antes de qualquer saída baseada em assinatura
   * de navegador — senão quem só tem o app publicado nunca receberia (D-228 §4).
   */
  const nativo = await enviarNativoParaUsuarios(admin, memberIds, {
    title: body.title.trim(),
    body: body.message.trim(),
    url: '/circles',
  })

  const { data: subs } = await admin.from('push_subscriptions')
    .select('endpoint, p256dh, auth').in('user_id', memberIds)
  if (!subs?.length) {
    return NextResponse.json({
      sent: nativo.sent,
      failed: nativo.failed,
      ...(nativo.sent ? {} : { note: 'No subscribers' }),
    })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const payload = JSON.stringify({
    title: body.title.trim(), body: body.message.trim(),
    icon: '/icon-192.png', badge: '/icon-192.png', data: { url: '/circles' },
  })

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload))
  )
  const sent = results.filter(r => r.status === 'fulfilled').length

  const deadEndpoints = subs.filter((_, i) => {
    const r = results[i]
    return r.status === 'rejected' && (r.reason as { statusCode?: number })?.statusCode === 410
  }).map(s => s.endpoint)
  if (deadEndpoints.length) await admin.from('push_subscriptions').delete().in('endpoint', deadEndpoints)

  return NextResponse.json({
    sent: sent + nativo.sent,
    failed: results.length - sent + nativo.failed,
  })
}
