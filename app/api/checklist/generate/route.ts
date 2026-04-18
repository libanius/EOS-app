import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'
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

/**
 * POST /api/checklist/generate
 * Body: { scenarioType: string; scenarioDescription?: string; scenarioId?: string }
 *
 * Pipeline:
 *   auth -> load profile+family -> LLM (JSON) -> normalise -> upsert
 *   (canonical_key,scenario_id) uniqueness guarantees cross-scenario dedup.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // 1. Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1b. Rate limit — 10 req / 60 s / user
  {
    const rl = await enforceRateLimit(`checklist:${user.id}`)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again in a minute.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }
  }

  // 2. Body
  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const scenarioType = (body.scenarioType ?? 'GENERAL').toUpperCase()
  const scenarioId = body.scenarioId ?? null

  // 3. Load family
  const { data: family } = await supabase
    .from('family_members')
    .select('age, medical_conditions, mobility_impaired, is_infant')
    .eq('profile_id', user.id)

  const familySize = Math.max(1, family?.length ?? 1)
  const hasChildren = (family ?? []).some((m) => (m.age ?? 99) < 18)
  const hasInfants = (family ?? []).some(
    (m) => (m.age ?? 99) < 2 || m.is_infant === true,
  )
  const hasElderly = (family ?? []).some((m) => (m.age ?? 0) >= 65)
  const hasMedicalConditions = (family ?? []).some(
    (m) => Array.isArray(m.medical_conditions) && m.medical_conditions.length > 0,
  )

  const input: ChecklistGenerateInput = {
    scenarioType,
    scenarioDescription: body.scenarioDescription,
    familySize,
    hasChildren,
    hasInfants,
    hasElderly,
    hasMedicalConditions,
  }

  // 4. LLM call
  let items: LLMItem[]
  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        {
          role: 'system',
          content:
            'You generate tiered emergency preparedness checklists as strict JSON. Never add prose.',
        },
        { role: 'user', content: buildChecklistPrompt(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    })

    const raw = completion.choices[0]?.message?.content ?? '{"items":[]}'
    const parsed = JSON.parse(raw) as { items?: LLMItem[] }
    items = Array.isArray(parsed.items) ? parsed.items : []
  } catch (err) {
    console.error('[EOS] checklist.generate LLM failed:', err)
    return NextResponse.json(
      { error: 'LLM generation failed. Try again in a moment.' },
      { status: 502 },
    )
  }

  // 5. Normalise + upsert
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

  // Upsert — (profile_id, canonical_key, scenario_id) is unique (see migration).
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
