/**
 * EOS single-device Apple Web Push diagnostic.
 * A deliberate user action, never an emergency alert or a circle broadcast.
 */
import { type NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { providerReason, readVapid } from '@/lib/vapid'

export const runtime = 'nodejs'

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  // Cookie-authenticated route must reject cross-origin POSTs.
  if (!req.headers.get('origin') || req.headers.get('origin') !== req.nextUrl.origin) {
    return response({ error: 'Origin not allowed' }, 403)
  }
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return response({ error: 'JSON required' }, 415)
  }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return response({ error: 'Unauthorized' }, 401)

  const input = await req.json().catch(() => null)
  const endpoint = input && typeof input === 'object' && typeof input.endpoint === 'string'
    ? input.endpoint : ''
  if (!endpoint || endpoint.length > 2048) return response({ error: 'Invalid device subscription' }, 400)

  // Narrow to the Apple Web Push transport of the installed iPhone PWA.
  let host = ''
  try {
    const url = new URL(endpoint)
    if (url.protocol === 'https:' && url.hostname === 'web.push.apple.com'
        && !url.username && !url.password && !url.port) {
      host = url.hostname
    }
  } catch { /* invalid endpoint */ }
  if (!host) return response({ error: 'Only iPhone PWA Web Push can be tested here' }, 422)

  const admin = createAdminClient()
  if (!admin) return response({ error: 'Push service unavailable' }, 503)

  // Exact subscription from this browser, owned by the authenticated user.
  // Do not enumerate the user's other devices or select by enrollment time.
  const { data: sub, error: subError } = await admin
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (subError) return response({ error: 'Subscription lookup unavailable' }, 503)
  if (!sub) return response({ error: 'This device is not registered on your account' }, 404)

  // PUSH-403-001: cleaned subject + verified key pair, before spending the quota.
  const vapid = readVapid()
  if (!vapid.ok) {
    console.error('[EOS self-push-test] VAPID problem=' + vapid.problem)
    return response({ error: 'VAPID configuration invalid', vapidProblem: vapid.problem }, 503)
  }
  const { subject, publicKey, privateKey } = vapid.config

  // Atomic distributed limit, fail closed: one attempt in ten minutes per account.
  const { data: allowance, error: limitError } = await admin.rpc('consume_rate_limit', {
    p_key: 'push-self-test:' + user.id,
    p_window: 600,
    p_limit: 1,
  })
  const quota = Array.isArray(allowance) ? allowance[0] : allowance
  if (limitError || !quota || typeof quota.allowed !== 'boolean') {
    return response({ error: 'Rate limiter unavailable' }, 503)
  }
  if (!quota.allowed) return response({ error: 'A test was already attempted. Try after 10 minutes.' }, 429)

  const body = JSON.stringify({
    title: 'TESTE EOS',
    body: 'Nenhuma emergência está acontecendo',
    url: '/mais',
  })

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  } catch {
    console.error('[EOS self-push-test] VAPID configuration invalid')
    return response({ error: 'VAPID configuration invalid' }, 503)
  }
  try {
    // Single subscription; no retry, no pruning after 403.
    const provider = await webpush.sendNotification({
      endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth },
    }, body, { TTL: 60 })
    console.info('[EOS self-push-test] host=web.push.apple.com status=' + provider.statusCode)
    return response({
      ok: true, provider: host, providerStatus: provider.statusCode,
      note: 'Provider accepted the push; device arrival requires separate confirmation.',
    })
  } catch (error) {
    const status = (error as { statusCode?: unknown }).statusCode
    const providerStatus = typeof status === 'number' ? status : null
    const reason = providerReason(error)
    console.warn('[EOS self-push-test] host=web.push.apple.com status=' + (providerStatus ?? 'network_error')
      + (reason ? ' reason=' + reason : '') + (vapid.subjectFixed ? ' subject=normalized' : ''))
    return response({
      ok: false, provider: host, providerStatus, providerReason: reason,
      error: 'Web Push provider rejected the message or could not be reached',
    }, 502)
  }
}
