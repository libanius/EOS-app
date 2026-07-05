import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import { enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getRelevantChunks } from '@/lib/knowledge'
import {
  buildChecklistPrompt,
  canonicalKey,
  type ChecklistGenerateInput,
  type ChecklistTier,
} from '@/lib/checklist'

interface GenerateBody {
  kitType?: string
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

  const kitType = (body.kitType ?? 'GERAL').toUpperCase()
  const scenarioType = (body.scenarioType ?? 'GENERAL').toUpperCase()
  const scenarioId = body.scenarioId ?? null

  const { data: family } = await supabase
    .from('family_members')
    .select('age, medical_conditions, medical_notes, medications, mobility_impaired, is_infant')
    .eq('profile_id', user.id)

  const familySize = Math.max(1, family?.length ?? 1)
  const input: ChecklistGenerateInput = {
    kitType,
    scenarioType,
    scenarioDescription: body.scenarioDescription,
    familySize,
    hasChildren: (family ?? []).some((m) => (m.age ?? 99) < 18),
    hasInfants: (family ?? []).some((m) => (m.age ?? 99) < 2 || m.is_infant === true),
    hasElderly: (family ?? []).some((m) => (m.age ?? 0) >= 65),
    hasMedicalConditions: (family ?? []).some(
      (m) =>
        (Array.isArray(m.medical_conditions) && m.medical_conditions.length > 0) ||
        !!m.medical_notes ||
        (Array.isArray(m.medications) && m.medications.length > 0),
    ),
  }

  // RAG context from verified sources (FEMA, Red Cross, SAS, etc.)
  const ragQuery = `preparedness checklist ${kitType} ${scenarioType} supplies equipment`
  const ragChunks = await getRelevantChunks(ragQuery, scenarioType).catch(() => [] as string[])
  const ragContext = ragChunks.length > 0
    ? `\n\nMATERIAL DE REFERÊNCIA (fontes verificadas — FEMA, Cruz Vermelha, OMS, SAS):\n${ragChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}`
    : ''

  let items: LLMItem[]
  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      max_tokens: 2048,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are EOS preparedness planner. Respond ONLY with valid JSON. All item names in Brazilian Portuguese (pt-BR). Never use Spanish or English for item names.',
        },
        {
          role: 'user',
          content: buildChecklistPrompt(input) + ragContext,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message.content ?? '{}'
    const parsed = JSON.parse(raw) as { items?: LLMItem[] }
    items = (parsed.items ?? []).filter(
      (i) => typeof i.name === 'string' && TIERS.includes(i.tier),
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'AI generation failed' },
      { status: 500 },
    )
  }

  if (items.length === 0) {
    return NextResponse.json({ error: 'No items generated' }, { status: 500 })
  }

  const rows = items.map((i) => ({
    profile_id: user.id,
    scenario_id: scenarioId,
    kit_type: kitType,
    canonical_key: canonicalKey(i.name),
    item_name: i.name,
    tier: i.tier,
    quantity: i.quantity ?? 1,
    unit: i.unit ?? null,
  }))

  const { error: insertError } = await supabase
    .from('checklists')
    .upsert(rows, {
      onConflict: 'profile_id,canonical_key,kit_type',
      ignoreDuplicates: true,
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length })
}
