import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'
import { DEFAULT_EDU_CONTENT, normalizeEduInput, normalizeTags } from '@/lib/edu'

function tableMissing(error: { code?: string } | null) {
  return error?.code === '42P01'
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminMode = req.nextUrl.searchParams.get('admin') === '1'
  const tag = normalizeTags(req.nextUrl.searchParams.get('tag') ?? '')[0] ?? null
  const owner = isAdminEmail(user.email)
  const client = createAdminClient()
  if (!client) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  let query = client
    .from('edu_content')
    .select('id, title, source_type, source_url, scenario_tags, summary, transcript, status, version, rag_enabled, rag_ingested_at, updated_at, approved_at')
    .order('updated_at', { ascending: false })

  if (!adminMode || !owner) query = query.eq('status', 'approved')
  if (tag) query = query.contains('scenario_tags', [tag])

  const { data, error } = await query
  if (error && tableMissing(error)) {
    return NextResponse.json({
      content: adminMode && owner ? [] : DEFAULT_EDU_CONTENT,
      canAdmin: owner,
      migrationPending: true,
    })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    content: data ?? [],
    canAdmin: owner,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const body = normalizeEduInput(raw)
  if (!body.title.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service role not configured' }, { status: 503 })

  if (body.id) {
    const { data: existing, error: readError } = await admin
      .from('edu_content')
      .select('id, version')
      .eq('id', body.id)
      .maybeSingle()
    if (readError && tableMissing(readError)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { data, error } = await admin
      .from('edu_content')
      .update({
        title: body.title,
        source_type: body.source_type,
        source_url: body.source_url,
        scenario_tags: body.scenario_tags,
        summary: body.summary,
        transcript: body.transcript,
        status: body.status,
        rag_enabled: body.rag_enabled,
        version: Number(existing.version ?? 1) + 1,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        approved_at: body.status === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', body.id)
      .select('id, title, source_type, source_url, scenario_tags, summary, transcript, status, version, rag_enabled, rag_ingested_at, updated_at, approved_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ content: data })
  }

  const { data, error } = await admin
    .from('edu_content')
    .insert({
      title: body.title,
      source_type: body.source_type,
      source_url: body.source_url,
      scenario_tags: body.scenario_tags,
      summary: body.summary,
      transcript: body.transcript,
      status: body.status,
      rag_enabled: body.rag_enabled,
      created_by: user.id,
      updated_by: user.id,
      approved_at: body.status === 'approved' ? new Date().toISOString() : null,
    })
    .select('id, title, source_type, source_url, scenario_tags, summary, transcript, status, version, rag_enabled, rag_ingested_at, updated_at, approved_at')
    .single()

  if (error && tableMissing(error)) return NextResponse.json({ error: 'migration_pending' }, { status: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: data }, { status: 201 })
}
