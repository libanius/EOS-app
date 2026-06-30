import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let sub: PushSubscriptionJSON
  try { sub = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
  }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { endpoint?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', body.endpoint)
  return NextResponse.json({ ok: true })
}
