import { type NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PING_PRESETS, type PingPreset } from '@/lib/family-ping'
import { createCommsNotifications } from '@/lib/comms-notifications'
import { logError } from '@/lib/error-log'

/**
 * POST /api/family/ping — a preset message to ONE person in your circle (D-073).
 *
 * Presets, not free text, and deliberately so. Under stress people do not
 * compose; they pick. A fixed vocabulary also means the recipient recognises the
 * message instantly instead of parsing a sentence — "Estou bem" reads faster
 * than anything either of them would have typed.
 *
 * Only reaches someone who shares a circle with the sender. There is no way to
 * ping a stranger, and no way to ping anonymously: the sender's name is in the
 * notification.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:brightscalegroup@gmail.com'


export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let body: { toUserId?: string; preset?: string; pt?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }

  const preset = body.preset as PingPreset | undefined
  if (!body.toUserId || !preset || !(preset in PING_PRESETS)) {
    return NextResponse.json({ error: 'toUserId e preset válidos são obrigatórios.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })

  // A shared circle is the only relationship that authorises a ping.
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    admin.from('circle_members').select('circle_id').eq('user_id', user.id),
    admin.from('circle_members').select('circle_id').eq('user_id', body.toUserId),
  ])
  const shared = (mine ?? []).some(a => (theirs ?? []).some(b => b.circle_id === a.circle_id))
  if (!shared) return NextResponse.json({ error: 'Sem círculo em comum.' }, { status: 403 })

  const { data: sender } = await admin.from('profiles').select('name').eq('id', user.id).maybeSingle()
  const text = PING_PRESETS[preset][body.pt === false ? 'en' : 'pt']

  /*
   * ── A MENSAGEM EXISTE NO APP ANTES DE TENTAR O PUSH (FAM-T09 / D-186) ────
   *
   * Até aqui o ping era **só** push. Se a notificação não saísse — permissão
   * revogada, assinatura expirada, iPhone que só aceita push de PWA instalada
   * — a mensagem não existia em lugar nenhum: nem na caixa de entrada, nem na
   * linha do tempo, nem quando a pessoa abrisse o app. Sumia.
   *
   * Isso inverte a promessa da tela. "Onde você está?" numa emergência é
   * justamente a mensagem que não pode depender do canal mais frágil da pilha.
   *
   * Agora a ordem é outra: **grava primeiro, empurra depois.** O push vira
   * reforço — o que faz o telefone vibrar — e não o meio de transporte.
   */
  await createCommsNotifications({
    admin,
    actorId: user.id,
    recipientIds: [body.toUserId],
    scope: 'circle',
    surface: 'family',
    kind: 'family_ping',
    title: sender?.name ?? 'Família',
    body: text,
    href: '/family',
    metadata: { preset },
  })

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    // A mensagem chegou; só não vibra. Dizer "não entregou" aqui seria mentira.
    return NextResponse.json({ ok: true, sent: text, reason: 'in_app_only', push: 'unconfigured' })
  }

  const { data: subs } = await admin
    // A coluna é user_id. profile_id não existe — escrevi errado três vezes e
    // todo push que eu adicionei falhava em silêncio.
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', body.toUserId)

  if (!subs?.length) {
    return NextResponse.json({ ok: true, sent: text, reason: 'in_app_only', push: 'no_device' })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const payload = JSON.stringify({
    title: `EOS · ${sender?.name ?? 'Família'}`,
    body: text,
    url: '/family',
  })

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload),
    ),
  )
  const delivered = results.some(r => r.status === 'fulfilled')

  /*
   * ── A FALHA PARA DE SER ANÔNIMA ─────────────────────────────────────────
   *
   * Antes isto devolvia `push_failed` e mais nada. Cinco causas diferentes —
   * VAPID ausente, sem dispositivo, assinatura expirada, chave trocada, rede —
   * chegavam na tela como a mesma frase, e nenhuma chegava ao `error_log`.
   * Diagnosticar exigia adivinhar. (Mesma lição de D-185.)
   */
  const mortas: string[] = []
  const codigos: number[] = []
  results.forEach((r, i) => {
    if (r.status !== 'rejected') return
    const status = Number((r.reason as { statusCode?: number })?.statusCode ?? 0)
    codigos.push(status)
    // 404/410 = o navegador desfez a assinatura. Guardá-la só garante que a
    // próxima tentativa também falhe.
    if (status === 404 || status === 410) mortas.push(subs[i].endpoint)
  })

  if (mortas.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', mortas)
  }

  if (!delivered) {
    await logError(
      'api/family/ping:push',
      `falhou para ${subs.length} assinatura(s): status ${codigos.join(',') || 'desconhecido'}${mortas.length ? ` · ${mortas.length} removida(s)` : ''}`,
      { userId: user.id, context: { destinatario: body.toUserId, preset } },
    )
  }

  return NextResponse.json({
    ok: true,
    sent: text,
    // A mensagem SEMPRE chegou; `push` diz se ela também vibrou.
    push: delivered ? 'delivered' : 'failed',
    reason: delivered ? undefined : 'in_app_only',
  })
}
