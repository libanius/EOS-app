import { type NextRequest, NextResponse } from 'next/server'
import { buildEduPreparednessProposals, cleanEduActionText, type EduPreparednessProposal } from '@/lib/edu-actions'
import { generationParams, getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import { enforceAiBudget, rateLimitHeaders } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

type Body = {
  language?: 'pt' | 'en'
  item?: {
    title?: string
    summary?: string
    transcript?: string
  }
}

function normalizeActions(value: unknown): EduPreparednessProposal[] {
  const raw = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  return raw
    .map((entry): EduPreparednessProposal | null => {
      const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
      const name = cleanEduActionText(String(record.name ?? ''))
        .replace(/[.;:,]+$/g, '')
        .trim()
      if (name.length < 8) return null
      const key = name.toLowerCase()
      if (seen.has(key)) return null
      seen.add(key)
      const tier = record.tier === 'MODERATE' || record.tier === 'EXCELLENT' ? record.tier : 'ESSENTIAL'
      return {
        name: name.length > 96 ? `${name.slice(0, 93).trim()}...` : name,
        tier,
        quantity: Math.max(1, Math.min(99, Math.floor(Number(record.quantity) || 1))),
        unit: typeof record.unit === 'string' && record.unit.trim() ? record.unit.trim().slice(0, 24) : null,
      }
    })
    .filter((item): item is EduPreparednessProposal => Boolean(item))
    .slice(0, 6)
}

function extractJson(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found.')
  return JSON.parse(match[0]) as { actions?: unknown }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try { body = await req.json() as Body }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const item = body.item ?? {}
  const language = body.language === 'en' ? 'en' : 'pt'
  const fallback = buildEduPreparednessProposals({
    summary: String(item.summary ?? ''),
    transcript: String(item.transcript ?? ''),
  })

  const exceeded = await enforceAiBudget(`edu-actions:${user.id}`, { perMinute: 6, perDay: 80 })
  if (exceeded) {
    return NextResponse.json(
      { actions: fallback, curated: false, error: 'rate_limited' },
      { status: 200, headers: rateLimitHeaders(exceeded.result) },
    )
  }

  try {
    const client = getOpenAIClient()
    const model = getOpenAIModel()
    const target = language === 'pt' ? 'Portuguese' : 'English'
    const response = await client.chat.completions.create({
      model,
      ...generationParams(model, { maxOutputTokens: 500, temperature: 0.1 }),
      messages: [
        {
          role: 'system',
          content: [
            'You curate emergency-preparedness education into short checklist actions.',
            `Return only JSON: {"actions":[{"name":"...","tier":"ESSENTIAL","quantity":1,"unit":null}]}.`,
            `Write every action in ${target}.`,
            'Rules: no markdown, no asterisks, no quotes, no video timestamps, no minute markers, no long explanations.',
            'Use clear imperative or action-noun checklist language. Prefer actionable meaning over transcript wording.',
            'Do not invent unrelated actions. Maximum 6 actions, maximum 96 characters each.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: cleanEduActionText(String(item.title ?? '')).slice(0, 160),
            summary: String(item.summary ?? '').slice(0, 1600),
            transcript: String(item.transcript ?? '').slice(0, 6000),
            fallback_actions: fallback.map(action => action.name),
          }),
        },
      ],
    })
    const raw = response.choices[0]?.message?.content ?? ''
    const curated = normalizeActions(extractJson(raw).actions)
    return NextResponse.json({ actions: curated.length ? curated : fallback, curated: curated.length > 0 })
  } catch {
    return NextResponse.json({ actions: fallback, curated: false })
  }
}
