import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type MessageRow = {
  id: string
  circle_id: string
  sender_id: string
  body: string
  kind: 'text' | 'system' | 'alert'
  created_at: string
}

type ProfileRow = {
  id: string
  name: string | null
}

const MAX_BODY = 1000
const LIMIT = 80

async function requireMember(circleId: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: membership, error } = await supabase
    .from('circle_members')
    .select('role')
    .eq('circle_id', circleId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!membership) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const admin = createAdminClient()
  if (!admin) return { error: NextResponse.json({ error: 'Service role not configured' }, { status: 503 }) }

  return { user, admin }
}

export async function GET(req: NextRequest) {
  const circleId = req.nextUrl.searchParams.get('circleId')
  if (!circleId) return NextResponse.json({ error: 'circleId required' }, { status: 400 })

  const guard = await requireMember(circleId)
  if ('error' in guard) return guard.error

  const { data, error } = await guard.admin
    .from('circle_messages')
    .select('id, circle_id, sender_id, body, kind, created_at')
    .eq('circle_id', circleId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = ((data ?? []) as MessageRow[]).reverse()
  const senderIds = Array.from(new Set(rows.map(row => row.sender_id)))
  const names = new Map<string, string>()

  if (senderIds.length) {
    const { data: profiles } = await guard.admin
      .from('profiles')
      .select('id, name')
      .in('id', senderIds)

    for (const profile of (profiles ?? []) as ProfileRow[]) {
      names.set(profile.id, profile.name || '—')
    }
  }

  return NextResponse.json({
    messages: rows.map(row => ({
      id: row.id,
      circle_id: row.circle_id,
      sender_id: row.sender_id,
      sender_name: names.get(row.sender_id) ?? '—',
      is_me: row.sender_id === guard.user.id,
      body: row.body,
      kind: row.kind,
      created_at: row.created_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  let body: { circleId?: string; body?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const circleId = body.circleId
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!circleId) return NextResponse.json({ error: 'circleId required' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'message required' }, { status: 400 })
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'message too long' }, { status: 400 })

  const guard = await requireMember(circleId)
  if ('error' in guard) return guard.error

  const { data, error } = await guard.admin
    .from('circle_messages')
    .insert({
      circle_id: circleId,
      sender_id: guard.user.id,
      body: text,
      kind: 'text',
    })
    .select('id, circle_id, sender_id, body, kind, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    message: {
      ...(data as MessageRow),
      sender_name: guard.user.user_metadata?.name ?? guard.user.email ?? '—',
      is_me: true,
    },
  }, { status: 201 })
}
