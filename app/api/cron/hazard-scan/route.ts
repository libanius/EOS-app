import { type NextRequest, NextResponse } from 'next/server'
import { runHazardScan } from '@/lib/hazards/scan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One pass across every watched location; the cap in HAZARD_CONFIG.alerting
// keeps it inside this budget.
export const maxDuration = 300

/**
 * The scheduled hazard scan (D-074).
 *
 * Deliberately scheduler-agnostic: it is a plain authenticated request, so
 * Vercel Cron, Supabase pg_cron + pg_net, a GitHub Action or any external
 * pinger can drive it. That matters because Vercel's Hobby plan only allows
 * one cron per day — useless for alerting — while pg_cron runs every 10
 * minutes at no extra cost. See docs/hazard-alerting-setup.md.
 *
 * Auth: `CRON_SECRET`, sent as `Authorization: Bearer …` (what Vercel Cron
 * sends automatically) or `x-cron-key`. With no secret configured the route
 * refuses to run — an open endpoint that hammers upstream feeds and pushes to
 * every phone is not something to leave lying around.
 */
function authorize(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return { ok: false, status: 503, error: 'CRON_SECRET not configured — scan disabled' }
  }
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
  const key = req.headers.get('x-cron-key')
  if (bearer !== secret && key !== secret) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}

async function handle(req: NextRequest) {
  const auth = authorize(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const summary = await runHazardScan()
  // 200 even with per-location errors: a scheduler retrying the whole sweep
  // because one city timed out would re-scan every other city for nothing.
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
