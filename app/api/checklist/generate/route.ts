import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/lib/ensure-profile'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import { enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getHousehold } from '@/lib/household'
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
  await ensureProfile(supabase, user)

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

  /*
   * A casa, e não a lista digitada à mão (D-123).
   *
   * Antes isto lia `family_members` do usuário e ignorava o círculo: uma casa
   * de quatro contas gerava checklist para uma pessoa. Agora conta quem
   * confirmou morar junto + os dependentes de cada um.
   */
  const household = await getHousehold(user.id)
  const family = household.people

  /*
   * Casa desconhecida NÃO vira casa de um.
   *
   * Se a leitura falhou, gerar uma lista para uma pessoa seria pior que não
   * gerar: ela parece certa. Aqui a rota para e diz.
   */
  if (!household.known) {
    return NextResponse.json(
      { error: 'Não foi possível ler quem mora na sua casa. Tente de novo — gerar uma lista para o número errado de pessoas é pior que não gerar.' },
      { status: 503 },
    )
  }

  const familySize = Math.max(1, household.size)
  const input: ChecklistGenerateInput = {
    kitType,
    scenarioType,
    scenarioDescription: body.scenarioDescription,
    familySize,
    hasChildren: family.some((m) => (m.age ?? 99) < 18),
    hasInfants: family.some((m) => (m.age ?? 99) < 2 || m.isInfant),
    hasElderly: family.some((m) => (m.age ?? 0) >= 65),
    /*
     * Necessidade OCULTA conta como necessidade.
     *
     * Quem mora junto não vê a ficha do outro sem permissão. Tratar "não sei" como
     * "não tem" geraria uma lista sem remédio para uma casa que toma remédio —
     * e nesta direção o erro é irreversível. Preparar a mais custa espaço;
     * preparar a menos custa a pessoa.
     */
    hasMedicalConditions:
      household.needsHidden > 0 ||
      family.some(
        (m) =>
          m.medicalConditions.length > 0 ||
          m.medications.length > 0 ||
          m.mobilityImpaired,
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
