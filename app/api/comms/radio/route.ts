import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cloneDefaultRadioConfig, normalizeRadioConfig } from '@/lib/comms-radio'

type CircleRole = 'Admin' | 'Editor' | 'Viewer'

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

async function requireMember(circleId: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient()
  if (!admin) return { error: NextResponse.json({ error: 'Service role not configured' }, { status: 503 }) }

  const { data: membership, error } = await admin
    .from('circle_members')
    .select('role')
    .eq('circle_id', circleId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!membership) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { user, admin, role: membership.role as CircleRole }
}

export async function GET(req: NextRequest) {
  const circleId = req.nextUrl.searchParams.get('circleId')
  if (!circleId) return NextResponse.json({ error: 'circleId required' }, { status: 400 })

  const guard = await requireMember(circleId)
  if ('error' in guard) return guard.error

  const { data, error } = await guard.admin
    .from('circle_radio_profiles')
    .select('config, updated_at, updated_by')
    .eq('circle_id', circleId)
    .maybeSingle()

  if (error && tableMissing(error)) {
    return NextResponse.json({
      config: cloneDefaultRadioConfig(),
      migrationPending: true,
      canEdit: false,
    })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    config: normalizeRadioConfig(data?.config ?? null),
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
    canEdit: guard.role === 'Admin' || guard.role === 'Editor',
  })
}

export async function PUT(req: NextRequest) {
  let body: { circleId?: string; config?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.circleId) return NextResponse.json({ error: 'circleId required' }, { status: 400 })

  const guard = await requireMember(body.circleId)
  if ('error' in guard) return guard.error
  if (guard.role !== 'Admin' && guard.role !== 'Editor') {
    return NextResponse.json({ error: 'Editor role required' }, { status: 403 })
  }

  const config = normalizeRadioConfig(body.config)
  const { data, error } = await guard.admin
    .from('circle_radio_profiles')
    .upsert({
      circle_id: body.circleId,
      config,
      updated_by: guard.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('config, updated_at, updated_by')
    .single()

  if (error && tableMissing(error)) {
    return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    config: normalizeRadioConfig(data?.config ?? config),
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
    canEdit: true,
  })
}
