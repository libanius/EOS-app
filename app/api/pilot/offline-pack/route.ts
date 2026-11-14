import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KnowledgePack } from '@/lib/offline-knowledge'
import { buildKnowledgePack } from '@/lib/offline-knowledge-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const PART_CHARS = 256 * 1024
let cached: KnowledgePack | null = null

export async function GET(req: NextRequest) {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'knowledge_unavailable' }, { status: 503 })
  try {
    const partValue = req.nextUrl.searchParams.get('part')
    const requestedVersion = req.nextUrl.searchParams.get('version')
    const part = partValue === null ? null : Number(partValue)
    if (part !== null && (!Number.isInteger(part) || part < 0 || part >= 128 || !requestedVersion)) return NextResponse.json({ error: 'invalid_part' }, { status: 400 })
    // A fresh manifest observes new publications; parts may reuse only that immutable version.
    const pack = part !== null && cached?.version === requestedVersion ? cached : await buildKnowledgePack(admin)
    cached = pack
    const headers = { 'Cache-Control': 'private, no-store', ETag: `"${pack.version}"` }
    if (part === null && req.headers.get('if-none-match') === headers.ETag) return new NextResponse(null, { status: 304, headers })
    const serialized = JSON.stringify(pack.documents)
    const parts = Math.max(1, Math.ceil(serialized.length / PART_CHARS))
    if (part !== null) {
      if (pack.version !== requestedVersion) return NextResponse.json({ error: 'knowledge_version_changed' }, { status: 409, headers })
      if (part >= parts) return NextResponse.json({ error: 'invalid_part' }, { status: 400, headers })
      return NextResponse.json({ version: pack.version, part, data: serialized.slice(part * PART_CHARS, (part + 1) * PART_CHARS) }, { headers })
    }
    return NextResponse.json({ schema: 1, version: pack.version, syncedAt: pack.syncedAt, parts, characters: serialized.length }, { headers })
  } catch (err) {
    const tooLarge = err instanceof Error && err.message === 'knowledge_pack_too_large'
    return NextResponse.json({ error: tooLarge ? 'knowledge_pack_too_large' : 'knowledge_source_unavailable' }, { status: tooLarge ? 413 : 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
