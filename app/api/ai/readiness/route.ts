import { NextResponse } from 'next/server'
import { getHousehold } from '@/lib/household'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'

type AIReadinessResponse = {
  overview: string
  risk_level: 'baixo' | 'medio' | 'alto'
  priorities: string[]
  strengths: string[]
  next_steps: string[]
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

  /*
   * A casa inteira, com o inventário SOMADO (D-123).
   *
   * Antes esta rota lia só a lista digitada à mão e o inventário do próprio
   * usuário. Uma casa de quatro contas era analisada como uma pessoa com uma
   * despensa — e a prontidão saía otimista pelos dois lados.
   */
  const household = await getHousehold(user.id)
  if (!household.known) {
    return NextResponse.json(
      { error: 'Não foi possível ler quem mora na sua casa. Analisar prontidão com o número errado de pessoas dá uma resposta que parece certa.' },
      { status: 503 },
    )
  }

  const family = household.people
  const inventory = {
    water_liters: household.inventory.waterLiters,
    // A engine trabalha em dias; `foodPersonDays` divide pelo tamanho da casa.
    food_days: household.size > 0 ? household.inventory.foodPersonDays / household.size : 0,
    fuel_liters: household.inventory.fuelLiters,
    battery_percent: household.inventory.batteryPercent,
    has_medical_kit: household.inventory.hasMedicalKit,
    has_communication_device: household.inventory.hasCommunicationDevice,
    cash_amount: 0,
  }
  const peopleCount = Math.max(household.size, 1)
  // Necessidade que não podemos ler conta como necessidade: veja o mesmo
  // raciocínio em `checklist/generate`.
  const specialNeedsCount =
    household.needsHidden +
    family.filter(
      (member) =>
        member.isInfant ||
        member.mobilityImpaired ||
        member.medicalConditions.length > 0 ||
        member.medications.length > 0,
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
- Se needs_unknown_for for maior que zero, trate como necessidade possível e diga isso: há gente na casa cuja ficha não pode ser lida.
- Português do Brasil.

Dados da família:
${JSON.stringify(
    {
      people_count: household.size,
      special_needs_count: specialNeedsCount,
      // Dito ao modelo em vez de escondido: "não sabemos" não é "não tem", e um
      // analista que confunde os dois recomenda menos do que a casa precisa.
      needs_unknown_for: household.needsHidden,
      contributing_inventories: household.inventory.contributors,
      members: family.map(m => ({
        name: m.name,
        age: m.age,
        is_infant: m.isInfant,
        mobility_impaired: m.mobilityImpaired,
        medical_conditions: m.medicalConditions,
        medications: m.medications,
        depends_on_someone: m.dependsOn !== null,
        relationship: m.relationship,
        medical_data_visible: m.medicalVisible,
      })),
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
