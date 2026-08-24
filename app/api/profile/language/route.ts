import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Persist the language the user picked (D-220).
 *
 * The choice already lives in localStorage and in a cookie, and both are enough
 * for anything rendered from a request. A push notification is not: it is
 * written by the scheduled scan, which has no browser and no cookie. Without a
 * column on the profile, every alert would go out in one language regardless of
 * what the person chose.
 *
 * Fire-and-forget by design — the UI must switch language instantly whether or
 * not this call succeeds.
 */
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { language?: unknown }
  try {
    body = (await req.json()) as { language?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const language = body.language
  if (language !== 'pt' && language !== 'en') {
    return NextResponse.json({ error: 'language must be "pt" or "en"' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update({ language }).eq('id', user.id)
  if (error) {
    // Column absent → the alerting migration has not been applied. The app keeps
    // working in the chosen language; only the push language falls back.
    if (error.code === '42703' || error.code === '42P01') {
      return NextResponse.json({ status: 'migration_pending', language })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', language })
}
