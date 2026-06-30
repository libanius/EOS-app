import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import webpush from 'web-push'
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

  const { data: subs } = await supabase.from('push_subscriptions')
    .select('endpoint, p256dh, auth').in('user_id', memberIds)
  if (!subs?.length) return NextResponse.json({ sent: 0, note: 'No subscribers' })

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
  if (deadEndpoints.length) await supabase.from('push_subscriptions').delete().in('endpoint', deadEndpoints)

  return NextResponse.json({ sent, failed: results.length - sent })
}
