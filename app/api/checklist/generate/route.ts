import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import {
  buildChecklistPrompt,
  canonicalKey,
  type ChecklistGenerateInput,
  type ChecklistTier,
} from '@/lib/checklist'

interface GenerateBody {
  scenarioType?: string
  scenarioDescription?: string
  scenarioId?: string | null
}

interface LLMItem {
  name: string
  tier: ChecklistTier
  quantity: number
  unit?: string | null
}

const TIERS: ChecklistTier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await enforceRateLimit(`checklist:${user.id}`)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const scenarioType = (body.scenarioType ?? 'GENERAL').toUpperCase()
  const scenarioId = body.scenarioId ?? null

  const { data: family } = await supabase
    .from('family_members')
    .select('age, medical_conditions, mobility_impaired, is_infant')
    .eq('profile_id', user.id)

  const familySize = Math.max(1, family?.length ?? 1)
  const input: ChecklistGenerateInput = {
    scenarioType,
    scenarioDescription: body.scenarioDescription,
    familySize,
    hasChildren: (family ?? []).some((m) => (m.age ?? 99) < 18),
    hasInfants: (family ?? []).some((m) => (m.age ?? 99) < 2 || m.is_infant === true),
    hasElderly: (family ?? []).some((m) => (m.age ?? 0) >= 65),
    hasMedicalConditions: (family ?? []).some(
      (m) => Array.isArray(m.medical_conditions) && m.medical_conditions.length > 0,
    ),
  }

  let items: LLMItem[]
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: buildChecklistPrompt(input),
        },
      ],
      system: 'You generate tiered emergency preparedness checklists as strict JSON. Never add prose or markdown fences. Respond only with valid JSON.',
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '{"items":[]}'
    const parsed = JSON.parse(raw) as { items?: LLMItem[] }
    items = Array.isArray(parsed.items) ? parsed.items : []
  } catch (err) {
    console.error('[EOS] checklist.generate LLM failed:', err)
    return NextResponse.json(
      { error: 'LLM generation failed. Try again in a moment.' },
      { status: 502 },
    )
  }

  const normalised = items
    .filter(
      (i) =>
        typeof i?.name === 'string' &&
        TIERS.includes(i.tier as ChecklistTier) &&
        typeof i.quantity === 'number' &&
        i.quantity > 0,
    )
    .map((i) => ({
      profile_id: user.id,
      scenario_id: scenarioId,
      canonical_key: canonicalKey(i.name),
      item_name: i.name,
      tier: i.tier,
      quantity: i.quantity,
      unit: i.unit ?? null,
    }))
    .filter((i) => i.canonical_key.length > 0)

  if (normalised.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const { data: upserted, error: upsertErr } = await supabase
    .from('checklists')
    .upsert(normalised, {
      onConflict: 'profile_id,canonical_key,scenario_id',
      ignoreDuplicates: false,
    })
    .select('*')

  if (upsertErr) {
    console.error('[EOS] checklist.upsert failed:', upsertErr)
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({ items: upserted ?? [] })
}
