import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'

type FamilyMember = {
  name: string
  age: number | null
  medical_conditions: string[] | null
  mobility_impaired: boolean | null
  is_infant: boolean | null
}

type InventoryRow = {
  water_liters: number | null
  food_days: number | null
  fuel_liters: number | null
  battery_percent: number | null
  has_medical_kit: boolean | null
  has_communication_device: boolean | null
  cash_amount: number | null
}

type AIReadinessResponse = {
  overview: string
  risk_level: 'baixo' | 'medio' | 'alto'
  priorities: string[]
  strengths: string[]
  next_steps: string[]
}

function getFallbackInventory(row: InventoryRow | null) {
  return {
    water_liters: Number(row?.water_liters) || 0,
    food_days: Number(row?.food_days) || 0,
    fuel_liters: Number(row?.fuel_liters) || 0,
    battery_percent: Number(row?.battery_percent) || 0,
    has_medical_kit: Boolean(row?.has_medical_kit),
    has_communication_device: Boolean(row?.has_communication_device),
    cash_amount: Number(row?.cash_amount) || 0,
  }
}

function extractJsonObject(raw: string): AIReadinessResponse {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('No JSON object found in model response.')
  }

  const parsed = JSON.parse(match[0]) as Partial<AIReadinessResponse>

  return {
    overview: String(parsed.overview || '').trim(),
    risk_level:
      parsed.risk_level === 'baixo' || parsed.risk_level === 'medio' || parsed.risk_level === 'alto'
        ? parsed.risk_level
        : 'medio',
    priorities: Array.isArray(parsed.priorities) ? parsed.priorities.map(String).filter(Boolean).slice(0, 3) : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).filter(Boolean).slice(0, 3) : [],
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.map(String).filter(Boolean).slice(0, 4) : [],
  }
}

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY não configurada no ambiente.' },
      { status: 500 },
    )
  }

  const [{ data: members, error: familyError }, { data: inventoryRow, error: inventoryError }] = await Promise.all([
    supabase
      .from('family_members')
      .select('name, age, medical_conditions, mobility_impaired, is_infant')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('resource_inventory')
      .select(
        'water_liters, food_days, fuel_liters, battery_percent, has_medical_kit, has_communication_device, cash_amount',
      )
      .eq('profile_id', user.id)
      .maybeSingle(),
  ])

  if (familyError) {
    console.error('[GET /api/ai/readiness] family', familyError.message)
    return NextResponse.json({ error: familyError.message }, { status: 500 })
  }

  if (inventoryError) {
    console.error('[GET /api/ai/readiness] inventory', inventoryError.message)
    return NextResponse.json({ error: inventoryError.message }, { status: 500 })
  }

  const family = (members ?? []) as FamilyMember[]
  const inventory = getFallbackInventory((inventoryRow ?? null) as InventoryRow | null)
  const peopleCount = Math.max(family.length, 1)
  const specialNeedsCount = family.filter(
    (member) =>
      Boolean(member.is_infant) ||
      Boolean(member.mobility_impaired) ||
      (member.medical_conditions?.length ?? 0) > 0,
  ).length

  const client = getOpenAIClient()
  const model = getOpenAIModel()

  const prompt = `
Você é um analista de prontidão para emergências familiares.
Responda apenas em JSON válido, sem markdown, sem comentários e sem texto fora do objeto.

Esquema obrigatório:
{
  "overview": "string curta em português",
  "risk_level": "baixo" | "medio" | "alto",
  "priorities": ["até 3 itens"],
  "strengths": ["até 3 itens"],
  "next_steps": ["até 4 itens"]
}

Regras:
- Considere primeiro água, comida, energia, comunicação e kit médico.
- Se houver bebês, mobilidade reduzida ou condições médicas, priorize isso.
- Seja específico e acionável.
- Não invente dados ausentes.
- Português do Brasil.

Dados da família:
${JSON.stringify(
    {
      people_count: family.length,
      special_needs_count: specialNeedsCount,
      members: family,
    },
    null,
    2,
  )}

Dados de inventário:
${JSON.stringify(
    {
      ...inventory,
      water_per_person: Number((inventory.water_liters / peopleCount).toFixed(2)),
    },
    null,
    2,
  )}
`

  try {
    const response = await client.responses.create({
      model,
      input: prompt,
    })

    const briefing = extractJsonObject(response.output_text)

    return NextResponse.json({
      briefing,
      meta: {
        model,
        generated_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao gerar análise com OpenAI.'
    console.error('[GET /api/ai/readiness] openai', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
