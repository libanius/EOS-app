import { type NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PING_PRESETS, type PingPreset } from '@/lib/family-ping'

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

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ ok: false, reason: 'push_unconfigured' })
  }

  const { data: subs } = await admin
    // A coluna é user_id. profile_id não existe — escrevi errado três vezes e
    // todo push que eu adicionei falhava em silêncio.
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', body.toUserId)

  if (!subs?.length) {
    // Honest: the message had nowhere to go. The UI must say so rather than
    // letting the sender believe it was delivered.
    return NextResponse.json({ ok: false, reason: 'no_device' })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const payload = JSON.stringify({
    title: `EOS · ${sender?.name ?? 'Família'}`,
    body: text,
    url: '/dashboard',
  })

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload),
    ),
  )
  const delivered = results.some(r => r.status === 'fulfilled')
  return NextResponse.json({ ok: delivered, sent: text, reason: delivered ? undefined : 'push_failed' })
}
